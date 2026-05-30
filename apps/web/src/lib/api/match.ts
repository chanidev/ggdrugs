import { BFF_URL, withCredentials } from './client.js';

// =============================================================
// match.ts — 채팅 신청 + 채팅방 REST 클라이언트 (A_803/A_804/A_805)
// =============================================================

// ── 타입 정의 ────────────────────────────────────────────────

export interface MatchRequestOut {
  matchRequestId: string;
  requesterId: string;
  requesterNickname: string;
  requestType: '1:1' | 'group';
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  expiresAt: string;
  createdAt: string;
}

export interface ChatRoomMemberOut {
  userId: string;
  nickname: string;
  role: 'owner' | 'member';
}

export interface ChatRoomSummaryOut {
  chatRoomId: string;
  roomType: '1:1' | 'group';
  status: 'active' | 'ended';
  maxMembers: number;
  eventId: string | null;
  ownerUserId: string | null;
  myRole: 'owner' | 'member';
  lastSeenAt: string | null;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
  members: ChatRoomMemberOut[];
}

export interface ChatRoomMessageOut {
  messageId: string;
  chatRoomId: string;
  senderUserId: string | null;
  messageType: 'text' | 'image' | 'sticker' | 'system';
  body: string | null;
  attachmentUrl: string | null;
  stickerId: string | null;
  createdAt: string;
}

export interface MessagePageOut {
  messages: ChatRoomMessageOut[];
  nextCursor: string | null;
}

export interface AppointmentIn {
  appointedAt: string; // ISO 8601
  eventName?: string;
  eventId?: string;
}

export interface AppointmentVoteIn {
  vote: 'agree' | 'reject' | 'counter';
  counterAt?: string;
  counterTime?: string;
}

export interface AppointmentOut {
  appointmentId: string;
  chatRoomId: string;
  proposerUserId: string;
  eventName: string | null;
  eventId: string | null;
  appointedAt: string | null;
  status: 'proposed' | 'counter_proposed' | 'confirmed' | 'rejected' | 'expired';
  expiresAt: string;
  createdAt: string;
}

export interface GroupMemberOut {
  userId: string;
  nickname: string;
  role: 'owner' | 'member';
}

export interface SendMessagePayload {
  chatRoomId: string;
  type: 'text' | 'image' | 'sticker';
  body?: string;
  attachmentUrl?: string;
  stickerId?: string;
}

// ── API 함수 ─────────────────────────────────────────────────

/**
 * POST /community/match/request/1-to-1 (A_803)
 * 1:1 채팅 신청 전송.
 */
export async function sendMatchRequest1to1(
  receiverUserId: string,
): Promise<{ matchRequestId: string; expiresAt: string }> {
  const res = await fetch(
    `${BFF_URL}/community/match/request/1-to-1`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverUserId }),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 409) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error === 'duplicate_pending' ? 'DUPLICATE_PENDING' : 'BLOCKED');
  }
  if (res.status === 422) throw new Error('PROFILE_REQUIRED');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`POST /community/match/request/1-to-1 ${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as { matchRequestId: string; expiresAt: string };
}

/**
 * POST /community/match/request/group (A_804)
 * 그룹 채팅 초대 전송 (최대 3명).
 */
export async function sendGroupInvite(
  receiverUserIds: string[],
): Promise<{ matchRequestIds: string[] }> {
  const res = await fetch(
    `${BFF_URL}/community/match/request/group`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverUserIds }),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 422) throw new Error('PROFILE_REQUIRED');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`POST /community/match/request/group ${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as { matchRequestIds: string[] };
}

/**
 * PATCH /community/match/request/:matchRequestId/accept
 * 신청 수락 → chatRoomId 반환.
 */
export async function acceptMatchRequest(
  matchRequestId: string,
): Promise<{ chatRoomId: string }> {
  const res = await fetch(
    `${BFF_URL}/community/match/request/${encodeURIComponent(matchRequestId)}/accept`,
    withCredentials({ method: 'PATCH' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (res.status === 409) throw new Error('NOT_PENDING');
  if (res.status === 410) throw new Error('EXPIRED');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`PATCH match/request/${matchRequestId}/accept ${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as { chatRoomId: string };
}

/**
 * PATCH /community/match/request/:matchRequestId/reject
 * 신청 거절.
 */
export async function rejectMatchRequest(matchRequestId: string): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/community/match/request/${encodeURIComponent(matchRequestId)}/reject`,
    withCredentials({ method: 'PATCH' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`PATCH match/request/${matchRequestId}/reject ${res.status}: ${t.slice(0, 200)}`);
  }
}

/**
 * GET /community/match/request/incoming
 * 받은 신청 목록 (pending + 미만료).
 */
export async function getIncomingRequests(): Promise<MatchRequestOut[]> {
  const res = await fetch(
    `${BFF_URL}/community/match/request/incoming`,
    withCredentials(),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET match/request/incoming ${res.status}`);
  const body = await res.json() as { items: MatchRequestOut[] };
  return body.items;
}

/**
 * GET /community/chat-rooms/mine
 * 내 채팅방 목록.
 */
export async function getMyChatRooms(): Promise<ChatRoomSummaryOut[]> {
  const res = await fetch(
    `${BFF_URL}/community/chat-rooms/mine`,
    withCredentials(),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET chat-rooms/mine ${res.status}`);
  const body = await res.json() as { items: ChatRoomSummaryOut[] };
  return body.items;
}

/**
 * GET /community/chat-rooms/:chatRoomId/messages
 * 메시지 조회 (cursor 기반).
 */
export async function getChatRoomMessages(
  chatRoomId: string,
  cursor?: string,
): Promise<MessagePageOut> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(
    `${BFF_URL}/community/chat-rooms/${encodeURIComponent(chatRoomId)}/messages${qs}`,
    withCredentials(),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('NOT_MEMBER');
  if (!res.ok) throw new Error(`GET chat-rooms/${chatRoomId}/messages ${res.status}`);
  return (await res.json()) as MessagePageOut;
}

/**
 * PATCH /community/chat-rooms/:chatRoomId/event
 * 채팅방에 이벤트 연결 (GG-ROOM-004).
 */
export async function selectRoomEvent(chatRoomId: string, eventId: string): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/community/chat-rooms/${encodeURIComponent(chatRoomId)}/event`,
    withCredentials({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('NOT_MEMBER');
  if (res.status === 404) throw new Error('EVENT_NOT_FOUND');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`PATCH chat-rooms/${chatRoomId}/event ${res.status}: ${t.slice(0, 200)}`);
  }
}

/**
 * POST /community/chat-rooms/:chatRoomId/leave
 * 채팅방 나가기.
 */
export async function leaveRoom(chatRoomId: string): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/community/chat-rooms/${encodeURIComponent(chatRoomId)}/leave`,
    withCredentials({ method: 'POST' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`POST chat-rooms/${chatRoomId}/leave ${res.status}: ${t.slice(0, 200)}`);
  }
}

/**
 * POST /community/chat-rooms/:chatRoomId/block/:targetUserId
 * 멤버 차단.
 */
export async function blockUser(chatRoomId: string, targetUserId: string): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/community/chat-rooms/${encodeURIComponent(chatRoomId)}/block/${encodeURIComponent(targetUserId)}`,
    withCredentials({ method: 'POST' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('NOT_MEMBER');
  if (res.status === 409) throw new Error('ALREADY_BLOCKED');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`POST chat-rooms/${chatRoomId}/block/${targetUserId} ${res.status}: ${t.slice(0, 200)}`);
  }
}

/**
 * POST /community/chat-rooms/:chatRoomId/appointment
 * 약속 제안 (GG-ROOM-013~018).
 */
export async function proposeAppointment(
  chatRoomId: string,
  body: AppointmentIn,
): Promise<AppointmentOut> {
  const res = await fetch(
    `${BFF_URL}/community/chat-rooms/${encodeURIComponent(chatRoomId)}/appointment`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('NOT_MEMBER');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`POST chat-rooms/${chatRoomId}/appointment ${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as AppointmentOut;
}

/**
 * PATCH /community/chat-rooms/:chatRoomId/appointment/:appointmentId/vote
 * 약속 투표.
 */
export async function voteAppointment(
  chatRoomId: string,
  appointmentId: string,
  body: AppointmentVoteIn,
): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/community/chat-rooms/${encodeURIComponent(chatRoomId)}/appointment/${encodeURIComponent(appointmentId)}/vote`,
    withCredentials({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('NOT_MEMBER');
  if (res.status === 409) throw new Error('NOT_VOTABLE');
  if (res.status === 410) throw new Error('EXPIRED');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`PATCH chat-rooms/${chatRoomId}/appointment/${appointmentId}/vote ${res.status}: ${t.slice(0, 200)}`);
  }
}

/**
 * POST /community/chat-rooms/:chatRoomId/kick/instant/:targetUserId
 * 즉시강퇴 (방장 1회 권한, GG-MATE-017).
 */
export async function instantKick(chatRoomId: string, targetUserId: string): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/community/chat-rooms/${encodeURIComponent(chatRoomId)}/kick/instant/${encodeURIComponent(targetUserId)}`,
    withCredentials({ method: 'POST' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('NOT_OWNER');
  if (res.status === 422) throw new Error('INSTANT_KICK_USED');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`POST chat-rooms/${chatRoomId}/kick/instant/${targetUserId} ${res.status}: ${t.slice(0, 200)}`);
  }
}

/**
 * POST /community/chat-rooms/:chatRoomId/kick/vote
 * 강퇴투표 시작 (방장, GG-MATE-018).
 */
export async function startKickVote(chatRoomId: string, targetUserId: string): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/community/chat-rooms/${encodeURIComponent(chatRoomId)}/kick/vote`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId }),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('NOT_OWNER');
  if (res.status === 409) throw new Error('VOTE_ALREADY_ACTIVE');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`POST chat-rooms/${chatRoomId}/kick/vote ${res.status}: ${t.slice(0, 200)}`);
  }
}
