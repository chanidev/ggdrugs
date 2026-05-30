import { useTranslation } from 'react-i18next';
import type { DisplayEvent } from '../lib/event-display';
import { Icon } from './Icon';
import { PhaseBadge } from './PhaseBadge';
import { Poster } from './Poster';

/**
 * EventList — 정규화된 이벤트 배열을 받아 카드 리스트 + 상단 요약 바 렌더.
 *
 * 데이터 페칭은 상위(부모)에서. 여기서는 순수 표현 컴포넌트.
 */
export function EventList({
  items,
  activeId,
  onSelect,
  loading = false,
  error = null,
  totalLabel,
}: {
  items: DisplayEvent[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  /** 상단 바에 표시할 커스텀 카운트 라벨 — 서버 total 과 items.length 가 다른 경우 사용. */
  totalLabel?: React.ReactNode;
}) {
  const { t } = useTranslation(['common', 'navigation']);
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-[13px] text-(--color-text-subtle)">
        {t('label.loading')}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-[13px] text-(--color-error)">
        <div className="text-[14px] font-medium">{t('error.loadFailed')}</div>
        <div className="max-w-[260px] text-(--color-text-muted)">{error}</div>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-[13px] text-(--color-text-subtle)">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-(--color-surface-alt) text-(--color-text-subtle)">
          <Icon name="inbox" size={20} />
        </div>
        <div className="text-[14px] font-medium text-(--color-text-muted)">{t('label.empty')}</div>
        <div>{t('navigation:eventList.emptyHint')}</div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-(--color-border) bg-(--color-surface-alt) px-5 py-3">
        <div className="text-[13px] text-(--color-text-muted)">
          {totalLabel ?? (
            <>
              <strong className="tabular text-(--color-text)">{items.length}</strong>
              {t('navigation:eventList.defaultTotalSuffix')}
            </>
          )}
        </div>
        <span
          className="text-[12px] text-(--color-text-subtle)"
          title={t('navigation:eventList.sortHintTitle')}
        >
          {t('navigation:eventList.sortHint')}
        </span>
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {items.map((e, i) => (
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
  event: DisplayEvent;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation('navigation');
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
          <h3 className="m-0 line-clamp-2 text-[16px] font-semibold leading-[1.3] tracking-[-0.01em]">
            {event.title}
          </h3>
          <PhaseBadge phase={event.phase} />
        </div>
        <p className="m-0 flex items-center gap-1.5 text-[13px] text-(--color-text-muted)">
          <span>{event.region}</span>
          {event.distanceLabel && (
            <>
              <span aria-hidden className="text-(--color-text-subtle)">·</span>
              <span className="tabular text-(--color-accent)" aria-label={t('eventList.distanceAriaLabel', { distance: event.distanceLabel })}>
                {event.distanceLabel}
              </span>
            </>
          )}
        </p>
        <p className="tabular m-0 text-[13px] text-(--color-text-muted)">{event.dateRange}</p>
        {event.vibes.length > 0 && (
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
        )}
      </div>
    </button>
  );
}
