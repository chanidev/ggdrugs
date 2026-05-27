import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';

/**
 * 여러 외부 소스 ingest 가 공유하는 헬퍼.
 *
 *  - resolveRegionId: addr 텍스트에서 서울 구를 추출해 regions 매칭. 실패 시 서울 전체.
 *  - getCategoryId: category_code 캐시 조회.
 *  - upsertCrawledEvent: (crawl_origin, external_source_id) 기준 upsert.
 *  - computePhase: today 기준 upcoming/ongoing/ended.
 */

export type EventCategoryCode =
  | 'festival'
  | 'expo'
  | 'symposium'
  | 'conference'
  | 'exhibition'
  | 'performance'
  | 'education'
  | 'movie';

export interface NormalizedEvent {
  externalSourceId: string;
  crawlOrigin: string;
  categoryCode: EventCategoryCode;
  title: string;
  /** 원본 API 가 제공하는 설명 문구. HTML strip 후 plain text 로 저장. 없으면 null. */
  description: string | null;
  addressText: string | null;
  latitude: number | null;
  longitude: number | null;
  startDate: Date;
  endDate: Date;
  posterImageUrl: string | null;
}

function todayUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function computePhase(start: Date, end: Date): 'upcoming' | 'ongoing' | 'ended' {
  const today = todayUtcMidnight();
  if (today < start) return 'upcoming';
  if (today > end) return 'ended';
  return 'ongoing';
}

/**
 * Forward-looking 필터: endDate >= 오늘 인 이벤트만 통과 (진행중 + 예정).
 * 이미 종료된 이벤트는 초기 backfill 로 DB 에 보관돼 있고, 이후 재수집 대상에서 제외.
 * 배치 주기적 실행 비용(네트워크 + upsert) 절감 목적.
 */
export function isForwardLooking(startDate: Date, endDate: Date): boolean {
  return endDate >= todayUtcMidnight();
  // startDate 는 필요 없음 — endDate 기준만으로 진행중(start<today<=end) + 예정(start>today) 모두 포함.
}

/** YYYYMMDD 형식의 오늘 날짜 — TourAPI 등 URL 쿼리용. */
export function todayYmd(): string {
  const t = todayUtcMidnight();
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const d = String(t.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * 날짜 문자열을 UTC midnight Date 로 파싱. 앞쪽 8자리 숫자를 YYYYMMDD 로 간주.
 * 지원 포맷: "20260813", "2026-08-13", "2026-08-13 00:00:00.0", "2026.08.13" 등.
 */
export function parseYmd(s: string | undefined | null): Date | null {
  if (!s) return null;
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * 전국 광역시·도 매칭 패턴. 단축형(sido_name) + 정식명칭 모두 인식.
 * 순서: 더 긴 정식명 우선 ("강원특별자치도" → "강원특별자치도" 가 먼저, "강원" 은 뒤).
 */
const SIDO_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: '서울', re: /서울(?:특별시)?/ },
  { name: '부산', re: /부산(?:광역시)?/ },
  { name: '대구', re: /대구(?:광역시)?/ },
  { name: '인천', re: /인천(?:광역시)?/ },
  { name: '광주', re: /광주(?:광역시)?/ },
  { name: '대전', re: /대전(?:광역시)?/ },
  { name: '울산', re: /울산(?:광역시)?/ },
  { name: '세종', re: /세종(?:특별자치시)?/ },
  { name: '경기', re: /경기(?:도)?/ },
  { name: '강원', re: /강원(?:특별자치도|도)?/ },
  { name: '충북', re: /(?:충청북도|충북)/ },
  { name: '충남', re: /(?:충청남도|충남)/ },
  { name: '전북', re: /(?:전북특별자치도|전라북도|전북)/ },
  { name: '전남', re: /(?:전라남도|전남)/ },
  { name: '경북', re: /(?:경상북도|경북)/ },
  { name: '경남', re: /(?:경상남도|경남)/ },
  { name: '제주', re: /제주(?:특별자치도|도)?/ },
];

/**
 * 자치구가 있는 일반시 목록 — sigungu 매칭 시 "<시명> <자치구>" 합성형 우선.
 * 광역시 산하 자치구 ("부산 해운대구") 와 충돌 없음 (sido 매칭 먼저).
 */
const CITIES_WITH_AUTONOMOUS_DISTRICTS = [
  '수원시', '성남시', '고양시', '용인시', '청주시', '천안시', '전주시', '포항시', '창원시', '안산시',
] as const;

/**
 * 주소 텍스트에서 시/도 + 시/군/구 추출. 자치구 있는 일반시는 합성형 ("수원시 영통구") 으로 반환.
 *
 * 알고리즘:
 *  1. SIDO_PATTERNS 순회해 첫 매치를 sido 로 채택.
 *  2. 시도 접두사를 제거한 나머지 문자열에서 sigungu 를 탐색 (시도명이 sigungu 로 오인되는 문제 방지).
 *  3. 자치구 있는 일반시 합성형 우선 매칭: "<시명> <n>구" 패턴.
 *  4. 합성형 매칭 안 되면 단순 "<n>(시|군|구)" 단일 캡처.
 *  5. 시 단위 row fallback 은 resolveRegionId 가 담당 (여기서는 sigungu 그대로).
 */
export function extractKoreanRegion(
  addr: string | null | undefined,
): { sido: string; sigungu: string | null } | null {
  if (!addr) return null;

  // sido 매칭
  let sido: string | null = null;
  let sidoPattern: RegExp | null = null;
  for (const p of SIDO_PATTERNS) {
    if (p.re.test(addr)) {
      sido = p.name;
      sidoPattern = p.re;
      break;
    }
  }
  if (!sido || !sidoPattern) return null;

  // 시도 접두사 제거 — 광역시/도 명칭이 sigungu 로 캡처되는 것을 방지.
  // 예: "서울특별시 종로구" → " 종로구", "부산광역시 해운대구" → " 해운대구"
  const rest = addr.replace(sidoPattern, '');

  // 합성형 우선 매칭: "수원시 영통구" 등 — rest 에서 탐색
  for (const city of CITIES_WITH_AUTONOMOUS_DISTRICTS) {
    const re = new RegExp(`${city}\\s*([가-힣]{1,5}구)`);
    const m = rest.match(re);
    if (m) return { sido, sigungu: `${city} ${m[1]!}` };
  }

  // 일반 시/군/구 단일 매칭 — 한글 1~5자 + 시/군/구 (마산합포구 등 긴 자치구명 대응)
  const sgMatch = rest.match(/([가-힣]{1,5}(?:시|군|구))/);
  if (sgMatch) {
    const sg = sgMatch[1]!;
    // "서울시" 같은 모호 표기는 sigungu 아님 (광역만 인식)
    if (sg === '서울시') return { sido, sigungu: null };
    return { sido, sigungu: sg };
  }

  return { sido, sigungu: null };
}

/**
 * 주소 텍스트 → regions.regionId 매핑. 4단 fallback:
 *  1. (sido, sigungu) exact 매치
 *  2. (sido, "<시>") 시 단위 fallback (자치구 있는 일반시인데 자치구가 sigungu 와 시드 모두 안 맞을 때)
 *  3. (sido, NULL) 광역 단일 row
 *  4. null — 호출자 (upsertCrawledEvent) 가 throw
 */
export async function resolveRegionId(
  addr: string | null | undefined,
): Promise<bigint | null> {
  const r = extractKoreanRegion(addr);
  if (!r) return null;

  // 1. exact match
  if (r.sigungu) {
    const exact = await prisma.region.findFirst({
      where: { sidoName: r.sido, sigunguName: r.sigungu, dongName: null },
      select: { regionId: true },
    });
    if (exact) return exact.regionId;

    // 2. 합성형이면 시 단위 fallback
    if (r.sigungu.includes(' ')) {
      const cityOnly = r.sigungu.split(' ')[0]!;
      const cityRow = await prisma.region.findFirst({
        where: { sidoName: r.sido, sigunguName: cityOnly, dongName: null },
        select: { regionId: true },
      });
      if (cityRow) return cityRow.regionId;
    }
  }

  // 3. 광역 fallback
  const sidoRow = await prisma.region.findFirst({
    where: { sidoName: r.sido, sigunguName: null, dongName: null },
    select: { regionId: true },
  });
  return sidoRow?.regionId ?? null;
}

const categoryIdCache = new Map<EventCategoryCode, bigint>();

export async function getCategoryId(code: EventCategoryCode): Promise<bigint> {
  const cached = categoryIdCache.get(code);
  if (cached !== undefined) return cached;
  const row = await prisma.eventCategory.findUnique({
    where: { categoryCode: code },
    select: { categoryId: true },
  });
  if (!row) throw new Error(`event_categories 에 '${code}' 행이 없습니다 — seed_master_data 확인`);
  categoryIdCache.set(code, row.categoryId);
  return row.categoryId;
}

/**
 * 크로스-소스 중복 체크: (title, start_date, end_date) 가 동일한 이벤트가
 * 다른 crawl_origin 에 이미 있으면 true.
 *
 * 한계: title 이 공백/기호 하나라도 다르면 못 잡음. Phase 2 에서 normalized_title
 * + pg_trgm similarity 로 강화 예정. 지금은 정확 일치 기준.
 */
async function existsInOtherOrigin(ev: NormalizedEvent): Promise<boolean> {
  const hit = await prisma.event.findFirst({
    where: {
      title: ev.title.slice(0, 200),
      startDate: ev.startDate,
      endDate: ev.endDate,
      crawlOrigin: { not: ev.crawlOrigin },
    },
    select: { eventId: true },
  });
  return hit !== null;
}

export async function upsertCrawledEvent(ev: NormalizedEvent): Promise<void> {
  if (ev.endDate < ev.startDate) throw new Error('endDate < startDate');

  // 크로스-소스 dedup: 다른 소스가 이미 같은 이벤트 등록했으면 skip (먼저 들어온 쪽이 win).
  if (await existsInOtherOrigin(ev)) return;

  const categoryId = await getCategoryId(ev.categoryCode);
  const regionId = await resolveRegionId(ev.addressText);
  if (!regionId) throw new Error('region resolution failed');

  // update 절에 categoryId·regionId 도 포함 — 분류 로직 개선 후 재ingest 시 기존 row 도 교정.
  // 관리자가 수동 재분류한 행은 별도 'manual_override' 필드가 생기기 전까진 덮어쓰기 허용.

  const data = {
    categoryId,
    regionId,
    sourceType: 'crawled',
    crawlOrigin: ev.crawlOrigin,
    title: ev.title.slice(0, 200),
    description: ev.description ? ev.description.slice(0, 10_000) : null,
    addressDetail: ev.addressText?.slice(0, 255) ?? null,
    startDate: ev.startDate,
    endDate: ev.endDate,
    posterImageUrl: ev.posterImageUrl?.slice(0, 500) ?? null,
    approvalStatus: 'approved',
    phase: computePhase(ev.startDate, ev.endDate),
    approvedAt: new Date(),
  } satisfies Omit<Prisma.EventUncheckedCreateInput, 'externalSourceId'>;

  // v4.10 — lat/lng 컬럼 DROP 후 location_geom 단일 source. Prisma client 가 Unsupported 필드라
  // create/update 에서 직접 set 불가 → upsert 후 별도 raw UPDATE 로 채움. NULL coords 면 NULL.
  const upserted = await prisma.event.upsert({
    where: {
      crawlOrigin_externalSourceId: {
        crawlOrigin: ev.crawlOrigin,
        externalSourceId: ev.externalSourceId,
      },
    },
    create: { ...data, externalSourceId: ev.externalSourceId },
    update: {
      title: data.title,
      description: data.description,
      addressDetail: data.addressDetail,
      startDate: data.startDate,
      endDate: data.endDate,
      posterImageUrl: data.posterImageUrl,
      phase: data.phase,
      categoryId: data.categoryId,
      regionId: data.regionId,
    },
  });

  const validLat = ev.latitude !== null && Number.isFinite(ev.latitude);
  const validLng = ev.longitude !== null && Number.isFinite(ev.longitude);
  if (validLat && validLng) {
    await prisma.$executeRaw`
      UPDATE events
      SET location_geom = ST_SetSRID(ST_MakePoint(${ev.longitude!}::float, ${ev.latitude!}::float), 4326)
      WHERE event_id = ${upserted.eventId}
    `;
  } else {
    // 좌표 부재 시 명시 NULL set (이전 row 의 location_geom 잔존 가능 — 명시적 정리).
    await prisma.$executeRaw`
      UPDATE events SET location_geom = NULL WHERE event_id = ${upserted.eventId}
    `;
  }
}

/** HTML tag 제거 + 엔티티 디코드(&nbsp; 등) + 공백 정규화. 100K 길이 컷오프. */
export function cleanDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let t = raw.slice(0, 100_000);
  t = t.replace(/<[^>]+>/g, ' ');
  t = t
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
}

export interface IngestResult {
  fetched: number;
  upserted: number;
  skipped: number;
  errors: number;
}
