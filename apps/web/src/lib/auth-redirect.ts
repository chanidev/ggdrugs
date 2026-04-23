/**
 * A_100 자동 복귀 — OAuth 로그인 entry 헬퍼.
 *
 * 현재 path+search+hash 를 returnTo query 로 인코딩한 OAuth start URL 반환.
 * BFF auth.ts 가 same-origin path 화이트리스트 검증 후 returnTo 쿠키에 저장 →
 * callback 에서 ${WEB_URL}${returnTo} 로 redirect.
 *
 *   loginUrl('google')                  → /api/auth/google?returnTo=%2Fevents%2F123
 *   loginUrl('google', '/me')           → /api/auth/google?returnTo=%2Fme  (override)
 *   loginUrl('google', '/me', false)    → /api/auth/google                 (returnTo 생략)
 *
 * useReturnTo 가 false 면 returnTo 없이 (홈 redirect 가 의도된 케이스).
 */
export function loginUrl(
  provider: 'google' | 'kakao',
  returnTo?: string,
  useReturnTo = true,
): string {
  const base = `/api/auth/${provider}`;
  if (!useReturnTo) return base;
  const target = returnTo ?? currentPath();
  if (!target || target === '/') return base;
  return `${base}?returnTo=${encodeURIComponent(target)}`;
}

/** 현재 path + search + hash. SSR 환경에선 빈 문자열. */
export function currentPath(): string {
  if (typeof window === 'undefined') return '';
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

/** UNAUTHENTICATED 발생 시 호출 — 현재 path 보존하고 OAuth provider 로 보냄. */
export function redirectToLogin(provider: 'google' | 'kakao' = 'google'): void {
  window.location.href = loginUrl(provider);
}
