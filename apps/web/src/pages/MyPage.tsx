import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Header } from '../layout/Header';
import { Icon } from '../components/Icon';
import { PhaseBadge } from '../components/PhaseBadge';
import {
  MonthCalendar,
  type CalendarEvent,
} from '../components/calendar/MonthCalendar';
import { useCurrentUser } from '../lib/auth-context';
import {
  fetchMyBookmarks,
  fetchMyReviews,
  deleteMyReview,
  type BookmarkListItem,
  type MyReviewItem,
} from '../lib/api';

/**
 * MyPage — A_500 마이페이지.
 *
 * 탭: 캘린더(기본) / 내 북마크 / 내 리뷰.
 * 캘린더 = 스펙상 centerpiece — 월간 grid + 저장 이벤트 배지 + 날짜 선택 시
 * 우측/하단에 해당 날짜 이벤트 리스트 (상세/리뷰 CTA 포함).
 * 인증 필요 — 비로그인 상태면 로그인 유도 박스.
 */

type Tab = 'calendar' | 'bookmarks' | 'reviews';

export function MyPage() {
  const { user, loading: authLoading } = useCurrentUser();
  const [tab, setTab] = useState<Tab>('calendar');

  if (authLoading) return <PageShell>{null}</PageShell>;

  if (!user) {
    return (
      <PageShell>
        <section className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-10 text-center">
          <h1 className="m-0 mb-2 text-[20px] font-bold tracking-[-0.015em]">
            로그인이 필요해요
          </h1>
          <p className="m-0 mb-6 text-[14px] text-(--color-text-muted)">
            북마크와 리뷰는 로그인 후에 확인할 수 있어요.
          </p>
          <a
            href="/api/auth/google"
            className="inline-flex h-10 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-4 text-[14px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
          >
            Google 로그인 <Icon name="arrow" size={14} />
          </a>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <header className="mb-6">
        <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
          마이페이지
        </p>
        <h1 className="m-0 mt-1 text-[24px] font-bold tracking-[-0.015em]">
          <span className="text-(--color-accent)">•</span> {user.nickname} 님
        </h1>
      </header>

      <div
        role="tablist"
        aria-label="마이페이지 섹션"
        className="mb-4 flex border-b border-(--color-border)"
      >
        <TabBtn active={tab === 'calendar'} onClick={() => setTab('calendar')}>
          캘린더
        </TabBtn>
        <TabBtn active={tab === 'bookmarks'} onClick={() => setTab('bookmarks')}>
          내 북마크
        </TabBtn>
        <TabBtn active={tab === 'reviews'} onClick={() => setTab('reviews')}>
          내 리뷰
        </TabBtn>
      </div>

      {tab === 'calendar' && <CalendarTab />}
      {tab === 'bookmarks' && <BookmarksList />}
      {tab === 'reviews' && <ReviewsList />}
    </PageShell>
  );
}

// =============================================================
// Calendar Tab — A_500 월간 캘린더 + 선택 날짜 요약
// =============================================================

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function CalendarTab() {
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
      <aside className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
        <h3 className="m-0 mb-2 text-[14px] font-semibold">
          {selectedDate ? selectedDate : '날짜를 선택하세요'}
        </h3>
        {selectedEvents.length === 0 && selectedReviewed.length === 0 ? (
          <p className="m-0 text-[12px] text-(--color-text-subtle)">
            이 날에 걸린 북마크·리뷰 이벤트가 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {selectedEvents.map((b) => (
              <li key={b.bookmarkId}>
                <CalendarEventCard
                  eventId={b.event.eventId}
                  title={b.event.title}
                  phase={b.event.phase}
                  startDate={b.event.startDate}
                  endDate={b.event.endDate}
                />
              </li>
            ))}
            {selectedReviewed.map((r) => (
              <li key={r.reviewId}>
                <CalendarEventCard
                  eventId={r.event.eventId}
                  title={r.event.title}
                  phase="ended"
                  startDate={r.event.startDate}
                  endDate={r.event.endDate}
                  reviewedStars={r.rating}
                />
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function CalendarEventCard({
  eventId,
  title,
  phase,
  startDate,
  endDate,
  reviewedStars,
}: {
  eventId: string;
  title: string;
  phase: 'upcoming' | 'ongoing' | 'ended';
  startDate: string;
  endDate: string;
  reviewedStars?: number;
}) {
  const dateLabel = startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
  return (
    <Link
      to={`/events/${eventId}`}
      className="flex flex-col gap-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-2.5 transition-colors hover:border-(--color-border-hover) hover:bg-(--color-surface-alt)"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="m-0 line-clamp-2 text-[13px] font-medium leading-[1.35]">{title}</h4>
        <PhaseBadge phase={phase} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="tabular text-[11px] text-(--color-text-subtle)">{dateLabel}</span>
        {reviewedStars !== undefined ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-(--color-accent)">
            <Stars value={reviewedStars} /> 리뷰 완료
          </span>
        ) : phase === 'ended' ? (
          <span className="text-[11px] font-medium text-(--color-accent)">리뷰 작성 가능 →</span>
        ) : null}
      </div>
    </Link>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative -mb-px inline-flex h-10 items-center border-b-2 px-4 text-[14px] font-medium transition-colors ${
        active
          ? 'border-(--color-accent) text-(--color-accent)'
          : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'
      }`}
    >
      {children}
    </button>
  );
}

function BookmarksList() {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    items: BookmarkListItem[];
    total: number;
  }>({ loading: true, error: null, items: [], total: 0 });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ loading: true, error: null, items: [], total: 0 });
    fetchMyBookmarks({ limit: 50 }, ctrl.signal)
      .then((r) => setState({ loading: false, error: null, items: r.items, total: r.total }))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setState({ loading: false, error: (err as Error).message, items: [], total: 0 });
      });
    return () => ctrl.abort();
  }, []);

  if (state.loading) return <SkeletonList />;
  if (state.error) return <EmptyBox label="불러오지 못했어요" hint={state.error} />;
  if (state.items.length === 0)
    return <EmptyBox label="아직 북마크한 이벤트가 없어요" hint="지도에서 마음에 드는 이벤트를 북마크해 보세요." />;

  return (
    <div className="flex flex-col gap-2">
      <p className="tabular m-0 mb-1 text-[12px] text-(--color-text-subtle)">
        {state.total.toLocaleString()}개
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {state.items.map((b) => (
          <li key={b.bookmarkId}>
            <BookmarkCard item={b} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BookmarkCard({ item }: { item: BookmarkListItem }) {
  const ev = item.event;
  const date =
    ev.startDate === ev.endDate ? ev.startDate : `${ev.startDate} — ${ev.endDate}`;
  const region = ev.region.sigunguName
    ? `${ev.region.sidoName} ${ev.region.sigunguName}`
    : ev.region.sidoName;
  return (
    <Link
      to={`/events/${ev.eventId}`}
      className="flex gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-3 transition-colors hover:border-(--color-border-hover) hover:bg-(--color-surface-alt)"
    >
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-(--radius-md) bg-(--color-surface-warm)">
        {ev.posterImageUrl ? (
          <img
            src={ev.posterImageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="m-0 line-clamp-2 text-[15px] font-semibold leading-[1.3]">
            {ev.title}
          </h3>
          <PhaseBadge phase={ev.phase} />
        </div>
        <p className="m-0 text-[13px] text-(--color-text-muted)">{region}</p>
        <p className="tabular m-0 text-[12px] text-(--color-text-subtle)">{date}</p>
      </div>
    </Link>
  );
}

function ReviewsList() {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    items: MyReviewItem[];
    total: number;
  }>({ loading: true, error: null, items: [], total: 0 });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ loading: true, error: null, items: [], total: 0 });
    fetchMyReviews({ limit: 50 }, ctrl.signal)
      .then((r) => setState({ loading: false, error: null, items: r.items, total: r.total }))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setState({ loading: false, error: (err as Error).message, items: [], total: 0 });
      });
    return () => ctrl.abort();
  }, []);

  if (state.loading) return <SkeletonList />;
  if (state.error) return <EmptyBox label="불러오지 못했어요" hint={state.error} />;
  if (state.items.length === 0)
    return (
      <EmptyBox
        label="아직 작성한 리뷰가 없어요"
        hint="상세 페이지에서 별점과 짧은 후기를 남겨 보세요."
      />
    );

  const handleDelete = async (reviewId: string) => {
    if (!window.confirm('리뷰를 삭제할까요? 되돌릴 수 없어요.')) return;
    try {
      await deleteMyReview(reviewId);
      setState((prev) => ({
        ...prev,
        items: prev.items.filter((r) => r.reviewId !== reviewId),
        total: Math.max(0, prev.total - 1),
      }));
    } catch (err) {
      window.alert(`삭제 실패: ${(err as Error).message}`);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="tabular m-0 mb-1 text-[12px] text-(--color-text-subtle)">
        {state.total.toLocaleString()}개
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {state.items.map((r) => (
          <li key={r.reviewId}>
            <ReviewCard item={r} onDelete={() => void handleDelete(r.reviewId)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewCard({
  item,
  onDelete,
}: {
  item: MyReviewItem;
  onDelete: () => void;
}) {
  const ev = item.event;
  const date = item.createdAt.slice(0, 10);
  return (
    <article className="flex flex-col gap-2 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4 transition-colors hover:border-(--color-border-hover)">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/events/${ev.eventId}`}
          className="m-0 line-clamp-2 text-[15px] font-semibold leading-[1.3] text-(--color-text) hover:text-(--color-accent)"
        >
          {ev.title}
        </Link>
        <Stars value={item.rating} />
      </div>
      <p className="m-0 line-clamp-3 text-[13px] leading-[1.55] text-(--color-text)">
        {item.body}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="tabular text-[11px] text-(--color-text-subtle)">{date}</span>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-7 items-center rounded-(--radius-md) px-2 text-[12px] font-medium text-(--color-text-subtle) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-error)"
        >
          삭제
        </button>
      </div>
    </article>
  );
}

function Stars({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <span aria-label={`별점 ${clamped} / 5`} className="inline-flex shrink-0 items-center gap-0.5 text-(--color-accent)">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} aria-hidden className={i < clamped ? '' : 'text-(--color-border)'}>
          ★
        </span>
      ))}
    </span>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className="h-[90px] animate-pulse rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface-alt)"
        />
      ))}
    </div>
  );
}

function EmptyBox({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-10 text-center">
      <p className="m-0 mb-1 text-[15px] font-semibold text-(--color-text)">{label}</p>
      <p className="m-0 text-[13px] text-(--color-text-muted)">{hint}</p>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[880px] flex-col px-6 py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
