/**
 * Header — 상단 바.
 * 좌: 로고/서비스명.  중앙: 탭 (예정 이벤트 A_203 placeholder).  우: 역할 전환·로그인 버튼.
 */
export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-(--color-border) bg-(--color-surface) px-6">
      <div className="flex items-baseline gap-6">
        <a
          href="/"
          className="font-sans text-h3 font-bold tracking-tight"
          style={{ letterSpacing: '-0.015em' }}
        >
          GGdrugs
        </a>
        <nav className="hidden gap-1 md:flex" aria-label="상단 탭">
          <TabLink label="탐색" active />
          <TabLink label="예정 이벤트" />
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-4 py-2 text-body-sm font-medium text-(--color-text) transition-colors hover:bg-(--color-surface-alt)"
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
      className={`rounded-(--radius-md) px-3 py-1.5 text-body-sm font-medium transition-colors ${
        active
          ? 'bg-(--color-accent-bg) text-(--color-accent)'
          : 'text-(--color-text-muted) hover:bg-(--color-surface-alt) hover:text-(--color-text)'
      }`}
    >
      {label}
    </a>
  );
}
