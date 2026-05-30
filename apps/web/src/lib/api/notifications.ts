import { BFF_URL, withCredentials } from './client.js';

// =============================================================
// A_806 / A_500 알림 센터 — Slice 6 확장
// =============================================================

export interface MyNotification {
  notificationId: string;
  eventId: string | null;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  eventAvailable: boolean;
  // Slice 6 추가
  notificationType: string | null;
  // match_request/group_invite: matchRequestId (relatedEntityType='match_request')
  //                            또는 chatRoomId (relatedEntityType='chat_room', 수락됨 알림)
  // appointment/appointment_update/mate_eval: appointmentId (relatedEntityType='appointment')
  // chat_message/kick_vote/vacancy_notification: chatRoomId
  relatedEntityId: string | null;
  relatedEntityType: string | null;
  // appointment/appointment_update/mate_eval 타입에만 값이 있음 (BFF Appointment 조인)
  relatedChatRoomId: string | null;
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
  if (res.status === 401) return 0;
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

/**
 * GG-NOTI-008/009/010/011: match_request / group_invite 수락/거절
 * 대상: relatedEntityType === 'match_request' (relatedEntityId = matchRequestId)인 알림만 호출
 * 기존 `PATCH /community/match/request/:id/accept|reject` 엔드포인트 재사용.
 */
export async function respondMatchRequest(
  matchRequestId: string,
  action: 'accept' | 'reject',
): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/community/match/request/${encodeURIComponent(matchRequestId)}/${action}`,
    withCredentials({ method: 'PATCH' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`PATCH match request ${action} ${res.status}`);
}
