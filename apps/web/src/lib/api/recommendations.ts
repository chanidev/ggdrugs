import { BFF_URL, withCredentials } from './client.js';

// =============================================================
// G-5: 추천 — taste profile 기반 매칭 이벤트.
// =============================================================

export interface RecommendedEventItem {
  eventId: string;
  title: string;
  posterImageUrl: string | null;
  startDate: string;
  endDate: string;
  phase: 'upcoming' | 'ongoing' | 'ended';
  categoryName: string;
  region: { sidoName: string; sigunguName: string | null; fullAddress: string };
  /** 어떤 dimension 과 매칭됐는지 (UI tooltip 용). 'category' | 'region' | 'vibe' subset. */
  matchedDimensions: string[];
}

export interface MyRecommendationsResponse {
  items: RecommendedEventItem[];
  tasteSignals: Record<string, string>;
  /** 'no_taste_signals' = user_taste_profiles 빈 (북마크/리뷰 0). 'no_valid_signals' = 손상값 only. */
  reason: 'no_taste_signals' | 'no_valid_signals' | null;
}

export async function fetchMyRecommendations(
  query: { limit?: number },
  signal?: AbortSignal,
): Promise<MyRecommendationsResponse> {
  const sp = new URLSearchParams();
  if (query.limit) sp.set('limit', String(query.limit));
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/recommendations?${sp.toString()}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /me/recommendations ${res.status}`);
  return (await res.json()) as MyRecommendationsResponse;
}
