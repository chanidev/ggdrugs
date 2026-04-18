import { LogoLockup } from '../components/brand/Logo';
import { Icon } from '../components/Icon';

/**
 * Header — 상단 바 (60px).
 * 좌: 브랜드 lockup + nav tabs.  우: 빠른검색(search-mini) + 로그인.
 *
 * 레퍼런스: handoff ui_kit_web.html §Header.
 */
export function Header() {
  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-(--color-border) bg-(--color-surface) px-6">
      <div className="flex items-center gap-8">
        <LogoLockup />
        <nav className="hidden gap-[2px] md:flex" aria-label="상단 탭">
          <TabLink label="탐색" active />
          <TabLink label="예정 이벤트" />
          <TabLink label="내 캘린더" />
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <SearchMini />
        <button
          type="button"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium text-(--color-text) transition-colors hover:border-(--color-border-hover) hover:bg-(--color-surface-alt)"
        >
          로그인
        </button>
      </div>
    </header>
  );
}

function TabLink({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <a
      href="#"
      className={`rounded-(--radius-md) px-3 py-1.5 text-[14px] font-medium transition-colors ${
        active
          ? 'bg-(--color-accent-bg) text-(--color-accent)'
          : 'text-(--color-text-muted) hover:bg-(--color-surface-alt) hover:text-(--color-text)'
      }`}
    >
      {label}
    </a>
  );
}

function SearchMini() {
  return (
    <button
      type="button"
      className="hidden h-[34px] w-[220px] cursor-text items-center gap-2 rounded-(--radius-md) bg-(--color-surface-alt) px-3 text-[13px] text-(--color-text-muted) transition-colors hover:text-(--color-text) md:flex"
      aria-label="빠른 검색 (⌘K)"
    >
      <Icon name="search" size={14} />
      <span>이벤트·장소 검색</span>
      <kbd className="ml-auto rounded-[3px] border border-(--color-border) bg-(--color-surface) px-[5px] py-[1px] font-mono text-[11px] text-(--color-text-subtle)">
        ⌘K
      </kbd>
    </button>
  );
}
