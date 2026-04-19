import { Fragment, useEffect, useState } from 'react';
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
      {/* Editorial status strip — 종이 지도 범례 감성.
          4 equal tabs 대신 한 줄 인라인 문장 (middot 구분),
          숫자는 mono tabular, active 는 버밀리언 dot. */}
      <div
        role="tablist"
        aria-label="이벤트 진행 단계"
        className="flex shrink-0 flex-wrap items-center gap-y-1 border-b border-(--color-border) bg-(--color-surface) px-5 py-2.5"
      >
        {PHASE_TABS.map((t, i) => {
          const active = phase === t.key;
          const count = phaseCount(t.key);
          return (
            <Fragment key={t.key}>
              {i > 0 && (
                <span
                  aria-hidden
                  className="select-none px-1 text-[12px] text-(--color-text-subtle)"
                >
                  ·
                </span>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPhase(t.key)}
                className={`group inline-flex items-center gap-1.5 rounded-(--radius-sm) px-1.5 py-0.5 text-[13px] transition-colors ${
                  active
                    ? 'text-(--color-accent)'
                    : 'text-(--color-text-muted) hover:text-(--color-text)'
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full bg-(--color-accent)"
                  />
                )}
                <span className={active ? 'font-semibold' : 'font-medium'}>{t.label}</span>
                {count !== null && (
                  <span
                    className={`font-mono text-[12px] tabular ${
                      active
                        ? 'text-(--color-accent)'
                        : 'text-(--color-text-subtle) group-hover:text-(--color-text-muted)'
                    }`}
                  >
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            </Fragment>
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
