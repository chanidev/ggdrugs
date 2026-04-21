import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Header } from '../layout/Header';
import { Icon } from '../components/Icon';
import { useCurrentUser } from '../lib/auth-context';
import {
  fetchMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type MyNotification,
} from '../lib/api';

/**
 * /notifications — A_500 알림 센터.
 *
 * 목록 + 읽음 표시. 이벤트가 연결된 알림이고 eventAvailable=true 면 상세 링크.
 * 필터: 전체 / 미읽음 토글. "모두 읽음" 일괄 처리 버튼.
 */

type Filter = 'all' | 'unread';

export function NotificationsPage() {
  const { user, loading: authLoading } = useCurrentUser();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<MyNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markAllBusy, setMarkAllBusy] = useState(false);

  const reload = useCallback(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchMyNotifications(
      { limit: 50, unreadOnly: filter === 'unread' },
      ctrl.signal,
    )
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

  const onItemClick = async (n: MyNotification) => {
    if (n.readAt) return;
    // 옵티미스틱 업데이트 — 실패해도 상세 링크 이동은 계속.
    setItems((prev) =>
      prev.map((x) =>
        x.notificationId === n.notificationId
          ? { ...x, readAt: new Date().toISOString() }
          : x,
      ),
    );
    try {
      await markNotificationRead(n.notificationId);
    } catch {
      /* silent — 다음 reload 에서 바로잡힘 */
    }
  };

  const onMarkAll = async () => {
    setMarkAllBusy(true);
    try {
      await markAllNotificationsRead();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'mark-all failed');
    } finally {
      setMarkAllBusy(false);
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
            href="/api/auth/google"
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
            알림 센터 · A_203 / A_500
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

      <div className="mb-4 inline-flex rounded-(--radius-md) border border-(--color-border) p-0.5">
        {(
          [
            { key: 'all', label: '전체' },
            { key: 'unread', label: '미읽음' },
          ] as const
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`h-8 rounded-[6px] px-3 text-[13px] font-medium transition-colors ${
              filter === f.key
                ? 'bg-(--color-accent) text-white'
                : 'text-(--color-text-muted) hover:text-(--color-text)'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto self-center px-2 text-[12px] text-(--color-text-subtle)">
          {total.toLocaleString()}건
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
          불러오기 실패: {error}
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
            {items.map((n) => {
              const unread = !n.readAt;
              const hasEventLink = n.eventAvailable && n.eventId;
              const content = (
                <div className="flex items-start gap-3 p-4">
                  {unread ? (
                    <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-(--color-accent)" />
                  ) : (
                    <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-(--color-border)" />
                  )}
                  <div className="min-w-0 flex-1">
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
                  </div>
                </div>
              );
              return (
                <li key={n.notificationId}>
                  {hasEventLink ? (
                    <Link
                      to={`/events/${n.eventId}`}
                      onClick={() => void onItemClick(n)}
                      className="block transition-colors hover:bg-(--color-surface-alt)"
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onItemClick(n)}
                      className="block w-full text-left transition-colors hover:bg-(--color-surface-alt)"
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Shell>
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
