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
    <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-(--color-border) bg-(--color-surface) px-4 md:px-6">
      {/* LogoLockup 내부가 이미 <Link to="/">. 중첩 <a> 방지 위해 여기서는 감싸지 않는다. */}
      <LogoLockup />

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
        {user.isAdmin && (
          <Link
            to="/admin"
            className="hidden h-8 items-center gap-1.5 rounded-(--radius-md) border border-(--color-accent)/40 bg-(--color-accent)/5 px-3 text-[13px] font-medium text-(--color-accent) transition-colors hover:bg-(--color-accent)/10 md:inline-flex"
            aria-label="관리자 콘솔"
          >
            Admin
          </Link>
        )}
        <Link
          to="/me"
          className="hidden h-8 items-center gap-1.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] text-(--color-text) transition-colors hover:border-(--color-border-hover) sm:inline-flex"
          aria-label="마이페이지"
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-(--color-accent)"
          />
          <span className="font-medium">{user.nickname}</span>
        </Link>
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

  // Real OAuth — Google/Kakao 선택. (BFF 503 이면 알림 fallback.)
  return (
    <div className="flex items-center gap-1.5">
      <a
        href="/api/auth/kakao"
        className="inline-flex h-8 shrink-0 items-center rounded-(--radius-md) border border-(--color-border) bg-[#FEE500] px-2.5 text-[12px] font-medium text-[#191600] transition-colors hover:bg-[#FDD835] md:px-3 md:text-[13px]"
      >
        Kakao
      </a>
      <a
        href="/api/auth/google"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-(--color-accent-hover) md:px-3 md:text-[13px]"
      >
        <span className="md:hidden">Google</span>
        <span className="hidden md:inline">Google 로그인</span>
      </a>
    </div>
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
