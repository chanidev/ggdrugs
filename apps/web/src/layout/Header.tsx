import { Link } from 'react-router';
import { LogoLockup } from '../components/brand/Logo';
import { Icon } from '../components/Icon';

/**
 * Header — 상단 바 (60px).
 * 좌: 브랜드 lockup (루트로 링크).  우: 빠른검색(placeholder) + 로그인(준비 중).
 *
 * 참고: 상단 nav 탭 (탐색 / 예정 / 내 캘린더) 은 제거 — "탐색" 뷰 하나뿐이고
 * "예정" 은 A_300 패널 내 phase 탭으로, "내 캘린더" 는 A_500 인증 이후로 미룸.
 * 유효한 네비 대상이 생기면 다시 돌려놓는다.
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
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="로그인 기능은 준비 중입니다"
          className="inline-flex h-8 shrink-0 cursor-not-allowed items-center gap-1.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium text-(--color-text-subtle)"
        >
          로그인
        </button>
      </div>
    </header>
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
