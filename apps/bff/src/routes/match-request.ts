/**
 * match-request.ts — 1:1/그룹 신청 REST (A_803/A_804)
 *
 * 패턴: routes/mate.ts (requireAuth, 트랜잭션, 입력검증, audit 로그)
 *
 * WARNING: ChatSession / prisma.chatMessage 를 절대 사용하지 않는다.
 *          이 파일은 prisma.matchRequest / prisma.chatRoom* 만 사용한다.
 *
 * 엔드포인트:
 *   POST   /community/match/request/1-to-1          sendOneToOneRequest
 *   POST   /community/match/request/group            sendGroupRequest
 *   PATCH  /community/match/request/:matchRequestId/accept  acceptMatchRequest
 *   PATCH  /community/match/request/:matchRequestId/reject  rejectMatchRequest
 *   GET    /community/match/request/incoming         listIncomingRequests
 */

import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';
import { getSocketServer } from '../lib/socket-server.js';

// 만료 기간 상수
const ONE_TO_ONE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const GROUP_TTL_MS = 6 * 60 * 60 * 1000;        // 6h

// BigInt 형식의 userId는 불투명한 숫자 식별자이므로 PII(이메일·전화번호·주민번호) 가 아니다.
// 따라서 audit 로그에 userId 를 그대로 기록한다 (mate.ts 의 gender/nationality/ageRangeLower
// 마스킹 패턴은 실제 개인식별정보에만 적용). 이 결정은 CLAUDE.md §6 ③ 항목 근거.
function maskUserId(id: bigint | string): string {
  const s = String(id);
  // 마지막 4자리만 남기고 앞자리를 * 로 치환 — audit trail 보존 + 원본 완전노출 방지
  return s.length > 4 ? '*'.repeat(s.length - 4) + s.slice(-4) : '****';
}

function parseBigId(raw: unknown): bigint | null {
  const s = typeof raw === 'string' ? raw : '';
  try {
    const n = BigInt(s);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

// ============================================================
// POST /community/match/request/1-to-1  (A_803)
// body: { receiverUserId: string }
// 가드: 본인→본인 불가, pending 중복 409, MateProfile 없음 422, 차단 409
// ============================================================
export async function sendOneToOneRequest(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const receiverUserId = parseBigId(body.receiverUserId);
  if (!receiverUserId) {
    res.status(400).json({ error: 'receiverUserId must be a valid id string' });
    return;
  }

  // 자기 자신에게 신청 불가
  if (receiverUserId === auth.userId) {
    res.status(400).json({ error: 'cannot send request to yourself' });
    return;
  }

  // MateProfile 존재 확인 (본인)
  const myProfile = await prisma.mateProfile.findUnique({
    where: { userId: auth.userId },
    select: { mateProfileId: true, isDeleted: true },
  });
  if (!myProfile || myProfile.isDeleted) {
    res.status(422).json({ error: 'profile_required' });
    return;
  }

  // GG-REPORT-009: 이용정지 대상자에게 신청 불가
  const receiverUser = await prisma.user.findUnique({
    where: { userId: receiverUserId },
    select: { sanctionStatus: true, sanctionExpiresAt: true, isDeleted: true },
  });
  if (!receiverUser || receiverUser.isDeleted) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }
  const receiverCheckNow = new Date();
  // GG-REPORT-009: 유효한 이용정지(만료 전)인 수신자에게 신청 불가.
  // 컨벤션: actionAdminReport(admin-reports.ts)는 항상 non-null sanctionExpiresAt을 설정한다.
  // sanctionExpiresAt=null 은 "만료됨/정지 없음"을 의미하며, suspended + null = 정지 해제로 취급한다.
  // (ADR 0007 결정14: 이용정지는 항상 기간 지정 필수, 기간 미지정 정지는 actionAdminReport에서 400 반환)
  // 이 암묵적 가정은 getRecommendations(mate.ts), sendGroupRequest 와 통일된 패턴이다.
  // runSanctionExpirySweep이 아직 실행 전일 수 있으므로 앱 레이어에서도 만료 여부 확인.
  if (
    receiverUser.sanctionStatus === 'suspended' &&
    receiverUser.sanctionExpiresAt != null &&
    receiverUser.sanctionExpiresAt > receiverCheckNow
  ) {
    res.status(409).json({ error: 'target_suspended' });
    return;
  }

  // 차단 여부 확인 (양방향)
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: auth.userId, blockedUserId: receiverUserId },
        { blockerId: receiverUserId, blockedUserId: auth.userId },
      ],
    },
  });
  if (block) {
    res.status(409).json({ error: 'blocked' });
    return;
  }

  // pending 중복 확인 (방향 무관)
  const existing = await prisma.matchRequest.findFirst({
    where: {
      OR: [
        { requesterId: auth.userId, receiverId: receiverUserId },
        { requesterId: receiverUserId, receiverId: auth.userId },
      ],
      status: 'pending',
      expiresAt: { gt: new Date() },
      requestType: '1:1',
    },
  });
  if (existing) {
    res.status(409).json({ error: 'duplicate_pending' });
    return;
  }

  const expiresAt = new Date(Date.now() + ONE_TO_ONE_TTL_MS);

  const result = await prisma.$transaction(async (tx) => {
    const matchRequest = await tx.matchRequest.create({
      data: {
        requesterId: auth.userId,
        receiverId: receiverUserId,
        requestType: '1:1',
        status: 'pending',
        expiresAt,
      },
      select: { matchRequestId: true, expiresAt: true },
    });

    const notification = await tx.notification.create({
      data: {
        userId: receiverUserId,
        title: '채팅 신청이 왔어요',
        message: `${auth.nickname}님이 채팅을 신청했습니다.`,
        scheduledAt: new Date(),
        isSent: true,
        sentAt: new Date(),
        notificationType: 'match_request',
        relatedEntityId: matchRequest.matchRequestId,
        relatedEntityType: 'match_request',
      },
      select: { notificationId: true, title: true, notificationType: true },
    });

    return { matchRequest, notification };
  });

  // 실시간 알림 (fire-and-forget — socket 미연결이어도 안전)
  try {
    const io = getSocketServer();
    io.to(`user:${receiverUserId.toString()}`).emit('notification', {
      notificationId: result.notification.notificationId.toString(),
      notificationType: result.notification.notificationType,
      title: result.notification.title,
    });
  } catch {
    // Socket.IO 서버 미초기화 상태(eval/test 환경) — 무시
  }

  logger.info(
    { action: 'match_request_1to1', requesterId: maskUserId(auth.userId), receiverUserId: maskUserId(receiverUserId) },
    '1:1 match request sent',
  );

  res.status(201).json({
    matchRequestId: result.matchRequest.matchRequestId.toString(),
    expiresAt: result.matchRequest.expiresAt.toISOString(),
  });
}

// ============================================================
// POST /community/match/request/group  (A_804)
// body: { receiverUserIds: string[] }  (최대 3명)
// 가드: length ≤ 3, 각 대상 MateProfile.groupApply=true
// ============================================================
export async function sendGroupRequest(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawIds = body.receiverUserIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    res.status(400).json({ error: 'receiverUserIds must be a non-empty array' });
    return;
  }

  if (rawIds.length > 3) {
    res.status(422).json({ error: 'receiverUserIds.length must be ≤ 3' });
    return;
  }

  const receiverIds: bigint[] = [];
  for (const raw of rawIds) {
    const id = parseBigId(raw);
    if (!id) {
      res.status(400).json({ error: `invalid receiverUserId: ${String(raw)}` });
      return;
    }
    if (id === auth.userId) {
      res.status(400).json({ error: 'cannot send request to yourself' });
      return;
    }
    receiverIds.push(id);
  }

  // 중복 receiverId 감지 — 동일 대상에 MatchRequest 2건 생성 방지
  const uniqueIds = [...new Set(receiverIds.map(String))].map(BigInt);
  if (uniqueIds.length !== receiverIds.length) {
    res.status(400).json({ error: 'duplicate_receiver_ids' });
    return;
  }

  // GG-REPORT-009: 이용정지 대상자에게 그룹 신청 불가
  // 컨벤션: sanctionExpiresAt=null 은 "만료됨/정지 없음"으로 취급 (sendOneToOneRequest 와 동일).
  // actionAdminReport 는 항상 non-null expiresAt 을 설정 (ADR 0007 결정14).
  // 만료된 정지는 통과 허용 (getRecommendations / sendOneToOneRequest 패턴과 통일).
  const groupReceiverCheckNow = new Date();
  const receiverUsers = await prisma.user.findMany({
    where: { userId: { in: receiverIds } },
    select: { userId: true, sanctionStatus: true, sanctionExpiresAt: true, isDeleted: true },
  });
  for (const ru of receiverUsers) {
    if (ru.isDeleted) {
      res.status(404).json({ error: 'user_not_found', userId: ru.userId.toString() });
      return;
    }
    if (
      ru.sanctionStatus === 'suspended' &&
      ru.sanctionExpiresAt != null &&
      ru.sanctionExpiresAt > groupReceiverCheckNow
    ) {
      res.status(409).json({ error: 'target_suspended', userId: ru.userId.toString() });
      return;
    }
  }

  // 차단 여부 확인 (양방향, 전체 수신자 대상) — 1:1 경로와 동일 패턴
  const groupBlock = await prisma.block.findFirst({
    where: {
      OR: receiverIds.flatMap((id) => [
        { blockerId: auth.userId, blockedUserId: id },
        { blockerId: id, blockedUserId: auth.userId },
      ]),
    },
  });
  if (groupBlock) {
    res.status(409).json({ error: 'blocked' });
    return;
  }

  // MateProfile 본인 확인
  const myProfile = await prisma.mateProfile.findUnique({
    where: { userId: auth.userId },
    select: { mateProfileId: true, isDeleted: true },
  });
  if (!myProfile || myProfile.isDeleted) {
    res.status(422).json({ error: 'profile_required' });
    return;
  }

  // 각 수신자 groupApply 검증
  const receiverProfiles = await prisma.mateProfile.findMany({
    where: { userId: { in: receiverIds }, isDeleted: false },
    select: { userId: true, groupApply: true },
  });

  for (const receiverId of receiverIds) {
    const profile = receiverProfiles.find((p) => p.userId === receiverId);
    if (!profile || !profile.groupApply) {
      res.status(422).json({ error: 'group_apply_required', userId: receiverId.toString() });
      return;
    }
  }

  // 기존 그룹방 용량 초과 방지 (plan line 542: "기존 그룹방 현재멤버수+receiverUserIds.length ≤ 4")
  //
  // 의도: 요청자가 이미 active 그룹방에 속해 있을 때, 그 방에 추가 초대하면 4명 한도를 초과하는지 검증.
  //       기존 방이 없는 경우(신규 방 생성 경로)는 이 가드 대상이 아니다.
  //       신규 방에서는 receiverIds.length ≤ 3 (상단 rawIds.length > 3 가드)으로
  //       최대 요청자(1) + 3명 = 4명이 보장된다.
  //
  // findFirst: 요청자는 active 그룹방 1개만 속할 수 있다는 제약은 DB 레벨에는 없으므로,
  //            복수 방 가입 시 임의의 한 방만 검사한다. 이는 현재 비즈니스 규칙(1인 1그룹방)
  //            상에서 데이터 정합성이 유지되는 한 안전하다.
  const existingGroupMembership = await prisma.groupMembership.findFirst({
    where: {
      userId: auth.userId,
      memberStatus: 'active',
      chatRoom: { roomType: 'group', status: 'active' },
    },
    select: { chatRoomId: true },
  });

  if (existingGroupMembership) {
    const currentCount = await prisma.groupMembership.count({
      where: {
        chatRoomId: existingGroupMembership.chatRoomId,
        memberStatus: 'active',
      },
    });
    if (currentCount + receiverIds.length > 4) {
      res.status(422).json({ error: 'group_capacity_exceeded', currentCount, inviting: receiverIds.length });
      return;
    }
  }

  const expiresAt = new Date(Date.now() + GROUP_TTL_MS);

  const matchRequestIds = await prisma.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const receiverId of receiverIds) {
      const mr = await tx.matchRequest.create({
        data: {
          requesterId: auth.userId,
          receiverId,
          requestType: 'group',
          status: 'pending',
          expiresAt,
        },
        select: { matchRequestId: true },
      });
      ids.push(mr.matchRequestId.toString());

      await tx.notification.create({
        data: {
          userId: receiverId,
          title: '그룹 채팅 초대가 왔어요',
          message: `${auth.nickname}님이 그룹 채팅에 초대했습니다.`,
          scheduledAt: new Date(),
          isSent: true,
          sentAt: new Date(),
          notificationType: 'group_invite',
          relatedEntityId: mr.matchRequestId,
          relatedEntityType: 'match_request',
        },
      });
    }
    return ids;
  });

  // 실시간 알림 (fire-and-forget)
  try {
    const io = getSocketServer();
    for (const receiverId of receiverIds) {
      io.to(`user:${receiverId.toString()}`).emit('notification', {
        notificationType: 'group_invite',
        title: '그룹 채팅 초대가 왔어요',
      });
    }
  } catch {
    // Socket.IO 미초기화 — 무시
  }

  logger.info(
    { action: 'match_request_group', requesterId: maskUserId(auth.userId), receiverCount: receiverIds.length },
    'group match requests sent',
  );

  res.status(201).json({ matchRequestIds });
}

// ============================================================
// PATCH /community/match/request/:matchRequestId/accept
// 가드: 본인이 receiver, status='pending', expiresAt>now
// ============================================================
export async function acceptMatchRequest(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const matchRequestId = parseBigId(req.params.matchRequestId);
  if (!matchRequestId) {
    res.status(400).json({ error: 'invalid matchRequestId' });
    return;
  }

  const matchRequest = await prisma.matchRequest.findUnique({
    where: { matchRequestId },
    select: {
      matchRequestId: true,
      requesterId: true,
      receiverId: true,
      requestType: true,
      status: true,
      expiresAt: true,
    },
  });

  if (!matchRequest) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  if (matchRequest.receiverId !== auth.userId) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  if (matchRequest.status !== 'pending') {
    res.status(409).json({ error: 'not_pending', currentStatus: matchRequest.status });
    return;
  }

  if (matchRequest.expiresAt <= new Date()) {
    res.status(410).json({ error: 'expired' });
    return;
  }

  let chatRoomId: bigint;

  if (matchRequest.requestType === '1:1') {
    // 1:1 수락: ChatRoom(ownerUserId=null) + 2 GroupMembership(role=member) + 시스템 메시지 + Notification
    const result = await prisma.$transaction(async (tx) => {
      const room = await tx.chatRoom.create({
        data: {
          roomType: '1:1',
          maxMembers: 2,
          ownerUserId: null,
        },
        select: { chatRoomId: true },
      });

      // 양쪽 모두 role='member'
      await tx.groupMembership.createMany({
        data: [
          { chatRoomId: room.chatRoomId, userId: matchRequest.requesterId, role: 'member' },
          { chatRoomId: room.chatRoomId, userId: matchRequest.receiverId, role: 'member' },
        ],
      });

      await tx.matchRequest.update({
        where: { matchRequestId },
        data: { status: 'accepted', chatRoomId: room.chatRoomId },
      });

      await tx.chatRoomMessage.create({
        data: {
          chatRoomId: room.chatRoomId,
          senderUserId: null,
          messageType: 'system',
          body: '채팅방이 시작되었습니다',
        },
      });

      // requester에게 수락 알림
      await tx.notification.create({
        data: {
          userId: matchRequest.requesterId,
          title: '신청이 수락되었습니다',
          message: `채팅 신청이 수락되었습니다. 대화를 시작해보세요!`,
          scheduledAt: new Date(),
          isSent: true,
          sentAt: new Date(),
          notificationType: 'match_request',
          relatedEntityId: room.chatRoomId,
          relatedEntityType: 'chat_room',
        },
      });

      return room;
    });
    chatRoomId = result.chatRoomId;
  } else {
    // 그룹 수락 — Serializable + P2034 재시도. 두 가지 경합을 차단:
    //  (a) 최초 수락 경합: existingAccepted 를 tx 밖에서 읽으면 동시 첫 수락 2건이 각자 방을 만들어
    //      한 그룹에 방이 2개 생긴다 → tx 내부 재조회 + 직렬화로 두 번째는 기존 방 합류로 수렴.
    //  (b) 정원 초과: upsert 전 active 멤버 수를 tx 내부에서 세어 maxMembers 초과 합류를 거절(409).
    // (voteAppointment 와 동일한 동시성 패턴 — leaveRoom/약속투표 참고.)
    let resolvedRoomId: bigint | null = null;
    let roomFull = false;
    for (let attempt = 0; ; attempt++) {
      resolvedRoomId = null;
      roomFull = false;
      try {
        await prisma.$transaction(
          async (tx) => {
            // (a) 기존 수락 방을 tx 내부에서 재조회 (경합 차단)
            const existingAccepted = await tx.matchRequest.findFirst({
              where: {
                requesterId: matchRequest.requesterId,
                requestType: 'group',
                status: 'accepted',
                chatRoomId: { not: null },
              },
              select: { chatRoomId: true },
            });

            if (existingAccepted?.chatRoomId) {
              const existingRoomId = existingAccepted.chatRoomId;

              // (b) 정원 검사: 수신자가 이미 active 가 아닌데 정원이 찼으면 거절
              const room = await tx.chatRoom.findUnique({
                where: { chatRoomId: existingRoomId },
                select: { maxMembers: true },
              });
              const maxMembers = room?.maxMembers ?? 4;
              const activeCount = await tx.groupMembership.count({
                where: { chatRoomId: existingRoomId, memberStatus: 'active' },
              });
              const mine = await tx.groupMembership.findUnique({
                where: { chatRoomId_userId: { chatRoomId: existingRoomId, userId: matchRequest.receiverId } },
                select: { memberStatus: true },
              });
              if (mine?.memberStatus !== 'active' && activeCount >= maxMembers) {
                roomFull = true;
                return; // 부수효과 없이 종료 → 409
              }

              await tx.groupMembership.upsert({
                where: { chatRoomId_userId: { chatRoomId: existingRoomId, userId: matchRequest.receiverId } },
                create: { chatRoomId: existingRoomId, userId: matchRequest.receiverId, role: 'member' },
                update: { memberStatus: 'active' },
              });

              await tx.matchRequest.update({
                where: { matchRequestId },
                data: { status: 'accepted', chatRoomId: existingRoomId },
              });

              await tx.notification.create({
                data: {
                  userId: matchRequest.requesterId,
                  title: '그룹 신청이 수락되었습니다',
                  message: '그룹 채팅 신청이 수락되었습니다.',
                  scheduledAt: new Date(),
                  isSent: true,
                  sentAt: new Date(),
                  notificationType: 'group_invite',
                  relatedEntityId: existingRoomId,
                  relatedEntityType: 'chat_room',
                },
              });

              resolvedRoomId = existingRoomId;
            } else {
              // 첫 수락자 → 방 생성, ownerUserId = 수락자(receiver)
              const room = await tx.chatRoom.create({
                data: { roomType: 'group', maxMembers: 4, ownerUserId: matchRequest.receiverId },
                select: { chatRoomId: true },
              });

              await tx.groupMembership.createMany({
                data: [
                  { chatRoomId: room.chatRoomId, userId: matchRequest.requesterId, role: 'member' },
                  { chatRoomId: room.chatRoomId, userId: matchRequest.receiverId, role: 'owner' },
                ],
              });

              await tx.matchRequest.update({
                where: { matchRequestId },
                data: { status: 'accepted', chatRoomId: room.chatRoomId },
              });

              await tx.chatRoomMessage.create({
                data: {
                  chatRoomId: room.chatRoomId,
                  senderUserId: null,
                  messageType: 'system',
                  body: '그룹 채팅방이 시작되었습니다',
                },
              });

              await tx.notification.create({
                data: {
                  userId: matchRequest.requesterId,
                  title: '그룹 신청이 수락되었습니다',
                  message: '그룹 채팅 신청이 수락되었습니다.',
                  scheduledAt: new Date(),
                  isSent: true,
                  sentAt: new Date(),
                  notificationType: 'group_invite',
                  relatedEntityId: room.chatRoomId,
                  relatedEntityType: 'chat_room',
                },
              });

              resolvedRoomId = room.chatRoomId;
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
          // voteAppointment 와 동일: 충돌 시 점증 백오프로 tight busy-wait 회피.
          await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }

    if (roomFull) {
      res.status(409).json({ error: 'group_full' });
      return;
    }
    if (resolvedRoomId === null) {
      res.status(500).json({ error: 'accept_failed' });
      return;
    }
    chatRoomId = resolvedRoomId;
  }

  // 실시간 알림 (fire-and-forget)
  try {
    const io = getSocketServer();
    io.to(`user:${matchRequest.requesterId.toString()}`).emit('notification', {
      notificationType: 'match_request',
      title: '신청이 수락되었습니다',
      chatRoomId: chatRoomId.toString(),
    });
  } catch {
    // Socket.IO 미초기화 — 무시
  }

  logger.info(
    { action: 'match_request_accept', matchRequestId: matchRequestId.toString(), chatRoomId: chatRoomId.toString() },
    // matchRequestId/chatRoomId 는 PII 아님 — userId 는 maskUserId 로 처리됨
    'match request accepted',
  );

  res.status(200).json({ chatRoomId: chatRoomId.toString() });
}

// ============================================================
// PATCH /community/match/request/:matchRequestId/reject
// MatchRequest.update({ status:'rejected' }) + Notification to requester
// ============================================================
export async function rejectMatchRequest(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const matchRequestId = parseBigId(req.params.matchRequestId);
  if (!matchRequestId) {
    res.status(400).json({ error: 'invalid matchRequestId' });
    return;
  }

  const matchRequest = await prisma.matchRequest.findUnique({
    where: { matchRequestId },
    select: {
      requesterId: true,
      receiverId: true,
      status: true,
    },
  });

  if (!matchRequest) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  if (matchRequest.receiverId !== auth.userId) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  if (matchRequest.status !== 'pending') {
    res.status(409).json({ error: 'not_pending', currentStatus: matchRequest.status });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.matchRequest.update({
      where: { matchRequestId },
      data: { status: 'rejected' },
    });

    await tx.notification.create({
      data: {
        userId: matchRequest.requesterId,
        title: '신청이 거절되었습니다',
        message: '채팅 신청이 거절되었습니다.',
        scheduledAt: new Date(),
        isSent: true,
        sentAt: new Date(),
        notificationType: 'match_request',
        relatedEntityId: matchRequestId,
        relatedEntityType: 'match_request',
      },
    });
  });

  logger.info(
    { action: 'match_request_reject', matchRequestId: matchRequestId.toString() },
    'match request rejected',
  );

  res.status(200).json({ ok: true });
}

// ============================================================
// GET /community/match/request/incoming
// status:'pending', expiresAt>now, receiverId=me
// ============================================================
export async function listIncomingRequests(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const requests = await prisma.matchRequest.findMany({
    where: {
      receiverId: auth.userId,
      status: 'pending',
      expiresAt: { gt: new Date() },
    },
    select: {
      matchRequestId: true,
      requesterId: true,
      requestType: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      requester: {
        select: { nickname: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({
    items: requests.map((r) => ({
      matchRequestId: r.matchRequestId.toString(),
      requesterId: r.requesterId.toString(),
      requesterNickname: r.requester.nickname,
      requestType: r.requestType,
      status: r.status,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
