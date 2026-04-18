import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { env } from '../env.js';
import { logger } from '../logger.js';

/**
 * TourAPI (한국관광공사) 축제 크롤 ingest.
 *
 * - 엔드포인트: KorService2/searchFestival2
 * - 대상: 서울(areaCode=1) 에서 오늘 이후 시작하는 축제 (contentTypeId=15 내재)
 * - 주기: scheduler.ts 에서 24h 간격
 * - 중복: (crawl_origin, external_source_id) 기준 upsert
 * - 승인 상태: 자동으로 `approved` 세팅 (공공데이터 소스 신뢰; 추후 관리자 재심사 가능)
 *
 * 설계 결정:
 * - TOUR_API_KEY 는 공공데이터포털 발급값이 이미 URL-인코딩돼 있어서 URLSearchParams 로
 *   다시 인코딩하면 `%` 가 `%25` 로 이중 인코딩됨. 쿼리 문자열을 수동 조립.
 * - mapx=경도, mapy=위도 (TourAPI 규칙).
 * - addr1 을 정규식으로 파싱해 regions 테이블 매칭; 실패 시 서울 전체(sigungu=NULL) 로 fallback.
 */

const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
const CRAWL_ORIGIN = 'tourapi-festival';
const PAGE_SIZE = 100;
const MOBILE_APP = 'alle';

/**
 * 이 날짜 이후에 시작하는 축제만 가져옴 (TourAPI 필수 파라미터).
 * 2024-01-01 로 넉넉하게 잡아 과거 데이터도 아카이빙 — 쿼리에서 phase 로 분리 가능.
 */
const EVENT_START_DATE_FLOOR = '20240101';

interface TourApiItem {
  contentid: string;
  contenttypeid: string;
  title: string;
  addr1?: string;
  addr2?: string;
  mapx?: string;
  mapy?: string;
  eventstartdate?: string;
  eventenddate?: string;
  firstimage?: string;
  firstimage2?: string;
  areacode?: string;
  sigungucode?: string;
  tel?: string;
}

interface TourApiResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: '' | { item?: TourApiItem | TourApiItem[] };
      numOfRows?: number;
      pageNo?: number;
      totalCount?: number;
    };
  };
}

export interface IngestResult {
  fetched: number;
  upserted: number;
  skipped: number;
  errors: number;
}

/**
 * YYYYMMDD 문자열을 UTC midnight Date 로 파싱. 빈/잘못된 값은 null.
 */
function parseYmd(s: string | undefined): Date | null {
  if (!s || !/^\d{8}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function computePhase(start: Date, end: Date): 'upcoming' | 'ongoing' | 'ended' {
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (todayUtc < start) return 'upcoming';
  if (todayUtc > end) return 'ended';
  return 'ongoing';
}

/**
 * addr1 에서 서울 구 이름을 추출. 예: "서울특별시 종로구 ..." → "종로구".
 */
function extractSigunguFromAddr(addr: string | undefined): string | null {
  if (!addr) return null;
  const match = addr.match(/^서울(?:특별시)?\s+(\S{1,5}구)/);
  return match ? match[1]! : null;
}

async function fetchPage(pageNo: number): Promise<{ items: TourApiItem[]; total: number }> {
  if (!env.TOUR_API_KEY) {
    throw new Error('TOUR_API_KEY is not set');
  }
  // URL-encoded key 를 그대로 사용 (이중 인코딩 방지).
  const qs = [
    `serviceKey=${env.TOUR_API_KEY}`,
    'MobileOS=ETC',
    `MobileApp=${MOBILE_APP}`,
    '_type=json',
    'arrange=A',
    `numOfRows=${PAGE_SIZE}`,
    `pageNo=${pageNo}`,
    'areaCode=1', // 서울
    `eventStartDate=${EVENT_START_DATE_FLOOR}`, // TourAPI 필수 파라미터
  ].join('&');
  const url = `${BASE_URL}?${qs}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`TourAPI HTTP ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  // 인증 실패 시 XML 로 응답하는 경우가 있음 — JSON 파싱 전 체크.
  if (!text.startsWith('{')) {
    throw new Error(`TourAPI non-JSON response: ${text.slice(0, 200)}`);
  }
  const data: TourApiResponse = JSON.parse(text);
  const header = data.response?.header;
  if (header?.resultCode !== '0000') {
    throw new Error(`TourAPI error ${header?.resultCode}: ${header?.resultMsg}`);
  }
  const body = data.response?.body;
  const rawItems = body?.items;
  let items: TourApiItem[] = [];
  if (rawItems && typeof rawItems === 'object') {
    const inner = rawItems.item;
    items = Array.isArray(inner) ? inner : inner ? [inner] : [];
  }
  return { items, total: body?.totalCount ?? 0 };
}

async function resolveRegionId(addr1: string | undefined): Promise<bigint | null> {
  const sigungu = extractSigunguFromAddr(addr1);
  if (sigungu) {
    const row = await prisma.region.findFirst({
      where: { sidoName: '서울', sigunguName: sigungu, dongName: null },
      select: { regionId: true },
    });
    if (row) return row.regionId;
  }
  // fallback: 서울 전체
  const fallback = await prisma.region.findFirst({
    where: { sidoName: '서울', sigunguName: null, dongName: null },
    select: { regionId: true },
  });
  return fallback?.regionId ?? null;
}

let festivalCategoryIdCache: bigint | null = null;
async function getFestivalCategoryId(): Promise<bigint> {
  if (festivalCategoryIdCache !== null) return festivalCategoryIdCache;
  const row = await prisma.eventCategory.findUnique({
    where: { categoryCode: 'festival' },
    select: { categoryId: true },
  });
  if (!row) throw new Error("event_categories 에 'festival' 행이 없습니다 — 20260418120000_seed_master_data 적용 확인");
  festivalCategoryIdCache = row.categoryId;
  return row.categoryId;
}

async function upsertEvent(item: TourApiItem, log: typeof logger): Promise<'upserted' | 'skipped'> {
  const start = parseYmd(item.eventstartdate);
  const end = parseYmd(item.eventenddate);
  if (!start || !end || end < start) {
    log.warn({ contentid: item.contentid, start: item.eventstartdate, end: item.eventenddate }, 'skip invalid dates');
    return 'skipped';
  }

  const categoryId = await getFestivalCategoryId();
  const regionId = await resolveRegionId(item.addr1);
  if (!regionId) {
    log.warn({ contentid: item.contentid, addr1: item.addr1 }, 'skip unresolved region');
    return 'skipped';
  }

  const lat = item.mapy ? Number(item.mapy) : null;
  const lng = item.mapx ? Number(item.mapx) : null;
  const addressDetail = [item.addr1, item.addr2].filter(Boolean).join(' ').trim() || null;
  const poster = item.firstimage || item.firstimage2 || null;
  const phase = computePhase(start, end);

  const common = {
    categoryId,
    regionId,
    sourceType: 'crawled',
    crawlOrigin: CRAWL_ORIGIN,
    title: item.title.slice(0, 200),
    addressDetail: addressDetail?.slice(0, 255) ?? null,
    latitude: lat !== null && Number.isFinite(lat) ? new Prisma.Decimal(lat.toFixed(7)) : null,
    longitude: lng !== null && Number.isFinite(lng) ? new Prisma.Decimal(lng.toFixed(7)) : null,
    startDate: start,
    endDate: end,
    posterImageUrl: poster?.slice(0, 500) ?? null,
    approvalStatus: 'approved',
    phase,
    approvedAt: new Date(),
  } satisfies Prisma.EventUncheckedCreateInput;

  await prisma.event.upsert({
    where: {
      crawlOrigin_externalSourceId: {
        crawlOrigin: CRAWL_ORIGIN,
        externalSourceId: item.contentid,
      },
    },
    create: {
      ...common,
      externalSourceId: item.contentid,
    },
    update: {
      // 변경 가능 필드만 갱신 (이미 관리자가 수정한 메타는 덮어쓰지 않도록 향후 분리 검토)
      title: common.title,
      addressDetail: common.addressDetail,
      latitude: common.latitude,
      longitude: common.longitude,
      startDate: common.startDate,
      endDate: common.endDate,
      posterImageUrl: common.posterImageUrl,
      phase: common.phase,
    },
  });
  return 'upserted';
}

export async function runTourapiIngest(): Promise<IngestResult> {
  const log = logger.child({ job: 'tourapi-ingest' });
  const result: IngestResult = { fetched: 0, upserted: 0, skipped: 0, errors: 0 };

  log.info('start');
  let pageNo = 1;
  while (true) {
    let page: Awaited<ReturnType<typeof fetchPage>>;
    try {
      page = await fetchPage(pageNo);
    } catch (err) {
      log.error({ pageNo, err: err instanceof Error ? err.message : String(err) }, 'fetch failed');
      result.errors += 1;
      break;
    }
    if (page.items.length === 0) break;
    result.fetched += page.items.length;

    for (const item of page.items) {
      try {
        const outcome = await upsertEvent(item, log);
        if (outcome === 'upserted') result.upserted += 1;
        else result.skipped += 1;
      } catch (err) {
        log.error({ contentid: item.contentid, err: err instanceof Error ? err.message : String(err) }, 'upsert failed');
        result.errors += 1;
      }
    }
    if (result.fetched >= page.total) break;
    pageNo += 1;
  }
  log.info(result, 'done');
  return result;
}
