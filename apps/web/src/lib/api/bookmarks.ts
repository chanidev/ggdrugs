import { BFF_URL, withCredentials } from './client.js';
import type { BffEventItem } from './events.js';

// =============================================================
// Bookmarks (A_302 / A_500)
// =============================================================

export interface BookmarkMutationResult {
  bookmarked: boolean;
  bookmarkCount: number;
}

export async function createBookmark(eventId: string): Promise<BookmarkMutationResult> {
  const res = await fetch(
    `${BFF_URL}/events/${encodeURIComponent(eventId)}/bookmark`,
    withCredentials({ method: 'POST' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`POST /events/${eventId}/bookmark ${res.status}`);
  return (await res.json()) as BookmarkMutationResult;
}

export async function deleteBookmark(eventId: string): Promise<BookmarkMutationResult> {
  const res = await fetch(
    `${BFF_URL}/events/${encodeURIComponent(eventId)}/bookmark`,
    withCredentials({ method: 'DELETE' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`DELETE /events/${eventId}/bookmark ${res.status}`);
  return (await res.json()) as BookmarkMutationResult;
}

/** 마이페이지 북마크 목록에서 캘린더 팝업 렌더에 필요한 확장 필드. */
export interface BookmarkedEvent extends BffEventItem {
  addressDetail: string | null;
  admissionFee: string | null;
  targetAudience: string | null;
  aiSummary: string | null;
  articleCount: number;
}

export interface BookmarkListItem {
  bookmarkId: string;
  bookmarkedAt: string;
  event: BookmarkedEvent;
}

export interface MyBookmarksResponse {
  page: number;
  limit: number;
  total: number;
  items: BookmarkListItem[];
}

export async function fetchMyBookmarks(
  opts: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<MyBookmarksResponse> {
  const sp = new URLSearchParams();
  if (opts.page) sp.set('page', String(opts.page));
  if (opts.limit) sp.set('limit', String(opts.limit));
  const qs = sp.toString();
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/bookmarks${qs ? `?${qs}` : ''}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /me/bookmarks ${res.status}`);
  return (await res.json()) as MyBookmarksResponse;
}
