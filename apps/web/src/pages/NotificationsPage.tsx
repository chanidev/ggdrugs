import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Header } from '../layout/Header';
import { Icon } from '../components/Icon';
import { useCurrentUser } from '../lib/auth-context';
import {
  fetchMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  respondMatchRequest,
  type MyNotification,
} from '../lib/api';
import { loginUrl } from '../lib/auth-redirect';

/**
 * /notifications — A_806 알림 페이지 (Slice 6).
 *
 * GG-NOTI-001: 알림 목록 표시
 * GG-NOTI-002~006: 유형별 뱃지 표시 (match_request/group_invite/appointment/appointment_update/mate_eval/chat_message)
 * GG-NOTI-007: 클릭 → 연결 화면 이동 (relatedEntityType 기반 분기)
 * GG-NOTI-008/009: match_request 수락/거절 인라인 (relatedEntityType==='match_request'만)
 * GG-NOTI-010/011: group_invite 수락/거절 인라인 (relatedEntityType==='match_request'만)
 * GG-NOTI-012: appointment 알림 → /chat/rooms/:relatedChatRoomId
 * GG-NOTI-013: mate_eval → /evaluate/:appointmentId
 * GG-NOTI-014: appointment_update → /me?tab=calendar
 *
 * 중요: 인라인 수락/거절은 relatedEntityType==='match_request'인 경우에만 표시.
 * match_request/group_invite '수락됨' 후속 알림은 relatedEntityType='chat_room'이므로
 * 버튼이 표시되지 않고 채팅방으로 이동한다.
 */

type Filter = 'all' | 'unread';

// ─── 유형별 메타 ────────────────────────────────────────────
const NOTIF_TYPE_META: Record<
  string,
  { label: string; badgeCls: string }
> = {
  match_request: {
    label: '메이트신청',
    badgeCls: 'bg-(--color-accent)/10 text-(--color-accent)',
  },
  group_invite: {
    label: '그룹초대',
    badgeCls: 'bg-(--color-info)/10 text-(--color-info)',
  },
  appointment: {
    label: '약속',
    badgeCls: 'bg-emerald-50 text-emerald-700',
  },
  appointment_update: {
    label: '약속만료',
    badgeCls: 'bg-amber-50 text-amber-700',
  },
  mate_eval: {
    label: '평가요청',
    badgeCls: 'bg-amber-50 text-amber-700',
  },
  kick_vote: {
    label: '퇴출투표',
    badgeCls: 'bg-(--color-error)/10 text-(--color-error)',
  },
  chat_message: {
    label: '메시지',
    badgeCls: 'bg-(--color-surface-alt) text-(--color-text-muted)',
  },
  vacancy_notification: {
    label: '공석',
    badgeCls: 'bg-(--color-surface-alt) text-(--color-text-muted)',
  },
};

function typeMeta(t: string | null) {
  if (!t) return null;
  return NOTIF_TYPE_META[t] ?? null;
}

// ─── 라우팅 헬퍼 — relatedEntityType 우선 분기 ─────────────
// GG-NOTI-007/012/013/014 실제 라우트만 사용
function resolveHref(n: MyNotification): string | null {
  const { notificationType: nt, relatedEntityType: ret, relatedEntityId: rid, relatedChatRoomId: rcrid } = n;

  // chat_room 타입: match_request 수락됨, group_invite 수락됨, chat_message,
  // 그리고 vacancy_notification(BFF에서 relatedEntityType='chat_room'으로 생성됨)까지
  // 이 분기에서 모두 처리된다. 플랜 표의 "이벤트 폴백" 설명은 구 설계 기준이며,
  // 실제 BFF(chat-room.ts:983)가 vacancy_notification의 relatedEntityType을 'chat_room'으로
  // 설정하므로 채팅방 이동이 올바른 동작이다.
  if (ret === 'chat_room') {
    return rid ? `/chat/rooms/${rid}` : null;
  }

  // match_request 타입: 인라인 수락/거절로 처리 — 별도 이동 없음
  if (ret === 'match_request') {
    return null;
  }

  // appointment 타입: notificationType으로 세분화
  if (ret === 'appointment') {
    if (nt === 'mate_eval') {
      // GG-NOTI-013: 평가화면 이동 — relatedEntityId가 appointmentId
      return rid ? `/evaluate/${rid}` : null;
    }
    if (nt === 'appointment_update') {
      // GG-NOTI-014: 약속만료 → 캘린더
      return '/me?tab=calendar';
    }
    // GG-NOTI-012: 약속 제안/확정 → 해당 채팅방 (BFF 조인값 사용)
    return rcrid ? `/chat/rooms/${rcrid}` : null;
  }

  // kick_vote: 별도 이동 없음 (읽음 처리만)
  if (ret === 'kick_vote') {
    return null;
  }

  // notificationType 없는 일반 이벤트 알림 폴백
  if (!nt) {
    return n.eventAvailable && n.eventId ? `/events/${n.eventId}` : null;
  }

  return null;
}

// 인라인 수락/거절: relatedEntityType==='match_request'인 경우에만
// (match_request 신청됨 + group_invite 초대됨 모두 해당)
function hasInlineAction(n: MyNotification): boolean {
  return n.relatedEntityType === 'match_request';
}

export function NotificationsPage() {
  const { user, loading: authLoading } = useCurrentUser();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<MyNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markAllBusy, setMarkAllBusy] = useState(false);
  // 수락/거절 진행 중인 notificationId set
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchMyNotifications({ limit: 50, unreadOnly: filter === 'unread' }, ctrl.signal)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [filter]);

  useEffect(() => {
    if (authLoading || !user) return;
    return reload();
  }, [authLoading, user, reload]);

  // 읽음 처리만 수행 (navigate 없음) — Link의 네이티브 to 이동과 중복되지 않도록 분리.
  // notificationType 없는 이벤트 폴백 Link의 onClick에서 이 함수만 호출한다.
  const markReadOnly = async (n: MyNotification) => {
    if (!n.readAt) {
      setItems((prev) =>
        prev.map((x) =>
          x.notificationId === n.notificationId ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      );
      try { await markNotificationRead(n.notificationId); } catch { /* silent */ }
    }
  };

  // 읽음 처리 + 이동 — resolveHref 결과가 있을 때 navigate 호출.
  // notificationType이 있는 알림의 버튼(button 요소) onClick에서만 사용한다.
  const onItemClick = async (n: MyNotification) => {
    if (!n.readAt) {
      setItems((prev) =>
        prev.map((x) =>
          x.notificationId === n.notificationId ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      );
      try { await markNotificationRead(n.notificationId); } catch { /* silent */ }
    }
    const href = resolveHref(n);
    if (href) void navigate(href);
  };

  const onMarkAll = async () => {
    setMarkAllBusy(true);
    try {
      await markAllNotificationsRead();
      // reload()는 AbortController cleanup을 반환한다.
      // 여기서는 effect 구독이 아닌 수동 호출이므로 cleanup을 void로 명시해 혼용을 방지한다.
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'mark-all failed');
    } finally {
      setMarkAllBusy(false);
    }
  };

  // 인라인 수락/거절 — relatedEntityType==='match_request'인 알림에만 호출
  // relatedEntityId는 matchRequestId
  const onRespond = async (
    n: MyNotification,
    action: 'accept' | 'reject',
  ) => {
    if (!n.relatedEntityId || n.relatedEntityType !== 'match_request') return;
    setRespondingIds((s) => new Set(s).add(n.notificationId));
    try {
      await respondMatchRequest(n.relatedEntityId, action);
      try { await markNotificationRead(n.notificationId); } catch { /* silent */ }
      // reload()는 AbortController cleanup을 반환한다.
      // 수동 호출이므로 void로 명시해 effect cleanup 반환값과의 혼용을 방지한다.
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setRespondingIds((s) => {
        const next = new Set(s);
        next.delete(n.notificationId);
        return next;
      });
    }
  };

  if (authLoading) return <Shell>{null}</Shell>;

  if (!user) {
    return (
      <Shell>
        <div className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-10 text-center">
          <h1 className="m-0 mb-2 text-[20px] font-bold tracking-[-0.015em]">로그인이 필요해요</h1>
          <p className="m-0 mb-6 text-[14px] text-(--color-text-muted)">
            알림은 로그인 후 확인할 수 있어요.
          </p>
          <a
            href={loginUrl('google', '/notifications')}
            className="inline-flex h-10 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-4 text-[14px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
          >
            Google 로그인 <Icon name="arrow" size={14} />
          </a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="mb-6 flex items-end justify-between gap-2">
        <div>
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
            알림 센터 · A_806
          </p>
          <h1 className="m-0 mt-1 text-[24px] font-bold tracking-[-0.015em]">알림</h1>
        </div>
        <button
          type="button"
          onClick={() => void onMarkAll()}
          disabled={markAllBusy || items.every((i) => i.readAt)}
          className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium text-(--color-text-muted) hover:border-(--color-border-hover) hover:text-(--color-text) disabled:opacity-40"
        >
          {markAllBusy ? '처리 중…' : '모두 읽음'}
        </button>
      </header>

      {/* 필터 탭 */}
      <div className="mb-4 flex items-center gap-2">
        <div className="inline-flex rounded-(--radius-md) border border-(--color-border) p-0.5">
          {(['all', 'unread'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`h-8 rounded-[6px] px-3 text-[13px] font-medium transition-colors ${
                filter === f
                  ? 'bg-(--color-accent) text-white'
                  : 'text-(--color-text-muted) hover:text-(--color-text)'
              }`}
            >
              {f === 'all' ? '전체' : '미읽음'}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px] text-(--color-text-subtle)">
          {total.toLocaleString()}건
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
          오류: {error}
        </div>
      )}

      <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
        {loading && items.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">불러오는 중…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-(--color-text-subtle)">
            {filter === 'unread' ? '미읽음 알림이 없어요.' : '아직 알림이 없어요.'}
          </div>
        ) : (
          <ul className="divide-y divide-(--color-border)">
            {items.map((n) => (
              <NotifItem
                key={n.notificationId}
                n={n}
                responding={respondingIds.has(n.notificationId)}
                onItemClick={onItemClick}
                onMarkReadOnly={markReadOnly}
                onRespond={onRespond}
              />
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

// ─── 개별 알림 항목 ─────────────────────────────────────────

function NotifItem({
  n,
  responding,
  onItemClick,
  onMarkReadOnly,
  onRespond,
}: {
  n: MyNotification;
  responding: boolean;
  onItemClick: (n: MyNotification) => void;
  /** Link 네이티브 이동과 중복 navigate 방지용 — 읽음 처리만 수행 */
  onMarkReadOnly: (n: MyNotification) => void;
  onRespond: (n: MyNotification, action: 'accept' | 'reject') => void;
}) {
  const unread = !n.readAt;
  const meta = typeMeta(n.notificationType);
  const showInline = hasInlineAction(n);

  return (
    <li>
      <div
        className={`flex items-start gap-3 p-4 transition-colors ${unread ? '' : 'opacity-75'}`}
      >
        {/* 읽음 인디케이터 */}
        <span
          aria-hidden
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
            unread ? 'bg-(--color-accent)' : 'bg-(--color-border)'
          }`}
        />

        <div className="min-w-0 flex-1">
          {/* 유형 뱃지 */}
          {meta && (
            <span
              className={`mb-1 inline-flex items-center gap-1 rounded-(--radius-sm) px-1.5 py-0.5 text-[10px] font-semibold ${meta.badgeCls}`}
            >
              {meta.label}
            </span>
          )}

          {/* 제목/내용 — 클릭 가능 영역 */}
          <button
            type="button"
            onClick={() => onItemClick(n)}
            className="block w-full text-left"
          >
            <h3
              className={`m-0 text-[14px] ${
                unread ? 'font-semibold text-(--color-text)' : 'text-(--color-text-muted)'
              }`}
            >
              {n.title}
            </h3>
            <p className="m-0 mt-0.5 text-[13px] text-(--color-text)">{n.message}</p>
            <p className="tabular m-0 mt-1 text-[11px] text-(--color-text-subtle)">
              {n.createdAt.slice(0, 19).replace('T', ' ')}
              {!n.eventAvailable && n.eventId && (
                <span className="ml-2 text-(--color-text-subtle)">(이벤트 비공개 또는 삭제됨)</span>
              )}
            </p>
          </button>

          {/* 인라인 수락/거절 (relatedEntityType==='match_request'만) — GG-NOTI-008/009/010/011 */}
          {showInline && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={responding}
                onClick={() => onRespond(n, 'accept')}
                className="inline-flex h-7 items-center rounded-(--radius-md) bg-(--color-accent) px-3 text-[12px] font-medium text-white transition-colors hover:bg-(--color-accent-hover) disabled:opacity-40"
              >
                {responding ? '처리 중…' : '수락'}
              </button>
              <button
                type="button"
                disabled={responding}
                onClick={() => onRespond(n, 'reject')}
                className="inline-flex h-7 items-center rounded-(--radius-md) border border-(--color-border) px-3 text-[12px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-border-hover) hover:text-(--color-text) disabled:opacity-40"
              >
                거절
              </button>
            </div>
          )}

          {/* 이벤트 링크 (notificationType 없는 이벤트 알림 폴백) */}
          {/* onClick에서 onMarkReadOnly(읽음 처리만) 사용 — Link의 to 이동과 navigate 중복 방지 */}
          {!n.notificationType && n.eventAvailable && n.eventId && (
            <Link
              to={`/events/${n.eventId}`}
              onClick={() => onMarkReadOnly(n)}
              className="mt-1 inline-flex items-center gap-1 text-[12px] text-(--color-accent) hover:underline"
            >
              이벤트 보기 <Icon name="arrow" size={12} />
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg) text-(--color-text)">
      <Header />
      <main className="mx-auto w-full max-w-[880px] flex-1 px-4 py-6 md:px-8 md:py-10">
        {children}
      </main>
    </div>
  );
}
