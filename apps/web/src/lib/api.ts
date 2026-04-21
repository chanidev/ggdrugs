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
  /** gpt-4o-mini 가 생성한 2~3문장 한국어 요약. description/title/category/vibes 기반. */
  aiSummary: string | null;
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
  /** gpt-4o-mini 가 자동 분류한 감성. 작성 직후엔 null, 몇 초 뒤 분류 완료. */
  sentiment: 'positive' | 'negative' | 'neutral' | null;
  createdAt: string; // ISO
  /** url 은 review-photos 버킷 public URL (anonymous download 정책 전제). */
  photos: { url: string; sortOrder: number }[];
}

export interface EventReviewsResponse {
  page: number;
  limit: number;
  total: number;
  avgRating: number;
  items: BffReviewItem[];
}

export interface ReviewPhotoMeta {
  key: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}

export async function createEventReview(
  id: string,
  body: { rating: number; body: string; photos?: ReviewPhotoMeta[] },
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
  /** admin_profiles.is_active=true 인 경우에만 true. UI 에서 관리자 링크 노출 판단. */
  isAdmin: boolean;
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

// =============================================================
// Chat (A_201 — LLM 자연어 검색)
// =============================================================

export interface ChatFilters {
  eventTypes: string[];
  companions: string[];
  periodKey: 'today' | 'weekend' | 'week' | 'month' | null;
  vibes: string[];
  regionHints: string[];
  /** BFF 가 regionHints 를 regions 테이블에서 resolve 해 추가한 id (없으면 []). */
  regionIds: string[];
  /** BFF 가 vibes(이름) 를 event_vibes 테이블에서 resolve 해 추가한 id. */
  vibeIds: string[];
}

export interface ChatReply {
  reply: string;
  filters: ChatFilters;
}

export async function sendChat(
  messages: { role: 'user' | 'assistant' | 'system'; text: string }[],
): Promise<ChatReply> {
  const res = await fetch(
    `${BFF_URL}/chat`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    }),
  );
  if (res.status === 502) throw new Error('LLM_UNREACHABLE');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /chat ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as ChatReply;
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

// =============================================================
// A_203 구독 + A_500 알림 센터
// =============================================================

export interface MySubscription {
  subscriptionId: string;
  regionIds: string[];
  companions: string[];
  eventTypes: string[];
  vibeIds: string[];
  periodMonths: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function fetchMySubscriptions(signal?: AbortSignal): Promise<MySubscription[]> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/subscriptions`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /me/subscriptions ${res.status}`);
  const data = (await res.json()) as { items: MySubscription[] };
  return data.items;
}

export interface NewSubscriptionBody {
  regionIds?: string[];
  companions?: Array<'solo' | 'couple' | 'friend' | 'family'>;
  eventTypes?: string[];
  vibeIds?: string[];
  periodMonths?: number | null;
}

export async function createSubscription(body: NewSubscriptionBody): Promise<MySubscription> {
  const res = await fetch(
    `${BFF_URL}/me/subscriptions`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 409) throw new Error('MAX_SUBSCRIPTIONS_REACHED');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /me/subscriptions ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { subscription: MySubscription };
  return data.subscription;
}

export async function toggleSubscription(
  subscriptionId: string,
  isActive: boolean,
): Promise<MySubscription> {
  const res = await fetch(
    `${BFF_URL}/me/subscriptions/${encodeURIComponent(subscriptionId)}`,
    withCredentials({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`PATCH /me/subscriptions/${subscriptionId} ${res.status}`);
  const data = (await res.json()) as { subscription: MySubscription };
  return data.subscription;
}

export async function deleteSubscription(subscriptionId: string): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/me/subscriptions/${encodeURIComponent(subscriptionId)}`,
    withCredentials({ method: 'DELETE' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`DELETE /me/subscriptions/${subscriptionId} ${res.status}`);
}

export interface MyNotification {
  notificationId: string;
  eventId: string | null;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  eventAvailable: boolean;
}

export interface MyNotificationsResponse {
  page: number;
  limit: number;
  total: number;
  items: MyNotification[];
}

export async function fetchMyNotifications(
  opts: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  signal?: AbortSignal,
): Promise<MyNotificationsResponse> {
  const sp = new URLSearchParams();
  if (opts.page) sp.set('page', String(opts.page));
  if (opts.limit) sp.set('limit', String(opts.limit));
  if (opts.unreadOnly) sp.set('unreadOnly', 'true');
  const qs = sp.toString();
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/notifications${qs ? `?${qs}` : ''}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /me/notifications ${res.status}`);
  return (await res.json()) as MyNotificationsResponse;
}

export async function fetchUnreadNotificationCount(signal?: AbortSignal): Promise<number> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/notifications/unread-count`, init);
  if (res.status === 401) return 0; // 비로그인은 0 으로 취급
  if (!res.ok) throw new Error(`GET /me/notifications/unread-count ${res.status}`);
  const data = (await res.json()) as { count: number };
  return data.count;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/me/notifications/${encodeURIComponent(notificationId)}/read`,
    withCredentials({ method: 'POST' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`POST /me/notifications/${notificationId}/read ${res.status}`);
}

export async function markAllNotificationsRead(): Promise<number> {
  const res = await fetch(
    `${BFF_URL}/me/notifications/read-all`,
    withCredentials({ method: 'POST' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`POST /me/notifications/read-all ${res.status}`);
  const data = (await res.json()) as { updated: number };
  return data.updated;
}

// =============================================================
// Admin — A_700 vibe 라벨 부여
// =============================================================

export interface AdminEventItem {
  eventId: string;
  title: string;
  phase: EventPhase;
  approvalStatus: string;
  startDate: string;
  endDate: string;
  posterImageUrl: string | null;
  aiSummary: string | null;
  category: { code: string; name: string };
  region: { regionId: string; sido: string; sigungu: string | null };
  vibes: { vibeId: string; name: string; group: string }[];
}

export interface AdminEventsQuery {
  hasVibes?: 'true' | 'false' | 'any';
  approvalStatus?: string;
  sourceType?: 'uploaded' | 'crawled';
  phase?: EventPhase[];
  regionIds?: string[];
  q?: string;
  page?: number;
  limit?: number;
}

export interface AdminEventsResponse {
  page: number;
  limit: number;
  total: number;
  items: AdminEventItem[];
}

export async function fetchAdminEvents(
  query: AdminEventsQuery = {},
  signal?: AbortSignal,
): Promise<AdminEventsResponse> {
  const sp = new URLSearchParams();
  if (query.hasVibes) sp.set('hasVibes', query.hasVibes);
  if (query.approvalStatus) sp.set('approvalStatus', query.approvalStatus);
  if (query.sourceType) sp.set('sourceType', query.sourceType);
  if (query.phase?.length) sp.set('phase', query.phase.join(','));
  if (query.regionIds?.length) sp.set('regionIds', query.regionIds.join(','));
  if (query.q) sp.set('q', query.q);
  if (query.page) sp.set('page', String(query.page));
  if (query.limit) sp.set('limit', String(query.limit));
  const qs = sp.toString();
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/admin/events${qs ? `?${qs}` : ''}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`GET /admin/events ${res.status}`);
  return (await res.json()) as AdminEventsResponse;
}

export async function putAdminEventVibes(
  eventId: string,
  vibeIds: string[],
): Promise<{ eventId: string; vibes: { vibeId: string; name: string; group: string }[] }> {
  const res = await fetch(
    `${BFF_URL}/admin/events/${encodeURIComponent(eventId)}/vibes`,
    withCredentials({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vibeIds }),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PUT /admin/events/${eventId}/vibes ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as {
    eventId: string;
    vibes: { vibeId: string; name: string; group: string }[];
  };
}

// =============================================================
// Admin — A_700 part 2: 업로더 승급 심사
// =============================================================

export type UploaderApprovalStatus =
  | 'pending'
  | 'approved'
  | 'revision_requested'
  | 'rejected';

export interface AdminUploaderItem {
  uploaderId: string;
  organizationName: string;
  contactPhone: string;
  contactEmail: string;
  approvalStatus: UploaderApprovalStatus;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    userId: string;
    nickname: string;
    authProvider: string;
    activeRole: string;
  };
}

export interface AdminUploadersResponse {
  page: number;
  limit: number;
  total: number;
  byStatus: Record<UploaderApprovalStatus, number>;
  items: AdminUploaderItem[];
}

export async function fetchAdminUploaders(
  query: {
    status?: UploaderApprovalStatus | 'any';
    page?: number;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<AdminUploadersResponse> {
  const sp = new URLSearchParams();
  if (query.status) sp.set('status', query.status);
  if (query.page) sp.set('page', String(query.page));
  if (query.limit) sp.set('limit', String(query.limit));
  const qs = sp.toString();
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/admin/uploaders${qs ? `?${qs}` : ''}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`GET /admin/uploaders ${res.status}`);
  return (await res.json()) as AdminUploadersResponse;
}

export interface AdminEventDocumentItem {
  documentId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
  previewUrl: string;
}

export interface AdminEventDocumentsResponse {
  eventId: string;
  sourceType: string;
  expiresIn: number;
  items: AdminEventDocumentItem[];
}

export async function fetchAdminEventDocuments(
  eventId: string,
  signal?: AbortSignal,
): Promise<AdminEventDocumentsResponse> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(
    `${BFF_URL}/admin/events/${encodeURIComponent(eventId)}/documents`,
    init,
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`GET /admin/events/${eventId}/documents ${res.status}`);
  return (await res.json()) as AdminEventDocumentsResponse;
}

export async function decideAdminEvent(
  eventId: string,
  action: 'approved' | 'revision_requested' | 'rejected',
  reason?: string,
): Promise<{ eventId: string; approvalStatus: UploaderApprovalStatus; reason: string | null }> {
  const res = await fetch(
    `${BFF_URL}/admin/events/${encodeURIComponent(eventId)}/decision`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      `POST /admin/events/${eventId}/decision ${res.status}: ${txt.slice(0, 200)}`,
    );
  }
  return (await res.json()) as {
    eventId: string;
    approvalStatus: UploaderApprovalStatus;
    reason: string | null;
  };
}

export interface AdminUploaderDetailResponse {
  uploader: AdminUploaderItem & {
    user: AdminUploaderItem['user'] & { createdAt: string };
    /** ADR 0003. scope<full 이면 마스킹된 값. */
    realName: string;
    businessRegistrationNumber: string | null;
    ciHash: string | null;
  };
  adminScope: string;
  eventStats: Record<UploaderApprovalStatus, number>;
  recentEvents: Array<{
    eventId: string;
    title: string;
    approvalStatus: UploaderApprovalStatus;
    phase: EventPhase;
    startDate: string;
    endDate: string;
    createdAt: string;
    categoryName: string;
  }>;
  documents: Array<{
    documentId: string;
    originalFilename: string;
    mimeType: string;
    fileSizeBytes: number;
    createdAt: string;
    previewUrl: string;
  }>;
  documentsExpiresIn: number;
}

export async function fetchAdminUploaderDetail(
  uploaderId: string,
  signal?: AbortSignal,
): Promise<AdminUploaderDetailResponse> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(
    `${BFF_URL}/admin/uploaders/${encodeURIComponent(uploaderId)}`,
    init,
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`GET /admin/uploaders/${uploaderId} ${res.status}`);
  return (await res.json()) as AdminUploaderDetailResponse;
}

export async function decideAdminUploader(
  uploaderId: string,
  action: 'approved' | 'revision_requested' | 'rejected',
): Promise<{
  uploaderId: string;
  approvalStatus: UploaderApprovalStatus;
  approvedAt: string | null;
  updatedAt: string;
}> {
  const res = await fetch(
    `${BFF_URL}/admin/uploaders/${encodeURIComponent(uploaderId)}/decision`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      `POST /admin/uploaders/${uploaderId}/decision ${res.status}: ${txt.slice(0, 200)}`,
    );
  }
  return (await res.json()) as {
    uploaderId: string;
    approvalStatus: UploaderApprovalStatus;
    approvedAt: string | null;
    updatedAt: string;
  };
}

// =============================================================
// Uploader self — A_600 / A_601 / A_602
// =============================================================

export interface MyUploaderProfile {
  uploaderId: string;
  organizationName: string;
  contactPhone: string;
  contactEmail: string;
  approvalStatus: UploaderApprovalStatus;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 본인 업로더 프로파일 조회. 프로파일 없으면 null. */
export async function fetchMyUploader(
  signal?: AbortSignal,
): Promise<MyUploaderProfile | null> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/uploader`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /me/uploader ${res.status}`);
  const data = (await res.json()) as { uploader: MyUploaderProfile };
  return data.uploader;
}

export interface UploaderSignupDocumentMeta {
  key: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface ApplyUploaderBody {
  organizationName: string;
  contactPhone: string;
  contactEmail: string;
  realName: string;
  /** 기관 업로더. ciHash 와 XOR. 10자리 숫자. */
  businessRegistrationNumber?: string | null;
  /** 개인 업로더. businessRegistrationNumber 와 XOR. 88자 Base64. */
  ciHash?: string | null;
  documents: UploaderSignupDocumentMeta[];
}

export async function requestUploaderSignupDocumentUploadUrl(body: {
  contentType: string;
  sizeBytes: number;
}): Promise<DocumentUploadUrlResponse> {
  const res = await fetch(
    `${BFF_URL}/me/uploader/documents/upload-url`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      `POST /me/uploader/documents/upload-url ${res.status}: ${txt.slice(0, 200)}`,
    );
  }
  return (await res.json()) as DocumentUploadUrlResponse;
}

export async function applyUploader(body: ApplyUploaderBody): Promise<{
  uploader: MyUploaderProfile;
  resubmitted?: boolean;
}> {
  const res = await fetch(
    `${BFF_URL}/me/uploader/apply`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as { status?: string };
    throw new Error(`ALREADY_APPLIED:${data.status ?? 'unknown'}`);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /me/uploader/apply ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as {
    uploader: MyUploaderProfile;
    resubmitted?: boolean;
  };
}

/** user ↔ uploader 역할 토글. uploader 전환은 approved 이어야 함. */
export async function setActiveRole(
  role: 'user' | 'uploader',
): Promise<{ activeRole: 'user' | 'uploader' }> {
  const res = await fetch(
    `${BFF_URL}/me/active-role`,
    withCredentials({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) {
    const data = (await res.json().catch(() => ({}))) as { status?: string };
    throw new Error(`UPLOADER_NOT_APPROVED:${data.status ?? 'unknown'}`);
  }
  if (!res.ok) throw new Error(`PUT /me/active-role ${res.status}`);
  return (await res.json()) as { activeRole: 'user' | 'uploader' };
}

export interface MyUploaderEventItem {
  eventId: string;
  title: string;
  phase: EventPhase;
  approvalStatus: UploaderApprovalStatus;
  startDate: string;
  endDate: string;
  posterImageUrl: string | null;
  createdAt: string;
  category: { code: string; name: string };
  region: { regionId: string; sido: string; sigungu: string | null };
  /** 최신 관리자 심사 로그 — rejected/revision_requested 일 때 사유 표시. */
  latestDecision: {
    action: 'approved' | 'revision_requested' | 'rejected';
    reason: string | null;
    decidedAt: string;
  } | null;
}

export interface MyUploaderEventsResponse {
  page: number;
  limit: number;
  total: number;
  byStatus: Record<UploaderApprovalStatus, number>;
  items: MyUploaderEventItem[];
}

export async function fetchMyUploaderEvents(
  query: {
    approvalStatus?: UploaderApprovalStatus | 'any';
    phase?: EventPhase[];
    page?: number;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<MyUploaderEventsResponse> {
  const sp = new URLSearchParams();
  if (query.approvalStatus) sp.set('approvalStatus', query.approvalStatus);
  if (query.phase?.length) sp.set('phase', query.phase.join(','));
  if (query.page) sp.set('page', String(query.page));
  if (query.limit) sp.set('limit', String(query.limit));
  const qs = sp.toString();
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/uploader/events${qs ? `?${qs}` : ''}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`GET /me/uploader/events ${res.status}`);
  return (await res.json()) as MyUploaderEventsResponse;
}

export interface UploaderDocumentMeta {
  key: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}

export type NewUploaderEventBody = {
  title: string;
  categoryCode: string;
  regionId: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  addressDetail?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  operatingHours?: string | null;
  targetAudience?: string | null;
  admissionFee?: string | null;
  expectedCompanionPrimary?: 'family' | 'friend' | 'couple' | 'solo' | null;
  expectedCompanionSecondary?: 'family' | 'friend' | 'couple' | 'solo' | null;
  posterImageUrl?: string | null;
  approvalDocuments: UploaderDocumentMeta[];
};

export interface CreatedUploaderEvent {
  eventId: string;
  title: string;
  approvalStatus: UploaderApprovalStatus;
  phase: EventPhase;
  startDate: string;
  endDate: string;
  createdAt: string;
}

export interface PosterUploadUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
  maxBytes: number;
}

export interface DocumentUploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
  maxBytes: number;
}

export interface ReviewPhotoUploadUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
  maxBytes: number;
}

export async function requestReviewPhotoUploadUrl(body: {
  contentType: string;
  sizeBytes: number;
}): Promise<ReviewPhotoUploadUrlResponse> {
  const res = await fetch(
    `${BFF_URL}/reviews/photos/upload-url`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      `POST /reviews/photos/upload-url ${res.status}: ${txt.slice(0, 200)}`,
    );
  }
  return (await res.json()) as ReviewPhotoUploadUrlResponse;
}

export async function requestDocumentUploadUrl(body: {
  contentType: string;
  sizeBytes: number;
}): Promise<DocumentUploadUrlResponse> {
  const res = await fetch(
    `${BFF_URL}/uploader/documents/upload-url`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      `POST /uploader/documents/upload-url ${res.status}: ${txt.slice(0, 200)}`,
    );
  }
  return (await res.json()) as DocumentUploadUrlResponse;
}

export async function requestPosterUploadUrl(body: {
  contentType: string;
  sizeBytes: number;
}): Promise<PosterUploadUrlResponse> {
  const res = await fetch(
    `${BFF_URL}/uploader/events/poster-upload-url`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      `POST /uploader/events/poster-upload-url ${res.status}: ${txt.slice(0, 200)}`,
    );
  }
  return (await res.json()) as PosterUploadUrlResponse;
}

/** presigned URL 로 바로 PUT. BFF 거치지 않음 (Content-Type 헤더 일치해야 서명 유효). */
export async function uploadToPresignedUrl(
  uploadUrl: string,
  file: File,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PUT S3 ${res.status}: ${txt.slice(0, 200)}`);
  }
}

export async function createUploaderEvent(
  body: NewUploaderEventBody,
): Promise<CreatedUploaderEvent> {
  const res = await fetch(
    `${BFF_URL}/uploader/events`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(`FORBIDDEN:${data.error ?? 'unknown'}`);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /uploader/events ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { event: CreatedUploaderEvent };
  return data.event;
}

// =============================================================
// A_601b — 업로더 이벤트 수정 재제출 (revision_requested / rejected)
// =============================================================

export interface UploaderEventDocumentPreview {
  documentId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  /** 5분짜리 presigned GET URL */
  previewUrl: string;
}

export interface UploaderEventDetail {
  eventId: string;
  title: string;
  categoryCode: string;
  regionId: string;
  regionLabel: string;
  description: string | null;
  startDate: string;
  endDate: string;
  addressDetail: string | null;
  latitude: string | null;
  longitude: string | null;
  operatingHours: string | null;
  targetAudience: string | null;
  admissionFee: string | null;
  expectedCompanionPrimary: 'family' | 'friend' | 'couple' | 'solo' | null;
  expectedCompanionSecondary: 'family' | 'friend' | 'couple' | 'solo' | null;
  posterImageUrl: string | null;
  approvalStatus: UploaderApprovalStatus;
  phase: EventPhase;
  createdAt: string;
  updatedAt: string;
  documents: UploaderEventDocumentPreview[];
  latestDecision: {
    action: string;
    reason: string | null;
    decidedAt: string;
  } | null;
}

export async function fetchUploaderEvent(
  eventId: string,
  signal?: AbortSignal,
): Promise<UploaderEventDetail> {
  const init: RequestInit = { method: 'GET' };
  if (signal) init.signal = signal;
  const res = await fetch(`${BFF_URL}/uploader/events/${encodeURIComponent(eventId)}`, withCredentials(init));
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`GET /uploader/events/${eventId} ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { event: UploaderEventDetail };
  return data.event;
}

export type UpdateUploaderEventBody = {
  title: string;
  categoryCode: string;
  regionId: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  addressDetail?: string | null;
  operatingHours?: string | null;
  targetAudience?: string | null;
  admissionFee?: string | null;
  expectedCompanionPrimary?: 'family' | 'friend' | 'couple' | 'solo' | null;
  expectedCompanionSecondary?: 'family' | 'friend' | 'couple' | 'solo' | null;
  /** 새 포스터 URL. 있으면 교체. undefined = 유지, clearPoster=true 와 병행 불가. */
  posterImageUrl?: string | null;
  /** true 면 기존 포스터 제거. posterImageUrl 과 병행 X. */
  clearPoster?: boolean;
  /** 제공 시 서류 전체 교체. 미제공 시 기존 유지. */
  approvalDocuments?: UploaderDocumentMeta[];
};

export interface UpdatedUploaderEvent {
  eventId: string;
  approvalStatus: UploaderApprovalStatus;
  phase: EventPhase;
  resubmitted: true;
}

export async function updateUploaderEvent(
  eventId: string,
  body: UpdateUploaderEventBody,
): Promise<UpdatedUploaderEvent> {
  const res = await fetch(
    `${BFF_URL}/uploader/events/${encodeURIComponent(eventId)}`,
    withCredentials({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
    throw new Error(`NOT_EDITABLE:${data.status ?? 'unknown'}`);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PATCH /uploader/events/${eventId} ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as UpdatedUploaderEvent;
}
