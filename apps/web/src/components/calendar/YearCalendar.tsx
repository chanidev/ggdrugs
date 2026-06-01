import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent } from './MonthCalendar';

/**
 * A_500 마이페이지 연간 캘린더 (와이어 6번 "연간" 토글).
 * 12개 미니 월 그리드. 각 월에 걸친 이벤트 수를 점/숫자로 표시, 클릭 시 월간 뷰로 진입.
 */

function monthOverlapCount(events: CalendarEvent[], year: number, month0: number): number {
  const lo = `${year}-${String(month0 + 1).padStart(2, '0')}-01`;
  const last = new Date(year, month0 + 1, 0).getDate();
  const hi = `${year}-${String(month0 + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  // 이벤트 구간 [startDate,endDate] 이 해당 월 [lo,hi] 과 겹치면 카운트
  return events.filter((e) => e.startDate <= hi && e.endDate >= lo).length;
}

export function YearCalendar({
  year,
  events,
  onMonthSelect,
  onShiftYear,
}: {
  year: number;
  events: CalendarEvent[];
  /** 미니 월 클릭 → 상위가 월간 뷰로 전환 */
  onMonthSelect: (month0: number) => void;
  onShiftYear: (delta: number) => void;
}) {
  const { t, i18n } = useTranslation('mypage');
  const thisYear = new Date().getFullYear();
  const thisMonth0 = new Date().getMonth();

  const counts = useMemo(
    () => Array.from({ length: 12 }, (_, m) => monthOverlapCount(events, year, m)),
    [events, year],
  );

  const monthLabel = (m0: number) =>
    new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(new Date(year, m0, 1));

  return (
    <section className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="tabular m-0 text-[18px] font-bold tracking-[-0.015em]">{year}</h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onShiftYear(-1)}
            aria-label={t('calendar.prevYear')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-(--radius-md) text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onShiftYear(1)}
            aria-label={t('calendar.nextYear')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-(--radius-md) text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
          >
            ›
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {counts.map((count, m0) => {
          const isCurrent = year === thisYear && m0 === thisMonth0;
          return (
            <button
              type="button"
              key={m0}
              onClick={() => onMonthSelect(m0)}
              className={`flex flex-col items-start gap-1 rounded-(--radius-md) border p-3 text-left transition-colors hover:border-(--color-border-hover) hover:bg-(--color-surface-alt) ${
                isCurrent ? 'border-(--color-accent) bg-(--color-accent-bg)' : 'border-(--color-border) bg-(--color-surface)'
              }`}
            >
              <span className="text-[14px] font-semibold text-(--color-text)">{monthLabel(m0)}</span>
              {count > 0 ? (
                <span className="inline-flex items-center gap-1 text-[12px] text-(--color-accent)">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-(--color-accent)" />
                  {t('calendar.yearMonthCount', { count })}
                </span>
              ) : (
                <span className="text-[12px] text-(--color-text-subtle)">{t('calendar.yearMonthNone')}</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
