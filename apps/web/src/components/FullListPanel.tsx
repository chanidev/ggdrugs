import { useState } from 'react';
import { CATEGORIES, type CategoryKey } from '../data/mock';
import { EventList } from './EventList';

/**
 * FullListPanel — A_300 전체목록 조회.
 * 상단 카테고리 chip row (전체 · 축제 · 박람회 · 심포지움 · 컨퍼런스) + 하단 EventList.
 */
export function FullListPanel() {
  const [selected, setSelected] = useState<CategoryKey>('all');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-(--color-border) px-5 py-3">
        {CATEGORIES.map((c) => {
          const active = selected === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(c.key)}
              className={`inline-flex h-[30px] items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${
                active
                  ? 'border-(--color-accent) bg-(--color-accent-bg) text-(--color-accent)'
                  : 'border-(--color-border) bg-(--color-surface) text-(--color-text) hover:border-(--color-border-hover)'
              }`}
            >
              {c.label}
              <span
                className={`tabular ml-1 font-medium ${
                  active ? 'text-(--color-accent)' : 'text-(--color-text-subtle)'
                }`}
              >
                {c.count}
              </span>
            </button>
          );
        })}
      </div>
      <EventList categoryFilter={selected} />
    </div>
  );
}
