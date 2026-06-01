import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent } from './MonthCalendar';

/**
 * A_500 마이페이지 주간 캘린더 (와이어 6번 "주간" 토글).
 * presentational — anchor(주 기준 날짜)·events 는 상위가 소유.
 * 일요일 시작 7열, 각 날짜 셀에 해당 날짜 이벤트 타이틀 chip.
 */

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function WeekCalendar({
  anchor,
  events,
  selectedDate,
  onDayClick,
  onShiftWeek,
}: {
  /** 주를 결정하는 기준 날짜 'YYYY-MM-DD' */
  anchor: string;
  events: CalendarEvent[];
  selectedDate: string | null;
  onDayClick: (date: string) => void;
  onShiftWeek: (deltaWeeks: number) => void;
}) {
  const { t, i18n } = useTranslation('mypage');
  const today = ymd(new Date());

  // 일요일 시작 주의 7일
  const start = useMemo(() => {
    const d = new Date(anchor);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }, [anchor]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      }),
    [start],
  );

  // 날짜별 이벤트 (startDate~endDate 구간 커버)
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const d of days) {
      const key = ymd(d);
      const hits = events.filter((e) => e.startDate <= key && key <= e.endDate);
      if (hits.length) m.set(key, hits);
    }
    return m;
  }, [days, events]);

  const fmt = new Intl.DateTimeFormat(i18n.language, { month: 'long', day: 'numeric' });
  const rangeLabel = `${fmt.format(days[0]!)} – ${fmt.format(days[6]!)}`;

  return (
    <section className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="m-0 text-[18px] font-bold tracking-[-0.015em]">{rangeLabel}</h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onShiftWeek(-1)}
            aria-label={t('calendar.prevWeek')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-(--radius-md) text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onShiftWeek(1)}
            aria-label={t('calendar.nextWeek')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-(--radius-md) text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
          >
            ›
          </button>
        </div>
      </header>

      <div role="grid" className="grid grid-cols-7 gap-px overflow-hidden rounded-(--radius-md) bg-(--color-border)">
        {days.map((d, i) => {
          const key = ymd(d);
          const isToday = key === today;
          const isSelected = key === selectedDate;
          const dayEvents = byDate.get(key) ?? [];
          return (
            <button
              type="button"
              key={key}
              role="gridcell"
              aria-selected={isSelected}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => onDayClick(key)}
              className={`flex min-h-[140px] flex-col gap-1 bg-(--color-surface) p-2 text-left transition-colors hover:bg-(--color-surface-alt) ${
                isSelected ? '!bg-(--color-accent-bg)' : ''
              }`}
            >
              <span
                className={`text-[11px] font-semibold ${
                  i === 0 ? 'text-(--color-accent)' : i === 6 ? 'text-(--color-info)' : 'text-(--color-text-subtle)'
                }`}
              >
                {t(`calendar.weekday.${WEEKDAY_KEYS[i]}`)}
              </span>
              <span
                className={`tabular text-[13px] font-medium ${
                  isToday
                    ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-(--color-accent) text-white'
                    : 'text-(--color-text)'
                }`}
              >
                {d.getDate()}
              </span>
              <div className="mt-0.5 flex flex-col gap-1">
                {dayEvents.slice(0, 4).map((e) => (
                  <span
                    key={e.eventId}
                    title={e.title}
                    className={`truncate rounded-(--radius-sm) px-1 py-0.5 text-[10px] ${
                      e.phase === 'ended'
                        ? 'bg-(--color-surface-alt) text-(--color-text-subtle)'
                        : e.phase === 'ongoing'
                          ? 'bg-(--color-accent)/15 text-(--color-accent)'
                          : 'bg-(--color-info)/15 text-(--color-info)'
                    }`}
                  >
                    {e.title}
                  </span>
                ))}
                {dayEvents.length > 4 && (
                  <span className="tabular text-[9px] font-semibold text-(--color-text-subtle)">
                    +{dayEvents.length - 4}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
