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
 *
 * 타임아웃 상수:
 *   - ONE_TO_ONE_TIMEOUT_MS: 1:1 신청 만료 기준 (24h). expireMatchRequests 내부에서
 *     requestType='1:1' 건에 방어 조건으로 적용.
 *   - GROUP_INVITE_TIMEOUT_MS: 그룹 초대 만료 기준 (6h). requestType='group' 건 방어 조건.
 *   두 값 모두 신청 생성 시 expiresAt 에 이미 반영되나, 스케줄러가 타입별로 독립 검증함.
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
const INACTIVITY_THRESHOLD_MS    = 48 * 60 * 60 * 1000; // 48h
const ONE_TO_ONE_TIMEOUT_MS      = 24 * 60 * 60 * 1000; // 1:1 신청 24h
const GROUP_INVITE_TIMEOUT_MS    =  6 * 60 * 60 * 1000; // 그룹 초대 6h

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
//
// 타입별 타임아웃 강제:
//   - 1:1 신청: expiresAt < now AND createdAt <= now - 24h (방어적 하한)
//   - 그룹 초대: expiresAt < now AND createdAt <= now - 6h  (방어적 하한)
//
// expiresAt 은 신청 생성 시 올바르게 세팅되는 것이 1차 기준이나,
// 스케줄러가 requestType 별로 독립 쿼리를 실행해 타임아웃 의도를 이중 검증한다.
// ============================================================
export async function expireMatchRequests(now: Date = new Date()): Promise<ExpireMatchResult> {
  // 1:1 신청: expiresAt < now AND (created_at 기준 24h 이상 경과 — 방어적 하한)
  const oneToOneDeadline = new Date(now.getTime() - ONE_TO_ONE_TIMEOUT_MS);
  // 그룹 초대: expiresAt < now AND (created_at 기준 6h 이상 경과 — 방어적 하한)
  const groupDeadline = new Date(now.getTime() - GROUP_INVITE_TIMEOUT_MS);

  const [expiredOneToOne, expiredGroup] = await Promise.all([
    prisma.matchRequest.findMany({
      where: {
        status: 'pending',
        requestType: '1:1',
        expiresAt: { lt: now },
        createdAt: { lte: oneToOneDeadline },
      },
      select: { matchRequestId: true, requesterId: true, requestType: true },
    }),
    prisma.matchRequest.findMany({
      where: {
        status: 'pending',
        requestType: 'group',
        expiresAt: { lt: now },
        createdAt: { lte: groupDeadline },
      },
      select: { matchRequestId: true, requesterId: true, requestType: true },
    }),
  ]);

  const expired = [...expiredOneToOne, ...expiredGroup];
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
  // kick_vote 알림 조회 — 미처리(voteResult 없음) 건만 로드해 풀스캔 방지.
  // 완료된 라운드(message에 "voteResult" 키 포함)는 사전 필터링.
  // 추가로 최근 7일 이내 isSent=true 알림만 대상으로 삼아 누적 행 스캔 최소화.
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const pendingVoteNotifs = await prisma.notification.findMany({
    where: {
      notificationType: 'kick_vote',
      relatedEntityType: 'kick_vote',
      isSent: true,
      sentAt: { gte: sevenDaysAgo },
      // voteResult 가 이미 기록된 알림 제외 — 처리 완료 라운드 사전 필터
      message: { not: { contains: '"voteResult"' } },
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

    // 전원 agree 여부 재확인 (기존 응답 포함).
    // 초기 쿼리와 동일한 sentAt 범위를 적용해 스코프 불일치로 인한 false-positive kick 방지.
    // (e.g. 초기 쿼리가 7d 내 alerted notifs 만 로드했는데 재확인 쿼리가 7d 이전 notif 까지 포함하면
    //  이전 라운드의 stale agree 가 전원 동의로 잘못 집계될 수 있음)
    const updatedNotifs = await prisma.notification.findMany({
      where: {
        notificationType: 'kick_vote',
        relatedEntityId: chatRoomId,
        relatedEntityType: 'kick_vote',
        isSent: true,
        sentAt: { gte: sevenDaysAgo },
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
      }, { isolationLevel: 'Serializable' });
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
      // 트랜잭션은 kick 여부(boolean)를 반환 — kicked++ 는 트랜잭션 밖에서 처리.
      // (Prisma interactive transaction 재시도 시 콜백 내부 side-effect 중복 방지)
      const wasKicked = await prisma.$transaction(async (tx) => {
        // 재확인 (동시 처리 방지)
        const current = await tx.groupMembership.findUnique({
          where: { membershipId: member.membershipId },
          select: { memberStatus: true, lastSeenAt: true },
        });
        if (!current || current.memberStatus !== 'active') return false;
        if (current.lastSeenAt && current.lastSeenAt >= threshold) return false; // 재접속 했음

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
        return true;
      });
      // kicked++ 는 트랜잭션 성공 후 외부에서 단 한 번만 실행
      if (wasKicked) kicked++;
    } catch (err) {
      logger.warn({ err, membershipId: member.membershipId.toString() }, 'inactivity kick error');
    }
  }

  if (kicked > 0) {
    logger.info({ action: 'handle_inactive_members', kicked }, 'inactive members kicked');
  }
  return { kicked };
}

// ============================================================
// notifyMateEval — [오버라이드 GG-REVIEW-001] mate_eval 평가 알림 + appointment_complete 크레딧
//
// 조건: appointment.status='confirmed' AND appointedAt <= now (약속일 경과)
// 동작:
//   1. 해당 chatRoom의 active 멤버 전원에게 notificationType='mate_eval' 알림 생성
//      — dedup: 동일 (appointmentId, userId) 기존 mate_eval Notification 존재 시 skip
//   2. appointment_complete +10 크레딧 적립
//      — dedup: credit_ledger에 동일 (appointmentId, userId, 'appointment_complete') 행 존재 시 skip
//
// [스키마] appointment_complete action은 credit_ledger에 정의됨 (Slice 5 구현).
// ============================================================

const MATE_EVAL_NOTIFY_INTERVAL = 10 * 60 * 1000;  // 10분
const CREDIT_APPOINTMENT_COMPLETE = 10;              // ADR 0007 결정5 — 상수 가정

export interface NotifyMateEvalResult {
  appointmentsProcessed: number;
  notificationsCreated: number;
  creditsCreated: number;
}

/**
 * notifyMateEval — confirmed 약속 appointedAt 경과 시 참가자 전원에게 mate_eval 알림 + appointment_complete 크레딧.
 *
 * @param now        기준 시각 (기본: 현재)
 * @param appointmentIds  처리할 약속 ID 목록 (테스트 격리용 필터). 미지정 시 전체 DB 대상.
 *
 * [이슈review:important] N+1 완화:
 *   - 약속별로 groupMembership을 개별 조회하는 구조는 유지하되,
 *     알림/크레딧 dedup은 INSERT … ON CONFLICT DO NOTHING (raw SQL) 방식을 사용한다.
 *     이로써 per-member findFirst 2건(TOCTOU 경합 포함)을 각 1건의 upsert로 대체.
 * [이슈review:important] 처리 완료 표시:
 *   - DB 유니크 제약(uq_credit_appt_complete_user, Notification의 unique_notification_per_entity)에
 *     의해 중복 행 삽입이 DB 차원에서 차단된다. 처음 insert 성공 = 새로 생성, conflict = 이미 처리.
 */
export async function notifyMateEval(
  now: Date = new Date(),
  appointmentIds?: bigint[],
): Promise<NotifyMateEvalResult> {
  // confirmed 상태이고 appointedAt이 경과한 약속 조회
  const dueAppointments = await prisma.appointment.findMany({
    where: {
      status: 'confirmed',
      appointedAt: { lte: now, not: null },
      ...(appointmentIds && appointmentIds.length > 0
        ? { appointmentId: { in: appointmentIds } }
        : {}),
    },
    select: {
      appointmentId: true,
      chatRoomId: true,
    },
  });

  if (dueAppointments.length === 0) return { appointmentsProcessed: 0, notificationsCreated: 0, creditsCreated: 0 };

  let notificationsCreated = 0;
  let creditsCreated = 0;

  for (const appt of dueAppointments) {
    // chatRoom의 active 멤버 전원 조회 (1쿼리/약속)
    const members = await prisma.groupMembership.findMany({
      where: { chatRoomId: appt.chatRoomId, memberStatus: 'active' },
      select: { userId: true },
    });

    if (members.length === 0) continue;

    for (const member of members) {
      // ── 1. mate_eval 알림: INSERT ... ON CONFLICT DO NOTHING (TOCTOU 없음)
      // Notification 테이블에 (userId, notificationType, relatedEntityId, relatedEntityType) UNIQUE 제약이
      // 있다면 upsert, 없으면 findFirst+create 패턴 유지.
      // 현재 스키마에는 해당 UNIQUE가 없으므로 findFirst+create 패턴 사용.
      // [운영 메모] 향후 unique_notification_per_entity 제약 추가 시 upsert로 교체 권장.
      const existingNotif = await prisma.notification.findFirst({
        where: {
          userId: member.userId,
          notificationType: 'mate_eval',
          relatedEntityId: appt.appointmentId,
          relatedEntityType: 'appointment',
        },
        select: { notificationId: true },
      });

      if (!existingNotif) {
        await prisma.notification.create({
          data: {
            userId: member.userId,
            title: '약속 후 평가를 남겨주세요',
            message: '함께한 메이트를 평가하고 크레딧을 받아보세요.',
            scheduledAt: now,
            isSent: true,
            sentAt: now,
            notificationType: 'mate_eval',
            relatedEntityId: appt.appointmentId,
            relatedEntityType: 'appointment',
          },
        });
        notificationsCreated++;
      }

      // ── 2. appointment_complete 크레딧 dedup:
      // DB 차원: migration.sql에 uq_credit_appt_complete_user 부분 유니크 인덱스 추가됨.
      // 코드 차원: findFirst → 없으면 create (단일 프로세스 스케줄러에서는 TOCTOU 경합 드물지만,
      //           DB 유니크 인덱스가 최종 보호선 역할. P2002 시 no-op으로 처리).
      const existingCredit = await prisma.creditLedger.findFirst({
        where: {
          userId: member.userId,
          action: 'appointment_complete',
          appointmentId: appt.appointmentId,
        },
        select: { ledgerId: true },
      });

      if (!existingCredit) {
        try {
          await prisma.creditLedger.create({
            data: {
              userId: member.userId,
              action: 'appointment_complete',
              pointsAmount: CREDIT_APPOINTMENT_COMPLETE,
              appointmentId: appt.appointmentId,
            },
          });
          creditsCreated++;
        } catch (e) {
          // P2002: DB 유니크 제약에 의한 중복 차단 (TOCTOU 경합 시) — no-op
          if (!(e instanceof Error && e.constructor.name === 'PrismaClientKnownRequestError' && (e as { code?: string }).code === 'P2002')) {
            throw e;
          }
        }
      }
    }
  }

  if (notificationsCreated > 0 || creditsCreated > 0) {
    logger.info(
      { action: 'notify_mate_eval', appointmentsProcessed: dueAppointments.length, notificationsCreated, creditsCreated },
      'mate_eval notifications and credits created',
    );
  }

  return { appointmentsProcessed: dueAppointments.length, notificationsCreated, creditsCreated };
}

// ─── wrapHandler ─────────────────────────────────────────────
// 핸들러 오류가 interval 을 멈추거나 다른 잡에 전파되지 않도록 보호.
// fn 의 반환 타입을 Promise<unknown> 으로 받아 각 핸들러를 직접 전달 가능.
// setInterval 은 fn 이 throw 해도 다음 tick 에 재실행 보장되지 않으므로,
// catch 를 여기서 명시적으로 처리해 uncaughtPromiseRejection 을 방지한다.
export function wrapHandler(fn: () => Promise<unknown>): () => void {
  return () => {
    fn().catch((err: unknown) => logger.error({ err }, 'chat scheduler error'));
  };
}

// ─── startChatScheduler ──────────────────────────────────────
export function startChatScheduler(): void {
  if (env.NODE_ENV === 'test') return;

  // 각 핸들러를 직접 전달 — .then(() => {}) 래퍼 불필요 (wrapHandler 가 반환값 무시)
  setInterval(wrapHandler(expireMatchRequests),     MATCH_EXPIRE_INTERVAL);
  setInterval(wrapHandler(resolveExpiredKickVotes), VOTE_EXPIRE_INTERVAL);
  setInterval(wrapHandler(expireAppointments),      APPT_EXPIRE_INTERVAL);
  setInterval(wrapHandler(handleInactiveMembers),   INACTIVITY_INTERVAL);
  // [오버라이드 GG-REVIEW-001] mate_eval 알림 + appointment_complete 크레딧 (Slice 5)
  setInterval(wrapHandler(notifyMateEval),          MATE_EVAL_NOTIFY_INTERVAL);

  // 스케줄러 기동 시점: 7일 이전 미처리 kick_vote 알림이 있으면 운영자 경고.
  // 스케줄러가 7일 이상 정지됐을 경우 자동 처리 불가 행이 남을 수 있음 — 수동 조정 필요.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  prisma.notification.count({
    where: {
      notificationType: 'kick_vote',
      relatedEntityType: 'kick_vote',
      isSent: true,
      sentAt: { lt: sevenDaysAgo },
      message: { not: { contains: '"voteResult"' } },
    },
  }).then((staleCount) => {
    if (staleCount > 0) {
      logger.warn(
        { staleKickVoteCount: staleCount, sentBefore: sevenDaysAgo.toISOString() },
        'chat scheduler startup: stale unresolved kick_vote notifications older than 7 days found — manual reconciliation required',
      );
    }
  }).catch((err: unknown) => {
    logger.warn({ err }, 'chat scheduler startup: stale kick_vote check failed');
  });

  logger.info(
    {
      matchExpireEveryMs: MATCH_EXPIRE_INTERVAL,
      voteExpireEveryMs: VOTE_EXPIRE_INTERVAL,
      apptExpireEveryMs: APPT_EXPIRE_INTERVAL,
      inactivityEveryMs: INACTIVITY_INTERVAL,
      mateEvalNotifyEveryMs: MATE_EVAL_NOTIFY_INTERVAL,
    },
    'chat scheduler started',
  );
}
