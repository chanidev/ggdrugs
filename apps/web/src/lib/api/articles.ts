import { BFF_URL, withCredentials } from './client.js';

// =============================================================
// A_400 — 이벤트 관련 기사
// =============================================================

export interface EventArticleItem {
  mappingId: string;
  articleId: string;
  title: string;
  sourceName: string;
  authorName: string | null;
  articleCategory: string | null;
  originalUrl: string;
  summary: string | null;
  publishedAt: string | null;
  relevanceScore: number;
  matchedAt: string;
}

export interface EventArticlesPage {
  total: number;
  limit: number;
  offset: number;
  items: EventArticleItem[];
}

/**
 * GET /events/:id/articles?limit=&offset=
 * 요약 패널(미니 리스트)은 `fetchEventArticles(id, 3)` 로 items 만 쓰고,
 * 상세 페이지는 `fetchEventArticlesPage(id, {limit,offset})` 로 total 까지 받아 페이징.
 */
export async function fetchEventArticlesPage(
  eventId: string,
  { limit = 5, offset = 0 }: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<EventArticlesPage> {
  const init: RequestInit = { method: 'GET' };
  if (signal) init.signal = signal;
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetch(
    `${BFF_URL}/events/${encodeURIComponent(eventId)}/articles?${params}`,
    withCredentials(init),
  );
  if (res.status === 404) return { total: 0, limit, offset, items: [] };
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`GET /events/${eventId}/articles ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as EventArticlesPage;
}

export async function fetchEventArticles(
  eventId: string,
  limit = 5,
  signal?: AbortSignal,
): Promise<EventArticleItem[]> {
  const page = await fetchEventArticlesPage(eventId, { limit, offset: 0 }, signal);
  return page.items;
}
