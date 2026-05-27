import { env } from '../env.js';
import { logger } from '../logger.js';
import { fetchWithRetry } from './lib/fetch-with-retry.js';
import {
  isForwardLooking,
  parseYmd,
  todayYmd,
  upsertCrawledEvent,
  type IngestResult,
  type NormalizedEvent,
} from './ingest-common.js';

/**
 * TourAPI (한국관광공사) 축제 크롤 ingest.
 *
 * - 엔드포인트: KorService2/searchFestival2 (contentTypeId=15 축제공연행사)
 * - 대상: 전국 (ADR 0006 — 2026-05-27 areaCode 하드코드 제거). eventStartDate=오늘 이후가 기본.
 *   backfill 시 `runTourapiIngest({ eventStartDate: '20260101', includePast: true })` 로 과거 포함.
 * - TOUR_API_KEY 는 공공데이터포털 발급값이 이미 URL-인코딩돼 있어서 URLSearchParams
 *   로 재인코딩하면 이중 인코딩됨. 쿼리 문자열을 수동 조립.
 */

const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
const CRAWL_ORIGIN = 'tourapi-festival';
const PAGE_SIZE = 100;
const MOBILE_APP = 'alle';
const DEFAULT_MAX_PAGES = 50;

interface TourApiItem {
  contentid: string;
  title: string;
  addr1?: string;
  addr2?: string;
  mapx?: string;
  mapy?: string;
  eventstartdate?: string;
  eventenddate?: string;
  firstimage?: string;
  firstimage2?: string;
}

interface TourApiResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: '' | { item?: TourApiItem | TourApiItem[] };
      totalCount?: number;
    };
  };
}

async function fetchPage(
  pageNo: number,
  eventStartDate: string,
  areaCode?: string,
): Promise<{ items: TourApiItem[]; total: number }> {
  if (!env.TOUR_API_KEY) throw new Error('TOUR_API_KEY is not set');
  const params = [
    `serviceKey=${env.TOUR_API_KEY}`,
    'MobileOS=ETC',
    `MobileApp=${MOBILE_APP}`,
    '_type=json',
    'arrange=A',
    `numOfRows=${PAGE_SIZE}`,
    `pageNo=${pageNo}`,
    `eventStartDate=${eventStartDate}`,
  ];
  // areaCode 미지정 시 전국 (ADR 0006). 1=서울, 6=부산, 31=경기, … 운영자가 명시한 경우만 필터.
  if (areaCode) params.push(`areaCode=${areaCode}`);
  const qs = params.join('&');

  const res = await fetchWithRetry(
    `${BASE_URL}?${qs}`,
    { headers: { Accept: 'application/json' } },
    { source: 'tourapi' },
  );
  if (!res.ok) throw new Error(`TourAPI HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (!text.startsWith('{')) throw new Error(`TourAPI non-JSON: ${text.slice(0, 200)}`);
  const data: TourApiResponse = JSON.parse(text);
  if (data.response?.header?.resultCode !== '0000') {
    throw new Error(`TourAPI error ${data.response?.header?.resultCode}: ${data.response?.header?.resultMsg}`);
  }
  const raw = data.response?.body?.items;
  let items: TourApiItem[] = [];
  if (raw && typeof raw === 'object') {
    const inner = raw.item;
    items = Array.isArray(inner) ? inner : inner ? [inner] : [];
  }
  return { items, total: data.response?.body?.totalCount ?? 0 };
}

function toNormalized(item: TourApiItem): NormalizedEvent | null {
  const start = parseYmd(item.eventstartdate);
  const end = parseYmd(item.eventenddate);
  if (!start || !end || end < start) return null;
  const addr = [item.addr1, item.addr2].filter(Boolean).join(' ').trim() || null;
  const lat = item.mapy ? Number(item.mapy) : null;
  const lng = item.mapx ? Number(item.mapx) : null;
  return {
    externalSourceId: item.contentid,
    crawlOrigin: CRAWL_ORIGIN,
    categoryCode: 'festival',
    title: item.title,
    // TourAPI `searchFestival2` 는 설명을 기본 리턴 안 함 (detailCommon 별도 호출 필요).
    // 대량 배치 비용 문제로 skip — AI 요약은 title+category 기반으로 fallback.
    description: null,
    addressText: addr,
    latitude: lat !== null && Number.isFinite(lat) ? lat : null,
    longitude: lng !== null && Number.isFinite(lng) ? lng : null,
    startDate: start,
    endDate: end,
    posterImageUrl: item.firstimage || item.firstimage2 || null,
  };
}

export interface TourapiIngestOptions {
  /** YYYYMMDD floor. 기본은 오늘 (forward-looking). backfill 시 과거 날짜 지정. */
  eventStartDate?: string;
  /** TourAPI areaCode (1=서울, 6=부산, 31=경기, …). 미지정 시 전국. ADR 0006 이전엔 '1' 하드코드. */
  areaCode?: string;
  /** true 면 isForwardLooking 가드 우회 (ended 포함). 운영자 backfill 전용. */
  includePast?: boolean;
  /** 페이지 캡. 기본 50 (= 5000 row). backfill 시 증가 가능. */
  maxPages?: number;
}

/** 하위 호환: 옛 `runTourapiIngest(string)` 호출도 floor 로 해석. */
export async function runTourapiIngest(
  optsOrFloor: TourapiIngestOptions | string = {},
): Promise<IngestResult> {
  const opts: TourapiIngestOptions = typeof optsOrFloor === 'string' ? { eventStartDate: optsOrFloor } : optsOrFloor;
  const eventStartDate = opts.eventStartDate ?? todayYmd();
  const areaCode = opts.areaCode;
  const includePast = opts.includePast ?? false;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const log = logger.child({ job: 'tourapi-ingest', floor: eventStartDate, areaCode: areaCode ?? '전국', includePast });
  const result: IngestResult = { fetched: 0, upserted: 0, skipped: 0, errors: 0 };

  if (!env.TOUR_API_KEY) {
    log.warn('TOUR_API_KEY missing — skip');
    return result;
  }
  log.info('start');

  let pageNo = 1;
  while (true) {
    let page: Awaited<ReturnType<typeof fetchPage>>;
    try {
      page = await fetchPage(pageNo, eventStartDate, areaCode);
    } catch (err) {
      log.error({ pageNo, err: err instanceof Error ? err.message : String(err) }, 'fetch failed');
      result.errors += 1;
      break;
    }
    if (page.items.length === 0) break;
    result.fetched += page.items.length;

    for (const raw of page.items) {
      const ev = toNormalized(raw);
      if (!ev) {
        result.skipped += 1;
        continue;
      }
      if (!includePast && !isForwardLooking(ev.startDate, ev.endDate)) {
        result.skipped += 1;
        continue;
      }
      try {
        await upsertCrawledEvent(ev);
        result.upserted += 1;
      } catch (err) {
        log.error({ contentid: raw.contentid, err: err instanceof Error ? err.message : String(err) }, 'upsert failed');
        result.errors += 1;
      }
    }
    if (result.fetched >= page.total) break;
    pageNo += 1;
    if (pageNo > maxPages) break;
  }
  log.info(result, 'done');
  return result;
}
