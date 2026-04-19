import { Link } from 'react-router';
import { LogoLockup } from '../components/brand/Logo';
import { Icon } from '../components/Icon';
import { useCurrentUser } from '../lib/auth-context';

/**
 * Header — 상단 바 (60px).
 * 좌: 브랜드 lockup (루트로 링크).  우: 빠른검색(placeholder) + auth 영역.
 *
 * Auth (Stage 1): 비로그인 시 "로그인" 버튼 → nickname prompt → dev-login.
 * 로그인 시 nickname 표시 + 로그아웃 버튼. Stage 2 에서 Google OAuth 로 swap.
 */
export function Header() {
  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-(--color-border) bg-(--color-surface) px-6">
      <Link
        to="/"
        className="inline-flex items-center rounded-(--radius-md) outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)"
        aria-label="Alle 홈"
      >
        <LogoLockup />
      </Link>

      <div className="flex items-center gap-3">
        <SearchMini />
        <AuthArea />
      </div>
    </header>
  );
}

function AuthArea() {
  const { user, loading, logout } = useCurrentUser();

  if (loading) {
    return (
      <div
        aria-hidden
        className="h-8 w-[86px] rounded-(--radius-md) bg-(--color-surface-alt)"
      />
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-[13px] text-(--color-text) sm:inline-flex">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-(--color-accent)"
          />
          <span className="font-medium">{user.nickname}</span>
        </span>
        <button
          type="button"
          onClick={() => {
            void logout();
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-border-hover) hover:text-(--color-text)"
        >
          로그아웃
        </button>
      </div>
    );
  }

  // Real OAuth — Google 로 redirect. (BFF 503 이면 알림 fallback.)
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = '/api/auth/google';
      }}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-3 text-[13px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
    >
      Google 로그인
    </button>
  );
}

function SearchMini() {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title="빠른 검색 (⌘K) — 준비 중입니다"
      className="hidden h-[34px] w-[220px] cursor-not-allowed items-center gap-2 rounded-(--radius-md) bg-(--color-surface-alt) px-3 text-[13px] text-(--color-text-subtle) md:flex"
      aria-label="빠른 검색 (⌘K) — 준비 중"
    >
      <Icon name="search" size={14} />
      <span>이벤트·장소 검색</span>
      <kbd className="ml-auto rounded-[3px] border border-(--color-border) bg-(--color-surface) px-[5px] py-[1px] font-mono text-[11px] text-(--color-text-subtle)">
        ⌘K
      </kbd>
    </button>
  );
}
