import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
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
  fetchMySubscriptions,
  fetchMyUploader,
  setActiveRole,
  toggleSubscription,
  deleteSubscription,
  deleteMyReview,
  type BookmarkListItem,
  type MyReviewItem,
  type MySubscription,
  type MyUploaderProfile,
} from '../lib/api';

/**
 * MyPage — A_500 마이페이지.
 *
 * 탭: 캘린더(기본) / 내 북마크 / 내 리뷰.
 * 캘린더 = 스펙상 centerpiece — 월간 grid + 저장 이벤트 배지 + 날짜 선택 시
 * 우측/하단에 해당 날짜 이벤트 리스트 (상세/리뷰 CTA 포함).
 * 인증 필요 — 비로그인 상태면 로그인 유도 박스.
 */

type Tab = 'calendar' | 'bookmarks' | 'reviews' | 'subscriptions';

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
      {/* GG-ROLE-001: 마이페이지 우측 상단 역할 전환 버튼 상시 노출. */}
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
            마이페이지
          </p>
          <h1 className="m-0 mt-1 text-[24px] font-bold tracking-[-0.015em]">
            <span className="text-(--color-accent)">•</span> {user.nickname} 님
          </h1>
        </div>
        <RoleToggleButton />
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
        <TabBtn active={tab === 'subscriptions'} onClick={() => setTab('subscriptions')}>
          구독
        </TabBtn>
      </div>

      {tab === 'calendar' && <CalendarTab />}
      {tab === 'bookmarks' && <BookmarksList />}
      {tab === 'reviews' && <ReviewsList />}
      {tab === 'subscriptions' && <SubscriptionsList />}

      <SessionFooter />
    </PageShell>
  );
}

/**
 * GG-ROLE-001 우측 상단 역할 전환 버튼.
 *
 * 4 상태 (uploader_profile + active_role 조합):
 *   1. uploader_profile null              → "업로더 신청"      → /uploader (ApplyForm 노출)
 *   2. status='pending'                   → "심사 중"           → /uploader (콘솔에서 진행 확인)
 *   3. status∈{revision_requested,rejected} → "보완하여 재신청" → /uploader (ApplyForm 재진입)
 *   4. status='approved' + activeRole='user'      → "업로더로 전환"     → setActiveRole('uploader') + /uploader
 *   5. status='approved' + activeRole='uploader'  → "사용자로 돌아가기" → setActiveRole('user') + 머무름
 *
 * 비로그인 호출 케이스는 부모 (MyPage) 에서 이미 user 검사 후 진입하므로 처리 안 함.
 */
function RoleToggleButton() {
  const { user, refresh } = useCurrentUser();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MyUploaderProfile | null | 'loading'>(
    'loading',
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMyUploader()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (profile === 'loading' || !user) {
    return (
      <span
        aria-hidden
        className="inline-block h-9 w-32 animate-pulse rounded-(--radius-md) bg-(--color-surface-alt)"
      />
    );
  }

  // 1. 미신청
  if (!profile) {
    return (
      <Link
        to="/uploader"
        className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-accent)/40 bg-(--color-accent)/5 px-3 text-[13px] font-medium text-(--color-accent) hover:bg-(--color-accent)/10"
      >
        업로더 신청 <Icon name="arrow" size={12} />
      </Link>
    );
  }

  // 2. 심사 중
  if (profile.approvalStatus === 'pending') {
    return (
      <Link
        to="/uploader"
        className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-3 text-[13px] font-medium text-(--color-text-muted) hover:border-(--color-border-hover)"
        title="관리자 심사 진행 중 — 콘솔에서 상세 확인"
      >
        업로더 심사 중
      </Link>
    );
  }

  // 3. 보완 / 반려 — rejected 는 7일 쿨다운 (BFF computeReapplyGate 가 결정).
  if (
    profile.approvalStatus === 'revision_requested' ||
    profile.approvalStatus === 'rejected'
  ) {
    const isRejected = profile.approvalStatus === 'rejected';
    const label = isRejected ? '반려' : '보완 요청';

    // 쿨다운 active — disabled 버튼 + 카운트다운.
    if (isRejected && !profile.canReapply && profile.canReapplyAt) {
      const ms = new Date(profile.canReapplyAt).getTime() - Date.now();
      const days = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
      return (
        <span
          aria-disabled="true"
          className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-3 text-[13px] font-medium text-(--color-text-subtle)"
          title={`${profile.canReapplyAt.slice(0, 10)} 이후 재신청 가능 (rejected 7일 쿨다운)`}
        >
          반려 · {days}일 후 재신청
        </span>
      );
    }

    return (
      <Link
        to="/uploader"
        className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-warning)/40 bg-(--color-warning)/5 px-3 text-[13px] font-medium text-(--color-warning) hover:bg-(--color-warning)/10"
        title={`${label}됨 — 보완하여 재신청`}
      >
        {label} · 재신청
      </Link>
    );
  }

  // 4 / 5. approved → 토글
  const isUploaderMode = user.activeRole === 'uploader';
  const onToggle = async () => {
    setPending(true);
    try {
      await setActiveRole(isUploaderMode ? 'user' : 'uploader');
      await refresh();
      if (!isUploaderMode) navigate('/uploader');
    } catch (e) {
      window.alert(`전환 실패: ${(e as Error).message}`);
    } finally {
      setPending(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void onToggle()}
      disabled={pending}
      className={
        isUploaderMode
          ? 'inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium text-(--color-text-muted) hover:border-(--color-border-hover) hover:text-(--color-text) disabled:opacity-40'
          : 'inline-flex h-9 items-center rounded-(--radius-md) bg-(--color-accent) px-4 text-[13px] font-medium text-white hover:bg-(--color-accent-hover) disabled:opacity-40'
      }
    >
      {pending
        ? '전환 중…'
        : isUploaderMode
          ? '사용자로 돌아가기'
          : '업로더로 전환'}
    </button>
  );
}

/**
 * ADR 0004 D-3 — 세션 관리. 로그아웃 두 옵션 노출.
 * 단일 디바이스 로그아웃 (기존 동작) + 모든 디바이스 로그아웃 (전체 세션 폐기).
 * 보안 사고 의심 시 후자 사용 — admin revoke (D-6) 와 별개로 본인이 직접 cleanup.
 */
function SessionFooter() {
  const { logout, logoutAll } = useCurrentUser();
  const [pending, setPending] = useState<'one' | 'all' | null>(null);

  const onLogout = async () => {
    setPending('one');
    try {
      await logout();
      window.location.href = '/';
    } catch (e) {
      window.alert(`로그아웃 실패: ${(e as Error).message}`);
      setPending(null);
    }
  };

  const onLogoutAll = async () => {
    if (
      !window.confirm(
        '모든 디바이스에서 로그아웃할까요? 다른 기기·브라우저의 세션도 모두 끊겨요.',
      )
    )
      return;
    setPending('all');
    try {
      const r = await logoutAll();
      window.alert(`${r.deleted}개 세션을 끊었어요.`);
      window.location.href = '/';
    } catch (e) {
      window.alert(`로그아웃 실패: ${(e as Error).message}`);
      setPending(null);
    }
  };

  return (
    <section className="mt-10 border-t border-(--color-border) pt-6">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
        세션 관리
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onLogout()}
          disabled={pending !== null}
          className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-border-hover) hover:text-(--color-text) disabled:opacity-40"
        >
          {pending === 'one' ? '로그아웃 중…' : '이 디바이스 로그아웃'}
        </button>
        <button
          type="button"
          onClick={() => void onLogoutAll()}
          disabled={pending !== null}
          className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-error) hover:text-(--color-error) disabled:opacity-40"
        >
          {pending === 'all' ? '전체 로그아웃 중…' : '모든 디바이스 로그아웃'}
        </button>
      </div>
      <p className="m-0 mt-2 text-[11.5px] text-(--color-text-subtle)">
        분실·탈취가 의심되면 모든 디바이스 로그아웃을 사용하세요.
      </p>
    </section>
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

type SummaryEvent = {
  eventId: string;
  title: string;
  startDate: string;
  endDate: string;
  addressDetail: string | null;
  admissionFee: string | null;
  targetAudience: string | null;
  aiSummary: string | null;
  articleCount: number;
  region: { sidoName: string; sigunguName: string | null; fullAddress: string };
};

/**
 * A_500 캘린더 이벤트 요약 카드.
 *
 * 요구사항정의서 v5.0 A_500 §4 스펙:
 *   이벤트명 · 장소 · 기간 · 가격 · 대상 · 요약(aiSummary)
 *   + '상세 보기' (A_400) / '리뷰 작성·수정' (A_501) CTA
 *
 * 리뷰 CTA 활성 조건 (GG-REVIEW-001):
 *   phase === 'ended' 일 때만 활성. 내가 이미 리뷰 작성했으면 '수정'.
 *
 * 관련 기사 수는 스펙엔 없지만 UX 힌트로 작은 배지. articleCount > 0 일 때만.
 */
function CalendarSummaryCard({
  event,
  phase,
  reviewedRating,
}: {
  event: SummaryEvent;
  phase: 'upcoming' | 'ongoing' | 'ended';
  reviewedRating?: number;
}) {
  const dateLabel = event.startDate === event.endDate ? event.startDate : `${event.startDate} ~ ${event.endDate}`;
  const place =
    event.addressDetail ??
    (event.region.sigunguName
      ? `${event.region.sidoName} ${event.region.sigunguName}`
      : event.region.fullAddress);

  const canReview = phase === 'ended';
  const reviewLabel = reviewedRating !== undefined ? '리뷰 수정' : '리뷰 작성';
  const reviewHref = `/events/${event.eventId}#review`;

  return (
    <article className="flex flex-col gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4 transition-colors hover:border-(--color-border-hover)">
      <header className="flex flex-wrap items-center gap-1.5">
        <PhaseBadge phase={phase} />
        {reviewedRating !== undefined && (
          <span className="inline-flex items-center gap-1 rounded-(--radius-sm) bg-(--color-accent-bg) px-1.5 py-0.5 text-[10px] font-medium text-(--color-accent)">
            <Stars value={reviewedRating} />
          </span>
        )}
        {event.articleCount > 0 && (
          <span
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-(--color-surface-alt) px-2 py-0.5 text-[10px] font-medium text-(--color-text-muted)"
            title={`관련 기사 ${event.articleCount}건 — 상세에서 전체 보기`}
          >
            <span className="tabular text-(--color-text)">{event.articleCount}</span>
            <span>관련 기사</span>
          </span>
        )}
      </header>

      <h4 className="m-0 text-[15px] font-semibold leading-[1.4] tracking-[-0.01em] text-(--color-text)">
        {event.title}
      </h4>

      <dl className="grid grid-cols-[44px_1fr] gap-x-3 gap-y-1 text-[12.5px]">
        <dt className="text-(--color-text-subtle)">장소</dt>
        <dd className="m-0 truncate text-(--color-text-muted)">{place}</dd>
        <dt className="text-(--color-text-subtle)">기간</dt>
        <dd className="tabular m-0 text-(--color-text-muted)">{dateLabel}</dd>
        {event.admissionFee && (
          <>
            <dt className="text-(--color-text-subtle)">가격</dt>
            <dd className="m-0 text-(--color-text-muted)">{event.admissionFee}</dd>
          </>
        )}
        {event.targetAudience && (
          <>
            <dt className="text-(--color-text-subtle)">대상</dt>
            <dd className="m-0 text-(--color-text-muted)">{event.targetAudience}</dd>
          </>
        )}
      </dl>

      {event.aiSummary && (
        <p className="m-0 line-clamp-3 rounded-(--radius-md) bg-(--color-surface-alt) p-2.5 text-[12px] leading-[1.55] text-(--color-text-muted)">
          {event.aiSummary}
        </p>
      )}

      <footer className="flex gap-1.5">
        <Link
          to={`/events/${event.eventId}`}
          className="inline-flex h-8 flex-1 items-center justify-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) text-[12px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-border-hover) hover:text-(--color-text)"
        >
          상세 보기
        </Link>
        {canReview ? (
          <Link
            to={reviewHref}
            className="inline-flex h-8 flex-1 items-center justify-center rounded-(--radius-md) bg-(--color-accent) text-[12px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
          >
            {reviewLabel}
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex h-8 flex-1 cursor-not-allowed items-center justify-center rounded-(--radius-md) border border-dashed border-(--color-border) text-[11.5px] text-(--color-text-subtle)"
            title="이벤트 종료일 이후에 작성 가능 (GG-REVIEW-001)"
          >
            {phase === 'upcoming' ? '리뷰는 종료 후' : '종료 후 작성'}
          </span>
        )}
      </footer>
    </article>
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

// =============================================================
// Subscriptions Tab — A_203 조건 기반 알림 구독 관리
// =============================================================

const COMPANION_LABELS: Record<string, string> = {
  solo: '혼자',
  couple: '연인',
  friend: '친구',
  family: '가족',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  festival: '축제',
  expo: '박람회',
  symposium: '심포지움',
  conference: '컨퍼런스',
  exhibition: '전시',
  performance: '공연',
  education: '교육',
  movie: '영화',
};

function summarizeSubscription(s: MySubscription): string {
  const parts: string[] = [];
  if (s.regionIds.length > 0) parts.push(`지역 ${s.regionIds.length}개`);
  if (s.companions.length > 0) {
    parts.push(s.companions.map((c) => COMPANION_LABELS[c] ?? c).join('·'));
  }
  if (s.eventTypes.length > 0) {
    parts.push(s.eventTypes.map((t) => EVENT_TYPE_LABELS[t] ?? t).join('·'));
  }
  if (s.vibeIds.length > 0) parts.push(`성향 ${s.vibeIds.length}개`);
  if (s.periodMonths != null) parts.push(`${s.periodMonths}개월 이내`);
  return parts.length > 0 ? parts.join(' · ') : '모든 조건 (매우 광범위)';
}

function SubscriptionsList() {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    items: MySubscription[];
  }>({ loading: true, error: null, items: [] });
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ loading: true, error: null, items: [] });
    fetchMySubscriptions(ctrl.signal)
      .then((items) => setState({ loading: false, error: null, items }))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setState({ loading: false, error: (err as Error).message, items: [] });
      });
    return () => ctrl.abort();
  }, []);

  const onToggle = async (s: MySubscription) => {
    setPendingId(s.subscriptionId);
    try {
      const next = await toggleSubscription(s.subscriptionId, !s.isActive);
      setState((prev) => ({
        ...prev,
        items: prev.items.map((x) => (x.subscriptionId === s.subscriptionId ? next : x)),
      }));
    } catch (e) {
      window.alert(`변경 실패: ${(e as Error).message}`);
    } finally {
      setPendingId(null);
    }
  };

  const onDelete = async (s: MySubscription) => {
    if (!window.confirm('이 구독을 삭제할까요?')) return;
    setPendingId(s.subscriptionId);
    try {
      await deleteSubscription(s.subscriptionId);
      setState((prev) => ({
        ...prev,
        items: prev.items.filter((x) => x.subscriptionId !== s.subscriptionId),
      }));
    } catch (e) {
      window.alert(`삭제 실패: ${(e as Error).message}`);
    } finally {
      setPendingId(null);
    }
  };

  if (state.loading) return <SkeletonList />;
  if (state.error) return <EmptyBox label="불러오지 못했어요" hint={state.error} />;
  if (state.items.length === 0) {
    return (
      <EmptyBox
        label="구독한 조건이 없어요"
        hint="필터 검색 패널의 '이 조건 구독' 버튼으로 만들 수 있어요."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="tabular m-0 mb-1 text-[12px] text-(--color-text-subtle)">
        {state.items.length}개 구독. 새 이벤트가 조건에 맞으면 알림으로 받아요.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {state.items.map((s) => (
          <li key={s.subscriptionId}>
            <article
              className={`flex flex-col gap-2 rounded-(--radius-lg) border bg-(--color-surface) p-4 transition-colors ${
                s.isActive ? 'border-(--color-border)' : 'border-(--color-border) opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-(--radius-sm) px-2 py-[2px] text-[11px] font-semibold ${
                        s.isActive
                          ? 'bg-(--color-success)/10 text-(--color-success)'
                          : 'bg-(--color-surface-alt) text-(--color-text-subtle)'
                      }`}
                    >
                      {s.isActive ? '활성' : '정지'}
                    </span>
                    <span className="tabular text-[11px] text-(--color-text-subtle)">
                      등록 {s.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  <p className="m-0 mt-1 text-[14px] text-(--color-text)">
                    {summarizeSubscription(s)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => void onToggle(s)}
                    disabled={pendingId === s.subscriptionId}
                    className="inline-flex h-7 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2 text-[12px] font-medium text-(--color-text-muted) hover:border-(--color-border-hover) hover:text-(--color-text) disabled:opacity-40"
                  >
                    {s.isActive ? '정지' : '재개'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(s)}
                    disabled={pendingId === s.subscriptionId}
                    className="inline-flex h-7 items-center rounded-(--radius-md) px-2 text-[12px] font-medium text-(--color-text-subtle) hover:bg-(--color-surface-alt) hover:text-(--color-error) disabled:opacity-40"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
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
