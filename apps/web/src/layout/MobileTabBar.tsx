import { Icon } from '../components/Icon';
import type { SidebarSection } from './Sidebar';

/**
 * MobileTabBar — md 미만에서 하단 고정. 4 tab (지도/필터/목록/채팅).
 *
 * "지도" 탭은 open=null (패널 모두 닫힘) 상태. 다른 3 탭은 OverlayPanel open 제어.
 * DESIGN.md §Layout "모바일: list/map 토글 전환" 의도와 정합 — 동시 표시 X.
 */
export function MobileTabBar({
  open,
  onSelect,
}: {
  open: SidebarSection | null;
  onSelect: (next: SidebarSection | null) => void;
}) {
  return (
    <nav
      aria-label="모바일 하단 탭"
      className="absolute bottom-0 left-0 right-0 z-30 flex h-14 shrink-0 items-stretch border-t border-(--color-border) bg-(--color-surface) shadow-[0_-2px_12px_rgba(0,0,0,0.04)] md:hidden"
    >
      <TabBtn label="지도" icon="locate" active={open === null} onClick={() => onSelect(null)} />
      <TabBtn label="필터" icon="filter" active={open === 'filter'} onClick={() => onSelect('filter')} />
      <TabBtn label="목록" icon="list" active={open === 'list'} onClick={() => onSelect('list')} />
      <TabBtn label="채팅" icon="chat" active={open === 'chat'} onClick={() => onSelect('chat')} />
    </nav>
  );
}

function TabBtn({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: 'filter' | 'list' | 'chat' | 'locate';
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
        active ? 'text-(--color-accent)' : 'text-(--color-text-muted)'
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-1/2 top-0 h-[2px] w-8 -translate-x-1/2 rounded-b-full bg-(--color-accent)"
        />
      )}
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}
