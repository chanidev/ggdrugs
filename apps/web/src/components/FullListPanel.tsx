import { useState } from 'react';
import { EventList } from './EventList';
import { SidebarSubHeader } from '../layout/SidebarSubHeader';

/**
 * FullListPanel — A_300 전체목록 조회.
 *
 * 상단 카테고리 5버튼(전체/축제/박람회/심포지움/컨퍼런스) + 스크롤 리스트.
 * category_code enum은 event_categories.category_code (DDL v4) 기준.
 */
const CATEGORIES = [
  { key: 'all', label: '전체' },
  { key: 'festival', label: '축제' },
  { key: 'expo', label: '박람회' },
  { key: 'symposium', label: '심포지움' },
  { key: 'conference', label: '컨퍼런스' },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]['key'];

export function FullListPanel() {
  const [selected, setSelected] = useState<CategoryKey>('all');

  return (
    <div className="flex h-full flex-col">
      <SidebarSubHeader title="전체목록 조회" />
      <div className="flex shrink-0 flex-wrap gap-2 border-b border-(--color-border) p-4">
        {CATEGORIES.map((c) => {
          const isActive = selected === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => setSelected(c.key)}
              className={`h-8 rounded-(--radius-md) px-3 text-body-sm font-medium transition-colors ${
                isActive
                  ? 'bg-(--color-accent) text-white'
                  : 'bg-(--color-surface-alt) text-(--color-text-muted) hover:text-(--color-text)'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <EventList categoryFilter={selected} />
    </div>
  );
}
