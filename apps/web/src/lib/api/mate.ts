import { BFF_URL, withCredentials } from './client.js';

// ============================================================
// 타입 정의
// ============================================================

export interface MateProfileBody {
  gender: string;
  ageRangeLower: number;
  regionId: string | null;
  hasCar: boolean;
  nationality: string;
  koreanOk: boolean;
  prefGender: string | null;
  prefAgeLower: number | null;
  prefRegionId: string | null;
  prefHasCar: boolean | null;
  prefNationality: string | null;
  prefKoreanOk: boolean | null;
  autoRecommend: boolean;
  groupApply: boolean;
  consentedAt: string; // ISO 8601, 약관동의 시각
}

export interface MateProfile {
  mateProfileId: string;
  gender: string;
  ageRangeLower: number;
  regionId: string | null;
  hasCar: boolean;
  nationality: string;
  koreanOk: boolean;
  prefGender: string | null;
  prefAgeLower: number | null;
  prefRegionId: string | null;
  prefHasCar: boolean | null;
  prefNationality: string | null;
  prefKoreanOk: boolean | null;
  autoRecommend: boolean;
  groupApply: boolean;
  consentedAt: string | null;
  updatedAt: string;
}

export interface MateProfileWithIndex extends MateProfile {
  mateIndex: number;
}

export interface RecommendationItem {
  userId: string;
  nickname: string;
  score: number;
  mateIndex: number;
}

export interface RecommendationsBlind {
  state: 'blind';
}

export interface RecommendationsList {
  state: 'list';
  items: RecommendationItem[];
}

export type RecommendationsResponse = RecommendationsBlind | RecommendationsList;

export interface MateIndexResult {
  userId: string;
  indexValue: number;
}

// ============================================================
// API 함수
// ============================================================

/**
 * POST /community/mate/profile — 메이트 프로필 upsert (GG-MATCH-009/010).
 * consentedAt 필수 — 없으면 BFF 가 422 consent_required 반환.
 */
export async function saveMateProfile(body: MateProfileBody): Promise<MateProfile> {
  const res = await fetch(
    `${BFF_URL}/community/mate/profile`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 422) throw new Error('CONSENT_REQUIRED');
  if (res.status === 400) {
    const t = await res.text().catch(() => '');
    throw new Error(`VALIDATION: ${t.slice(0, 200)}`);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`POST /community/mate/profile ${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as MateProfile;
}

/**
 * GET /community/mate/profile — 본인 프로필 (없으면 null).
 */
export async function getMyMateProfile(): Promise<MateProfile | null> {
  const res = await fetch(
    `${BFF_URL}/community/mate/profile`,
    withCredentials(),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`GET /community/mate/profile ${res.status}`);
  return (await res.json()) as MateProfile;
}

/**
 * GET /community/mate/profile/me — 본인 프로필 + 메이트지수 (A_807).
 */
export async function getMyMateProfileWithIndex(): Promise<MateProfileWithIndex | null> {
  const res = await fetch(
    `${BFF_URL}/community/mate/profile/me`,
    withCredentials(),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`GET /community/mate/profile/me ${res.status}`);
  return (await res.json()) as MateProfileWithIndex;
}

/**
 * GET /community/mate/recommendations — 추천 목록.
 * state='blind' 이면 프로필 미입력 또는 동의 없음 (GG-COMM-007/008).
 */
export async function getRecommendations(): Promise<RecommendationsResponse> {
  const res = await fetch(
    `${BFF_URL}/community/mate/recommendations`,
    withCredentials(),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /community/mate/recommendations ${res.status}`);
  return (await res.json()) as RecommendationsResponse;
}

/**
 * GET /community/mate/index/:userId — 경량 메이트지수 조회 (작성자 프로필 모달용).
 */
export async function getMateIndex(userId: string): Promise<MateIndexResult | null> {
  const res = await fetch(
    `${BFF_URL}/community/mate/index/${encodeURIComponent(userId)}`,
    withCredentials(),
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /community/mate/index/${userId} ${res.status}`);
  return (await res.json()) as MateIndexResult;
}
