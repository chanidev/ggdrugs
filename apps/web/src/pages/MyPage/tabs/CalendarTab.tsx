import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  MonthCalendar,
  type CalendarEvent,
} from '../../../components/calendar/MonthCalendar';
import {
  fetchMyBookmarks,
  fetchMyReviews,
  fetchMyAppointments,
  type BookmarkListItem,
  type MyReviewItem,
  type MyAppointmentItem,
} from '../../../lib/api';
import { CalendarSummaryCard } from '../parts/CalendarSummaryCard.js';
import { EmptyBox } from '../parts/EmptyBox.js';

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const APPT_PREFIX = 'appt:';

export function CalendarTab() {
  const now = useMemo(() => new Date(), []);
  const navigate = useNavigate();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(ymd(now));

  const [bookmarks, setBookmarks] = useState<BookmarkListItem[]>([]);
  const [reviews, setReviews] = useState<MyReviewItem[]>([]);
  const [appointments, setAppointments] = useState<MyAppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    Promise.all([
      fetchMyBookmarks({ limit: 200 }, ctrl.signal),
      fetchMyReviews({ limit: 200 }, ctrl.signal),
      fetchMyAppointments({}, ctrl.signal),
    ])
      .then(([b, r, a]) => {
        setBookmarks(b.items);
        setReviews(r.items);
        setAppointments(a.items);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown error');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  // 북마크 + 리뷰 + confirmed 약속 단일 CalendarEvent[] 병합
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    const map = new Map<string, CalendarEvent>();

    // 북마크
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

    // 리뷰
    for (const r of reviews) {
      const e = r.event;
      if (!map.has(e.eventId)) {
        map.set(e.eventId, {
          eventId: e.eventId,
          title: e.title,
          startDate: e.startDate,
          endDate: e.endDate,
          phase: 'ended',
        });
      }
    }

    // 약속 — appointedAt 날짜를 단일 날짜 이벤트로 매핑
    // 'appt:' 접두사 → MonthCalendar 셀에서 별도 도트로 구분 가능
    for (const a of appointments) {
      if (!a.appointedAt) continue;
      const dateStr = a.appointedAt.slice(0, 10);
      const apptEventId = `${APPT_PREFIX}${a.appointmentId}`;
      const isPast = dateStr < ymd(now);
      map.set(apptEventId, {
        eventId: apptEventId,
        title: a.eventName ?? a.event?.title ?? '약속',
        startDate: dateStr,
        endDate: dateStr,
        phase: isPast ? 'ended' : 'upcoming',
      });
    }

    return [...map.values()];
  }, [bookmarks, reviews, appointments, now]);

  // 선택 날짜 북마크
  const selectedBookmarks = useMemo(() => {
    if (!selectedDate) return [];
    return bookmarks.filter((b) => {
      const e = b.event;
      return e.startDate <= selectedDate && selectedDate <= e.endDate;
    });
  }, [bookmarks, selectedDate]);

  // 선택 날짜 리뷰 (북마크와 중복 제외)
  const selectedReviewed = useMemo(() => {
    if (!selectedDate) return [];
    return reviews.filter((r) => {
      const e = r.event;
      return (
        e.startDate <= selectedDate &&
        selectedDate <= e.endDate &&
        !selectedBookmarks.some((b) => b.event.eventId === e.eventId)
      );
    });
  }, [reviews, selectedDate, selectedBookmarks]);

  // 선택 날짜 약속
  const selectedAppointments = useMemo(() => {
    if (!selectedDate) return [];
    return appointments.filter((a) => a.appointedAt?.slice(0, 10) === selectedDate);
  }, [appointments, selectedDate]);

  if (loading) {
    return (
      <div
        aria-hidden
        className="h-[480px] animate-pulse rounded-(--radius-lg) bg-(--color-surface-alt)"
      />
    );
  }
  if (error) return <EmptyBox label="불러오지 못했어요" hint={error} />;

  const hasAnything =
    selectedBookmarks.length > 0 ||
    selectedReviewed.length > 0 ||
    selectedAppointments.length > 0;

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

        {!hasAnything ? (
          <p className="m-0 rounded-(--radius-md) bg-(--color-surface-alt) p-4 text-center text-[12px] text-(--color-text-subtle)">
            이 날에 걸린 북마크·약속·리뷰 이벤트가 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {/* 북마크 이벤트 */}
            {selectedBookmarks.map((b) => {
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

            {/* 리뷰만 있는 이벤트 */}
            {selectedReviewed.map((r) => (
              <li key={r.reviewId}>
                <CalendarSummaryCard
                  event={r.event}
                  phase="ended"
                  reviewedRating={r.rating}
                />
              </li>
            ))}

            {/* confirmed 약속 카드 — GG-MY-002 / GG-ROOM-020 */}
            {selectedAppointments.map((a) => (
              <li key={a.appointmentId}>
                <AppointmentCard
                  appointment={a}
                  onGoToRoom={() => void navigate(`/chat/rooms/${a.chatRoomId}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

// ─── 약속 카드 (emerald 소스 구분, GG-MY-002 6항목) ─────────

function AppointmentCard({
  appointment: a,
  onGoToRoom,
}: {
  appointment: MyAppointmentItem;
  onGoToRoom: () => void;
}) {
  const dateLabel = a.appointedAt
    ? a.appointedAt.slice(0, 16).replace('T', ' ')
    : '일시 미정';
  const hasEvent = a.event != null;

  return (
    <article className="flex flex-col gap-2 rounded-(--radius-lg) border border-emerald-200 bg-emerald-50/50 p-4 transition-colors hover:border-emerald-300">
      <header className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-(--radius-sm) bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
          약속 · confirmed
        </span>
      </header>

      {/* 이벤트명 */}
      <h4 className="m-0 text-[14px] font-semibold leading-[1.4] text-(--color-text)">
        {a.eventName ?? a.event?.title ?? '약속'}
      </h4>

      {/* 약속 일시 */}
      <p className="tabular m-0 text-[12px] text-(--color-text-muted)">약속 일시: {dateLabel}</p>

      {/* 이벤트 기간·장소·가격·운영시간·대상 — GG-MY-002 요약 항목 */}
      {hasEvent && (
        <div className="flex flex-col gap-0.5">
          <p className="m-0 text-[11px] text-(--color-text-subtle)">
            기간: {a.event!.startDate} ~ {a.event!.endDate}
          </p>
          {a.event!.region && (
            <p className="m-0 text-[11px] text-(--color-text-subtle)">
              장소: {a.event!.region}
            </p>
          )}
          {a.event!.price != null && (
            <p className="m-0 text-[11px] text-(--color-text-subtle)">
              가격: {a.event!.price === '0' || a.event!.price === '' ? '무료' : a.event!.price}
            </p>
          )}
          {a.event!.operatingHours && (
            <p className="m-0 text-[11px] text-(--color-text-subtle)">
              운영시간: {a.event!.operatingHours}
            </p>
          )}
          {a.event!.targetAudience && (
            <p className="m-0 text-[11px] text-(--color-text-subtle)">
              대상: {a.event!.targetAudience}
            </p>
          )}
        </div>
      )}
      {!hasEvent && (
        <p className="m-0 text-[11px] text-(--color-text-subtle)">
          기간·장소·가격: 이벤트 연결 없음
        </p>
      )}

      {/* CTA 버튼 영역 */}
      <div className="mt-1 flex flex-wrap gap-2">
        {/* GG-ROOM-020: 채팅방으로 */}
        <button
          type="button"
          onClick={onGoToRoom}
          className="inline-flex h-7 items-center justify-center rounded-(--radius-md) border border-emerald-300 bg-white px-3 text-[12px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
        >
          채팅방으로
        </button>
        {/* GG-MY-002: 이벤트 상세 이동 (event 있을 때만) */}
        {hasEvent && (
          <Link
            to={`/events/${a.event!.eventId}`}
            className="inline-flex h-7 items-center justify-center rounded-(--radius-md) border border-(--color-border) bg-white px-3 text-[12px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-border-hover) hover:text-(--color-text)"
          >
            이벤트 상세
          </Link>
        )}
      </div>
    </article>
  );
}
