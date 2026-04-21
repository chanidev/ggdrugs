import { useMemo } from 'react';

/**
 * A_500 마이페이지 월간 캘린더.
 *
 * 순수 presentational:
 *  - events: 표시할 이벤트 (startDate ~ endDate 구간 전체에 배지).
 *  - selectedDate: 'YYYY-MM-DD' — 우측 패널 state 가 소유
 *  - onDayClick: 사용자가 날짜 셀 클릭 → 상위가 선택된 날짜 이벤트를 보여줌.
 *  - month: 현재 표시 월 (연/월 state 는 상위가 소유해야 month 네비게이션 동기)
 *
 * 한국 UX 관행 따라 일요일 시작. 오늘 표시, 이전/다음달 셀 비활성 dim.
 * 이벤트 배지는 accent dot + 개수 숫자 (1개면 dot만). 3개 이상이면 '+N'.
 *
 * 모듈 경계:
 *  - 날짜 계산은 여기서 닫힘. Date 만 사용, 타 라이브러리 없음 (tree-shake 이득).
 *  - 이벤트 매핑/fetch 는 상위 책임.
 */

export interface CalendarEvent {
  eventId: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  phase: 'upcoming' | 'ongoing' | 'ended';
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function firstCellOfMonthGrid(year: number, month0: number): Date {
  const first = new Date(year, month0, 1);
  const lead = first.getDay(); // 0=일
  return new Date(year, month0, 1 - lead);
}

function eachCoveredDate(start: string, end: string, from: Date, to: Date): string[] {
  const s = new Date(start);
  const e = new Date(end);
  const lo = s > from ? s : from;
  const hi = e < to ? e : to;
  const out: string[] = [];
  for (let d = new Date(lo); d <= hi; d.setDate(d.getDate() + 1)) out.push(ymd(d));
  return out;
}

export function MonthCalendar({
  year,
  month0,
  events,
  selectedDate,
  onMonthChange,
  onDayClick,
}: {
  /** 표시 연도 (e.g. 2026) */
  year: number;
  /** 0~11 월 인덱스 */
  month0: number;
  events: CalendarEvent[];
  selectedDate: string | null;
  onMonthChange: (y: number, m0: number) => void;
  onDayClick: (date: string) => void;
}) {
  const today = ymd(new Date());

  // 6주 grid (42 cells) — 항상 고정 크기, 빈 셀은 전/다음달 dim.
  const gridStart = useMemo(() => firstCellOfMonthGrid(year, month0), [year, month0]);
  const cells = useMemo(() => {
    const out: { date: string; dateObj: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      out.push({ date: ymd(d), dateObj: d, inMonth: d.getMonth() === month0 });
    }
    return out;
  }, [gridStart, month0]);

  // 이벤트 → date map.  key: YYYY-MM-DD, value: events covering that date.
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    const from = cells[0]!.dateObj;
    const to = cells[cells.length - 1]!.dateObj;
    for (const e of events) {
      for (const d of eachCoveredDate(e.startDate, e.endDate, from, to)) {
        const arr = m.get(d) ?? [];
        arr.push(e);
        m.set(d, arr);
      }
    }
    return m;
  }, [events, cells]);

  const label = `${year}년 ${month0 + 1}월`;

  const prev = () => {
    if (month0 === 0) onMonthChange(year - 1, 11);
    else onMonthChange(year, month0 - 1);
  };
  const next = () => {
    if (month0 === 11) onMonthChange(year + 1, 0);
    else onMonthChange(year, month0 + 1);
  };
  const toToday = () => {
    const d = new Date();
    onMonthChange(d.getFullYear(), d.getMonth());
  };

  return (
    <section className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="m-0 text-[18px] font-bold tracking-[-0.015em]">{label}</h2>
          <button
            type="button"
            onClick={toToday}
            className="inline-flex h-7 items-center rounded-(--radius-sm) border border-(--color-border) px-2 text-[12px] text-(--color-text-muted) transition-colors hover:border-(--color-border-hover) hover:text-(--color-text)"
          >
            오늘
          </button>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={prev}
            aria-label="이전 달"
            className="inline-flex h-8 w-8 items-center justify-center rounded-(--radius-md) text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="다음 달"
            className="inline-flex h-8 w-8 items-center justify-center rounded-(--radius-md) text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
          >
            ›
          </button>
        </div>
      </header>

      <div
        role="grid"
        aria-label={`${label} 캘린더`}
        className="grid grid-cols-7 gap-px bg-(--color-border) overflow-hidden rounded-(--radius-md)"
      >
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={w}
            role="columnheader"
            className={`bg-(--color-surface) py-1.5 text-center text-[11px] font-semibold tracking-[0.05em] ${
              i === 0
                ? 'text-(--color-accent)'
                : i === 6
                  ? 'text-(--color-info)'
                  : 'text-(--color-text-subtle)'
            }`}
          >
            {w}
          </div>
        ))}
        {cells.map((c) => {
          const isToday = c.date === today;
          const isSelected = c.date === selectedDate;
          const dayEvents = byDate.get(c.date) ?? [];
          const hasEvents = dayEvents.length > 0;
          const weekday = c.dateObj.getDay();
          return (
            <button
              type="button"
              key={c.date}
              role="gridcell"
              aria-selected={isSelected}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => onDayClick(c.date)}
              className={`relative flex h-16 flex-col items-start gap-1 bg-(--color-surface) p-1.5 text-left transition-colors hover:bg-(--color-surface-alt) ${
                !c.inMonth ? 'opacity-40' : ''
              } ${isSelected ? '!bg-(--color-accent-bg)' : ''}`}
            >
              <span
                className={`tabular text-[12px] font-medium ${
                  isToday
                    ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-(--color-accent) text-white'
                    : weekday === 0
                      ? 'text-(--color-accent)'
                      : weekday === 6
                        ? 'text-(--color-info)'
                        : 'text-(--color-text)'
                }`}
              >
                {c.dateObj.getDate()}
              </span>
              {hasEvents && (
                <div className="flex flex-wrap items-center gap-0.5">
                  {dayEvents.slice(0, 2).map((e) => (
                    <span
                      key={e.eventId}
                      aria-hidden
                      title={e.title}
                      className={`h-1.5 w-1.5 rounded-full ${
                        e.phase === 'ended'
                          ? 'bg-(--color-text-subtle)'
                          : e.phase === 'ongoing'
                            ? 'bg-(--color-accent)'
                            : 'bg-(--color-info)'
                      }`}
                    />
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="tabular text-[9px] font-semibold text-(--color-text-subtle)">
                      +{dayEvents.length - 2}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 범례 */}
      <footer className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-(--color-text-subtle)">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-(--color-info)" /> 예정
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-(--color-accent)" /> 진행중
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-(--color-text-subtle)" /> 종료
        </span>
      </footer>
    </section>
  );
}
