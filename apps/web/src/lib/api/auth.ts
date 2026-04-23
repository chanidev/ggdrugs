import { BFF_URL, withCredentials } from './client.js';

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

export async function logout(): Promise<void> {
  const res = await fetch(`${BFF_URL}/auth/logout`, withCredentials({ method: 'POST' }));
  if (!res.ok) throw new Error(`POST /auth/logout ${res.status}`);
}

/**
 * ADR 0004 D-3: 본인의 모든 디바이스 일괄 로그아웃 — 요청 디바이스 포함.
 * 응답의 deleted 는 삭제된 세션 row 수 (보유 디바이스 수에 해당).
 */
export async function logoutAll(): Promise<{ deleted: number }> {
  const res = await fetch(
    `${BFF_URL}/auth/logout-all`,
    withCredentials({ method: 'POST' }),
  );
  if (!res.ok) throw new Error(`POST /auth/logout-all ${res.status}`);
  return (await res.json()) as { ok: boolean; deleted: number };
}
