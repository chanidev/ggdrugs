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

  res.status(200).json({
    items: memberships.map((m) => ({
      chatRoomId: m.chatRoom.chatRoomId.toString(),
      roomType: m.chatRoom.roomType,
      status: m.chatRoom.status,
      maxMembers: m.chatRoom.maxMembers,
      eventId: m.chatRoom.eventId?.toString() ?? null,
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

  // 이벤트 존재 + approved 확인
  const event = await prisma.event.findFirst({
    where: { eventId, approvalStatus: 'approved', isDeleted: false },
    select: { eventId: true },
  });
  if (!event) {
    res.status(404).json({ error: 'event_not_found' });
    return;
  }

  const updated = await prisma.chatRoom.update({
    where: { chatRoomId },
    data: { eventId },
    select: { chatRoomId: true, eventId: true, updatedAt: true },
  });

  logger.info(
    { action: 'chat_room_event_select', chatRoomId: chatRoomId.toString(), eventId: eventId.toString(), userId: maskId(auth.userId) },
    'chat room event selected',
  );

  res.status(200).json({
    chatRoomId: updated.chatRoomId.toString(),
    eventId: updated.eventId?.toString() ?? null,
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

    // 시스템 메시지
    await tx.chatRoomMessage.create({
      data: {
        chatRoomId,
        senderUserId: null,
        messageType: 'system',
        body: '약속이 제안되었습니다',
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
  let apptOut: Record<string, unknown>;

  await prisma.$transaction(async (tx) => {
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
        finalStatus = 'confirmed';
        await tx.appointment.update({
          where: { appointmentId },
          data: { status: 'confirmed' },
        });

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
      finalStatus = 'rejected';
      await tx.appointment.update({
        where: { appointmentId },
        data: { status: 'rejected' },
      });

      await tx.chatRoomMessage.create({
        data: {
          chatRoomId,
          senderUserId: null,
          messageType: 'system',
          body: '약속이 거절되었습니다',
        },
      });
    } else if (vote === 'counter') {
      finalStatus = 'counter_proposed';
      await tx.appointment.update({
        where: { appointmentId },
        data: { status: 'counter_proposed' },
      });

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
    }
  });

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

  await prisma.$transaction(async (tx) => {
    // 내 멤버십 left 처리
    await tx.groupMembership.update({
      where: { membershipId: membership.membershipId },
      data: { memberStatus: 'left', leftAt: now },
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
