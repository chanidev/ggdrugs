import { createHash } from 'node:crypto';
import { env } from '../env.js';
import { logger } from '../logger.js';
import {
  parseYmd,
  upsertCrawledEvent,
  type EventCategoryCode,
  type IngestResult,
  type NormalizedEvent,
} from './ingest-common.js';

/**
 * 서울열린데이터광장 "문화행사 정보" ingest.
 *
 * - 엔드포인트: http://openapi.seoul.go.kr:8088/{KEY}/json/culturalEventInfo/{START}/{END}
 * - 인증키는 '일반 인증키' (raw, URL 인코딩 없음) — URL path 세그먼트에 그대로 삽입.
 * - 최대 1000 행/요청, START/END 는 1-based index.
 * - 외부 고유 ID 가 없어서 sha1(title|strtdate|place) 로 external_source_id 생성.
 * - LOT/LAT 필드 값을 범위로 자동 판별 (Seoul API 가 관례적으로 뒤섞어 넣음).
 * - CODENAME 에 박람회/심포지움/컨퍼런스 키워드 있으면 해당 카테고리로, 아니면 festival.
 */

const BASE = 'http://openapi.seoul.go.kr:8088';
const ENDPOINT = 'culturalEventInfo';
const CRAWL_ORIGIN = 'seoul-culture';
const PAGE_SIZE = 1000;

interface SeoulEventRow {
  CODENAME?: string;
  GUNAME?: string;
  TITLE?: string;
  PLACE?: string;
  STRTDATE?: string;
  END_DATE?: string;
  MAIN_IMG?: string;
  ORG_LINK?: string;
  HMPG_ADDR?: string;
  LOT?: string;
  LAT?: string;
}

interface SeoulResponse {
  culturalEventInfo?: {
    list_total_count?: number;
    RESULT?: { CODE?: string; MESSAGE?: string };
    row?: SeoulEventRow[];
  };
  RESULT?: { CODE?: string; MESSAGE?: string };
}

function makeExternalId(row: SeoulEventRow): string {
  const src = `${row.TITLE ?? ''}|${row.STRTDATE ?? ''}|${row.PLACE ?? ''}`;
  return createHash('sha1').update(src).digest('hex').slice(0, 32);
}

function classifyCategory(codename: string | undefined): EventCategoryCode {
  if (!codename) return 'festival';
  if (/박람회/.test(codename)) return 'expo';
  if (/심포지(엄|움)/.test(codename)) return 'symposium';
  if (/컨퍼런스|컨퍼렌스|포럼/.test(codename)) return 'conference';
  return 'festival';
}

/** LOT/LAT 중 37 근처는 latitude, 126-128 근처는 longitude. 값 범위로 자동 할당. */
function splitLatLng(lot: string | undefined, lat: string | undefined): { latitude: number | null; longitude: number | null } {
  const candidates = [lot, lat].map((v) => (v ? Number(v) : NaN));
  let latitude: number | null = null;
  let longitude: number | null = null;
  for (const n of candidates) {
    if (!Number.isFinite(n)) continue;
    if (n >= 33 && n <= 40) latitude = n;
    else if (n >= 124 && n <= 132) longitude = n;
  }
  return { latitude, longitude };
}

async function fetchPage(start: number, end: number): Promise<{ items: SeoulEventRow[]; total: number }> {
  if (!env.SEOUL_OPEN_API_KEY) throw new Error('SEOUL_OPEN_API_KEY is not set');
  const url = `${BASE}/${env.SEOUL_OPEN_API_KEY}/json/${ENDPOINT}/${start}/${end}/`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Seoul OpenAPI HTTP ${res.status}`);
  const data = (await res.json()) as SeoulResponse;

  const outer = data.RESULT;
  if (outer && outer.CODE && outer.CODE !== 'INFO-000') {
    throw new Error(`Seoul OpenAPI error ${outer.CODE}: ${outer.MESSAGE}`);
  }
  const block = data.culturalEventInfo;
  const resultCode = block?.RESULT?.CODE;
  if (resultCode && resultCode !== 'INFO-000' && resultCode !== 'INFO-200') {
    throw new Error(`Seoul OpenAPI error ${resultCode}: ${block?.RESULT?.MESSAGE}`);
  }
  return { items: block?.row ?? [], total: block?.list_total_count ?? 0 };
}

function toNormalized(row: SeoulEventRow): NormalizedEvent | null {
  const start = parseYmd(row.STRTDATE);
  const end = parseYmd(row.END_DATE);
  if (!start || !end || end < start || !row.TITLE) return null;
  const gu = row.GUNAME ? `${row.GUNAME.endsWith('구') ? row.GUNAME : row.GUNAME + '구'}` : '';
  const addressText = row.PLACE ? `서울 ${gu} ${row.PLACE}`.trim() : `서울 ${gu}`.trim() || null;
  const { latitude, longitude } = splitLatLng(row.LOT, row.LAT);
  return {
    externalSourceId: makeExternalId(row),
    crawlOrigin: CRAWL_ORIGIN,
    categoryCode: classifyCategory(row.CODENAME),
    title: row.TITLE,
    addressText,
    latitude,
    longitude,
    startDate: start,
    endDate: end,
    posterImageUrl: row.MAIN_IMG || null,
  };
}

export async function runSeoulCultureIngest(): Promise<IngestResult> {
  const log = logger.child({ job: 'seoul-culture-ingest' });
  const result: IngestResult = { fetched: 0, upserted: 0, skipped: 0, errors: 0 };

  if (!env.SEOUL_OPEN_API_KEY) {
    log.warn('SEOUL_OPEN_API_KEY missing — skip');
    return result;
  }
  log.info('start');

  let offset = 1;
  while (true) {
    let page: Awaited<ReturnType<typeof fetchPage>>;
    try {
      page = await fetchPage(offset, offset + PAGE_SIZE - 1);
    } catch (err) {
      log.error({ offset, err: err instanceof Error ? err.message : String(err) }, 'fetch failed');
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
        log.error({ title: raw.TITLE, err: err instanceof Error ? err.message : String(err) }, 'upsert failed');
        result.errors += 1;
      }
    }
    if (result.fetched >= page.total) break;
    offset += PAGE_SIZE;
  }
  log.info(result, 'done');
  return result;
}
