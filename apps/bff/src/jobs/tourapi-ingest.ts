import { env } from '../env.js';
import { logger } from '../logger.js';
import {
  parseYmd,
  upsertCrawledEvent,
  type IngestResult,
  type NormalizedEvent,
} from './ingest-common.js';

/**
 * TourAPI (한국관광공사) 축제 크롤 ingest.
 *
 * - 엔드포인트: KorService2/searchFestival2 (contentTypeId=15 축제공연행사)
 * - 대상: 서울(areaCode=1), eventStartDate=20240101 이후 전체
 * - TOUR_API_KEY 는 공공데이터포털 발급값이 이미 URL-인코딩돼 있어서 URLSearchParams
 *   로 재인코딩하면 이중 인코딩됨. 쿼리 문자열을 수동 조립.
 */

const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
const CRAWL_ORIGIN = 'tourapi-festival';
const PAGE_SIZE = 100;
const MOBILE_APP = 'alle';
const EVENT_START_DATE_FLOOR = '20240101';

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

async function fetchPage(pageNo: number): Promise<{ items: TourApiItem[]; total: number }> {
  if (!env.TOUR_API_KEY) throw new Error('TOUR_API_KEY is not set');
  const qs = [
    `serviceKey=${env.TOUR_API_KEY}`,
    'MobileOS=ETC',
    `MobileApp=${MOBILE_APP}`,
    '_type=json',
    'arrange=A',
    `numOfRows=${PAGE_SIZE}`,
    `pageNo=${pageNo}`,
    'areaCode=1',
    `eventStartDate=${EVENT_START_DATE_FLOOR}`,
  ].join('&');

  const res = await fetch(`${BASE_URL}?${qs}`, { headers: { Accept: 'application/json' } });
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
    addressText: addr,
    latitude: lat !== null && Number.isFinite(lat) ? lat : null,
    longitude: lng !== null && Number.isFinite(lng) ? lng : null,
    startDate: start,
    endDate: end,
    posterImageUrl: item.firstimage || item.firstimage2 || null,
  };
}

export async function runTourapiIngest(): Promise<IngestResult> {
  const log = logger.child({ job: 'tourapi-ingest' });
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
      page = await fetchPage(pageNo);
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
  }
  log.info(result, 'done');
  return result;
}
