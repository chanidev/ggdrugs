import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { fetchUnreadNotificationCount } from '../../lib/api';

/**
 * Header 에 들어가는 알림 벨. 로그인 상태에서만 렌더.
 *
 * 30초 polling 으로 unread count 동기화. SSE/WebSocket 은 Phase 2.
 * 클릭 시 /notifications 페이지로 이동 (별도 라우트).
 * 미읽음 있으면 accent dot, 9 초과면 '9+'.
 */
export function NotificationBell() {
  const { t } = useTranslation('common');
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      fetchUnreadNotificationCount()
        .then((n) => {
          if (!cancelled) setCount(n);
        })
        .catch(() => {
          /* 조용히 무시 — 네트워크 이슈는 UI 에 노출 안 함 */
        });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const label = count === 0
    ? t('aria.notifications')
    : count > 9
      ? t('aria.notificationsPlus')
      : t('aria.notificationsCount', { count });

  return (
    <Link
      to="/notifications"
      aria-label={label}
      title={label}
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-(--radius-md) text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-(--color-accent) px-1 text-[9px] font-bold tabular text-white"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
