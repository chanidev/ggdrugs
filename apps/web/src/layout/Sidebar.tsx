import { Icon } from '../components/Icon';

export type SidebarSection = 'filter' | 'list' | 'chat';

const SECTIONS: Array<{
  key: SidebarSection;
  title: string;
  description: string;
  icon: 'filter' | 'list' | 'chat';
}> = [
  { key: 'filter', title: '필터 검색',     description: '5개 축으로 좁히기',  icon: 'filter' },
  { key: 'list',   title: '전체목록 조회', description: '카테고리별 인덱스', icon: 'list' },
  { key: 'chat',   title: '채팅방 검색',   description: '자연어로 묻기',       icon: 'chat' },
];

/**
 * Sidebar — 메인 페이지 탐색 rail (236px).
 *
 * Layout:
 *   - eyebrow → title → subtitle
 *   - 3 row 네비게이션 (icon box + title + desc)
 *   - 하단 stats 블록 (margin-top:auto 로 바닥 고정)
 *
 * state 는 AppShell 에서 lifted up — OverlayPanel 이 형제로 포지셔닝되려면 여기서는 소유 안 함.
 */
export function Sidebar({
  open,
  onToggle,
}: {
  open: SidebarSection | null;
  onToggle: (key: SidebarSection) => void;
}) {
  return (
    <aside
      className="flex w-[236px] shrink-0 flex-col border-r border-(--color-border) bg-(--color-surface)"
      aria-label="이벤트 탐색 메뉴"
    >
      <div className="px-5 pb-1 pt-[18px] text-[11px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
        Discovery · A_200
      </div>
      <h2 className="m-0 px-5 pb-4 text-[22px] font-bold leading-tight tracking-[-0.02em]">
        이벤트를 찾는
        <br />
        서울의 방법
      </h2>
      <p className="m-0 border-b border-(--color-border) px-5 pb-[18px] text-[13px] leading-[1.55] text-(--color-text-muted)">
        지도 위 핀과 채팅, 필터로 축제·박람회·심포지움·컨퍼런스를 탐색하세요.
      </p>

      <nav aria-label="탐색 섹션">
        <ul className="m-0 list-none p-0">
          {SECTIONS.map((s, i) => (
            <li key={s.key} className={i > 0 ? 'border-t border-(--color-border)' : ''}>
              <RailRow section={s} active={open === s.key} onClick={() => onToggle(s.key)} />
            </li>
          ))}
        </ul>
      </nav>

      <StatsBlock />
    </aside>
  );
}

function RailRow({
  section,
  active,
  onClick,
}: {
  section: { key: SidebarSection; title: string; description: string; icon: 'filter' | 'list' | 'chat' };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`relative flex w-full items-center gap-3 px-5 py-4 text-left transition-colors ${
        active ? 'bg-(--color-accent-bg)' : 'hover:bg-(--color-surface-alt)'
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-[2px] bg-(--color-accent)"
        />
      )}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-md) transition-colors ${
          active
            ? 'bg-(--color-surface) text-(--color-accent)'
            : 'bg-(--color-surface-alt) text-(--color-text-muted)'
        }`}
      >
        <Icon name={section.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`mb-0.5 text-[15px] font-semibold tracking-[-0.01em] ${
            active ? 'text-(--color-accent)' : 'text-(--color-text)'
          }`}
        >
          {section.title}
        </p>
        <p className="truncate text-[12px] text-(--color-text-muted)">
          {section.description}
        </p>
      </div>
    </button>
  );
}

function StatsBlock() {
  return (
    <div className="mt-auto border-t border-(--color-border) px-5 py-[18px]">
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
        현재 지도 위
      </div>
      <StatRow label="전체 이벤트" value="42" />
      <StatRow label="진행중" value={<span className="text-(--color-accent)">8</span>} separator />
      <StatRow label="이번 주 시작" value="12" separator />
    </div>
  );
}

function StatRow({
  label,
  value,
  separator = false,
}: {
  label: string;
  value: React.ReactNode;
  separator?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between py-1.5 ${
        separator ? 'border-t border-dashed border-(--color-border)' : ''
      }`}
    >
      <span className="text-[13px] text-(--color-text-muted)">{label}</span>
      <span className="tabular text-[15px] font-semibold text-(--color-text)">{value}</span>
    </div>
  );
}
