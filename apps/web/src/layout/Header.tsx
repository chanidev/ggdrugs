import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LogoLockup } from '../components/brand/Logo';
import { Icon } from '../components/Icon';
import { NotificationBell } from '../components/notifications/NotificationBell';
import { useCurrentUser } from '../lib/auth-context';
import { loginUrl } from '../lib/auth-redirect';
import { LanguageToggle } from '../components/LanguageToggle';

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
        <LanguageToggle />
        <AuthArea />
      </div>
    </header>
  );
}

function AuthArea() {
  const { t } = useTranslation('common');
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
    // 업로더 링크는 active_role=uploader 일 때만 (콘솔 직행). 미승인/미신청 상태의 신청 진입점은
    // /me 우측 상단 RoleToggleButton (GG-ROLE-001) 이 담당. Header 는 탐색 동선 단순화 위해 비노출.
    return (
      <div className="flex items-center gap-2">
        {user.isAdmin && (
          <Link
            to="/admin"
            className="hidden h-8 items-center gap-1.5 rounded-(--radius-md) border border-(--color-accent)/40 bg-(--color-accent)/5 px-3 text-[13px] font-medium text-(--color-accent) transition-colors hover:bg-(--color-accent)/10 md:inline-flex"
            aria-label={t('aria.adminConsole')}
          >
            {t('label.admin')}
          </Link>
        )}
        {user.activeRole === 'uploader' && (
          <Link
            to="/uploader"
            className="hidden h-8 items-center gap-1.5 rounded-(--radius-md) border border-(--color-accent)/40 bg-(--color-accent)/5 px-3 text-[13px] font-medium text-(--color-accent) transition-colors hover:bg-(--color-accent)/10 md:inline-flex"
            aria-label={t('aria.uploaderConsole')}
          >
            {t('label.uploader')}
          </Link>
        )}
        <NotificationBell />
        <Link
          to="/me"
          className="hidden h-8 items-center gap-1.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] text-(--color-text) transition-colors hover:border-(--color-border-hover) sm:inline-flex"
          aria-label={t('aria.myPage')}
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
          {t('button.logout')}
        </button>
      </div>
    );
  }

  // Real OAuth — Google/Kakao 선택. A_100 자동 복귀 — 현재 path 를 returnTo 로 보존.
  // (BFF 503 이면 알림 fallback.)
  return (
    <div className="flex items-center gap-1.5">
      <a
        href={loginUrl('kakao')}
        className="inline-flex h-8 shrink-0 items-center rounded-(--radius-md) border border-(--color-border) bg-[#FEE500] px-2.5 text-[12px] font-medium text-[#191600] transition-colors hover:bg-[#FDD835] md:px-3 md:text-[13px]"
      >
        {t('label.login_kakao')}
      </a>
      <a
        href={loginUrl('google')}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-(--color-accent-hover) md:px-3 md:text-[13px]"
      >
        <span className="md:hidden">{t('label.login_google_short')}</span>
        <span className="hidden md:inline">{t('label.login_google')}</span>
      </a>
    </div>
  );
}

function SearchMini() {
  const { t } = useTranslation('common');
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={t('aria.quickSearch')}
      className="hidden h-[34px] w-[220px] cursor-not-allowed items-center gap-2 rounded-(--radius-md) bg-(--color-surface-alt) px-3 text-[13px] text-(--color-text-subtle) md:flex"
      aria-label={t('aria.quickSearchLabel')}
    >
      <Icon name="search" size={14} />
      <span>{t('search.placeholder')}</span>
      <kbd className="ml-auto rounded-[3px] border border-(--color-border) bg-(--color-surface) px-[5px] py-[1px] font-mono text-[11px] text-(--color-text-subtle)">
        ⌘K
      </kbd>
    </button>
  );
}
