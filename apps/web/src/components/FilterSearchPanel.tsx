import { useState } from 'react';
import { EventList } from './EventList';
import { SidebarSubHeader } from '../layout/SidebarSubHeader';

/**
 * FilterSearchPanel — A_202 필터 검색.
 *
 * 5종 pill chip (지역·기간·인원구성·종류·성향) + 적용 버튼 + 결과 리스트.
 * Phase 2에서 각 pill을 클릭 시 dropdown으로 값 선택하는 UI 추가. 지금은 토글만.
 */
const FILTERS = [
  { key: 'region', label: '지역' },
  { key: 'period', label: '기간' },
  { key: 'companion', label: '인원구성' },
  { key: 'type', label: '종류' },
  { key: 'vibe', label: '성향' },
] as const;

export function FilterSearchPanel() {
  const [active, setActive] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);

  const toggle = (key: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setApplied(false);
  };

  const clear = () => {
    setActive(new Set());
    setApplied(false);
  };

  return (
    <div className="flex h-full flex-col">
      <SidebarSubHeader title="필터 검색" />
      <div className="shrink-0 space-y-3 border-b border-(--color-border) p-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const isActive = active.has(f.key);
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => toggle(f.key)}
                className={`h-8 rounded-full px-3 text-body-sm font-medium transition-colors ${
                  isActive
                    ? 'border border-(--color-accent) bg-(--color-accent-bg) text-(--color-accent)'
                    : 'border border-transparent bg-(--color-surface-alt) text-(--color-text-muted) hover:text-(--color-text)'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={active.size === 0}
            onClick={() => setApplied(true)}
            className="h-9 flex-1 rounded-(--radius-md) bg-(--color-accent) px-4 text-body-sm font-medium text-white transition-colors hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
          >
            적용
          </button>
          {active.size > 0 && (
            <button
              type="button"
              onClick={clear}
              className="h-9 rounded-(--radius-md) border border-(--color-border) px-3 text-body-sm text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
            >
              전체 취소
            </button>
          )}
        </div>
      </div>

      {applied ? (
        <EventList />
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-body-sm text-(--color-text-subtle)">
          {active.size === 0
            ? '필터를 하나 이상 선택하면 적용할 수 있어요.'
            : '[적용]을 누르면 결과가 표시됩니다.'}
        </div>
      )}
    </div>
  );
}
