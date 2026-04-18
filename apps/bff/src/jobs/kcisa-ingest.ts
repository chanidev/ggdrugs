import { createHash } from 'node:crypto';
import { env } from '../env.js';
import { logger } from '../logger.js';
import {
  extractSeoulGu,
  isForwardLooking,
  isSeoulAddress,
  parseYmd,
  upsertCrawledEvent,
  type EventCategoryCode,
  type IngestResult,
  type NormalizedEvent,
} from './ingest-common.js';

/**
 * 한국문화정보원(KCISA) 공연전시정보 ingest.
 *
 * - 엔드포인트: https://api.kcisa.kr/openapi/API_CCA_145/request
 * - 응답: XML (JSON 미지원). 단순 <TAG>value</TAG> 구조라 regex 파싱.
 * - 키는 URL-encoded (공공데이터포털·KCISA 모두 동일 관례).
 * - 서울만 필터 (EVENT_SITE 에 "서울" 포함 여부).
 * - GENRE 키워드로 4 카테고리 분류 (박람회/심포지움/컨퍼런스/그 외 festival).
 */

const BASE_URL = 'https://api.kcisa.kr/openapi/API_CCA_145/request';
const CRAWL_ORIGIN = 'kcisa-culture';
const PAGE_SIZE = 100;

interface KcisaItem {
  TITLE?: string;
  LOCAL_ID?: string;
  EVENT_SITE?: string;
  EVENT_PERIOD?: string;
  IMAGE_OBJECT?: string;
  GENRE?: string;
  SUB_TITLE?: string;
  DESCRIPTION?: string;
  URL?: string;
}

function parseXmlItems(xml: string): KcisaItem[] {
  const items: KcisaItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const body = m[1]!;
    const obj: Record<string, string> = {};
    const tagRegex = /<([A-Z_]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tagRegex.exec(body)) !== null) {
      // CDATA 껍질 제거
      const raw = tm[2]!.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
      obj[tm[1]!] = raw;
    }
    items.push(obj as KcisaItem);
  }
  return items;
}

function parseResultCode(xml: string): { code: string; msg: string } {
  const code = xml.match(/<resultCode>([^<]+)<\/resultCode>/)?.[1] ?? '';
  const msg = xml.match(/<resultMsg>([^<]+)<\/resultMsg>/)?.[1] ?? '';
  return { code, msg };
}

function parseTotalCount(xml: string): number {
  const m = xml.match(/<totalCount>(\d+)<\/totalCount>/);
  return m ? Number(m[1]!) : 0;
}

/** EVENT_PERIOD = "20250101~20250131" or "2025-01-01 ~ 2025-01-31". */
function parsePeriod(period: string | undefined): { start: Date; end: Date } | null {
  if (!period) return null;
  const parts = period.split(/[~–—]/).map((s) => s.trim());
  if (parts.length < 2) return null;
  const start = parseYmd(parts[0]);
  const end = parseYmd(parts[1]);
  if (!start || !end || end < start) return null;
  return { start, end };
}

function classifyCategory(genre: string | undefined): EventCategoryCode {
  if (!genre) return 'festival';
  if (/박람회/.test(genre)) return 'expo';
  if (/심포지(엄|움)/.test(genre)) return 'symposium';
  if (/컨퍼런스|컨퍼렌스|포럼/.test(genre)) return 'conference';
  return 'festival';
}

function externalIdOf(item: KcisaItem): string {
  if (item.LOCAL_ID && item.LOCAL_ID.length > 0) return item.LOCAL_ID.slice(0, 100);
  const src = `${item.TITLE ?? ''}|${item.EVENT_PERIOD ?? ''}|${item.EVENT_SITE ?? ''}`;
  return createHash('sha1').update(src).digest('hex').slice(0, 32);
}

async function fetchPage(pageNo: number): Promise<{ items: KcisaItem[]; total: number }> {
  if (!env.KCISA_API_KEY) throw new Error('KCISA_API_KEY is not set');
  const qs = [
    `serviceKey=${env.KCISA_API_KEY}`,
    `numOfRows=${PAGE_SIZE}`,
    `pageNo=${pageNo}`,
  ].join('&');
  const res = await fetch(`${BASE_URL}?${qs}`, { headers: { Accept: 'application/xml' } });
  if (!res.ok) throw new Error(`KCISA HTTP ${res.status}`);
  const xml = await res.text();
  const { code, msg } = parseResultCode(xml);
  if (code && code !== '00' && code !== '0000') {
    throw new Error(`KCISA error ${code}: ${msg}`);
  }
  return { items: parseXmlItems(xml), total: parseTotalCount(xml) };
}

function toNormalized(item: KcisaItem): NormalizedEvent | null {
  if (!item.TITLE) return null;
  if (!isSeoulAddress(item.EVENT_SITE)) return null; // 서울 아닌 건 skip (현재 regions 커버리지)
  const period = parsePeriod(item.EVENT_PERIOD);
  if (!period) return null;
  const gu = extractSeoulGu(item.EVENT_SITE);
  const addressText = item.EVENT_SITE ?? (gu ? `서울 ${gu}` : '서울');
  return {
    externalSourceId: externalIdOf(item),
    crawlOrigin: CRAWL_ORIGIN,
    categoryCode: classifyCategory(item.GENRE),
    title: item.TITLE,
    addressText,
    latitude: null,
    longitude: null,
    startDate: period.start,
    endDate: period.end,
    posterImageUrl: item.IMAGE_OBJECT || null,
  };
}

export async function runKcisaIngest(): Promise<IngestResult> {
  const log = logger.child({ job: 'kcisa-ingest' });
  const result: IngestResult = { fetched: 0, upserted: 0, skipped: 0, errors: 0 };

  if (!env.KCISA_API_KEY) {
    log.warn('KCISA_API_KEY missing — skip');
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
      if (!ev || !isForwardLooking(ev.startDate, ev.endDate)) {
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
    pageNo += 1;
    // 안전장치: 10페이지 (1000건) 이후는 다음 주기
    if (pageNo > 10) break;
  }
  log.info(result, 'done');
  return result;
}
