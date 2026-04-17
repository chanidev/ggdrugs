import { useState } from 'react';

/**
 * FilterBar — 필터 5종 pill chip.
 * DESIGN.md §Chip: fully rounded, active 상태는 accent-bg/accent.
 * 실제 드롭다운·다중 선택 UI는 Phase 2에서 추가. 지금은 shell만.
 */
const FILTERS = [
  { key: 'region', label: '지역' },
  { key: 'period', label: '기간' },
  { key: 'companion', label: '인원구성' },
  { key: 'type', label: '종류' },
  { key: 'vibe', label: '성향' },
] as const;

export function FilterBar() {
  const [active, setActive] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-(--color-border) p-4">
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
      {active.size > 0 && (
        <button
          type="button"
          onClick={() => setActive(new Set())}
          className="ml-auto text-body-sm text-(--color-text-muted) underline decoration-dotted underline-offset-2 transition-colors hover:text-(--color-text)"
        >
          전체 취소
        </button>
      )}
    </div>
  );
}
