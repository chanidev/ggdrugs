import { useEffect, useMemo, useState } from 'react';
import {
  MonthCalendar,
  type CalendarEvent,
} from '../../../components/calendar/MonthCalendar';
import {
  fetchMyBookmarks,
  fetchMyReviews,
  type BookmarkListItem,
  type MyReviewItem,
} from '../../../lib/api';
import { CalendarSummaryCard } from '../parts/CalendarSummaryCard.js';
import { EmptyBox } from '../parts/EmptyBox.js';

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function CalendarTab() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(ymd(now));

  const [bookmarks, setBookmarks] = useState<BookmarkListItem[]>([]);
  const [reviews, setReviews] = useState<MyReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    Promise.all([
      fetchMyBookmarks({ limit: 200 }, ctrl.signal),
      fetchMyReviews({ limit: 200 }, ctrl.signal),
    ])
      .then(([b, r]) => {
        setBookmarks(b.items);
        setReviews(r.items);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown error');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  // 북마크 이벤트 + 리뷰한 이벤트 병합 (중복 제거).
  // 리뷰한 이벤트는 원래 참석했다는 뜻이므로 캘린더에 함께 표시 — 회고 맥락.
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    const map = new Map<string, CalendarEvent>();
    for (const b of bookmarks) {
      const e = b.event;
      map.set(e.eventId, {
        eventId: e.eventId,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        phase: e.phase,
      });
    }
    for (const r of reviews) {
      const e = r.event;
      if (!map.has(e.eventId)) {
        map.set(e.eventId, {
          eventId: e.eventId,
          title: e.title,
          startDate: e.startDate,
          endDate: e.endDate,
          phase: 'ended', // 리뷰가 있으면 종료 이벤트
        });
      }
    }
    return [...map.values()];
  }, [bookmarks, reviews]);

  // 선택된 날짜에 걸린 이벤트 (북마크 기준으로만 — 상세 정보가 풍부).
  const selectedEvents = useMemo(() => {
    if (!selectedDate) return [];
    return bookmarks.filter((b) => {
      const e = b.event;
      return e.startDate <= selectedDate && selectedDate <= e.endDate;
    });
  }, [bookmarks, selectedDate]);

  // 선택된 날짜에 내가 리뷰한 이벤트도 함께 (종료 이벤트).
  const selectedReviewed = useMemo(() => {
    if (!selectedDate) return [];
    return reviews.filter((r) => {
      const e = r.event;
      return e.startDate <= selectedDate && selectedDate <= e.endDate;
    });
  }, [reviews, selectedDate]);

  if (loading) {
    return (
      <div aria-hidden className="h-[480px] animate-pulse rounded-(--radius-lg) bg-(--color-surface-alt)" />
    );
  }
  if (error) return <EmptyBox label="불러오지 못했어요" hint={error} />;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <MonthCalendar
        year={year}
        month0={month0}
        events={calendarEvents}
        selectedDate={selectedDate}
        onMonthChange={(y, m) => {
          setYear(y);
          setMonth0(m);
        }}
        onDayClick={(d) => setSelectedDate(d)}
      />
      <aside className="flex flex-col gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-5">
        <header>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
            A_500 · 캘린더 요약
          </p>
          <h3 className="tabular m-0 mt-0.5 text-[15px] font-bold tracking-[-0.01em]">
            {selectedDate ?? '날짜를 선택하세요'}
          </h3>
        </header>
        {selectedEvents.length === 0 && selectedReviewed.length === 0 ? (
          <p className="m-0 rounded-(--radius-md) bg-(--color-surface-alt) p-4 text-center text-[12px] text-(--color-text-subtle)">
            이 날에 걸린 북마크·리뷰 이벤트가 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {selectedEvents.map((b) => {
              const reviewOfThis = reviews.find((r) => r.event.eventId === b.event.eventId);
              return (
                <li key={b.bookmarkId}>
                  <CalendarSummaryCard
                    event={b.event}
                    phase={b.event.phase}
                    {...(reviewOfThis ? { reviewedRating: reviewOfThis.rating } : {})}
                  />
                </li>
              );
            })}
            {selectedReviewed
              .filter((r) => !selectedEvents.some((b) => b.event.eventId === r.event.eventId))
              .map((r) => (
                <li key={r.reviewId}>
                  <CalendarSummaryCard
                    event={r.event}
                    phase="ended"
                    reviewedRating={r.rating}
                  />
                </li>
              ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
