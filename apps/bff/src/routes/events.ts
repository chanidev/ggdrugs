import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';

// =============================================================
// GET /events  — 요구사항 v5.0 필터 5종 기반 이벤트 목록
//
// 쿼리 파라미터:
//   regionIds    CSV of BigInt   (선택)  복수 시 OR
//   period       3m|6m|all|custom          (기본 all)
//   periodStart  YYYY-MM-DD       (period=custom 시 필수)
//   periodEnd    YYYY-MM-DD       (period=custom 시 필수)
//   companions   CSV of (solo|couple|friend|family)   복수 시 OR
//                매칭: events.expected_companion_primary OR _secondary 중
//                하나라도 겹치면 매치 (wiki filters-5-types open Q1 — 최단 UX 채택)
//   eventTypes   CSV of (festival|expo|symposium|conference)  복수 시 OR
//   vibeIds      CSV of BigInt    복수 시 OR (event_vibe_assignments)
//   phases       CSV of (upcoming|ongoing|ended)   복수 시 OR
//   page         1 이상 정수 (기본 1)
//   limit        1~500 정수 (기본 20, map 뷰는 500 활용 가능)
//
// 공개 응답 조건:
//   - approval_status = 'approved'
//   - is_deleted = false
//
// 정렬: end_date DESC (→ 진행중·예정이 먼저, 오래 전 종료는 뒤로), start_date ASC tie-break
// =============================================================

const COMPANION_ENUM = new Set(['solo', 'couple', 'friend', 'family']);
const EVENT_TYPE_ENUM = new Set([
  'festival',
  'expo',
  'symposium',
  'conference',
  'exhibition',
  'performance',
  'education',
  'movie',
]);
const PERIOD_ENUM = new Set(['3m', '6m', 'all', 'custom']);
const PHASE_ENUM = new Set(['upcoming', 'ongoing', 'ended']);
/** v4.4 — 정렬 옵션. ending(default) / recent / popular. v4.5 — distance 추가 (anchor 또는 bbox 필요). */
const SORT_ENUM = new Set(['ending', 'recent', 'popular', 'distance']);
type SortKey = 'ending' | 'recent' | 'popular' | 'distance';

function parseCsv(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseBigIntCsv(raw: unknown): bigint[] {
  const out: bigint[] = [];
  for (const s of parseCsv(raw)) {
    try {
      const n = BigInt(s);
      if (n > 0n) out.push(n);
    } catch {
      // skip invalid
    }
  }
  return out;
}

function parseIntClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * v4.3 — bbox=minLng,minLat,maxLng,maxLat 파싱 + 범위 검증.
 * 잘못된 형식 / 범위 위반은 null 반환 (caller 가 ignore — 안전한 default).
 * Lng -180..180, Lat -90..90, min < max.
 */
function parseBbox(raw: unknown): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const parts = raw.split(',').map((s) => Number.parseFloat(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return null;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  return { minLng, minLat, maxLng, maxLat };
}

/**
 * v4.5 — anchor=lng,lat 파싱 + 범위 검증. parseBbox 와 동일 패턴.
 * 잘못된 형식 / 범위 위반은 null 반환.
 */
function parseAnchor(raw: unknown): { lng: number; lat: number } | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const parts = raw.split(',').map((s) => Number.parseFloat(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lng, lat] = parts as [number, number];
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return { lng, lat };
}

function parsePeriod(q: Request['query']): { start: Date | null; end: Date | null; error?: string } {
  const kind = typeof q.period === 'string' ? q.period : 'all';
  if (!PERIOD_ENUM.has(kind)) return { start: null, end: null, error: 'invalid period' };
  if (kind === 'all') return { start: null, end: null };

  const now = new Date();
  if (kind === '3m' || kind === '6m') {
    const months = kind === '3m' ? 3 : 6;
    const end = new Date(now);
    end.setMonth(end.getMonth() + months);
    return { start: now, end };
  }
  // custom
  const s = typeof q.periodStart === 'string' ? q.periodStart : '';
  const e = typeof q.periodEnd === 'string' ? q.periodEnd : '';
  const sd = new Date(s);
  const ed = new Date(e);
  if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) {
    return { start: null, end: null, error: 'custom period requires periodStart/periodEnd (YYYY-MM-DD)' };
  }
  if (sd > ed) return { start: null, end: null, error: 'periodStart must be <= periodEnd' };
  return { start: sd, end: ed };
}

export async function listEvents(req: Request, res: Response) {
  const regionIds = parseBigIntCsv(req.query.regionIds);
  const companionsRaw = parseCsv(req.query.companions);
  const companions = companionsRaw.filter((c) => COMPANION_ENUM.has(c));
  const eventTypesRaw = parseCsv(req.query.eventTypes);
  const eventTypes = eventTypesRaw.filter((c) => EVENT_TYPE_ENUM.has(c));
  const vibeIds = parseBigIntCsv(req.query.vibeIds);
  const phasesRaw = parseCsv(req.query.phases);
  const phases = phasesRaw.filter((p) => PHASE_ENUM.has(p));
  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  // limit 상한 500 — map 뷰 용도. 목록 페이지는 100 이하 사용 권장.
  const limit = parseIntClamp(req.query.limit, 20, 1, 500);

  const periodResult = parsePeriod(req.query);
  if (periodResult.error) {
    res.status(400).json({ error: periodResult.error });
    return;
  }
  const bbox = parseBbox(req.query.bbox);
  const sort: SortKey =
    typeof req.query.sort === 'string' && SORT_ENUM.has(req.query.sort)
      ? (req.query.sort as SortKey)
      : 'ending';

  const where: Prisma.EventWhereInput = {
    approvalStatus: 'approved',
    isDeleted: false,
  };

  // v4.3 — bbox 필터: PostGIS ST_Within(location_geom, ST_MakeEnvelope(...)) 로
  // event_id 부분집합 추출 후 일반 where 에 IN clause 추가. lat/lng IS NULL 인 2건은
  // 자연스럽게 탈락 (location_geom NULL).
  if (bbox) {
    const ids = await prisma.$queryRaw<{ event_id: bigint }[]>`
      SELECT event_id FROM events
      WHERE location_geom IS NOT NULL
        AND ST_Within(
          location_geom,
          ST_MakeEnvelope(${bbox.minLng}, ${bbox.minLat}, ${bbox.maxLng}, ${bbox.maxLat}, 4326)
        )
    `;
    const bboxEventIds = ids.map((r) => r.event_id);
    if (bboxEventIds.length === 0) {
      // 빈 bbox — 빈 응답으로 short-circuit (count + findMany 둘 다 0).
      res.json({ page, limit, total: 0, items: [] });
      return;
    }
    where.eventId = { in: bboxEventIds };
  }

  if (regionIds.length > 0) where.regionId = { in: regionIds };
  if (periodResult.start || periodResult.end) {
    where.startDate = {};
    if (periodResult.start) where.startDate.gte = periodResult.start;
    if (periodResult.end) where.startDate.lte = periodResult.end;
  }
  if (companions.length > 0) {
    where.OR = [
      { expectedCompanionPrimary: { in: companions } },
      { expectedCompanionSecondary: { in: companions } },
    ];
  }
  if (eventTypes.length > 0) {
    where.category = { categoryCode: { in: eventTypes } };
  }
  if (vibeIds.length > 0) {
    where.vibeAssignments = { some: { vibeId: { in: vibeIds } } };
  }
  if (phases.length > 0) {
    where.phase = { in: phases };
  }

  // v4.5 — sort=distance 는 PostGIS KNN 정렬 + 거리값 계산이 raw 연산이라 일반 흐름과 분리.
  if (sort === 'distance') {
    const explicitAnchor = parseAnchor(req.query.anchor);

    // v4.6 — 단일 region 필터 + sort=distance 시 region centroid 를 anchor 로 자동 적용.
    // priority: explicit > region centroid (regionIds 단일) > bbox center > 400.
    // raw query 로 lookup — center_lat/center_lng 는 v4.6 마이그레이션에서 추가된 컬럼.
    let regionAnchor: { lng: number; lat: number } | null = null;
    if (!explicitAnchor && regionIds.length === 1) {
      const rows = await prisma.$queryRaw<{ center_lat: number | null; center_lng: number | null }[]>`
        SELECT center_lat::float AS center_lat, center_lng::float AS center_lng
        FROM regions WHERE region_id = ${regionIds[0]}
      `;
      const r = rows[0];
      if (r?.center_lat != null && r?.center_lng != null) {
        regionAnchor = { lng: Number(r.center_lng), lat: Number(r.center_lat) };
      }
    }

    const anchor: { lng: number; lat: number } | null =
      explicitAnchor ??
      regionAnchor ??
      (bbox
        ? { lng: (bbox.minLng + bbox.maxLng) / 2, lat: (bbox.minLat + bbox.maxLat) / 2 }
        : null);
    if (!anchor) {
      res.status(400).json({ error: 'anchor or bbox required for sort=distance' });
      return;
    }

    // Pass A: 일반 where 의 candidate eventIds 중 location_geom NOT NULL 인 것만 추출.
    // v4.10 — lat/lng 컬럼 DROP 후 location_geom 단일 source. raw query 로 필터링.
    const candidateRows = await prisma.event.findMany({
      where,
      select: { eventId: true },
    });
    const allCandidateIds = candidateRows.map((r) => r.eventId);
    if (allCandidateIds.length === 0) {
      res.json({ page, limit, total: 0, items: [] });
      return;
    }
    const geomCandidates = await prisma.$queryRaw<{ event_id: bigint }[]>(
      Prisma.sql`
        SELECT event_id FROM events
        WHERE event_id IN (${Prisma.join(allCandidateIds)})
          AND location_geom IS NOT NULL
      `,
    );
    const candidateIds = geomCandidates.map((r) => r.event_id);
    if (candidateIds.length > 50_000) {
      res.status(413).json({
        error: 'too many candidates for distance sort, narrow filter or use bbox',
      });
      return;
    }
    if (candidateIds.length === 0) {
      res.json({ page, limit, total: 0, items: [] });
      return;
    }

    // Pass B: KNN ORDER BY (GiST 활용) + ST_Distance(geography) 미터 단위 거리값.
    const offset = (page - 1) * limit;
    const ranked = await prisma.$queryRaw<{ event_id: bigint; distance_m: number }[]>(
      Prisma.sql`
        SELECT event_id,
               ST_Distance(
                 location_geom::geography,
                 ST_SetSRID(ST_MakePoint(${anchor.lng}, ${anchor.lat}), 4326)::geography
               ) AS distance_m
        FROM events
        WHERE event_id IN (${Prisma.join(candidateIds)})
        ORDER BY location_geom <-> ST_SetSRID(ST_MakePoint(${anchor.lng}, ${anchor.lat}), 4326),
                 event_id ASC
        LIMIT ${limit} OFFSET ${offset}
      `,
    );
    const orderedIds = ranked.map((r) => r.event_id);
    const distanceById = new Map<string, number>(
      ranked.map((r) => [r.event_id.toString(), Math.round(Number(r.distance_m))]),
    );

    // Pass C: 상세 fetch + KNN 순서 보존 reorder + distanceMeters 첨부.
    // v4.10 — coords map 별도 fetch (ST_X/ST_Y derive).
    const [rows, coords] = await Promise.all([
      prisma.event.findMany({
        where: { eventId: { in: orderedIds } },
        select: EVENT_SELECT,
      }),
      fetchEventCoords(orderedIds),
    ]);
    const byId = new Map(rows.map((r) => [r.eventId.toString(), r]));
    const items = orderedIds
      .map((id) => byId.get(id.toString()))
      .filter((r): r is NonNullable<typeof r> => r !== undefined)
      .map((r) => mapEventRow(r, coords, distanceById.get(r.eventId.toString())));

    res.json({ page, limit, total: candidateIds.length, items });
    return;
  }

  // v4.4 — sort 별 orderBy 매핑. 모두 eventId asc tie-break 으로 결정론적 페이지네이션 보장.
  const orderBy: Prisma.EventOrderByWithRelationInput[] =
    sort === 'recent'
      ? [{ createdAt: 'desc' }, { eventId: 'asc' }]
      : sort === 'popular'
        ? [{ bookmarkCount: 'desc' }, { reviewCount: 'desc' }, { eventId: 'asc' }]
        : [{ endDate: 'desc' }, { startDate: 'asc' }, { eventId: 'asc' }];

  const [total, rows] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: EVENT_SELECT,
    }),
  ]);

  // v4.10 — coords map 별도 fetch (lat/lng 컬럼 DROP 후 ST_X/ST_Y derive).
  const coords = await fetchEventCoords(rows.map((r) => r.eventId));
  const items = rows.map((r) => mapEventRow(r, coords));

  res.json({
    page,
    limit,
    total,
    items,
  });
}

/** 공유 select — 일반 흐름과 distance Pass C 가 동일 필드 응답. */
const EVENT_SELECT = {
  eventId: true,
  title: true,
  startDate: true,
  endDate: true,
  phase: true,
  posterImageUrl: true,
  bookmarkCount: true,
  avgRating: true,
  reviewCount: true,
  category: { select: { categoryCode: true, displayName: true } },
  region: {
    select: {
      regionId: true,
      sidoName: true,
      sigunguName: true,
      dongName: true,
      fullAddress: true,
    },
  },
  vibeAssignments: {
    select: {
      vibe: { select: { vibeId: true, vibeName: true, vibeGroup: true } },
    },
  },
} as const satisfies Prisma.EventSelect;

type EventRowFromSelect = Prisma.EventGetPayload<{ select: typeof EVENT_SELECT }>;

/**
 * v4.10 — events.latitude/longitude 컬럼 DROP 후 location_geom 단일 source.
 * 응답 형식 (lat/lng 필드) 유지 위해 ST_X/ST_Y 로 derive — 별도 raw query 1회.
 */
export async function fetchEventCoords(
  eventIds: bigint[],
): Promise<Map<string, { lat: number; lng: number }>> {
  if (eventIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ event_id: bigint; lng: number | null; lat: number | null }[]>(
    Prisma.sql`
      SELECT event_id,
             ST_X(location_geom)::float AS lng,
             ST_Y(location_geom)::float AS lat
      FROM events
      WHERE event_id IN (${Prisma.join(eventIds)})
        AND location_geom IS NOT NULL
    `,
  );
  const map = new Map<string, { lat: number; lng: number }>();
  for (const r of rows) {
    if (r.lat != null && r.lng != null) {
      map.set(r.event_id.toString(), { lat: Number(r.lat), lng: Number(r.lng) });
    }
  }
  return map;
}

/** Prisma row → API item. v4.5 distance sort 시 distanceMeters 첨부, 그 외 omit. v4.10 — coords map 으로 lat/lng derive. */
function mapEventRow(
  r: EventRowFromSelect,
  coords: Map<string, { lat: number; lng: number }>,
  distanceMeters?: number,
) {
  const c = coords.get(r.eventId.toString());
  return {
    eventId: r.eventId.toString(),
    title: r.title,
    category: {
      code: r.category.categoryCode,
      name: r.category.displayName,
    },
    region: {
      regionId: r.region.regionId.toString(),
      sidoName: r.region.sidoName,
      sigunguName: r.region.sigunguName,
      dongName: r.region.dongName,
      fullAddress: r.region.fullAddress,
    },
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    phase: r.phase,
    latitude: c ? c.lat : null,
    longitude: c ? c.lng : null,
    posterImageUrl: r.posterImageUrl,
    bookmarkCount: r.bookmarkCount,
    avgRating: Number(r.avgRating),
    reviewCount: r.reviewCount,
    vibes: r.vibeAssignments.map((va) => ({
      vibeId: va.vibe.vibeId.toString(),
      name: va.vibe.vibeName,
      group: va.vibe.vibeGroup,
    })),
    ...(distanceMeters !== undefined ? { distanceMeters } : {}),
  };
}
