import { env } from '../env.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { Prisma } from '@prisma/client';
import { callLlm } from '../llm-client.js';

/**
 * 네이버 뉴스 검색 API → event_article_mappings 채움 (A_400 · N-2).
 *
 * 대상: approved + 미삭제 이벤트. 이벤트마다 `"{title}"` 쿼리로 네이버 뉴스를
 * 조회하고 결과 기사를 news_articles 에 upsert, event_article_mappings 에
 * relevance_score 와 함께 연결한다.
 *
 * 소스 한정 아님 — 네이버 뉴스 검색은 여러 언론사(동아·한겨레·연합·SBS·JTBC 등)
 * 가 혼재된 결과를 돌려준다. source_name 은 article 의 링크 도메인에서 추출.
 *
 * V2 보강: 네이버 결과가 < 3개면 Google News RSS 를 fallback 으로 추가 호출해
 * 해외·국내 언론사 커버리지 확대. (Google News 는 네이버 뉴스에 없는 소스도 색인.)
 *
 * Relevance scoring (V2 — embedding 재랭킹 결합):
 *   1차 keyword pre-filter:
 *     1.0  — 이벤트 제목이 기사 제목에 정규화 포함
 *     0.7  — 2+ significant token(2자+) 겹침
 *     0.4  — 1개 token 겹침
 *     0.0  — 겹침 없음 (drop)
 *   2차 embedding 재랭킹 (services/llm /embed):
 *     event: title + aiSummary · candidate: title + description
 *     cosine similarity → emb_score (0..1)
 *   final = 0.4 * kw_score + 0.6 * emb_score
 *
 * 저장 threshold: 0.55. 그 이하는 skip. (keyword-only fallback 은 0.5)
 *
 * embedding 불가 (OPENAI_API_KEY 없거나 /embed 503) 시 keyword-only fallback.
 */

const SEARCH_URL = 'https://openapi.naver.com/v1/search/news.json';
const DISPLAY = 20; // 이벤트당 최대 검색 결과
const MIN_SCORE_KEYWORD_ONLY = 0.5; // embedding 없을 때
const MIN_SCORE_WITH_EMBEDDING = 0.55; // embedding 결합 후
const PER_EVENT_MAX_MAPPINGS = 8;
const KEYWORD_HIT_THRESHOLD = 2;
const KEYWORD_WEIGHT = 0.4;
const EMBEDDING_WEIGHT = 0.6;

interface NaverNewsItem {
  title: string;
  originallink?: string;
  link: string;
  description?: string;
  pubDate?: string; // RFC 1123 e.g. "Wed, 05 Mar 2025 09:00:00 +0900"
}

interface NaverNewsResponse {
  total: number;
  start: number;
  display: number;
  items: NaverNewsItem[];
}

export interface NewsNaverIngestResult {
  eventsProcessed: number;
  articlesUpserted: number;
  mappingsUpserted: number;
  skipped: number;
  errors: number;
}

const log = logger.child({ job: 'news-naver-ingest' });

/** 네이버가 감싸는 `<b>` 하이라이트 및 HTML 엔티티 제거. */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .trim();
}

/** 한국어·영어·숫자만 남긴 소문자 normalized 문자열. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

const TOKEN_STOPWORDS = new Set([
  '서울', '축제', '행사', '이벤트', '페스티벌', '전시', '공연', '박람회',
  '2025', '2026', '2027', 'seoul', 'festival',
]);

/** 2글자 이상 token, stopword 제외. */
function significantTokens(normalized: string): Set<string> {
  const out = new Set<string>();
  for (const t of normalized.split(' ')) {
    if (t.length >= 2 && !TOKEN_STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

function computeRelevance(eventTitle: string, article: { title: string; description?: string | null }): number {
  const evNorm = normalize(eventTitle);
  const artTitleNorm = normalize(article.title);
  if (!evNorm || !artTitleNorm) return 0;

  if (artTitleNorm.includes(evNorm)) return 1.0;

  const evTokens = significantTokens(evNorm);
  if (evTokens.size === 0) return 0;

  const artTokens = significantTokens(artTitleNorm + ' ' + normalize(article.description ?? ''));
  let hits = 0;
  for (const t of evTokens) if (artTokens.has(t)) hits += 1;

  if (hits >= KEYWORD_HIT_THRESHOLD) return 0.7;
  if (hits >= 1) return 0.4;
  return 0;
}

/** 뉴스 원문 URL → 언론사 도메인 짧은 이름. */
function sourceFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const firstLabel = host.split('.')[0] ?? host;
    return firstLabel.slice(0, 30);
  } catch {
    return 'unknown';
  }
}

function parsePubDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Cosine similarity — 두 벡터 길이 같다고 가정. */
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/**
 * /embed 배치 호출. 실패 시 null (호출자가 keyword-only fallback).
 * 입력 순서와 동일한 순서의 vector list 반환.
 */
async function embedBatch(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const out = await callLlm<{ vectors: number[][] }>('/embed', { texts });
  if (!out || !Array.isArray(out.vectors)) return null;
  if (out.vectors.length !== texts.length) return null;
  return out.vectors;
}

const GOOGLE_NEWS_RSS = 'https://news.google.com/rss/search';
const GOOGLE_NEWS_FALLBACK_THRESHOLD = 3; // 네이버 사후 kw-filter 결과가 이 미만이면 fallback

/**
 * Google News RSS 파싱 — 공식 API 없음. RSS 가 안정적.
 * 한국어 한정: hl=ko&gl=KR&ceid=KR:ko. 최근 30일로 범위 제한.
 *
 * 아주 얕은 XML regex 파서 — RSS 스펙이 단순해서 충분. 외부 deps 추가 회피.
 * 취약 케이스: CDATA 안에 ]]> 가 들어있으면 깨질 수 있으나 Google News RSS 는 그런 케이스 없음.
 */
async function fetchGoogleNewsRss(query: string): Promise<NaverNewsItem[]> {
  const url = `${GOOGLE_NEWS_RSS}?q=${encodeURIComponent(`${query} when:30d`)}&hl=ko&gl=KR&ceid=KR:ko`;
  let xml: string;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'alle-news-bot/1.0' } });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }

  const items: NaverNewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  const pick = (src: string, tag: string): string | undefined => {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
    const m = src.match(re);
    if (!m) return undefined;
    // CDATA unwrap.
    return m[1]!.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
  };

  for (let m: RegExpExecArray | null; (m = itemRe.exec(xml)) !== null; ) {
    const block = m[1]!;
    const title = pick(block, 'title');
    const link = pick(block, 'link');
    const description = pick(block, 'description');
    const pubDate = pick(block, 'pubDate');
    if (!title || !link) continue;
    const entry: NaverNewsItem = { title, link, originallink: link };
    if (description) entry.description = description;
    if (pubDate) entry.pubDate = pubDate;
    items.push(entry);
  }
  return items;
}

async function fetchNaverNews(query: string): Promise<NaverNewsItem[]> {
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    throw new Error('NAVER_CLIENT_ID/SECRET missing');
  }
  const url = `${SEARCH_URL}?query=${encodeURIComponent(query)}&display=${DISPLAY}&sort=sim`;
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET,
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`naver news ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as NaverNewsResponse;
  return data.items ?? [];
}

/**
 * 한 이벤트에 대해 기사 검색 + 매핑 upsert.
 * 트랜잭션 단위는 기사 1개당. 실패해도 다른 기사/이벤트로 진행.
 */
async function processEvent(
  event: { eventId: bigint; title: string; aiSummary: string | null; description: string | null },
  result: NewsNaverIngestResult,
  useEmbedding: boolean,
) {
  let items: NaverNewsItem[];
  try {
    items = await fetchNaverNews(`"${event.title}"`);
    if (items.length === 0) {
      items = await fetchNaverNews(event.title);
    }
  } catch (err) {
    log.error(
      { eventId: event.eventId.toString(), err: err instanceof Error ? err.message : String(err) },
      'naver search failed',
    );
    result.errors += 1;
    return;
  }

  // 이 이벤트의 기존 매핑을 먼저 비운다 — 이번 실행의 scoring 이 authoritative.
  // scoring 알고리즘 변경(V1 kw-only → V2 embedding 결합) 시 stale 매핑 제거 보장.
  // articles 는 다른 이벤트와 공유될 수 있어 기사 자체는 남긴다 (orphan 은 후속 정리).
  try {
    await prisma.eventArticleMapping.deleteMany({ where: { eventId: event.eventId } });
  } catch (err) {
    log.warn(
      { eventId: event.eventId.toString(), err: err instanceof Error ? err.message : String(err) },
      'stale mapping cleanup failed — 계속 진행',
    );
  }

  // 1차 keyword pre-filter. 0점은 즉시 drop — embedding 비용 낭비 방지.
  const normalize = (rawItems: NaverNewsItem[]) =>
    rawItems.map((item) => {
      const title = stripHtml(item.title);
      const description = item.description ? stripHtml(item.description) : null;
      const originalUrl = item.originallink && item.originallink.startsWith('http')
        ? item.originallink
        : item.link;
      const kwScore = computeRelevance(event.title, { title, description });
      return {
        title,
        description,
        originalUrl,
        publishedAt: parsePubDate(item.pubDate),
        kwScore,
      };
    });

  const seenUrls = new Set<string>();
  let prefiltered = normalize(items)
    .filter((x) => x.kwScore > 0)
    .filter((x) => {
      if (seenUrls.has(x.originalUrl)) return false;
      seenUrls.add(x.originalUrl);
      return true;
    });

  // Google News RSS fallback — Naver 결과가 얇으면 추가 후보 확보.
  if (prefiltered.length < GOOGLE_NEWS_FALLBACK_THRESHOLD) {
    const gItems = await fetchGoogleNewsRss(event.title);
    const gFiltered = normalize(gItems).filter((x) => x.kwScore > 0);
    for (const g of gFiltered) {
      if (seenUrls.has(g.originalUrl)) continue;
      seenUrls.add(g.originalUrl);
      prefiltered.push(g);
    }
  }

  if (prefiltered.length === 0) {
    result.skipped += 1;
    return;
  }

  // 2차 embedding 재랭킹 (선택적). 실패하면 keyword-only.
  let embSucceeded = false;
  const embScores: number[] = new Array(prefiltered.length).fill(0);
  if (useEmbedding) {
    const eventText = [event.title, event.aiSummary ?? event.description ?? ''].filter(Boolean).join('\n').slice(0, 2000);
    const candTexts = prefiltered.map((c) => [c.title, c.description ?? ''].join('\n').slice(0, 2000));
    const vectors = await embedBatch([eventText, ...candTexts]);
    if (vectors && vectors.length === prefiltered.length + 1) {
      const evVec = vectors[0]!;
      for (let i = 0; i < prefiltered.length; i++) {
        const sim = cosine(evVec, vectors[i + 1]!);
        // cosine ∈ [-1,1] → [0,1] 로 clamp. 음수는 관련성 없음 취급.
        embScores[i] = Math.max(0, sim);
      }
      embSucceeded = true;
    } else {
      log.warn({ eventId: event.eventId.toString() }, 'embed unavailable — keyword-only fallback');
    }
  }

  const threshold = embSucceeded ? MIN_SCORE_WITH_EMBEDDING : MIN_SCORE_KEYWORD_ONLY;

  const scored = prefiltered
    .map((c, i) => ({
      ...c,
      score: embSucceeded
        ? KEYWORD_WEIGHT * c.kwScore + EMBEDDING_WEIGHT * embScores[i]!
        : c.kwScore,
    }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, PER_EVENT_MAX_MAPPINGS);

  if (scored.length === 0) {
    result.skipped += 1;
    return;
  }

  for (const cand of scored) {
    try {
      const relDecimal = new Prisma.Decimal(cand.score.toFixed(4));
      await prisma.$transaction(async (tx) => {
        // 기사 upsert. originalUrl 유니크.
        const article = await tx.newsArticle.upsert({
          where: { originalUrl: cand.originalUrl.slice(0, 500) },
          create: {
            sourceName: sourceFromUrl(cand.originalUrl),
            title: cand.title.slice(0, 300),
            originalUrl: cand.originalUrl.slice(0, 500),
            summary: cand.description,
            publishedAt: cand.publishedAt,
          },
          update: {
            title: cand.title.slice(0, 300),
            summary: cand.description,
            publishedAt: cand.publishedAt,
          },
          select: { articleId: true },
        });
        result.articlesUpserted += 1;

        // 매핑 upsert. (event_id, article_id) 유니크.
        await tx.eventArticleMapping.upsert({
          where: {
            eventId_articleId: {
              eventId: event.eventId,
              articleId: article.articleId,
            },
          },
          create: {
            eventId: event.eventId,
            articleId: article.articleId,
            relevanceScore: relDecimal,
          },
          update: { relevanceScore: relDecimal },
        });
        result.mappingsUpserted += 1;
      });
    } catch (err) {
      log.error(
        {
          eventId: event.eventId.toString(),
          url: cand.originalUrl,
          err: err instanceof Error ? err.message : String(err),
        },
        'upsert failed',
      );
      result.errors += 1;
    }
  }
}

/**
 * 전체 파이프라인 진입점.
 *
 * @param opts.eventLimit  — 단일 실행에서 처리할 최대 이벤트 수 (기본 50).
 *                            비용 관점: 네이버 API 호출 * 이벤트수.
 * @param opts.onlyEventId — 특정 이벤트 하나만 재매핑 (테스트용).
 */
export async function runNewsNaverIngest(opts: { eventLimit?: number; onlyEventId?: bigint } = {}): Promise<NewsNaverIngestResult> {
  const result: NewsNaverIngestResult = {
    eventsProcessed: 0,
    articlesUpserted: 0,
    mappingsUpserted: 0,
    skipped: 0,
    errors: 0,
  };

  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    log.warn('NAVER_CLIENT_ID/SECRET missing — skip');
    return result;
  }

  const where: Prisma.EventWhereInput = {
    isDeleted: false,
    approvalStatus: 'approved',
  };
  if (opts.onlyEventId) where.eventId = opts.onlyEventId;

  const events = await prisma.event.findMany({
    where,
    orderBy: [{ startDate: 'desc' }],
    take: opts.eventLimit ?? 50,
    select: { eventId: true, title: true, aiSummary: true, description: true },
  });

  // embedding 사용 가능 여부는 services/llm health probe 로 체크. 실패해도 keyword-only 진행.
  const useEmbedding = await probeEmbedding();
  log.info({ count: events.length, useEmbedding }, 'start');

  for (const ev of events) {
    await processEvent(ev, result, useEmbedding);
    result.eventsProcessed += 1;
    // rate limit 여유 — 네이버 공식 제한 10 req/sec, 일일 25k.
    await new Promise((r) => setTimeout(r, 120));
  }

  log.info(result, 'done');
  return result;
}

/** services/llm /embed 한 번 호출해보고 가능 여부 확인. 실패 시 false. */
async function probeEmbedding(): Promise<boolean> {
  const out = await callLlm<{ vectors: number[][] }>('/embed', { texts: ['probe'] });
  return !!out && Array.isArray(out.vectors) && out.vectors.length === 1;
}
