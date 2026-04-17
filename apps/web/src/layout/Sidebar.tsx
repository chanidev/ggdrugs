import { useState } from 'react';
import { FilterSearchPanel } from '../components/FilterSearchPanel';
import { FullListPanel } from '../components/FullListPanel';

/**
 * Sidebar — A_200 메인 페이지 사이드바.
 *
 * 세 가지 모드:
 * - 'idle'   : 초기 상태. 두 엔트리 카드 표시 (필터 검색 / 전체목록 조회)
 * - 'filter' : A_202 필터 검색 — 5종 필터 pill + 적용 CTA + 결과 리스트
 * - 'list'   : A_300 전체목록 조회 — 카테고리 5버튼 + 리스트
 */
export type SidebarMode = 'idle' | 'filter' | 'list';

export function Sidebar() {
  const [mode, setMode] = useState<SidebarMode>('idle');

  return (
    <aside
      className="flex w-[40%] min-w-[360px] max-w-[520px] flex-col border-r border-(--color-border) bg-(--color-surface)"
      aria-label="이벤트 탐색 사이드바"
    >
      <ModeTabs mode={mode} onChange={setMode} />
      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === 'idle' && <IdleState onPick={setMode} />}
        {mode === 'filter' && <FilterSearchPanel />}
        {mode === 'list' && <FullListPanel />}
      </div>
    </aside>
  );
}

function ModeTabs({
  mode,
  onChange,
}: {
  mode: SidebarMode;
  onChange: (m: SidebarMode) => void;
}) {
  return (
    <div
      className="flex shrink-0 border-b border-(--color-border)"
      role="tablist"
      aria-label="탐색 방식"
    >
      <TabButton
        label="필터 검색"
        active={mode === 'filter'}
        onClick={() => onChange('filter')}
      />
      <TabButton
        label="전체목록 조회"
        active={mode === 'list'}
        onClick={() => onChange('list')}
      />
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative flex-1 py-4 text-body font-medium transition-colors ${
        active
          ? 'text-(--color-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'
      }`}
    >
      {label}
      {active && (
        <span
          aria-hidden
          className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-(--color-accent)"
        />
      )}
    </button>
  );
}

function IdleState({ onPick }: { onPick: (m: SidebarMode) => void }) {
  return (
    <div className="flex h-full flex-col items-stretch gap-4 p-6">
      <p className="text-body-sm text-(--color-text-muted)">
        어떻게 이벤트를 찾으시겠어요?
      </p>

      <EntryCard
        title="필터 검색"
        description="지역·기간·인원구성·종류·성향 5가지 조건을 조합해 좁혀 찾기."
        onClick={() => onPick('filter')}
      />
      <EntryCard
        title="전체목록 조회"
        description="축제·박람회·심포지움·컨퍼런스 4가지 카테고리로 전체를 훑어보기."
        onClick={() => onPick('list')}
      />

      <p className="mt-auto text-caption text-(--color-text-subtle)">
        지도 하단의 채팅창에 자연어로 물어도 돼요.
      </p>
    </div>
  );
}

function EntryCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-2 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-5 text-left transition-all hover:border-(--color-accent) hover:shadow-(--shadow-md)"
    >
      <div className="flex w-full items-center justify-between">
        <h3 className="text-h3 font-semibold tracking-tight">{title}</h3>
        <span
          aria-hidden
          className="text-body text-(--color-text-subtle) transition-colors group-hover:text-(--color-accent)"
        >
          →
        </span>
      </div>
      <p className="text-body-sm text-(--color-text-muted)">{description}</p>
    </button>
  );
}
