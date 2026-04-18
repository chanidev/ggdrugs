import { useMemo } from 'react';
import { DUMMY_EVENTS, type CategoryKey, type MockEvent } from '../data/mock';
import { Icon } from './Icon';
import { PhaseBadge } from './PhaseBadge';
import { Poster } from './Poster';

/**
 * EventList — 필터/카테고리로 좁혀진 이벤트 카드 목록.
 * 현재는 DUMMY_EVENTS mock. /events API 연결되면 props 로 주입받도록 교체.
 */
export function EventList({
  categoryFilter = 'all',
  activeId,
  onSelect,
}: {
  categoryFilter?: CategoryKey | 'all';
  activeId?: number | null;
  onSelect?: (id: number) => void;
}) {
  const events = useMemo<MockEvent[]>(
    () => DUMMY_EVENTS.filter((e) => categoryFilter === 'all' || e.category === categoryFilter),
    [categoryFilter],
  );

  if (events.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-[13px] text-(--color-text-subtle)">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-(--color-surface-alt) text-(--color-text-subtle)">
          <Icon name="inbox" size={20} />
        </div>
        <div className="text-[14px] font-medium text-(--color-text-muted)">아직 결과가 없어요</div>
        <div>다른 카테고리를 선택해보세요.</div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-(--color-border) bg-(--color-surface-alt) px-5 py-3">
        <div className="text-[13px] text-(--color-text-muted)">
          <strong className="tabular text-(--color-text)">{events.length}</strong>개의 이벤트
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 text-[13px] text-(--color-text-muted) hover:text-(--color-text)"
        >
          최신순 <Icon name="arrow" size={12} />
        </button>
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {events.map((e, i) => (
          <li key={e.id} className={i > 0 ? 'border-t border-(--color-border)' : ''}>
            <EventCard event={e} active={e.id === activeId} onClick={() => onSelect?.(e.id)} />
          </li>
        ))}
      </ul>
    </>
  );
}

function EventCard({
  event,
  active,
  onClick,
}: {
  event: MockEvent;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer gap-3.5 px-5 py-4 text-left transition-colors ${
        active ? 'bg-(--color-accent-bg)' : 'hover:bg-(--color-surface-alt)'
      }`}
    >
      <Poster event={event} />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-start justify-between gap-2.5">
          <h3 className="m-0 text-[16px] font-semibold leading-[1.3] tracking-[-0.01em]">
            {event.title}
          </h3>
          <PhaseBadge phase={event.phase} />
        </div>
        <p className="m-0 text-[13px] text-(--color-text-muted)">{event.region}</p>
        <p className="tabular m-0 text-[13px] text-(--color-text-muted)">{event.dateRange}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {event.vibes.map((v) => (
            <span
              key={v}
              className={`rounded-full px-2 py-0.5 text-[11px] text-(--color-text-muted) ${
                active ? 'bg-(--color-surface)' : 'bg-(--color-surface-alt)'
              }`}
            >
              {v}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
