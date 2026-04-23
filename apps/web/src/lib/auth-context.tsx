import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  fetchMe,
  devLogin as apiDevLogin,
  logout as apiLogout,
  logoutAll as apiLogoutAll,
  type CurrentUser,
} from './api';

/**
 * 글로벌 auth 컨텍스트 — /auth/me 로 현재 세션 사용자 동기화.
 *
 *  user     null     = 비로그인
 *  user     CurrentUser = 로그인됨
 *  loading  초기 /auth/me 미완료
 *
 *  login(nickname) — Stage 1 dev 로그인. Stage 2 에서 OAuth redirect 로 대체.
 *  logout()         — 세션 파괴 후 state clear.
 *  refresh()        — 수동 재조회 (타 탭 동기화용 향후).
 */

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (nickname: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  /** ADR 0004 D-3: 모든 디바이스 일괄 로그아웃. 응답 deleted = 끊긴 세션 수. */
  logoutAll: () => Promise<{ deleted: number }>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await fetchMe();
      setUser(me);
    } catch {
      // 네트워크 에러 등 — 비로그인으로 취급.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (nickname: string) => {
    const u = await apiDevLogin(nickname);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const logoutAll = useCallback(async () => {
    const result = await apiLogoutAll();
    setUser(null);
    return result;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, logoutAll, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useCurrentUser(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useCurrentUser must be used within <AuthProvider>');
  return ctx;
}
