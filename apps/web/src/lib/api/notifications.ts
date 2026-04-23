import { BFF_URL, withCredentials } from './client.js';

// =============================================================
// A_500 알림 센터
// =============================================================

export interface MyNotification {
  notificationId: string;
  eventId: string | null;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  eventAvailable: boolean;
}

export interface MyNotificationsResponse {
  page: number;
  limit: number;
  total: number;
  items: MyNotification[];
}

export async function fetchMyNotifications(
  opts: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  signal?: AbortSignal,
): Promise<MyNotificationsResponse> {
  const sp = new URLSearchParams();
  if (opts.page) sp.set('page', String(opts.page));
  if (opts.limit) sp.set('limit', String(opts.limit));
  if (opts.unreadOnly) sp.set('unreadOnly', 'true');
  const qs = sp.toString();
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/notifications${qs ? `?${qs}` : ''}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /me/notifications ${res.status}`);
  return (await res.json()) as MyNotificationsResponse;
}

export async function fetchUnreadNotificationCount(signal?: AbortSignal): Promise<number> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/notifications/unread-count`, init);
  if (res.status === 401) return 0; // 비로그인은 0 으로 취급
  if (!res.ok) throw new Error(`GET /me/notifications/unread-count ${res.status}`);
  const data = (await res.json()) as { count: number };
  return data.count;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/me/notifications/${encodeURIComponent(notificationId)}/read`,
    withCredentials({ method: 'POST' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`POST /me/notifications/${notificationId}/read ${res.status}`);
}

export async function markAllNotificationsRead(): Promise<number> {
  const res = await fetch(
    `${BFF_URL}/me/notifications/read-all`,
    withCredentials({ method: 'POST' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`POST /me/notifications/read-all ${res.status}`);
  const data = (await res.json()) as { updated: number };
  return data.updated;
}
