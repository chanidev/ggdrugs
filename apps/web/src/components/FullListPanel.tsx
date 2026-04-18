import { useEffect, useState } from 'react';
import { CATEGORIES, type CategoryKey } from '../data/mock';
import { fetchEvents, type EventListResponse } from '../lib/api';
import { fromBffItem, type DisplayEvent } from '../lib/event-display';
import { EventList } from './EventList';

/**
 * FullListPanel — A_300 전체목록 조회.
 *
 * 상단 카테고리 chip (전체 · 축제 · 박람회 · 심포지움 · 컨퍼런스) + 하단 EventList.
 * 카테고리 chip 클릭 → GET /events?eventTypes=<code> 재호출.
 *
 * Phase 1 제약:
 *  - chip 우측 숫자는 정적(mock). 동적 counts 엔드포인트는 Phase 2 에서.
 *  - pagination 미구현 — 서버 limit 100 이후는 잘림.
 */
export function FullListPanel() {
  const [selected, setSelected] = useState<CategoryKey>('all');
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    data: EventListResponse | null;
  }>({ loading: true, error: null, data: null });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ loading: true, error: null, data: null });
    fetchEvents(
      {
        eventTypes: selected === 'all' ? [] : [selected],
        limit: 100,
      },
      ctrl.signal,
    )
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setState({ loading: false, error: (err as Error).message, data: null });
      });
    return () => ctrl.abort();
  }, [selected]);

  const items: DisplayEvent[] = state.data?.items.map(fromBffItem) ?? [];
  const totalLabel = state.data?.total ?? items.length;

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
      <EventList
        items={items}
        loading={state.loading}
        error={state.error}
        totalLabel={
          state.data ? `${state.data.total.toLocaleString()}개의 이벤트` : undefined
        }
      />
    </div>
  );
}
