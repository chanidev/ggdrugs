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

export const BFF_URL =
  (import.meta.env.VITE_BFF_URL as string | undefined) ?? '/api';

export function withCredentials(init: RequestInit = {}): RequestInit {
  return { credentials: 'include', ...init };
}
