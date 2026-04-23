import { createHash } from 'node:crypto';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { fetchWithRetry } from './lib/fetch-with-retry.js';
import {
  cleanDescription,
  isForwardLooking,
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
 * - API 가 서버사이드 날짜 필터를 지원 안 하므로 전체 페치 후 isForwardLooking 로 필터.
 *   이미 끝난 이벤트는 초기 backfill 이 DB 에 보관 중 → 여기선 새로 upsert 하지 않음.
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
  // 추가 설명 필드 — 대부분 비어있지만 있을 땐 가치 큼.
  USE_TRGT?: string;   // 이용대상
  USE_FEE?: string;    // 이용료
  PLAYER?: string;     // 출연자
  PROGRAM?: string;    // 프로그램 소개
  ETC_DESC?: string;   // 기타 설명
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

/**
 * Seoul API CODENAME → 내부 카테고리 매핑.
 *
 * 실 분포 (샘플 1,000):
 *   교육/체험 36% · 전시/미술 16% · 클래식 16% · 콘서트 6% · 연극 4%
 *   국악 4% · 독주/독창회 3% · 뮤지컬/오페라 3% · 무용 2% · 영화 2% · 축제-* 7%
 *
 * 우선순위 순서가 중요: 특수 키워드를 먼저 매칭.
 */
function classifyCategory(codename: string | undefined): EventCategoryCode {
  if (!codename) return 'festival';
  // 고정 키워드 (행사 포맷)
  if (/박람회/.test(codename)) return 'expo';
  if (/심포지(엄|움)/.test(codename)) return 'symposium';
  if (/컨퍼런스|컨퍼렌스|포럼/.test(codename)) return 'conference';
  // 축제 포맷: "축제-문화/예술", "축제-기타" 등
  if (/축제/.test(codename)) return 'festival';
  // 전시 계열
  if (/전시|미술/.test(codename)) return 'exhibition';
  // 공연 계열: 클래식 / 콘서트 / 연극 / 국악 / 독주 / 독창 / 뮤지컬 / 오페라 / 무용
  if (/클래식|콘서트|연극|국악|독주|독창|뮤지컬|오페라|무용/.test(codename)) return 'performance';
  // 영화
  if (/영화/.test(codename)) return 'movie';
  // 교육·체험
  if (/교육|체험/.test(codename)) return 'education';
  // 기타는 festival (원본 데이터에서 "기타" 카테고리 몇 % 존재)
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
  const res = await fetchWithRetry(url, { headers: { Accept: 'application/json' } }, { source: 'seoul-culture' });
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
  // 설명 필드 합성: PROGRAM + ETC_DESC 가 본문. PLAYER/USE_TRGT/USE_FEE 는 보조.
  // Seoul OpenAPI 는 description 전용 필드가 없어 여러 필드를 라벨링해 합친다.
  const parts: string[] = [];
  if (row.PROGRAM) parts.push(row.PROGRAM);
  if (row.ETC_DESC) parts.push(row.ETC_DESC);
  if (row.PLAYER) parts.push(`출연: ${row.PLAYER}`);
  if (row.USE_TRGT) parts.push(`대상: ${row.USE_TRGT}`);
  if (row.USE_FEE) parts.push(`이용료: ${row.USE_FEE}`);
  const description = cleanDescription(parts.join('\n'));
  return {
    externalSourceId: makeExternalId(row),
    crawlOrigin: CRAWL_ORIGIN,
    categoryCode: classifyCategory(row.CODENAME),
    title: row.TITLE,
    description,
    addressText,
    latitude,
    longitude,
    startDate: start,
    endDate: end,
    posterImageUrl: row.MAIN_IMG || null,
  };
}

/**
 * @param options.includePast true 면 forward-looking 필터 해제 — 전체(종료 포함) backfill/재분류 용.
 *                            일일 배치에서는 기본 false (진행중+예정만).
 */
export async function runSeoulCultureIngest(options: { includePast?: boolean } = {}): Promise<IngestResult> {
  const log = logger.child({ job: 'seoul-culture-ingest', includePast: !!options.includePast });
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
      if (!options.includePast && !isForwardLooking(ev.startDate, ev.endDate)) {
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
