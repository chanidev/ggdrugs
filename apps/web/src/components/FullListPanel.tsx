import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  fetchEvents,
  fetchEventsStats,
  type EventListResponse,
  type EventsStatsResponse,
  type EventPhase,
} from '../lib/api';
import { fromBffItem, type DisplayEvent } from '../lib/event-display';
import { EventList } from './EventList';

type SelectedKey = string; // 'all' | category code (ex. 'festival')
type PhaseKey = 'all' | EventPhase;

const PHASE_TABS: { key: PhaseKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'upcoming', label: '곧 열리는' },
  { key: 'ongoing', label: '진행중' },
  { key: 'ended', label: '종료' },
];

/**
 * FullListPanel — A_300 전체목록 조회 (+ A_203 곧 열리는 이벤트 탭).
 *
 * 상단 phase 탭 + 카테고리 chip + 하단 EventList.
 *  - phase 탭: /events/stats.phases 로 count 표시, 선택 시 /events?phases=<phase>.
 *  - 카테고리 chip: /events/stats.categories 로 count 표시, 선택 시 /events?eventTypes=<code>.
 *  - phase · category 는 교집합 (AND).
 */
export function FullListPanel({ activeEventId }: { activeEventId?: string | null }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<EventsStatsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedKey>('all');
  const [phase, setPhase] = useState<PhaseKey>('all');
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
        phases: phase === 'all' ? [] : [phase],
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
  }, [selected, phase]);

  const chips: { key: SelectedKey; label: string; count: number | null }[] = [
    { key: 'all', label: '전체', count: stats?.total ?? null },
    ...(stats?.categories.map((c) => ({ key: c.code, label: c.label, count: c.count })) ?? []),
  ];

  const phaseCount = (k: PhaseKey): number | null => {
    if (!stats) return null;
    if (k === 'all') return stats.total;
    return stats.phases[k] ?? 0;
  };

  const items: DisplayEvent[] = listState.data?.items.map(fromBffItem) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        aria-label="이벤트 진행 단계"
        className="flex shrink-0 gap-0.5 border-b border-(--color-border) px-5 pt-3 text-[13px]"
      >
        {PHASE_TABS.map((t) => {
          const active = phase === t.key;
          const count = phaseCount(t.key);
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPhase(t.key)}
              className={`relative -mb-px inline-flex h-9 items-center gap-1.5 border-b-2 px-3 font-medium transition-colors ${
                active
                  ? 'border-(--color-accent) text-(--color-accent)'
                  : 'border-transparent text-(--color-text-subtle) hover:text-(--color-text)'
              }`}
            >
              {t.label}
              {count !== null && (
                <span
                  className={`tabular text-[12px] ${
                    active ? 'text-(--color-accent)' : 'text-(--color-text-subtle)'
                  }`}
                >
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-(--color-border) px-5 py-3">
        {chips.map((c) => {
          const active = selected === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(c.key)}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${
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
        activeId={activeEventId ?? null}
        onSelect={(id) => navigate(`/events/${id}`)}
        totalLabel={
          listState.data ? `${listState.data.total.toLocaleString()}개의 이벤트` : undefined
        }
      />
    </div>
  );
}
