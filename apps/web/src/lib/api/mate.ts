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
  selectedEventId: string | null; // GG-MATCH-003: 함께 갈 축제(2주내). null=미선택
  consentedAt: string; // ISO 8601, 약관동의 시각
}

/** 메이트용 선택 가능 축제 (2주내 개최 예정 + approved). GG-MATCH-003 */
export interface MateEvent {
  eventId: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  posterImageUrl: string | null;
  regionName: string | null;
}

/** 프로필에 담긴 현재 선택 축제 요약. */
export interface SelectedEventSummary {
  eventId: string;
  title: string;
  startDate: string;
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
  selectedEvent: SelectedEventSummary | null; // GG-MATCH-003 현재 선택 축제
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

/** GG-MATCH-003: 축제 미선택(또는 선택 축제 만료) → 축제 선택 유도. */
export interface RecommendationsNoEvent {
  state: 'no_event';
}

export interface RecommendationsList {
  state: 'list';
  items: RecommendationItem[];
}

export type RecommendationsResponse =
  | RecommendationsBlind
  | RecommendationsNoEvent
  | RecommendationsList;

export interface MateIndexResult {
  userId: string;
  indexValue: number | null; // null = MateIndex 레코드 없음 (메이트 프로필 미등록)
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
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    // GG-MATCH-003: 선택 축제가 로드 후 만료/미승인/삭제된 경우 전용 코드 → 폼이 재선택 안내.
    if (b.error === 'selected_event_not_selectable') throw new Error('EVENT_NOT_SELECTABLE');
    throw new Error(`VALIDATION: ${(b.error ?? '').slice(0, 200)}`);
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
 * GET /community/mate/events — 2주내 개최 예정 approved 축제 (GG-MATCH-003 "축제 선택").
 */
export async function fetchUpcomingMateEvents(): Promise<MateEvent[]> {
  const res = await fetch(
    `${BFF_URL}/community/mate/events`,
    withCredentials(),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /community/mate/events ${res.status}`);
  const body = (await res.json()) as { events: MateEvent[] };
  return body.events;
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
