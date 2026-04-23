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
  /**
   * 어떤 dimension 과 매칭됐는지 (UI tooltip 용).
   * Qdrant personalized 결과는 ['semantic'], SQL fallback 은 'category'|'region'|'vibe' subset.
   */
  matchedDimensions: string[];
  /** Qdrant personalized 결과만 — kNN cosine score (0~1). SQL fallback 은 undefined. */
  score?: number;
}

export interface MyRecommendationsResponse {
  items: RecommendedEventItem[];
  /** 'qdrant_personalized' (mean vector kNN) | 'fallback_sql' (taste profile OR matching) */
  source: 'qdrant_personalized' | 'fallback_sql';
  tasteSignals?: Record<string, string>; // fallback_sql 일 때만 동봉
  seedCount: number;
  /**
   * null = 정상.
   * 'no_taste_signals' = 시그널 0 (북마크/리뷰 0).
   * 'no_valid_signals' = taste 손상 + Qdrant 0.
   * 'qdrant_unavailable' = LLM 다운, SQL fallback 사용 표기.
   */
  reason:
    | 'no_taste_signals'
    | 'no_valid_signals'
    | 'qdrant_unavailable'
    | null;
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
