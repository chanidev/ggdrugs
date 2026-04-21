import { env } from '../env.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { Prisma } from '@prisma/client';

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
 * Relevance scoring (keyword overlap heuristic, V1):
 *   1.0  — 이벤트 제목 정규화 문자열이 기사 제목에 포함
 *   0.7  — 2개 이상 significant token(2자+) 겹침
 *   0.4  — 1개 token 만 겹침 (lower floor, 저장은 하되 UI 에서 drop)
 *
 * 저장 threshold: 0.5. 그 이하는 skip.
 *
 * V2 아이디어(후속): OpenAI embedding cosine 으로 의미 기반 재랭킹.
 */

const SEARCH_URL = 'https://openapi.naver.com/v1/search/news.json';
const DISPLAY = 20; // 이벤트당 최대 검색 결과
const MIN_SCORE_TO_STORE = 0.5;
const PER_EVENT_MAX_MAPPINGS = 8;
const KEYWORD_HIT_THRESHOLD = 2;

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
  event: { eventId: bigint; title: string },
  result: NewsNaverIngestResult,
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

  // Score + sort + take top-N.
  const scored = items
    .map((item) => {
      const title = stripHtml(item.title);
      const description = item.description ? stripHtml(item.description) : null;
      const originalUrl = item.originallink && item.originallink.startsWith('http')
        ? item.originallink
        : item.link;
      const score = computeRelevance(event.title, { title, description });
      return {
        title,
        description,
        originalUrl,
        publishedAt: parsePubDate(item.pubDate),
        score,
      };
    })
    .filter((x) => x.score >= MIN_SCORE_TO_STORE)
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
    select: { eventId: true, title: true },
  });

  log.info({ count: events.length }, 'start');

  for (const ev of events) {
    await processEvent(ev, result);
    result.eventsProcessed += 1;
    // rate limit 여유 — 네이버 공식 제한 10 req/sec, 일일 25k.
    await new Promise((r) => setTimeout(r, 120));
  }

  log.info(result, 'done');
  return result;
}
