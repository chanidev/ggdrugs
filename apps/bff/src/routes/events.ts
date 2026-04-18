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
//   page         1 이상 정수 (기본 1)
//   limit        1~100 정수 (기본 20)
//
// 공개 응답 조건:
//   - approval_status = 'approved'
//   - is_deleted = false
//
// 정렬: end_date DESC (→ 진행중·예정이 먼저, 오래 전 종료는 뒤로), start_date ASC tie-break
// =============================================================

const COMPANION_ENUM = new Set(['solo', 'couple', 'friend', 'family']);
const EVENT_TYPE_ENUM = new Set(['festival', 'expo', 'symposium', 'conference']);
const PERIOD_ENUM = new Set(['3m', '6m', 'all', 'custom']);

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
  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  const limit = parseIntClamp(req.query.limit, 20, 1, 100);

  const periodResult = parsePeriod(req.query);
  if (periodResult.error) {
    res.status(400).json({ error: periodResult.error });
    return;
  }

  const where: Prisma.EventWhereInput = {
    approvalStatus: 'approved',
    isDeleted: false,
  };

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

  const [total, rows] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy: [{ endDate: 'desc' }, { startDate: 'asc' }, { eventId: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        eventId: true,
        title: true,
        startDate: true,
        endDate: true,
        phase: true,
        latitude: true,
        longitude: true,
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
      },
    }),
  ]);

  const items = rows.map((r) => ({
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
    latitude: r.latitude ? Number(r.latitude) : null,
    longitude: r.longitude ? Number(r.longitude) : null,
    posterImageUrl: r.posterImageUrl,
    bookmarkCount: r.bookmarkCount,
    avgRating: Number(r.avgRating),
    reviewCount: r.reviewCount,
    vibes: r.vibeAssignments.map((va) => ({
      vibeId: va.vibe.vibeId.toString(),
      name: va.vibe.vibeName,
      group: va.vibe.vibeGroup,
    })),
  }));

  res.json({
    page,
    limit,
    total,
    items,
  });
}
