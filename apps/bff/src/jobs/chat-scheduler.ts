/**
 * chat-scheduler.ts — 채팅 타임아웃 백그라운드 워커 (ADR 0007 결정10).
 *
 * 타임아웃 정책:
 *   - 1:1 신청: 24h 후 expired
 *   - 그룹 초대: 6h 후 expired
 *   - 강퇴 투표: 36h 미응답 시 동의로 간주 → 전원 동의 시 kick
 *   - 약속 제안: 36h 후 rejected 자동
 *   - 미접속 멤버: 48h 후 kicked
 *
 * WARNING: ChatSession(LLM 검색)과 완전 별개. prisma.chatMessage 사용 금지.
 *
 * 설계 원칙:
 *   - 각 핸들러는 now 파라미터를 받는 순수 함수로 분리 (테스트/eval 직접 호출 가능).
 *   - wrapHandler: 개별 잡 실패가 interval을 멈추거나 다른 잡에 전파되지 않음.
 *   - startChatScheduler(): NODE_ENV=test 시 early-return.
 *   - server.ts 에서 직접 호출 (startScheduler() 와 독립).
 */

import { logger } from '../logger.js';
import { env } from '../env.js';
import { prisma } from '../prisma.js';
import { getSocketServer } from '../lib/socket-server.js';

// ─── 폴링 간격 ───────────────────────────────────────────────
const MATCH_EXPIRE_INTERVAL  = 10 * 60 * 1000;  // 10분
const VOTE_EXPIRE_INTERVAL   = 10 * 60 * 1000;  // 10분
const INACTIVITY_INTERVAL    = 30 * 60 * 1000;  // 30분
const APPT_EXPIRE_INTERVAL   = 10 * 60 * 1000;  // 10분

// ─── 타임아웃 상수 ───────────────────────────────────────────
const INACTIVITY_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48h

// ─── 결과 타입 ───────────────────────────────────────────────
export interface ExpireMatchResult {
  expired: number;
}

export interface ResolveKickResult {
  processed: number;
  kicked: number;
}

export interface ExpireAppointmentResult {
  expired: number;
}

export interface InactivityKickResult {
  kicked: number;
}

// ============================================================
// expireMatchRequests — pending AND expiresAt < now → expired
// ============================================================
export async function expireMatchRequests(now: Date = new Date()): Promise<ExpireMatchResult> {
  const expired = await prisma.matchRequest.findMany({
    where: {
      status: 'pending',
      expiresAt: { lt: now },
    },
    select: {
      matchRequestId: true,
      requesterId: true,
      requestType: true,
    },
  });

  if (expired.length === 0) return { expired: 0 };

  const ids = expired.map((r) => r.matchRequestId);

  // 상태를 expired 로 일괄 갱신
  await prisma.matchRequest.updateMany({
    where: { matchRequestId: { in: ids } },
    data: { status: 'expired' },
  });

  // requester 에게 만료 알림 일괄 생성
  await prisma.notification.createMany({
    data: expired.map((r) => ({
      userId: r.requesterId,
      title: '채팅 신청이 만료되었습니다',
      message: r.requestType === '1:1'
        ? '상대방이 응답하지 않아 채팅 신청이 만료되었습니다.'
        : '그룹 채팅 신청이 만료되었습니다.',
      scheduledAt: now,
      isSent: true,
      sentAt: now,
      notificationType: 'match_request',
      relatedEntityId: r.matchRequestId,
      relatedEntityType: 'match_request',
    })),
    skipDuplicates: true,
  });

  // 실시간 알림 (fire-and-forget)
  try {
    const io = getSocketServer();
    for (const r of expired) {
      io.to(`user:${r.requesterId.toString()}`).emit('notification', {
        notificationType: 'match_request',
        title: '채팅 신청이 만료되었습니다',
      });
    }
  } catch {
    // Socket.IO 미초기화 — 무시
  }

  logger.info({ action: 'expire_match_requests', count: expired.length }, 'match requests expired');
  return { expired: expired.length };
}

// ============================================================
// resolveExpiredKickVotes — expiresAt 경과된 kick_vote 알림 처리.
// 미응답자를 agree 로 간주 → 전원 agree 이면 kicked 처리.
// ============================================================
export async function resolveExpiredKickVotes(now: Date = new Date()): Promise<ResolveKickResult> {
  // kick_vote 알림 전체 조회 (voteResult 없는 것이 남아 있을 수 있는 알림)
  // 처리 완료된 라운드(전원 voteResult 기록됨)는 skip.
  const pendingVoteNotifs = await prisma.notification.findMany({
    where: {
      notificationType: 'kick_vote',
      relatedEntityType: 'kick_vote',
    },
    select: {
      notificationId: true,
      relatedEntityId: true,
      message: true,
    },
  });

  // chatRoomId + targetUserId 로 라운드 그룹핑
  const roundMap = new Map<string, {
    chatRoomId: bigint;
    targetUserId: bigint;
    expiresAt: Date | null;
    notifs: Array<{ notificationId: bigint; message: string }>;
  }>();

  for (const n of pendingVoteNotifs) {
    let meta: { targetUserId?: string; expiresAt?: string; voteResult?: string } = {};
    try {
      meta = JSON.parse(n.message) as typeof meta;
    } catch {
      continue; // corrupt JSON — skip
    }

    const chatRoomId = n.relatedEntityId;
    if (!chatRoomId) continue;

    const targetUserId = meta.targetUserId ? BigInt(meta.targetUserId) : null;
    if (!targetUserId) continue;

    const expiresAt = meta.expiresAt ? new Date(meta.expiresAt) : null;

    const key = `${chatRoomId.toString()}:${targetUserId.toString()}`;
    if (!roundMap.has(key)) {
      roundMap.set(key, { chatRoomId, targetUserId, expiresAt, notifs: [] });
    }
    roundMap.get(key)!.notifs.push({ notificationId: n.notificationId, message: n.message });
  }

  let processed = 0;
  let kicked = 0;

  for (const round of roundMap.values()) {
    const { chatRoomId, targetUserId, expiresAt, notifs } = round;

    // 아직 만료되지 않은 라운드는 skip
    if (!expiresAt || expiresAt > now) continue;

    // 이미 전원 응답 완료된 라운드는 skip (스케줄러가 재처리할 필요 없음)
    const allAlreadyVoted = notifs.every((n) => {
      try {
        const m = JSON.parse(n.message) as { voteResult?: string };
        return m.voteResult !== undefined;
      } catch {
        return false;
      }
    });
    if (allAlreadyVoted) continue;

    processed++;

    // 미응답 알림에 agree 를 기록
    for (const n of notifs) {
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(n.message) as Record<string, unknown>;
      } catch {
        meta = {};
      }
      if (meta.voteResult === undefined) {
        await prisma.notification.update({
          where: { notificationId: n.notificationId },
          data: { message: JSON.stringify({ ...meta, voteResult: 'agree' }) },
        });
      }
    }

    // 전원 agree 여부 재확인 (기존 응답 포함)
    const updatedNotifs = await prisma.notification.findMany({
      where: {
        notificationType: 'kick_vote',
        relatedEntityId: chatRoomId,
        relatedEntityType: 'kick_vote',
        message: { contains: `"targetUserId":"${targetUserId.toString()}"` },
      },
      select: { message: true },
    });

    const allAgree = updatedNotifs.length > 0 && updatedNotifs.every((n) => {
      try {
        const m = JSON.parse(n.message) as { voteResult?: string };
        return m.voteResult === 'agree';
      } catch {
        return false;
      }
    });

    if (!allAgree) continue;

    // 대상 멤버십 kicked 처리 (SERIALIZABLE 트랜잭션)
    try {
      await prisma.$transaction(async (tx) => {
        const target = await tx.groupMembership.findFirst({
          where: { chatRoomId, userId: targetUserId, memberStatus: 'active' },
          select: { membershipId: true },
        });
        if (!target) return; // 이미 처리됨

        await tx.groupMembership.update({
          where: { membershipId: target.membershipId },
          data: { memberStatus: 'kicked', leftAt: now },
        });

        await tx.chatRoomMessage.create({
          data: {
            chatRoomId,
            senderUserId: null,
            messageType: 'system',
            body: '강퇴 투표가 가결되었습니다 (시간 초과)',
          },
        });

        // vacancy_notification — 남은 active 멤버에게
        const remainingMembers = await tx.groupMembership.findMany({
          where: { chatRoomId, memberStatus: 'active' },
          select: { userId: true },
        });
        if (remainingMembers.length > 0) {
          await tx.notification.createMany({
            data: remainingMembers.map((m) => ({
              userId: m.userId,
              title: '강퇴 투표가 가결되었습니다',
              message: '투표 시간이 만료되어 멤버가 강퇴되었습니다.',
              scheduledAt: now,
              isSent: true,
              sentAt: now,
              notificationType: 'vacancy_notification',
              relatedEntityId: chatRoomId,
              relatedEntityType: 'chat_room',
            })),
          });
        }
      });
      kicked++;
    } catch (err) {
      logger.warn({ err, chatRoomId: chatRoomId.toString(), targetUserId: targetUserId.toString() }, 'kick vote resolve error');
    }
  }

  if (processed > 0) {
    logger.info({ action: 'resolve_expired_kick_votes', processed, kicked }, 'expired kick votes resolved');
  }
  return { processed, kicked };
}

// ============================================================
// expireAppointments — proposed|counter_proposed AND expiresAt < now → rejected
// ============================================================
export async function expireAppointments(now: Date = new Date()): Promise<ExpireAppointmentResult> {
  const expiredAppts = await prisma.appointment.findMany({
    where: {
      status: { in: ['proposed', 'counter_proposed'] },
      expiresAt: { lt: now },
    },
    select: {
      appointmentId: true,
      chatRoomId: true,
    },
  });

  if (expiredAppts.length === 0) return { expired: 0 };

  const apptIds = expiredAppts.map((a) => a.appointmentId);

  await prisma.appointment.updateMany({
    where: { appointmentId: { in: apptIds } },
    data: { status: 'rejected' },
  });

  // 각 채팅방 참여자에게 알림
  for (const appt of expiredAppts) {
    const members = await prisma.groupMembership.findMany({
      where: { chatRoomId: appt.chatRoomId, memberStatus: 'active' },
      select: { userId: true },
    });

    if (members.length > 0) {
      await prisma.notification.createMany({
        data: members.map((m) => ({
          userId: m.userId,
          title: '약속 제안이 만료되었습니다',
          message: '응답 기한이 지나 약속 제안이 자동으로 거절되었습니다.',
          scheduledAt: now,
          isSent: true,
          sentAt: now,
          notificationType: 'appointment_update',
          relatedEntityId: appt.appointmentId,
          relatedEntityType: 'appointment',
        })),
        skipDuplicates: true,
      });
    }
  }

  logger.info({ action: 'expire_appointments', count: expiredAppts.length }, 'appointments expired');
  return { expired: expiredAppts.length };
}

// ============================================================
// handleInactiveMembers — active AND lastSeenAt < now-48h → kicked + vacancy_notification
// ============================================================
export async function handleInactiveMembers(now: Date = new Date()): Promise<InactivityKickResult> {
  const threshold = new Date(now.getTime() - INACTIVITY_THRESHOLD_MS);

  // lastSeenAt 이 threshold 보다 오래된 active 멤버 (그룹방 active)
  const inactiveMembers = await prisma.groupMembership.findMany({
    where: {
      memberStatus: 'active',
      lastSeenAt: { lt: threshold },
      chatRoom: { status: 'active', roomType: 'group' },
    },
    select: {
      membershipId: true,
      userId: true,
      chatRoomId: true,
    },
  });

  if (inactiveMembers.length === 0) return { kicked: 0 };

  let kicked = 0;

  for (const member of inactiveMembers) {
    try {
      await prisma.$transaction(async (tx) => {
        // 재확인 (동시 처리 방지)
        const current = await tx.groupMembership.findUnique({
          where: { membershipId: member.membershipId },
          select: { memberStatus: true, lastSeenAt: true },
        });
        if (!current || current.memberStatus !== 'active') return;
        if (current.lastSeenAt && current.lastSeenAt >= threshold) return; // 재접속 했음

        await tx.groupMembership.update({
          where: { membershipId: member.membershipId },
          data: { memberStatus: 'kicked', leftAt: now },
        });

        await tx.chatRoomMessage.create({
          data: {
            chatRoomId: member.chatRoomId,
            senderUserId: null,
            messageType: 'system',
            body: '장기 미접속으로 멤버가 퇴장되었습니다',
          },
        });

        // vacancy_notification — 남은 active 멤버에게
        const remainingMembers = await tx.groupMembership.findMany({
          where: { chatRoomId: member.chatRoomId, memberStatus: 'active', userId: { not: member.userId } },
          select: { userId: true },
        });
        if (remainingMembers.length > 0) {
          await tx.notification.createMany({
            data: remainingMembers.map((m) => ({
              userId: m.userId,
              title: '멤버가 장기 미접속으로 퇴장되었습니다',
              message: '채팅방에 자리가 생겼습니다.',
              scheduledAt: now,
              isSent: true,
              sentAt: now,
              notificationType: 'vacancy_notification',
              relatedEntityId: member.chatRoomId,
              relatedEntityType: 'chat_room',
            })),
          });
        }
        kicked++;
      });
    } catch (err) {
      logger.warn({ err, membershipId: member.membershipId.toString() }, 'inactivity kick error');
    }
  }

  if (kicked > 0) {
    logger.info({ action: 'handle_inactive_members', kicked }, 'inactive members kicked');
  }
  return { kicked };
}

// ─── wrapHandler ─────────────────────────────────────────────
// 핸들러 오류가 interval 을 멈추거나 다른 잡에 전파되지 않도록 보호.
function wrapHandler(fn: () => Promise<void>): () => void {
  return () => {
    fn().catch((err: unknown) => logger.error({ err }, 'chat scheduler error'));
  };
}

// ─── startChatScheduler ──────────────────────────────────────
export function startChatScheduler(): void {
  if (env.NODE_ENV === 'test') return;

  setInterval(wrapHandler(() => expireMatchRequests().then(() => {})), MATCH_EXPIRE_INTERVAL);
  setInterval(wrapHandler(() => resolveExpiredKickVotes().then(() => {})), VOTE_EXPIRE_INTERVAL);
  setInterval(wrapHandler(() => expireAppointments().then(() => {})), APPT_EXPIRE_INTERVAL);
  setInterval(wrapHandler(() => handleInactiveMembers().then(() => {})), INACTIVITY_INTERVAL);

  logger.info(
    {
      matchExpireEveryMs: MATCH_EXPIRE_INTERVAL,
      voteExpireEveryMs: VOTE_EXPIRE_INTERVAL,
      apptExpireEveryMs: APPT_EXPIRE_INTERVAL,
      inactivityEveryMs: INACTIVITY_INTERVAL,
    },
    'chat scheduler started',
  );
}
