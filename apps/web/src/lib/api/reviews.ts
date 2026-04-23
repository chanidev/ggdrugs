import { BFF_URL, withCredentials } from './client.js';

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
    addressDetail: string | null;
    admissionFee: string | null;
    targetAudience: string | null;
    aiSummary: string | null;
    articleCount: number;
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
