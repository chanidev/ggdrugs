import { useEffect, useState } from 'react';
import {
  fetchEvents,
  fetchEventsStats,
  type EventListResponse,
  type EventsStatsResponse,
} from '../lib/api';
import { fromBffItem, type DisplayEvent } from '../lib/event-display';
import { EventList } from './EventList';

type SelectedKey = string; // 'all' | category code (ex. 'festival')

/**
 * FullListPanel — A_300 전체목록 조회.
 *
 * 상단 카테고리 chip + 하단 EventList.
 *  - 카테고리 chip: /events/stats 에서 실 count 조회.
 *  - 리스트: /events?eventTypes=<code> (선택 시) 재호출.
 */
export function FullListPanel() {
  const [stats, setStats] = useState<EventsStatsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedKey>('all');
  const [listState, setListState] = useState<{
    loading: boolean;
    error: string | null;
    data: EventListResponse | null;
  }>({ loading: true, error: null, data: null });

  useEffect(() => {
    const ctrl = new AbortController();
    fetchEventsStats(ctrl.signal)
      .then(setStats)
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setStatsError((err as Error).message);
      });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setListState({ loading: true, error: null, data: null });
    fetchEvents(
      {
        eventTypes: selected === 'all' ? [] : [selected],
        limit: 100,
      },
      ctrl.signal,
    )
      .then((data) => setListState({ loading: false, error: null, data }))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setListState({ loading: false, error: (err as Error).message, data: null });
      });
    return () => ctrl.abort();
  }, [selected]);

  const chips: { key: SelectedKey; label: string; count: number | null }[] = [
    { key: 'all', label: '전체', count: stats?.total ?? null },
    ...(stats?.categories.map((c) => ({ key: c.code, label: c.label, count: c.count })) ?? []),
  ];

  const items: DisplayEvent[] = listState.data?.items.map(fromBffItem) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-(--color-border) px-5 py-3">
        {chips.map((c) => {
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
              {c.count !== null && (
                <span
                  className={`tabular ml-1 font-medium ${
                    active ? 'text-(--color-accent)' : 'text-(--color-text-subtle)'
                  }`}
                >
                  {c.count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
        {statsError && (
          <span className="ml-auto self-center text-[11px] text-(--color-error)">
            stats 로드 실패
          </span>
        )}
      </div>
      <EventList
        items={items}
        loading={listState.loading}
        error={listState.error}
        totalLabel={
          listState.data ? `${listState.data.total.toLocaleString()}개의 이벤트` : undefined
        }
      />
    </div>
  );
}
