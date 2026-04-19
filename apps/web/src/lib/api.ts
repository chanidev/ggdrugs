/**
 * BFF API 클라이언트.
 *
 * baseURL 결정:
 *  - VITE_BFF_URL 우선 (배포 환경·명시적 지정).
 *  - 없으면 `/api` (vite dev proxy 또는 같은 origin reverse-proxy).
 *
 * same-origin 전략 — 쿠키 세션(HttpOnly SameSite=Lax) 를 cross-origin 이슈 없이
 * 쓰기 위함. 모든 요청은 `credentials: 'include'`.
 */

const BFF_URL =
  (import.meta.env.VITE_BFF_URL as string | undefined) ?? '/api';

function withCredentials(init: RequestInit = {}): RequestInit {
  return { credentials: 'include', ...init };
}

export type EventPhase = 'upcoming' | 'ongoing' | 'ended';

export interface BffEventItem {
  eventId: string;
  title: string;
  category: { code: string; name: string };
  region: {
    regionId: string;
    sidoName: string;
    sigunguName: string | null;
    dongName: string | null;
    fullAddress: string;
  };
  startDate: string; // YYYY-MM-DD
  endDate: string;
  phase: EventPhase;
  latitude: number | null;
  longitude: number | null;
  posterImageUrl: string | null;
  bookmarkCount: number;
  avgRating: number;
  reviewCount: number;
  vibes: { vibeId: string; name: string; group: string }[];
}

export interface EventListResponse {
  page: number;
  limit: number;
  total: number;
  items: BffEventItem[];
}

export interface EventListQuery {
  regionIds?: string[];
  period?: '3m' | '6m' | 'all' | 'custom';
  periodStart?: string;
  periodEnd?: string;
  companions?: string[];
  eventTypes?: string[];
  vibeIds?: string[];
  phases?: EventPhase[];
  page?: number;
  limit?: number;
}

function buildQuery(q: EventListQuery): string {
  const sp = new URLSearchParams();
  if (q.regionIds?.length) sp.set('regionIds', q.regionIds.join(','));
  if (q.period) sp.set('period', q.period);
  if (q.periodStart) sp.set('periodStart', q.periodStart);
  if (q.periodEnd) sp.set('periodEnd', q.periodEnd);
  if (q.companions?.length) sp.set('companions', q.companions.join(','));
  if (q.eventTypes?.length) sp.set('eventTypes', q.eventTypes.join(','));
  if (q.vibeIds?.length) sp.set('vibeIds', q.vibeIds.join(','));
  if (q.phases?.length) sp.set('phases', q.phases.join(','));
  if (q.page) sp.set('page', String(q.page));
  if (q.limit) sp.set('limit', String(q.limit));
  return sp.toString();
}

export async function fetchEvents(
  query: EventListQuery,
  signal?: AbortSignal,
): Promise<EventListResponse> {
  const qs = buildQuery(query);
  const url = `${BFF_URL}/events${qs ? `?${qs}` : ''}`;
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET /events ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as EventListResponse;
}

export interface EventsStatsResponse {
  total: number;
  categories: { code: string; label: string; count: number }[];
  phases: Record<EventPhase, number>;
}

export async function fetchEventsStats(signal?: AbortSignal): Promise<EventsStatsResponse> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/events/stats`, init);
  if (!res.ok) throw new Error(`GET /events/stats ${res.status}`);
  return (await res.json()) as EventsStatsResponse;
}

export interface RegionItem {
  regionId: string;
  sido: string;
  sigungu: string | null;
  fullAddress: string;
}

export async function fetchRegions(signal?: AbortSignal): Promise<RegionItem[]> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/regions`, init);
  if (!res.ok) throw new Error(`GET /regions ${res.status}`);
  const data = (await res.json()) as { items: RegionItem[] };
  return data.items;
}

export interface VibeItem {
  vibeId: string;
  name: string;
  group: string; // mood | activity | theme
}

export async function fetchVibes(signal?: AbortSignal): Promise<VibeItem[]> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/vibes`, init);
  if (!res.ok) throw new Error(`GET /vibes ${res.status}`);
  const data = (await res.json()) as { items: VibeItem[] };
  return data.items;
}

export interface BffEventDetail extends BffEventItem {
  description: string | null;
  addressDetail: string | null;
  source: { type: string; crawlOrigin: string; externalId: string };
  createdAt: string;
  updatedAt: string;
  /** null = 비로그인. true/false = 로그인 상태의 현재 북마크 여부. */
  isBookmarked: boolean | null;
}

export async function fetchEventDetail(id: string, signal?: AbortSignal): Promise<BffEventDetail> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/events/${encodeURIComponent(id)}`, init);
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`GET /events/${id} ${res.status}`);
  return (await res.json()) as BffEventDetail;
}

export interface BffReviewItem {
  reviewId: string;
  nickname: string;
  rating: number; // 1~5
  body: string;
  createdAt: string; // ISO
  photos: { path: string; sortOrder: number }[];
}

export interface EventReviewsResponse {
  page: number;
  limit: number;
  total: number;
  avgRating: number;
  items: BffReviewItem[];
}

export async function createEventReview(
  id: string,
  body: { rating: number; body: string },
): Promise<BffReviewItem> {
  const res = await fetch(
    `${BFF_URL}/events/${encodeURIComponent(id)}/reviews`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 409) throw new Error('ALREADY_REVIEWED');
  if (res.status === 422) throw new Error('REVIEW_NOT_ALLOWED_YET');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /events/${id}/reviews ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as BffReviewItem;
}

export async function deleteMyReview(reviewId: string): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/reviews/${encodeURIComponent(reviewId)}`,
    withCredentials({ method: 'DELETE' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`DELETE /reviews/${reviewId} ${res.status}`);
}

export async function fetchEventReviews(
  id: string,
  opts: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<EventReviewsResponse> {
  const sp = new URLSearchParams();
  if (opts.page) sp.set('page', String(opts.page));
  if (opts.limit) sp.set('limit', String(opts.limit));
  const qs = sp.toString();
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(
    `${BFF_URL}/events/${encodeURIComponent(id)}/reviews${qs ? `?${qs}` : ''}`,
    init,
  );
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`GET /events/${id}/reviews ${res.status}`);
  return (await res.json()) as EventReviewsResponse;
}

// =============================================================
// Auth
// =============================================================

export interface CurrentUser {
  userId: string;
  nickname: string;
  activeRole: 'user' | 'uploader' | 'admin';
}

/** 현재 세션의 사용자. 401 이면 null (비로그인). 그 외 에러는 throw. */
export async function fetchMe(signal?: AbortSignal): Promise<CurrentUser | null> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/auth/me`, init);
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /auth/me ${res.status}`);
  const body = (await res.json()) as { user: CurrentUser };
  return body.user;
}

/** Stage 1 — dev 전용 로그인 stub. Stage 2 에서 Google OAuth 리다이렉트로 교체. */
export async function devLogin(nickname: string): Promise<CurrentUser> {
  const res = await fetch(
    `${BFF_URL}/auth/dev-login`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname }),
    }),
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`POST /auth/dev-login ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { user: CurrentUser };
  return data.user;
}

export async function logout(): Promise<void> {
  const res = await fetch(`${BFF_URL}/auth/logout`, withCredentials({ method: 'POST' }));
  if (!res.ok) throw new Error(`POST /auth/logout ${res.status}`);
}

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

export interface BookmarkListItem {
  bookmarkId: string;
  bookmarkedAt: string;
  event: BffEventItem;
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

export interface MyReviewItem {
  reviewId: string;
  rating: number;
  body: string;
  createdAt: string;
  event: {
    eventId: string;
    title: string;
    posterImageUrl: string | null;
    startDate: string;
    endDate: string;
    region: { sidoName: string; sigunguName: string | null; fullAddress: string };
  };
}

export interface MyReviewsResponse {
  page: number;
  limit: number;
  total: number;
  items: MyReviewItem[];
}

export async function fetchMyReviews(
  opts: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<MyReviewsResponse> {
  const sp = new URLSearchParams();
  if (opts.page) sp.set('page', String(opts.page));
  if (opts.limit) sp.set('limit', String(opts.limit));
  const qs = sp.toString();
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/reviews${qs ? `?${qs}` : ''}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /me/reviews ${res.status}`);
  return (await res.json()) as MyReviewsResponse;
}
