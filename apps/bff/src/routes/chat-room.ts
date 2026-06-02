/**
 * chat-room.ts — 채팅방 REST (A_805)
 *
 * 패턴: routes/match-request.ts (requireAuth, 트랜잭션, 입력검증)
 *
 * WARNING: ChatSession / prisma.chatMessage 를 절대 사용하지 않는다.
 *          이 파일은 prisma.chatRoom* / prisma.appointment* / prisma.block* 만 사용한다.
 *
 * 엔드포인트:
 *   GET    /community/chat-rooms/mine                                       listMyChatRooms
 *   GET    /community/chat-rooms/:chatRoomId/messages                       listMessages
 *   PATCH  /community/chat-rooms/:chatRoomId/event                          selectEvent
 *   POST   /community/chat-rooms/:chatRoomId/appointment                    proposeAppointment
 *   PATCH  /community/chat-rooms/:chatRoomId/appointment/:appointmentId/vote  voteAppointment
 *   POST   /community/chat-rooms/:chatRoomId/leave                          leaveRoom
 *   POST   /community/chat-rooms/:chatRoomId/block/:targetUserId            blockMember
 *
 * Task 5 — 방장 권한 REST (GG-MATE-017~021):
 *   POST   /community/chat-rooms/:chatRoomId/kick/instant/:targetUserId     instantKick
 *   POST   /community/chat-rooms/:chatRoomId/kick/vote                      startKickVote
 *   PATCH  /community/chat-rooms/:chatRoomId/kick/vote/:voteNotifId         castKickVote
 */

import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';
import { getSocketServer } from '../lib/socket-server.js';

const APPOINTMENT_TTL_MS = 36 * 60 * 60 * 1000; // 36h

function parseBigId(raw: unknown): bigint | null {
  const s = typeof raw === 'string' ? raw : '';
  try {
    const n = BigInt(s);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

function maskId(id: bigint | string): string {
  const s = String(id);
  return s.length > 4 ? '*'.repeat(s.length - 4) + s.slice(-4) : '****';
}

// ============================================================
// GET /community/chat-rooms/mine
// GroupMembership.findMany({ userId:me, memberStatus:'active' }) + ChatRoom(status:'active')
// 반환: ChatRoomSummaryOut[]
// ============================================================
export async function listMyChatRooms(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const memberships = await prisma.groupMembership.findMany({
    where: {
      userId: auth.userId,
      memberStatus: 'active',
      chatRoom: { status: 'active' },
    },
    select: {
      membershipId: true,
      role: true,
      lastSeenAt: true,
      joinedAt: true,
      chatRoom: {
        select: {
          chatRoomId: true,
          roomType: true,
          status: true,
          maxMembers: true,
          eventId: true,
          ownerUserId: true,
          createdAt: true,
          updatedAt: true,
          memberships: {
            where: { memberStatus: 'active' },
            select: {
              userId: true,
              role: true,
              user: { select: { nickname: true } },
            },
          },
        },
      },
    },
    orderBy: { chatRoom: { updatedAt: 'desc' } },
  });

  // 선택된 축제명 — ChatRoom↔Event 관계가 없어(스칼라 eventId만) id→title 일괄 조회로 매핑.
  const eventIds = [
    ...new Set(
      memberships
        .map((m) => m.chatRoom.eventId)
        .filter((x): x is bigint => x !== null)
        .map((x) => x.toString()),
    ),
  ].map((s) => BigInt(s));
  const events = eventIds.length
    ? await prisma.event.findMany({ where: { eventId: { in: eventIds } }, select: { eventId: true, title: true } })
    : [];
  const titleById = new Map(events.map((e) => [e.eventId.toString(), e.title]));

  res.status(200).json({
    items: memberships.map((m) => ({
      chatRoomId: m.chatRoom.chatRoomId.toString(),
      roomType: m.chatRoom.roomType,
      status: m.chatRoom.status,
      maxMembers: m.chatRoom.maxMembers,
      eventId: m.chatRoom.eventId?.toString() ?? null,
      eventTitle: m.chatRoom.eventId ? (titleById.get(m.chatRoom.eventId.toString()) ?? null) : null,
      ownerUserId: m.chatRoom.ownerUserId?.toString() ?? null,
      myRole: m.role,
      lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
      joinedAt: m.joinedAt.toISOString(),
      createdAt: m.chatRoom.createdAt.toISOString(),
      updatedAt: m.chatRoom.updatedAt.toISOString(),
      members: m.chatRoom.memberships.map((mb) => ({
        userId: mb.userId.toString(),
        nickname: mb.user.nickname,
        role: mb.role,
      })),
    })),
  });
}

// ============================================================
// GET /community/chat-rooms/:chatRoomId/messages?cursor=&limit=
// 멤버십 active 검증 + ChatRoomMessage.findMany(cursor 기반 페이지네이션)
// 반환: { messages: ChatRoomMessageOut[], nextCursor: string | null }
// ============================================================
export async function listMessages(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const chatRoomId = parseBigId(req.params.chatRoomId);
  if (!chatRoomId) {
    res.status(400).json({ error: 'invalid chatRoomId' });
    return;
  }

  const q = (req.query ?? {}) as Record<string, string>;
  const limitRaw = parseInt(q.limit ?? '30', 10);
  const limit = isNaN(limitRaw) || limitRaw <= 0 ? 30 : Math.min(limitRaw, 100);
  const cursor = q.cursor ? parseBigId(q.cursor) : null;

  // 멤버십 검증
  const membership = await prisma.groupMembership.findFirst({
    where: { chatRoomId, userId: auth.userId, memberStatus: 'active' },
    select: { membershipId: true },
  });
  if (!membership) {
    res.status(403).json({ error: 'not_member' });
    return;
  }

  const messages = await prisma.chatRoomMessage.findMany({
    where: {
      chatRoomId,
      ...(cursor ? { messageId: { lt: cursor } } : {}),
    },
    select: {
      messageId: true,
      senderUserId: true,
      messageType: true,
      body: true,
      attachmentUrl: true,
      stickerId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // +1 로 다음 페이지 유무 판단
  });

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? (page[page.length - 1]?.messageId?.toString() ?? null) : null;

  res.status(200).json({
    messages: page.map((m) => ({
      messageId: m.messageId.toString(),
      chatRoomId: chatRoomId.toString(),
      senderUserId: m.senderUserId?.toString() ?? null,
      messageType: m.messageType,
      body: m.body ?? null,
      attachmentUrl: m.attachmentUrl ?? null,
      stickerId: m.stickerId ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
    nextCursor,
  });
}

// ============================================================
// PATCH /community/chat-rooms/:chatRoomId/event
// body: { eventId: string }  (GG-ROOM-004)
// ChatRoom.update({ eventId })
// ============================================================
export async function selectEvent(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const chatRoomId = parseBigId(req.params.chatRoomId);
  if (!chatRoomId) {
    res.status(400).json({ error: 'invalid chatRoomId' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const eventId = parseBigId(body.eventId);
  if (!eventId) {
    res.status(400).json({ error: 'eventId must be a valid id string' });
    return;
  }

  // 멤버십 검증
  const membership = await prisma.groupMembership.findFirst({
    where: { chatRoomId, userId: auth.userId, memberStatus: 'active' },
    select: { membershipId: true },
  });
  if (!membership) {
    res.status(403).json({ error: 'not_member' });
    return;
  }

  // 이벤트 존재 + approved 확인 (시스템 메시지용 title 포함)
  const event = await prisma.event.findFirst({
    where: { eventId, approvalStatus: 'approved', isDeleted: false },
    select: { eventId: true, title: true },
  });
  if (!event) {
    res.status(404).json({ error: 'event_not_found' });
    return;
  }

  // 변경 여부 판단 — 같은 축제 재선택이면 시스템 메시지를 다시 올리지 않는다(스레드 노이즈 방지).
  const before = await prisma.chatRoom.findUnique({
    where: { chatRoomId },
    select: { eventId: true },
  });
  const changed = (before?.eventId?.toString() ?? null) !== eventId.toString();

  const updated = await prisma.chatRoom.update({
    where: { chatRoomId },
    data: { eventId },
    select: { chatRoomId: true, eventId: true, updatedAt: true },
  });

  // GG-ROOM-003/004: 축제가 새로 정해지거나 바뀌면 스레드에 시스템 메시지 + 실시간 브로드캐스트.
  // (약속 제안과 동일 패턴 — 멤버 전원이 '반응'을 보게 한다. 실패해도 선택 자체는 성공으로 응답.)
  if (changed) {
    try {
      const sysMsg = await prisma.chatRoomMessage.create({
        data: {
          chatRoomId,
          senderUserId: null,
          messageType: 'system',
          body: `이 채팅방의 축제가 '${event.title}'(으)로 정해졌어요`,
        },
      });
      const out = {
        messageId: sysMsg.messageId.toString(),
        chatRoomId: chatRoomId.toString(),
        senderUserId: null,
        messageType: sysMsg.messageType,
        body: sysMsg.body ?? null,
        attachmentUrl: null,
        stickerId: null,
        createdAt: sysMsg.createdAt.toISOString(),
      };
      getSocketServer().to(`room:${chatRoomId.toString()}`).emit('message', out);
    } catch (err) {
      logger.warn({ err, chatRoomId: chatRoomId.toString() }, 'event-select system message failed');
    }
  }

  logger.info(
    { action: 'chat_room_event_select', chatRoomId: chatRoomId.toString(), eventId: eventId.toString(), userId: maskId(auth.userId) },
    'chat room event selected',
  );

  res.status(200).json({
    chatRoomId: updated.chatRoomId.toString(),
    eventId: updated.eventId?.toString() ?? null,
    eventTitle: event.title,
    updatedAt: updated.updatedAt.toISOString(),
  });
}

// ============================================================
// POST /community/chat-rooms/:chatRoomId/appointment
// body: { eventName?, eventId?, appointedAt: string(ISO) }
// Appointment.create({ status:'proposed', expiresAt:now+36h })
// AppointmentVote.createMany(activeMembers, { vote:'pending' })
// ChatRoomMessage.create(system)
// Notification.createMany(activeMembers)
// 실시간: io.to(room).emit('appointment:proposed', AppointmentOut)
// ============================================================
export async function proposeAppointment(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const chatRoomId = parseBigId(req.params.chatRoomId);
  if (!chatRoomId) {
    res.status(400).json({ error: 'invalid chatRoomId' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const appointedAtRaw = body.appointedAt;
  if (!appointedAtRaw || typeof appointedAtRaw !== 'string') {
    res.status(400).json({ error: 'appointedAt (ISO string) is required' });
    return;
  }
  const appointedAt = new Date(appointedAtRaw);
  if (isNaN(appointedAt.getTime())) {
    res.status(400).json({ error: 'appointedAt must be a valid ISO date string' });
    return;
  }

  const eventName = typeof body.eventName === 'string' ? body.eventName : null;
  const eventId = parseBigId(body.eventId);

  // 멤버십 검증
  const membership = await prisma.groupMembership.findFirst({
    where: { chatRoomId, userId: auth.userId, memberStatus: 'active' },
    select: { membershipId: true },
  });
  if (!membership) {
    res.status(403).json({ error: 'not_member' });
    return;
  }

  const expiresAt = new Date(Date.now() + APPOINTMENT_TTL_MS);

  const appointment = await prisma.$transaction(async (tx) => {
    // active 멤버 목록 조회 — 트랜잭션 내에서 읽어 TOCTOU 방지
    const activeMembers = await tx.groupMembership.findMany({
      where: { chatRoomId, memberStatus: 'active' },
      select: { userId: true },
    });

    const appt = await tx.appointment.create({
      data: {
        chatRoomId,
        proposerUserId: auth.userId,
        eventName: eventName ?? null,
        eventId: eventId ?? null,
        appointedAt,
        status: 'proposed',
        expiresAt,
      },
      select: {
        appointmentId: true,
        chatRoomId: true,
        proposerUserId: true,
        eventName: true,
        eventId: true,
        appointedAt: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // 전원에게 투표 레코드 생성
    await tx.appointmentVote.createMany({
      data: activeMembers.map((m) => ({
        appointmentId: appt.appointmentId,
        userId: m.userId,
        vote: 'pending',
      })),
    });

    // 시스템 메시지 — 제안 일시(+축제명)를 본문에 포함 (와이어 9-7: 버블에 설정값 표시)
    const apptLabel = appointedAt.toISOString().slice(0, 16).replace('T', ' ');
    await tx.chatRoomMessage.create({
      data: {
        chatRoomId,
        senderUserId: null,
        messageType: 'system',
        body: `약속이 제안되었습니다 · ${apptLabel}${eventName ? ` · ${eventName}` : ''}`,
      },
    });

    // 알림 (제안자 제외 나머지 멤버에게)
    const otherMembers = activeMembers.filter((m) => m.userId !== auth.userId);
    if (otherMembers.length > 0) {
      await tx.notification.createMany({
        data: otherMembers.map((m) => ({
          userId: m.userId,
          title: '약속이 제안되었습니다',
          message: '채팅방에 새 약속 제안이 왔습니다.',
          scheduledAt: new Date(),
          isSent: true,
          sentAt: new Date(),
          notificationType: 'appointment',
          relatedEntityId: appt.appointmentId,
          relatedEntityType: 'appointment',
        })),
      });
    }

    return appt;
  });

  const apptOut = {
    appointmentId: appointment.appointmentId.toString(),
    chatRoomId: appointment.chatRoomId.toString(),
    proposerUserId: appointment.proposerUserId.toString(),
    eventName: appointment.eventName ?? null,
    eventId: appointment.eventId?.toString() ?? null,
    appointedAt: appointment.appointedAt?.toISOString() ?? null,
    status: appointment.status,
    expiresAt: appointment.expiresAt.toISOString(),
    createdAt: appointment.createdAt.toISOString(),
  };

  // 실시간 emit (fire-and-forget)
  try {
    const io = getSocketServer();
    io.to(`room:${chatRoomId.toString()}`).emit('appointment:proposed', apptOut);
  } catch {
    // Socket.IO 미초기화 — 무시
  }

  logger.info(
    { action: 'appointment_propose', chatRoomId: chatRoomId.toString(), appointmentId: appointment.appointmentId.toString() },
    'appointment proposed',
  );

  res.status(201).json(apptOut);
}

// ============================================================
// PATCH /community/chat-rooms/:chatRoomId/appointment/:appointmentId/vote
// body: { vote: 'agree'|'reject'|'counter', counterAt?, counterTime? }
// AppointmentVote.update({ vote, counterAt, counterTime })
// 전원 agree → Appointment.update({ status:'confirmed' }) + emit
// counter → Appointment.update({ status:'counter_proposed' }) + emit
// ============================================================
export async function voteAppointment(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const chatRoomId = parseBigId(req.params.chatRoomId);
  const appointmentId = parseBigId(req.params.appointmentId);
  if (!chatRoomId || !appointmentId) {
    res.status(400).json({ error: 'invalid chatRoomId or appointmentId' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const vote = body.vote;
  if (vote !== 'agree' && vote !== 'reject' && vote !== 'counter') {
    res.status(400).json({ error: 'vote must be agree | reject | counter' });
    return;
  }

  let counterAt: Date | null = null;
  let counterTime: Date | null = null;
  if (vote === 'counter') {
    if (body.counterAt && typeof body.counterAt === 'string') {
      counterAt = new Date(body.counterAt);
      if (isNaN(counterAt.getTime())) {
        res.status(400).json({ error: 'counterAt must be a valid ISO date string' });
        return;
      }
    }
    if (body.counterTime && typeof body.counterTime === 'string') {
      counterTime = new Date(body.counterTime);
      if (isNaN(counterTime.getTime())) {
        res.status(400).json({ error: 'counterTime must be a valid ISO date string' });
        return;
      }
    }
  }

  // 멤버십 검증
  const membership = await prisma.groupMembership.findFirst({
    where: { chatRoomId, userId: auth.userId, memberStatus: 'active' },
    select: { membershipId: true },
  });
  if (!membership) {
    res.status(403).json({ error: 'not_member' });
    return;
  }

  // Appointment 조회
  const appointment = await prisma.appointment.findFirst({
    where: { appointmentId, chatRoomId },
    select: { appointmentId: true, status: true, expiresAt: true, chatRoomId: true, proposerUserId: true, eventName: true, eventId: true, appointedAt: true, createdAt: true },
  });
  if (!appointment) {
    res.status(404).json({ error: 'appointment_not_found' });
    return;
  }
  if (appointment.status !== 'proposed' && appointment.status !== 'counter_proposed') {
    res.status(409).json({ error: 'appointment_not_votable', currentStatus: appointment.status });
    return;
  }
  if (appointment.expiresAt <= new Date()) {
    res.status(410).json({ error: 'appointment_expired' });
    return;
  }

  // 내 투표 레코드 존재 여부 확인
  const myVote = await prisma.appointmentVote.findUnique({
    where: { appointmentId_userId: { appointmentId, userId: auth.userId } },
    select: { voteId: true },
  });
  if (!myVote) {
    res.status(403).json({ error: 'not_a_voter' });
    return;
  }

  let finalStatus = appointment.status;
  let concurrentConflict = false;
  let apptOut: Record<string, unknown>;

  // 상태 전이 가능한(투표 진행 중) status 집합.
  const VOTABLE = ['proposed', 'counter_proposed'];

  // 동시 투표 경합 방지 (ADR 0009): Serializable + 조건부 상태 전이 + P2034 재시도.
  //  - 트랜잭션 시작 시 status 재확인 — 외부 check(line 462)와 tx 사이 경합 차단.
  //  - 상태 전이는 updateMany(WHERE status IN VOTABLE) 조건부 — 동시 tx 가 이미 전이했으면
  //    count=0 → 확정/거절 부수효과(알림·시스템 메시지) skip → reject↔confirm 뒤집힘 방지.
  //  - 마지막 두 동의자가 서로의 표를 못 봐 confirm 을 누락하는 race 는 Serializable
  //    직렬화 충돌(P2034)→재시도로 해소(재시도 시 상대 표 commit 반영). leaveRoom 과 동일 패턴.
  for (let attempt = 0; ; attempt++) {
    concurrentConflict = false;
    finalStatus = appointment.status;
    try {
      await prisma.$transaction(
        async (tx) => {
          // 트랜잭션 내 status 재확인 (외부 check 이후 경합으로 전이됐을 수 있음)
          const current = await tx.appointment.findUnique({
            where: { appointmentId },
            select: { status: true },
          });
          if (!current || !VOTABLE.includes(current.status)) {
            concurrentConflict = true;
            finalStatus = current?.status ?? appointment.status;
            return;
          }

          // 내 투표 업데이트
          await tx.appointmentVote.update({
            where: { appointmentId_userId: { appointmentId, userId: auth.userId } },
            data: {
              vote,
              ...(counterAt !== null ? { counterAt } : {}),
              ...(counterTime !== null ? { counterTime } : {}),
            },
          });

          if (vote === 'agree') {
            // 전원 동의 여부 확인 (제안자 포함 모든 투표)
            const allVotes = await tx.appointmentVote.findMany({
              where: { appointmentId },
              select: { vote: true },
            });
            const allAgree = allVotes.every((v) => v.vote === 'agree');

            if (allAgree) {
              // 조건부 확정 — 동시 tx 가 이미 상태를 바꿨다면 0 row → 부수효과 skip
              const upd = await tx.appointment.updateMany({
                where: { appointmentId, status: { in: VOTABLE } },
                data: { status: 'confirmed' },
              });
              if (upd.count === 0) {
                concurrentConflict = true;
                return;
              }
              finalStatus = 'confirmed';

              await tx.chatRoomMessage.create({
                data: {
                  chatRoomId,
                  senderUserId: null,
                  messageType: 'system',
                  body: '약속이 확정되었습니다',
                },
              });

              // 전원에게 확정 알림
              const members = await tx.groupMembership.findMany({
                where: { chatRoomId, memberStatus: 'active' },
                select: { userId: true },
              });
              await tx.notification.createMany({
                data: members.map((m) => ({
                  userId: m.userId,
                  title: '약속이 확정되었습니다',
                  message: '모든 멤버가 약속에 동의했습니다.',
                  scheduledAt: new Date(),
                  isSent: true,
                  sentAt: new Date(),
                  notificationType: 'appointment',
                  relatedEntityId: appointmentId,
                  relatedEntityType: 'appointment',
                })),
              });
            }
          } else if (vote === 'reject') {
            // [high] 단일 거절 → 즉시 약속 파기. 36h 스케줄러는 무응답(pending) 만료 처리 전담.
            const upd = await tx.appointment.updateMany({
              where: { appointmentId, status: { in: VOTABLE } },
              data: { status: 'rejected' },
            });
            if (upd.count === 0) {
              concurrentConflict = true;
              return;
            }
            finalStatus = 'rejected';

            await tx.chatRoomMessage.create({
              data: {
                chatRoomId,
                senderUserId: null,
                messageType: 'system',
                body: '약속이 거절되었습니다',
              },
            });

            // 거절 알림 — 거절자 제외 나머지 active 멤버에게 파기 통지 (오프라인 멤버 인지).
            const rejectMembers = await tx.groupMembership.findMany({
              where: { chatRoomId, memberStatus: 'active', userId: { not: auth.userId } },
              select: { userId: true },
            });
            if (rejectMembers.length > 0) {
              await tx.notification.createMany({
                data: rejectMembers.map((m) => ({
                  userId: m.userId,
                  title: '약속이 거절되었습니다',
                  message: '제안된 약속이 취소되었습니다.',
                  scheduledAt: new Date(),
                  isSent: true,
                  sentAt: new Date(),
                  notificationType: 'appointment',
                  relatedEntityId: appointmentId,
                  relatedEntityType: 'appointment',
                })),
              });
            }
          } else if (vote === 'counter') {
            const upd = await tx.appointment.updateMany({
              where: { appointmentId, status: { in: VOTABLE } },
              data: { status: 'counter_proposed' },
            });
            if (upd.count === 0) {
              concurrentConflict = true;
              return;
            }
            finalStatus = 'counter_proposed';

            // [medium] 역제안 시 역제안자 본인을 제외한 나머지 투표를 'pending'으로 초기화.
            // counter_proposed 는 새로운 제안 라운드이므로 이전 표는 무효화해야 함.
            await tx.appointmentVote.updateMany({
              where: { appointmentId, userId: { not: auth.userId } },
              data: { vote: 'pending', counterAt: null, counterTime: null },
            });

            await tx.chatRoomMessage.create({
              data: {
                chatRoomId,
                senderUserId: null,
                messageType: 'system',
                body: '역제안이 제출되었습니다',
              },
            });

            // GG-NOTI-012: 역제안 알림 — 역제안자 제외 나머지 멤버에게 재투표 유도.
            // (투표가 'pending' 으로 리셋됐으므로 오프라인 멤버도 새 라운드를 인지해야 함.)
            const counterMembers = await tx.groupMembership.findMany({
              where: { chatRoomId, memberStatus: 'active', userId: { not: auth.userId } },
              select: { userId: true },
            });
            if (counterMembers.length > 0) {
              await tx.notification.createMany({
                data: counterMembers.map((m) => ({
                  userId: m.userId,
                  title: '약속 역제안이 도착했습니다',
                  message: '새로운 날짜·시간이 제안되었습니다. 다시 투표해 주세요.',
                  scheduledAt: new Date(),
                  isSent: true,
                  sentAt: new Date(),
                  notificationType: 'appointment',
                  relatedEntityId: appointmentId,
                  relatedEntityType: 'appointment',
                })),
              });
            }
          }
        },
        { isolationLevel: 'Serializable' },
      );
      break;
    } catch (e) {
      const pe = e as { code?: string; message?: string };
      const conflict =
        pe.code === 'P2034' ||
        (pe.message ?? '').includes('write conflict') ||
        (pe.message ?? '').includes('deadlock');
      if (conflict && attempt < 3) {
        await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }

  // 동시 전이로 내 투표가 무의미해진 경우 — 409(재시도 가능). 현재 상태 동봉.
  if (concurrentConflict) {
    res.status(409).json({ error: 'appointment_not_votable', retryable: true, currentStatus: finalStatus });
    return;
  }

  // 최신 상태 조회 후 응답
  const updatedAppt = await prisma.appointment.findUnique({
    where: { appointmentId },
    select: {
      appointmentId: true,
      chatRoomId: true,
      proposerUserId: true,
      eventName: true,
      eventId: true,
      appointedAt: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  apptOut = {
    appointmentId: updatedAppt!.appointmentId.toString(),
    chatRoomId: updatedAppt!.chatRoomId.toString(),
    proposerUserId: updatedAppt!.proposerUserId.toString(),
    eventName: updatedAppt!.eventName ?? null,
    eventId: updatedAppt!.eventId?.toString() ?? null,
    appointedAt: updatedAppt!.appointedAt?.toISOString() ?? null,
    status: updatedAppt!.status,
    expiresAt: updatedAppt!.expiresAt.toISOString(),
    createdAt: updatedAppt!.createdAt.toISOString(),
    updatedAt: updatedAppt!.updatedAt.toISOString(),
  };

  // 실시간 emit (fire-and-forget)
  try {
    const io = getSocketServer();
    if (finalStatus === 'confirmed') {
      io.to(`room:${chatRoomId.toString()}`).emit('appointment:confirmed', apptOut);
    } else if (finalStatus === 'counter_proposed') {
      io.to(`room:${chatRoomId.toString()}`).emit('appointment:proposed', apptOut);
    } else if (finalStatus === 'rejected') {
      // 단일 거절 즉시 파기 시 클라이언트에 실시간 신호 전달 (ADR 0009 참조)
      io.to(`room:${chatRoomId.toString()}`).emit('appointment:rejected', apptOut);
    }
  } catch {
    // Socket.IO 미초기화 — 무시
  }

  logger.info(
    { action: 'appointment_vote', appointmentId: appointmentId.toString(), vote, finalStatus },
    'appointment vote cast',
  );

  res.status(200).json({ ...apptOut, vote });
}

// ============================================================
// POST /community/chat-rooms/:chatRoomId/leave
// GroupMembership.update({ memberStatus:'left', leftAt:now })
// 1:1: ChatRoom.update({ status:'ended', endedAt:now })
// 그룹(방장): ownerUserId 다음 active member로 이전
// ============================================================
export async function leaveRoom(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const chatRoomId = parseBigId(req.params.chatRoomId);
  if (!chatRoomId) {
    res.status(400).json({ error: 'invalid chatRoomId' });
    return;
  }

  // 채팅방 + 멤버십 조회
  const room = await prisma.chatRoom.findUnique({
    where: { chatRoomId },
    select: { chatRoomId: true, roomType: true, status: true, ownerUserId: true },
  });
  if (!room) {
    res.status(404).json({ error: 'room_not_found' });
    return;
  }
  if (room.status !== 'active') {
    res.status(409).json({ error: 'room_not_active', currentStatus: room.status });
    return;
  }

  const membership = await prisma.groupMembership.findFirst({
    where: { chatRoomId, userId: auth.userId, memberStatus: 'active' },
    select: { membershipId: true, role: true },
  });
  if (!membership) {
    res.status(403).json({ error: 'not_member' });
    return;
  }

  const now = new Date();

  // 스케줄러(handleInactiveMembers 등)가 group_memberships 를 동시 갱신해
  // write conflict/deadlock(P2034) 가 날 수 있어 짧게 재시도한다 (REST+스케줄러 동시성).
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        // 내 멤버십 left 처리 (lastSeenAt 도 갱신 — 나가기는 활동)
        await tx.groupMembership.update({
          where: { membershipId: membership.membershipId },
          data: { memberStatus: 'left', leftAt: now, lastSeenAt: now },
        });

    await tx.chatRoomMessage.create({
      data: {
        chatRoomId,
        senderUserId: null,
        messageType: 'system',
        body: '멤버가 채팅방을 나갔습니다',
      },
    });

    if (room.roomType === '1:1') {
      // 1:1: 채팅방 종료 + 상대방 멤버십 left 처리
      // 요청자 멤버십은 이미 위에서 update 완료 → 상대방(active)만 대상으로 한정해 중복 업데이트 방지
      await tx.groupMembership.updateMany({
        where: { chatRoomId, memberStatus: 'active', userId: { not: auth.userId } },
        data: { memberStatus: 'left', leftAt: now },
      });
      await tx.chatRoom.update({
        where: { chatRoomId },
        data: { status: 'ended', endedAt: now },
      });
    } else {
      // 그룹: 방장 여부 확인
      if (membership.role === 'owner') {
        // 다음 active 멤버로 방장 이전 (나를 제외한 active 멤버 중 joinedAt 빠른 순)
        const nextMember = await tx.groupMembership.findFirst({
          where: {
            chatRoomId,
            memberStatus: 'active',
            userId: { not: auth.userId },
          },
          orderBy: { joinedAt: 'asc' },
          select: { membershipId: true, userId: true },
        });

        if (nextMember) {
          // 새 방장 설정
          await tx.chatRoom.update({
            where: { chatRoomId },
            data: { ownerUserId: nextMember.userId },
          });
          await tx.groupMembership.update({
            where: { membershipId: nextMember.membershipId },
            data: { role: 'owner' },
          });

          // 결원 충원 알림 (남은 active 멤버에게)
          const remainingMembers = await tx.groupMembership.findMany({
            where: { chatRoomId, memberStatus: 'active' },
            select: { userId: true },
          });
          if (remainingMembers.length > 0) {
            await tx.notification.createMany({
              data: remainingMembers.map((m) => ({
                userId: m.userId,
                title: '방장이 변경되었습니다',
                message: '그룹 채팅방의 방장이 변경되었습니다.',
                scheduledAt: new Date(),
                isSent: true,
                sentAt: new Date(),
                notificationType: 'chat_message',
                relatedEntityId: chatRoomId,
                relatedEntityType: 'chat_room',
              })),
            });
          }
        } else {
          // 남은 멤버 없으면 채팅방 종료
          await tx.chatRoom.update({
            where: { chatRoomId },
            data: { status: 'ended', endedAt: now },
          });
        }
      } else {
        // [low] 비방장 멤버가 나간 후 남은 active 멤버 수 확인
        // active 멤버가 0명이면 채팅방을 종료 처리 (고아 방 방지)
        const remainingActiveCount = await tx.groupMembership.count({
          where: { chatRoomId, memberStatus: 'active' },
        });
        if (remainingActiveCount === 0) {
          await tx.chatRoom.update({
            where: { chatRoomId },
            data: { status: 'ended', endedAt: now },
          });
        }
      }
    }
      });
      break;
    } catch (e) {
      const pe = e as { code?: string; message?: string };
      const conflict =
        pe.code === 'P2034' ||
        (pe.message ?? '').includes('write conflict') ||
        (pe.message ?? '').includes('deadlock');
      if (conflict && attempt < 3) {
        await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }

  logger.info(
    { action: 'chat_room_leave', chatRoomId: chatRoomId.toString(), userId: maskId(auth.userId), roomType: room.roomType },
    'left chat room',
  );

  res.status(200).json({ ok: true });
}

// ============================================================
// POST /community/chat-rooms/:chatRoomId/block/:targetUserId
// GroupMembership.update({ memberStatus:'blocked' })
// Block.create({ blockerId:me, blockedUserId:target })
// ChatRoomMessage.create(system)
// GG-REPORT-009 연동 주석: 차단 사용자는 추천/신청 풀에서 제외 (슬라이스8에서 완성)
// ============================================================
export async function blockMember(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const chatRoomId = parseBigId(req.params.chatRoomId);
  const targetUserId = parseBigId(req.params.targetUserId);
  if (!chatRoomId || !targetUserId) {
    res.status(400).json({ error: 'invalid chatRoomId or targetUserId' });
    return;
  }

  if (targetUserId === auth.userId) {
    res.status(400).json({ error: 'cannot block yourself' });
    return;
  }

  // 내 멤버십 검증
  const myMembership = await prisma.groupMembership.findFirst({
    where: { chatRoomId, userId: auth.userId, memberStatus: 'active' },
    select: { membershipId: true },
  });
  if (!myMembership) {
    res.status(403).json({ error: 'not_member' });
    return;
  }

  // 대상 멤버십 검증
  const targetMembership = await prisma.groupMembership.findFirst({
    where: { chatRoomId, userId: targetUserId, memberStatus: 'active' },
    select: { membershipId: true },
  });
  if (!targetMembership) {
    res.status(404).json({ error: 'target_not_in_room' });
    return;
  }

  // 이미 차단했는지 확인
  const existingBlock = await prisma.block.findUnique({
    where: { blockerId_blockedUserId: { blockerId: auth.userId, blockedUserId: targetUserId } },
    select: { blockId: true },
  });
  if (existingBlock) {
    res.status(409).json({ error: 'already_blocked' });
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 대상 멤버십 blocked 처리
    await tx.groupMembership.update({
      where: { membershipId: targetMembership.membershipId },
      data: { memberStatus: 'blocked', leftAt: new Date() },
    });

    // Block 레코드 생성
    // GG-REPORT-009: 차단된 사용자는 추천/신청 풀에서 제외 — 슬라이스8에서 완성
    await tx.block.create({
      data: {
        blockerId: auth.userId,
        blockedUserId: targetUserId,
      },
    });

    // 시스템 메시지
    await tx.chatRoomMessage.create({
      data: {
        chatRoomId,
        senderUserId: null,
        messageType: 'system',
        body: '멤버가 차단되었습니다',
      },
    });
  });

  logger.info(
    { action: 'chat_room_block', chatRoomId: chatRoomId.toString(), blockerId: maskId(auth.userId), blockedUserId: maskId(targetUserId) },
    'member blocked in chat room',
  );

  res.status(200).json({ ok: true });
}

// ============================================================
// POST /community/chat-rooms/:chatRoomId/kick/instant/:targetUserId
// GG-MATE-017: 방장만 가능. 방 전체 1회 소진(instantKickUsed 플래그).
// 트랜잭션 SERIALIZABLE: 동시 요청 중 1건만 성공.
// ============================================================
export async function instantKick(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const chatRoomId = parseBigId(req.params.chatRoomId);
  const targetUserId = parseBigId(req.params.targetUserId);
  if (!chatRoomId || !targetUserId) {
    res.status(400).json({ error: 'invalid chatRoomId or targetUserId' });
    return;
  }

  if (targetUserId === auth.userId) {
    res.status(400).json({ error: 'cannot kick yourself' });
    return;
  }

  const now = new Date();

  try {
    await prisma.$transaction(
      async (tx) => {
        // 1. 방장 멤버십 조회 (동시성 보호: SERIALIZABLE isolation)
        const ownerMembership = await tx.groupMembership.findFirst({
          where: { chatRoomId, userId: auth.userId, role: 'owner', memberStatus: 'active' },
          select: { membershipId: true, instantKickUsed: true },
        });
        if (!ownerMembership) {
          const err = new Error('not_owner');
          (err as Error & { code?: string }).code = 'NOT_OWNER';
          throw err;
        }

        // 2. 즉시강퇴 1회 소진 여부 확인
        if (ownerMembership.instantKickUsed) {
          const err = new Error('instant_kick_used');
          (err as Error & { code?: string }).code = 'KICK_USED';
          throw err;
        }

        // 3. 대상 멤버십 확인
        const targetMembership = await tx.groupMembership.findFirst({
          where: { chatRoomId, userId: targetUserId, memberStatus: 'active' },
          select: { membershipId: true },
        });
        if (!targetMembership) {
          const err = new Error('target_not_in_room');
          (err as Error & { code?: string }).code = 'TARGET_NOT_FOUND';
          throw err;
        }

        // 4. 방장 행에서 instantKickUsed = true 소진
        await tx.groupMembership.update({
          where: { membershipId: ownerMembership.membershipId },
          data: { instantKickUsed: true },
        });

        // 5. 대상 멤버십 kicked 처리
        await tx.groupMembership.update({
          where: { membershipId: targetMembership.membershipId },
          data: { memberStatus: 'kicked', leftAt: now },
        });

        // 6. 시스템 메시지
        await tx.chatRoomMessage.create({
          data: {
            chatRoomId,
            senderUserId: null,
            messageType: 'system',
            body: '멤버가 강퇴되었습니다',
          },
        });

        // 7. 결원 충원 알림 — 남은 active 멤버에게 (대상 제외)
        // vacancy_notification 타입: 일반 채팅 알림과 구분되도록 전용 타입 사용
        const remainingMembers = await tx.groupMembership.findMany({
          where: { chatRoomId, memberStatus: 'active' },
          select: { userId: true },
        });
        if (remainingMembers.length > 0) {
          await tx.notification.createMany({
            data: remainingMembers.map((m) => ({
              userId: m.userId,
              title: '멤버가 강퇴되었습니다',
              message: '채팅방에서 멤버가 강퇴되어 자리가 생겼습니다.',
              scheduledAt: new Date(),
              isSent: true,
              sentAt: new Date(),
              notificationType: 'vacancy_notification',
              relatedEntityId: chatRoomId,
              relatedEntityType: 'chat_room',
            })),
          });
        }
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (err: unknown) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_OWNER' || e.message === 'not_owner') {
      res.status(403).json({ error: 'not_owner' });
      return;
    }
    if (e.code === 'KICK_USED' || e.message === 'instant_kick_used') {
      res.status(422).json({ error: 'instant_kick_used' });
      return;
    }
    if (e.code === 'TARGET_NOT_FOUND' || e.message === 'target_not_in_room') {
      res.status(404).json({ error: 'target_not_in_room' });
      return;
    }
    // Prisma P2034: SERIALIZABLE 트랜잭션 충돌 (write conflict / deadlock)
    // 동시 요청 중 나중에 도착한 것 — 이 시점에서 instantKickUsed 확정 여부 불명.
    // 의미상 concurrent conflict 이므로 409 Conflict 로 반환 (retryable).
    const pe = err as { code?: string; message?: string };
    if (pe.code === 'P2034' || (pe.message && pe.message.includes('write conflict'))) {
      res.status(409).json({ error: 'concurrent_conflict', retryable: true });
      return;
    }
    throw err;
  }

  // 실시간 emit (fire-and-forget)
  try {
    const io = getSocketServer();
    const updatedMembers = await prisma.groupMembership.findMany({
      where: { chatRoomId, memberStatus: 'active' },
      select: { userId: true, role: true, user: { select: { nickname: true } } },
    });
    io.to(`room:${chatRoomId.toString()}`).emit('room:member_update', {
      members: updatedMembers.map((m) => ({
        userId: m.userId.toString(),
        nickname: m.user.nickname,
        role: m.role,
      })),
    });
  } catch {
    // Socket.IO 미초기화 — 무시
  }

  logger.info(
    { action: 'instant_kick', chatRoomId: chatRoomId.toString(), kickerId: maskId(auth.userId), targetUserId: maskId(targetUserId) },
    'instant kick executed',
  );

  res.status(200).json({ ok: true });
}

// ============================================================
// POST /community/chat-rooms/:chatRoomId/kick/vote
// body: { targetUserId: string }
// GG-MATE-018: 방장만 투표 시작 가능. 36h 기한 kick_vote Notification 생성.
// ============================================================
export async function startKickVote(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const chatRoomId = parseBigId(req.params.chatRoomId);
  if (!chatRoomId) {
    res.status(400).json({ error: 'invalid chatRoomId' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const targetUserId = parseBigId(body.targetUserId);
  if (!targetUserId) {
    res.status(400).json({ error: 'targetUserId (string) is required' });
    return;
  }

  if (targetUserId === auth.userId) {
    res.status(400).json({ error: 'cannot vote kick yourself' });
    return;
  }

  // 방장 검증 (트랜잭션 외부에서 빠른 실패)
  const ownerMembership = await prisma.groupMembership.findFirst({
    where: { chatRoomId, userId: auth.userId, role: 'owner', memberStatus: 'active' },
    select: { membershipId: true },
  });
  if (!ownerMembership) {
    res.status(403).json({ error: 'not_owner' });
    return;
  }

  // 대상 검증 (트랜잭션 외부에서 빠른 실패)
  const targetMembership = await prisma.groupMembership.findFirst({
    where: { chatRoomId, userId: targetUserId, memberStatus: 'active' },
    select: { membershipId: true },
  });
  if (!targetMembership) {
    res.status(404).json({ error: 'target_not_in_room' });
    return;
  }

  // TOCTOU 방지: 중복 라운드 체크 + createMany 를 SERIALIZABLE 트랜잭션으로 묶는다.
  // 두 동시 요청이 동시에 guard 를 통과해 알림 중복 생성하는 경쟁 조건을 차단.
  let activeMembers: { userId: bigint }[] = [];
  let now: Date;
  let expiresAt: Date;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // 중복 투표 방지: 해당 대상에 대해 이미 진행 중인 kick_vote 가 있으면 409
        // "진행 중" = 해당 대상을 가리키는 알림 중 voteResult 가 아직 기록되지 않은 것이 1건이라도 존재
        // findFirst 는 임의의 1건만 반환하므로 부분 완료 상태(일부만 투표)에서 오탐 가능 → findMany 로 전체 조회
        const allTargetVoteNotifs = await tx.notification.findMany({
          where: {
            notificationType: 'kick_vote',
            relatedEntityId: chatRoomId,
            relatedEntityType: 'kick_vote',
            message: { contains: `"targetUserId":"${targetUserId.toString()}"` },
          },
          select: { message: true },
        });
        // 1건이라도 voteResult 없으면 해당 라운드가 아직 진행 중 → 신규 라운드 차단
        const roundIsActive = allTargetVoteNotifs.some((n) => {
          try {
            return (JSON.parse(n.message) as { voteResult?: string }).voteResult === undefined;
          } catch {
            // corrupt JSON — 안전하게 active 로 간주
            return true;
          }
        });
        if (roundIsActive) {
          const err = new Error('kick_vote_already_active');
          (err as Error & { code?: string }).code = 'VOTE_ACTIVE';
          throw err;
        }

        // active 멤버 조회 (대상 제외)
        const members = await tx.groupMembership.findMany({
          where: { chatRoomId, memberStatus: 'active', userId: { not: targetUserId } },
          select: { userId: true },
        });

        const txNow = new Date();
        const txExpiresAt = new Date(txNow.getTime() + 36 * 60 * 60 * 1000); // +36h

        const notifData = members.map((m) => ({
          userId: m.userId,
          title: '강퇴 투표가 시작되었습니다',
          message: JSON.stringify({ chatRoomId: chatRoomId.toString(), targetUserId: targetUserId.toString(), expiresAt: txExpiresAt.toISOString() }),
          scheduledAt: txNow,
          isSent: true,
          sentAt: txNow,
          notificationType: 'kick_vote',
          relatedEntityId: chatRoomId,
          relatedEntityType: 'kick_vote',
          // expiresAt 은 Notification 모델에 없으므로 message JSON 에 포함
        }));

        await tx.notification.createMany({ data: notifData });

        return { members, txNow, txExpiresAt };
      },
      { isolationLevel: 'Serializable' },
    );

    activeMembers = result.members;
    now = result.txNow;
    expiresAt = result.txExpiresAt;
  } catch (err: unknown) {
    const e = err as Error & { code?: string };
    if (e.code === 'VOTE_ACTIVE' || e.message === 'kick_vote_already_active') {
      res.status(409).json({ error: 'kick_vote_already_active' });
      return;
    }
    // Prisma P2034: SERIALIZABLE 트랜잭션 충돌 (동시 요청)
    const pe = err as { code?: string; message?: string };
    if (pe.code === 'P2034' || (pe.message && pe.message.includes('write conflict'))) {
      res.status(409).json({ error: 'concurrent_conflict', retryable: true });
      return;
    }
    throw err;
  }

  logger.info(
    { action: 'kick_vote_start', chatRoomId: chatRoomId.toString(), initiatorId: maskId(auth.userId), targetUserId: maskId(targetUserId) },
    'kick vote started',
  );

  res.status(201).json({
    ok: true,
    chatRoomId: chatRoomId.toString(),
    targetUserId: targetUserId.toString(),
    expiresAt: expiresAt.toISOString(),
    voterCount: activeMembers.length,
  });
}

// ============================================================
// PATCH /community/chat-rooms/:chatRoomId/kick/vote/:voteNotifId
// body: { vote: 'agree' | 'reject' }
// GG-MATE-019~020: 응답 기록. 전원(대상 제외) agree → 즉시 kicked.
// 미응답은 스케줄러(chat-scheduler.ts resolveExpiredKickVotes)가 agree로 처리.
// ============================================================
export async function castKickVote(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const chatRoomId = parseBigId(req.params.chatRoomId);
  const voteNotifId = parseBigId(req.params.voteNotifId);
  if (!chatRoomId || !voteNotifId) {
    res.status(400).json({ error: 'invalid chatRoomId or voteNotifId' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const vote = body.vote;
  if (vote !== 'agree' && vote !== 'reject') {
    res.status(400).json({ error: 'vote must be agree | reject' });
    return;
  }

  // 멤버십 검증
  const membership = await prisma.groupMembership.findFirst({
    where: { chatRoomId, userId: auth.userId, memberStatus: 'active' },
    select: { membershipId: true },
  });
  if (!membership) {
    res.status(403).json({ error: 'not_member' });
    return;
  }

  // 해당 kick_vote 알림 조회 — 내 알림이어야 하고 chatRoomId 일치
  const notif = await prisma.notification.findFirst({
    where: {
      notificationId: voteNotifId,
      userId: auth.userId,
      notificationType: 'kick_vote',
      relatedEntityId: chatRoomId,
      relatedEntityType: 'kick_vote',
    },
    select: { notificationId: true, message: true, readAt: true },
  });
  if (!notif) {
    res.status(404).json({ error: 'kick_vote_not_found' });
    return;
  }

  // [critical-fix] already_voted 판정: readAt 대신 message.voteResult 존재 여부로 판단.
  // readAt 은 알림센터 markAllRead 로 덮어쓰일 수 있으므로 투표 완료 마커로 쓰지 않는다.
  let notifMeta: Record<string, unknown> = {};
  try {
    notifMeta = JSON.parse(notif.message) as Record<string, unknown>;
  } catch {
    // corrupt JSON — 빈 객체로 진행
  }
  if (notifMeta.voteResult !== undefined) {
    res.status(409).json({ error: 'already_voted' });
    return;
  }

  // message JSON 에서 targetUserId 파싱
  let targetUserId: bigint | null = null;
  let expiresAt: Date | null = null;
  try {
    const meta = JSON.parse(notif.message) as { targetUserId?: string; expiresAt?: string };
    targetUserId = meta.targetUserId ? parseBigId(meta.targetUserId) : null;
    expiresAt = meta.expiresAt ? new Date(meta.expiresAt) : null;
  } catch {
    res.status(500).json({ error: 'vote_meta_corrupt' });
    return;
  }

  if (!targetUserId) {
    res.status(500).json({ error: 'vote_meta_missing_target' });
    return;
  }

  // 만료 확인
  if (expiresAt && expiresAt <= new Date()) {
    res.status(410).json({ error: 'kick_vote_expired' });
    return;
  }

  const now = new Date();

  // [critical-fix] 내 응답 기록: voteResult 만 message JSON 에 병합. readAt 은 건드리지 않는다.
  // readAt 은 알림센터 전용(읽음 표시)이며 투표 완료 마커로 dual-use 하지 않는다.
  await prisma.notification.update({
    where: { notificationId: voteNotifId },
    data: {
      message: JSON.stringify({ ...notifMeta, voteResult: vote }),
    },
  });

  let kicked = false;

  // 강퇴 조건: 전원(대상 제외) 응답 완료 AND 모두 agree
  // vote === 'reject' 이면 전원 agree 불가 → 즉시 skip
  if (vote === 'agree') {
    // 같은 투표 건에 대한 모든 알림 조회 (message 에 voteResult 포함)
    const allVoteNotifs = await prisma.notification.findMany({
      where: {
        notificationType: 'kick_vote',
        relatedEntityId: chatRoomId,
        relatedEntityType: 'kick_vote',
        message: { contains: `"targetUserId":"${targetUserId.toString()}"` },
      },
      select: { notificationId: true, readAt: true, message: true },
    });

    // [critical-fix] 전원 응답 여부: readAt 대신 voteResult 존재 여부로 판정.
    // readAt 은 알림센터 markAllRead 로 덮어쓰일 수 있으므로 사용하지 않는다.
    const allResponded = allVoteNotifs.length > 0 && allVoteNotifs.every((n) => {
      try {
        const m = JSON.parse(n.message) as { voteResult?: string };
        return m.voteResult !== undefined;
      } catch {
        return false;
      }
    });
    // 전원 agree 여부: message 의 voteResult 필드를 파싱
    const allAgree = allResponded && allVoteNotifs.every((n) => {
      try {
        const m = JSON.parse(n.message) as { voteResult?: string };
        return m.voteResult === 'agree';
      } catch {
        return false;
      }
    });

    if (allAgree) {
      // [medium-fix] 전원 동의 처리: SERIALIZABLE 트랜잭션으로 동시 요청 중복 처리 방지.
      // 트랜잭션 내에서 target 상태를 재확인해 이미 kicked 라면 chatRoomMessage/notification 생성 skip.
      await prisma.$transaction(async (tx) => {
        // 대상 멤버십 재확인 (SERIALIZABLE 격리로 동시 트랜잭션과 직렬화)
        const target = await tx.groupMembership.findFirst({
          where: { chatRoomId, userId: targetUserId!, memberStatus: 'active' },
          select: { membershipId: true },
        });
        if (!target) {
          // 이미 다른 트랜잭션이 처리함 → 중복 시스템 메시지/알림 생성 방지
          return;
        }

        await tx.groupMembership.update({
          where: { membershipId: target.membershipId },
          data: { memberStatus: 'kicked', leftAt: now },
        });

        await tx.chatRoomMessage.create({
          data: {
            chatRoomId,
            senderUserId: null,
            messageType: 'system',
            body: '강퇴 투표가 가결되었습니다',
          },
        });

        // 결원 충원 알림 — vacancy_notification 타입으로 방 안 남은 멤버에게 전송
        const remainingMembers = await tx.groupMembership.findMany({
          where: { chatRoomId, memberStatus: 'active' },
          select: { userId: true },
        });
        if (remainingMembers.length > 0) {
          await tx.notification.createMany({
            data: remainingMembers.map((m) => ({
              userId: m.userId,
              title: '강퇴 투표가 가결되었습니다',
              message: '투표 결과 멤버가 강퇴되었습니다.',
              scheduledAt: now,
              isSent: true,
              sentAt: now,
              notificationType: 'vacancy_notification',
              relatedEntityId: chatRoomId,
              relatedEntityType: 'chat_room',
            })),
          });
        }
      }, { isolationLevel: 'Serializable' });
      kicked = true;

      // [medium-fix] 투표강퇴 완료 시 실시간 멤버 목록 갱신 (instantKick 과 동일한 패턴)
      try {
        const io = getSocketServer();
        const updatedMembers = await prisma.groupMembership.findMany({
          where: { chatRoomId, memberStatus: 'active' },
          select: { userId: true, role: true, user: { select: { nickname: true } } },
        });
        io.to(`room:${chatRoomId.toString()}`).emit('room:member_update', {
          members: updatedMembers.map((m) => ({
            userId: m.userId.toString(),
            nickname: m.user.nickname,
            role: m.role,
          })),
        });
      } catch {
        // Socket.IO 미초기화 — 무시
      }
    }
  }

  logger.info(
    { action: 'kick_vote_cast', chatRoomId: chatRoomId.toString(), voterId: maskId(auth.userId), vote, kicked },
    'kick vote cast',
  );

  res.status(200).json({ ok: true, vote, kicked });
}
