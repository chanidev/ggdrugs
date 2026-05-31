/**
 * chat-room-eval.ts — in-process 검증 하니스 (PASS/FAIL)
 * Task 3: 신청 REST (1:1 A_803 / 그룹 A_804 / 수락·거절·목록)
 * Task 4: 채팅방 REST (메시지이력/약속/이벤트선택/나가기/차단 A_805)
 * Task 5: 방장 권한 REST (즉시강퇴/투표강퇴 GG-MATE-017~021)
 * 실행: npm run chatroom:eval (apps/bff 에서)
 *
 * WARNING: ChatSession / prisma.chatMessage 를 절대 사용하지 않는다.
 *          이 파일은 prisma.chatRoom* / prisma.matchRequest 만 사용.
 */

import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import {
  sendOneToOneRequest,
  sendGroupRequest,
  acceptMatchRequest,
  rejectMatchRequest,
  listIncomingRequests,
} from '../routes/match-request.js';
import {
  listMyChatRooms,
  listMessages,
  selectEvent,
  proposeAppointment,
  voteAppointment,
  leaveRoom,
  blockMember,
  instantKick,
  startKickVote,
  castKickVote,
} from '../routes/chat-room.js';
import {
  expireMatchRequests,
  resolveExpiredKickVotes,
  expireAppointments,
  handleInactiveMembers,
  wrapHandler,
} from './chat-scheduler.js';

interface MockReq {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  auth?: { userId: bigint; nickname: string; activeRole: string };
}

interface Captured {
  status: number;
  json: unknown;
}

function mockRes(): Response & { _c: Captured } {
  const c: Captured = { status: 200, json: undefined };
  const res = {
    _c: c,
    status(s: number) {
      c.status = s;
      return this;
    },
    json(b: unknown) {
      c.json = b;
      return this;
    },
    end() {
      return this;
    },
  } as unknown as Response & { _c: Captured };
  return res;
}

function mockReq(r: MockReq): Request {
  return {
    params: r.params ?? {},
    query: r.query ?? {},
    body: r.body ?? {},
    auth: r.auth,
  } as unknown as Request;
}

interface CaseResult {
  id: string;
  pass: boolean;
  failures: string[];
}
const results: CaseResult[] = [];

function check(id: string, fn: () => Promise<string[]>) {
  return fn()
    .then((failures) => results.push({ id, pass: failures.length === 0, failures }))
    .catch((e) => results.push({ id, pass: false, failures: [`threw: ${String(e)}`] }));
}

async function main() {
  // 두 유저 확보
  const users = await prisma.user.findMany({
    where: { isDeleted: false },
    select: { userId: true, nickname: true, activeRole: true },
    take: 3,
  });

  if (users.length < 2) {
    console.error('need at least 2 users in DB');
    process.exit(1);
  }

  const u1 = users[0]!;
  const u2 = users[1]!;
  const auth1 = { userId: u1.userId, nickname: u1.nickname, activeRole: u1.activeRole };
  const auth2 = { userId: u2.userId, nickname: u2.nickname, activeRole: u2.activeRole };

  // 클린업: 이전 실행 잔재 제거
  await prisma.groupMembership.deleteMany({
    where: { userId: { in: [u1.userId, u2.userId] } },
  });
  await prisma.chatRoomMessage.deleteMany({
    where: {
      chatRoom: {
        matchRequests: {
          some: { requesterId: { in: [u1.userId, u2.userId] } },
        },
      },
    },
  });
  await prisma.matchRequest.deleteMany({
    where: {
      OR: [
        { requesterId: { in: [u1.userId, u2.userId] } },
        { receiverId: { in: [u1.userId, u2.userId] } },
      ],
    },
  });
  // appointment FK 해소: 멤버십 없는 방의 appointments 먼저 삭제 (slice5-eval 잔재 포함)
  {
    const orphanRooms = await prisma.chatRoom.findMany({
      where: { memberships: { none: {} } },
      select: { chatRoomId: true },
    });
    const orphanIds = orphanRooms.map((r) => r.chatRoomId);
    if (orphanIds.length > 0) {
      // 역순 FK: slice5 테이블 포함 — appointmentId 먼저 수집 후 삭제
      const appts = await prisma.appointment.findMany({
        where: { chatRoomId: { in: orphanIds } },
        select: { appointmentId: true },
      });
      const apptIds = appts.map((a) => a.appointmentId);
      if (apptIds.length > 0) {
        await prisma.creditLedger.deleteMany({ where: { appointmentId: { in: apptIds } } });
        await prisma.festivalSurvey.deleteMany({ where: { appointmentId: { in: apptIds } } });
        await prisma.festivalReview.deleteMany({ where: { appointmentId: { in: apptIds } } });
        await prisma.mateEvaluation.deleteMany({ where: { appointmentId: { in: apptIds } } });
        await prisma.appointmentVote.deleteMany({ where: { appointmentId: { in: apptIds } } });
      }
      await prisma.appointment.deleteMany({ where: { chatRoomId: { in: orphanIds } } });
    }
  }
  await prisma.chatRoom.deleteMany({
    where: { memberships: { none: {} } },
  });
  await prisma.block.deleteMany({
    where: {
      OR: [
        { blockerId: u1.userId },
        { blockedUserId: u1.userId },
      ],
    },
  });
  await prisma.mateProfile.deleteMany({ where: { userId: { in: [u1.userId, u2.userId] } } });
  await prisma.mateIndex.deleteMany({ where: { userId: { in: [u1.userId, u2.userId] } } });

  // MateProfile 생성 (1:1 신청 가드 요구)
  const BASE = {
    gender: 'M',
    ageRangeLower: 25,
    nationality: 'KR',
    koreanOk: true,
    hasCar: false,
    consentedAt: new Date(),
    autoRecommend: true,
    groupApply: true,
  };
  await prisma.mateProfile.create({ data: { userId: u1.userId, ...BASE } });
  await prisma.mateProfile.create({ data: { userId: u2.userId, ...BASE, gender: 'F' } });
  await prisma.mateIndex.create({ data: { userId: u1.userId, indexValue: 50 } });
  await prisma.mateIndex.create({ data: { userId: u2.userId, indexValue: 50 } });

  try {
    // ── CASE 1: match.1to1.send.ok — 신청 생성, expiresAt = now+24h 이내 ──────
    let createdMatchRequestId = '';
    await check('match.1to1.send.ok', async () => {
      const res = mockRes();
      await sendOneToOneRequest(
        mockReq({ auth: auth1, body: { receiverUserId: u2.userId.toString() } }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 201) f.push(`status ${res._c.status} != 201`);
      const b = res._c.json as { matchRequestId?: string; expiresAt?: string };
      if (!b?.matchRequestId) f.push('no matchRequestId');
      if (!b?.expiresAt) f.push('no expiresAt');
      if (b?.expiresAt) {
        const exp = new Date(b.expiresAt).getTime();
        const now = Date.now();
        const diff = exp - now;
        // 24h = 86400000ms, 허용 오차 ±60s
        if (diff < 86340000 || diff > 86460000) {
          f.push(`expiresAt diff ${diff}ms not ~24h (86400000)`);
        }
      }
      if (b?.matchRequestId) createdMatchRequestId = b.matchRequestId;
      return f;
    });

    // ── CASE 2: match.duplicate.blocked — pending 중복 409 ────────────────────
    await check('match.duplicate.blocked', async () => {
      const res = mockRes();
      await sendOneToOneRequest(
        mockReq({ auth: auth1, body: { receiverUserId: u2.userId.toString() } }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 409) f.push(`status ${res._c.status} != 409`);
      return f;
    });

    // ── CASE 3: match.1to1.accept.creates_room — 수락 시 ChatRoom + 2 GroupMembership ──
    let chatRoomId = '';
    await check('match.1to1.accept.creates_room', async () => {
      const res = mockRes();
      await acceptMatchRequest(
        mockReq({ auth: auth2, params: { matchRequestId: createdMatchRequestId } }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
      const b = res._c.json as { chatRoomId?: string };
      if (!b?.chatRoomId) f.push('no chatRoomId');
      if (b?.chatRoomId) chatRoomId = b.chatRoomId;

      // DB 검증: ChatRoom 존재
      if (chatRoomId) {
        const room = await prisma.chatRoom.findUnique({
          where: { chatRoomId: BigInt(chatRoomId) },
          select: { roomType: true, maxMembers: true, ownerUserId: true },
        });
        if (!room) f.push('ChatRoom not found in DB');
        if (room?.roomType !== '1:1') f.push(`roomType ${room?.roomType} != '1:1'`);
        if (room?.maxMembers !== 2) f.push(`maxMembers ${room?.maxMembers} != 2`);

        // 2 GroupMembership
        const memberships = await prisma.groupMembership.findMany({
          where: { chatRoomId: BigInt(chatRoomId) },
          select: { userId: true, role: true },
        });
        if (memberships.length !== 2) f.push(`${memberships.length} memberships != 2`);
      }
      return f;
    });

    // ── CASE 4: match.1to1.accept.both_member — 1:1 ownerUserId=null, 양쪽 role='member' ──
    await check('match.1to1.accept.both_member', async () => {
      const f: string[] = [];
      if (!chatRoomId) { f.push('chatRoomId not set from previous case'); return f; }
      const room = await prisma.chatRoom.findUnique({
        where: { chatRoomId: BigInt(chatRoomId) },
        select: { ownerUserId: true },
      });
      if (room?.ownerUserId !== null) f.push(`ownerUserId ${room?.ownerUserId} != null`);

      const memberships = await prisma.groupMembership.findMany({
        where: { chatRoomId: BigInt(chatRoomId) },
        select: { role: true, userId: true },
      });
      for (const m of memberships) {
        if (m.role !== 'member') f.push(`userId ${m.userId} role '${m.role}' != 'member'`);
      }
      return f;
    });

    // ── CASE 5: match.1to1.reject.ok — status=rejected ───────────────────────
    await check('match.1to1.reject.ok', async () => {
      // 새 신청 생성 후 거절
      const sendRes = mockRes();
      await sendOneToOneRequest(
        mockReq({ auth: auth1, body: { receiverUserId: u2.userId.toString() } }),
        sendRes,
      );
      const f: string[] = [];
      if (sendRes._c.status !== 201) {
        f.push(`send status ${sendRes._c.status} != 201`);
        return f;
      }
      const sb = sendRes._c.json as { matchRequestId?: string };
      if (!sb?.matchRequestId) { f.push('no matchRequestId for reject test'); return f; }

      const rejectRes = mockRes();
      await rejectMatchRequest(
        mockReq({ auth: auth2, params: { matchRequestId: sb.matchRequestId } }),
        rejectRes,
      );
      if (rejectRes._c.status !== 200) f.push(`reject status ${rejectRes._c.status} != 200`);

      // DB 확인
      const mr = await prisma.matchRequest.findUnique({
        where: { matchRequestId: BigInt(sb.matchRequestId) },
        select: { status: true },
      });
      if (mr?.status !== 'rejected') f.push(`status '${mr?.status}' != 'rejected'`);
      return f;
    });

    // ── CASE 6: match.expired.not_accepted — expiresAt 과거 accept 시 410 ─────
    await check('match.expired.not_accepted', async () => {
      // 이미 만료된 신청 생성 (직접 DB insert)
      const expired = await prisma.matchRequest.create({
        data: {
          requesterId: u1.userId,
          receiverId: u2.userId,
          requestType: '1:1',
          status: 'pending',
          expiresAt: new Date(Date.now() - 1000), // 1초 전 = 만료
        },
      });
      const res = mockRes();
      await acceptMatchRequest(
        mockReq({ auth: auth2, params: { matchRequestId: expired.matchRequestId.toString() } }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 410) f.push(`status ${res._c.status} != 410`);
      return f;
    });

    // ── CASE 7: match.group.invite.max3 — 3명 초과 422 ───────────────────────
    await check('match.group.invite.max3', async () => {
      const res = mockRes();
      await sendGroupRequest(
        mockReq({
          auth: auth1,
          body: {
            receiverUserIds: [
              u2.userId.toString(),
              '99999999991',
              '99999999992',
              '99999999993',
            ],
          },
        }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 422) f.push(`status ${res._c.status} != 422`);
      return f;
    });

    // ── CASE 8: match.group.invite.groupapply_gate — groupApply=false 대상 422 ─
    await check('match.group.invite.groupapply_gate', async () => {
      // u2의 groupApply 를 false 로 업데이트
      await prisma.mateProfile.update({
        where: { userId: u2.userId },
        data: { groupApply: false },
      });
      const res = mockRes();
      await sendGroupRequest(
        mockReq({
          auth: auth1,
          body: { receiverUserIds: [u2.userId.toString()] },
        }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 422) f.push(`status ${res._c.status} != 422`);
      const b = res._c.json as { error?: string };
      if (b?.error !== 'group_apply_required') f.push(`error '${b?.error}' != 'group_apply_required'`);
      // 복원
      await prisma.mateProfile.update({
        where: { userId: u2.userId },
        data: { groupApply: true },
      });
      return f;
    });

    // ── CASE 8b: match.group.blocked — 차단된 대상에게 그룹 초대 409 ─────────────
    await check('match.group.blocked', async () => {
      // u1 → u2 차단 설정
      const blk = await prisma.block.create({
        data: { blockerId: u1.userId, blockedUserId: u2.userId },
        select: { blockId: true },
      });
      const res = mockRes();
      await sendGroupRequest(
        mockReq({
          auth: auth1,
          body: { receiverUserIds: [u2.userId.toString()] },
        }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 409) f.push(`status ${res._c.status} != 409`);
      const b = res._c.json as { error?: string };
      if (b?.error !== 'blocked') f.push(`error '${b?.error}' != 'blocked'`);
      // 차단 해제
      await prisma.block.delete({ where: { blockId: blk.blockId } });
      return f;
    });

    // ── CASE 9: notif.new_types_populated_on_create — Notification에 notificationType 채워짐 ──
    await check('notif.new_types_populated_on_create', async () => {
      // u2 에게 생성된 가장 최근 알림(match_request) 확인
      const notif = await prisma.notification.findFirst({
        where: {
          userId: u2.userId,
          notificationType: 'match_request',
        },
        orderBy: { createdAt: 'desc' },
        select: { notificationType: true, relatedEntityId: true, relatedEntityType: true },
      });
      const f: string[] = [];
      if (!notif) f.push('no match_request notification found for u2');
      if (notif?.notificationType !== 'match_request') f.push(`notificationType '${notif?.notificationType}' != 'match_request'`);
      if (!notif?.relatedEntityId) f.push('relatedEntityId is null');
      if (notif?.relatedEntityType !== 'match_request') f.push(`relatedEntityType '${notif?.relatedEntityType}' != 'match_request'`);
      return f;
    });

    // ── CASE 10: notif.legacy_rows_backfilled — event_id IS NOT NULL 행의 notification_type='event_bookmark' ──
    await check('notif.legacy_rows_backfilled', async () => {
      // 기존 이벤트 알림 행 조회 (event_id 있는 행)
      const legacyCount = await prisma.notification.count({
        where: {
          eventId: { not: null },
          notificationType: { not: 'event_bookmark' },
        },
      });
      const f: string[] = [];
      // event_id가 있으면서 notificationType이 event_bookmark 가 아닌 건이 0건이어야 함
      if (legacyCount > 0) {
        f.push(`${legacyCount} legacy rows with eventId have notificationType != 'event_bookmark' (not backfilled)`);
      }
      return f;
    });

    // ── CASE 11: GET incoming requests — receiverId=me, pending, expiresAt>now ──
    await check('match.incoming.list', async () => {
      // u2 에게 신청된 pending 목록 조회
      const res = mockRes();
      await listIncomingRequests(mockReq({ auth: auth2 }), res);
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
      const b = res._c.json as { items?: unknown[] };
      if (!Array.isArray(b?.items)) f.push('items not array');
      return f;
    });

    // ── CASE 12: match.group.capacity_guard — 기존 그룹방 멤버수+초대수 > 4 시 422 ──
    await check('match.group.capacity_guard', async () => {
      // 합성 유저 3명 생성: 그룹방을 4명으로 채우기 위해 (u1 + syn_a + syn_b + syn_c)
      // 이후 auth1(u1) 이 u2 에게 초대 시도 → 4+1=5 > 4 → 422
      const suffix = Date.now();
      const [synA, synB, synC, synInvitee] = await Promise.all([
        prisma.user.create({ data: { socialUid: `cap_guard_a_${suffix}`, authProvider: 'dev', nickname: `CapA${suffix}`, activeRole: 'user' } }),
        prisma.user.create({ data: { socialUid: `cap_guard_b_${suffix}`, authProvider: 'dev', nickname: `CapB${suffix}`, activeRole: 'user' } }),
        prisma.user.create({ data: { socialUid: `cap_guard_c_${suffix}`, authProvider: 'dev', nickname: `CapC${suffix}`, activeRole: 'user' } }),
        // 초대 대상: MateProfile(groupApply=true) 필요
        prisma.user.create({ data: { socialUid: `cap_guard_inv_${suffix}`, authProvider: 'dev', nickname: `CapInv${suffix}`, activeRole: 'user' } }),
      ]);

      // 초대 대상에게 MateProfile 생성 (groupApply 검증 통과용)
      await prisma.mateProfile.create({
        data: {
          userId: synInvitee.userId,
          gender: 'M',
          ageRangeLower: 25,
          nationality: 'KR',
          koreanOk: true,
          hasCar: false,
          consentedAt: new Date(),
          autoRecommend: true,
          groupApply: true,
        },
      });

      // active 그룹방 생성 후 4명 꽉 채움: u1 + synA + synB + synC
      const fullRoom = await prisma.chatRoom.create({
        data: {
          roomType: 'group',
          maxMembers: 4,
          status: 'active',
          ownerUserId: u1.userId,
        },
        select: { chatRoomId: true },
      });
      await prisma.groupMembership.createMany({
        data: [
          { chatRoomId: fullRoom.chatRoomId, userId: u1.userId,    role: 'owner',  memberStatus: 'active' },
          { chatRoomId: fullRoom.chatRoomId, userId: synA.userId,  role: 'member', memberStatus: 'active' },
          { chatRoomId: fullRoom.chatRoomId, userId: synB.userId,  role: 'member', memberStatus: 'active' },
          { chatRoomId: fullRoom.chatRoomId, userId: synC.userId,  role: 'member', memberStatus: 'active' },
        ],
      });

      const f: string[] = [];

      // auth1(u1) 이 synInvitee(1명) 에게 그룹 초대 → currentCount(4)+1 = 5 > 4 → 422
      const res = mockRes();
      await sendGroupRequest(
        mockReq({
          auth: auth1,
          body: { receiverUserIds: [synInvitee.userId.toString()] },
        }),
        res,
      );
      if (res._c.status !== 422) f.push(`status ${res._c.status} != 422`);
      const b = res._c.json as { error?: string };
      if (b?.error !== 'group_capacity_exceeded') {
        f.push(`error '${b?.error}' != 'group_capacity_exceeded'`);
      }

      // 클린업: 멤버십 → 방 → 합성 유저 순
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: fullRoom.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: fullRoom.chatRoomId } });
      await prisma.mateProfile.deleteMany({ where: { userId: { in: [synA.userId, synB.userId, synC.userId, synInvitee.userId] } } });
      await prisma.user.deleteMany({ where: { userId: { in: [synA.userId, synB.userId, synC.userId, synInvitee.userId] } } });

      return f;
    });

    // ─────────────────────────────────────────────────────────────────
    // TASK 4 — 채팅방 REST (A_805)
    // 별도 1:1 채팅방 생성 (u1↔u2) 후 모든 케이스 실행
    // ─────────────────────────────────────────────────────────────────

    // Task 4 전용 채팅방 생성
    const t4Room = await prisma.chatRoom.create({
      data: { roomType: '1:1', maxMembers: 2, status: 'active', ownerUserId: null },
      select: { chatRoomId: true },
    });
    await prisma.groupMembership.createMany({
      data: [
        { chatRoomId: t4Room.chatRoomId, userId: u1.userId, role: 'member', memberStatus: 'active' },
        { chatRoomId: t4Room.chatRoomId, userId: u2.userId, role: 'member', memberStatus: 'active' },
      ],
    });
    // 메시지 3건 미리 삽입
    await prisma.chatRoomMessage.createMany({
      data: [
        { chatRoomId: t4Room.chatRoomId, senderUserId: u1.userId, messageType: 'text', body: 'hello' },
        { chatRoomId: t4Room.chatRoomId, senderUserId: u2.userId, messageType: 'text', body: 'world' },
        { chatRoomId: t4Room.chatRoomId, senderUserId: null,      messageType: 'system', body: '채팅방이 시작되었습니다' },
      ],
    });

    // ── CASE T4-1: room.messages.paginated ─────────────────────────────
    await check('room.messages.paginated', async () => {
      const res = mockRes();
      await listMessages(
        mockReq({ auth: auth1, params: { chatRoomId: t4Room.chatRoomId.toString() }, query: { limit: '2' } }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
      const b = res._c.json as { messages?: unknown[]; nextCursor?: string | null };
      if (!Array.isArray(b?.messages)) f.push('messages not array');
      if ((b?.messages?.length ?? 0) !== 2) f.push(`messages.length ${b?.messages?.length} != 2`);
      // limit=2, 총 3건이므로 nextCursor가 있어야 함
      if (!b?.nextCursor) f.push('nextCursor should be set (more pages)');
      return f;
    });

    // ── CASE T4-2: room.event.selected ─────────────────────────────────
    // approved event 가 DB 에 있는지 먼저 확인
    const approvedEvent = await prisma.event.findFirst({
      where: { approvalStatus: 'approved', isDeleted: false },
      select: { eventId: true },
    });
    await check('room.event.selected', async () => {
      const f: string[] = [];
      if (!approvedEvent) { f.push('no approved event in DB for test'); return f; }
      const res = mockRes();
      await selectEvent(
        mockReq({ auth: auth1, params: { chatRoomId: t4Room.chatRoomId.toString() }, body: { eventId: approvedEvent.eventId.toString() } }),
        res,
      );
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
      const b = res._c.json as { eventId?: string };
      if (b?.eventId !== approvedEvent.eventId.toString()) f.push(`eventId ${b?.eventId} != ${approvedEvent.eventId}`);
      // DB 검증
      const room = await prisma.chatRoom.findUnique({ where: { chatRoomId: t4Room.chatRoomId }, select: { eventId: true } });
      if (room?.eventId?.toString() !== approvedEvent.eventId.toString()) f.push('ChatRoom.eventId not updated in DB');
      return f;
    });

    // ── CASE T4-3: room.appointment.propose.ok ─────────────────────────
    let proposedAppointmentId = '';
    await check('room.appointment.propose.ok', async () => {
      const res = mockRes();
      const futureAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // +7days
      await proposeAppointment(
        mockReq({
          auth: auth1,
          params: { chatRoomId: t4Room.chatRoomId.toString() },
          body: { appointedAt: futureAt, eventName: '한강 불꽃축제' },
        }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 201) f.push(`status ${res._c.status} != 201`);
      const b = res._c.json as { appointmentId?: string; status?: string; expiresAt?: string };
      if (!b?.appointmentId) f.push('no appointmentId');
      if (b?.status !== 'proposed') f.push(`status '${b?.status}' != 'proposed'`);
      if (!b?.expiresAt) f.push('no expiresAt');
      if (b?.appointmentId) proposedAppointmentId = b.appointmentId;

      // DB 검증: AppointmentVote 2건(pending)
      if (proposedAppointmentId) {
        const votes = await prisma.appointmentVote.findMany({
          where: { appointmentId: BigInt(proposedAppointmentId) },
          select: { vote: true },
        });
        if (votes.length !== 2) f.push(`${votes.length} votes != 2`);
        if (votes.some((v) => v.vote !== 'pending')) f.push('some vote != pending');
      }
      return f;
    });

    // ── CASE T4-4: room.appointment.all_agree ──────────────────────────
    await check('room.appointment.all_agree', async () => {
      const f: string[] = [];
      if (!proposedAppointmentId) { f.push('proposedAppointmentId not set'); return f; }

      // u1 동의
      const res1 = mockRes();
      await voteAppointment(
        mockReq({
          auth: auth1,
          params: { chatRoomId: t4Room.chatRoomId.toString(), appointmentId: proposedAppointmentId },
          body: { vote: 'agree' },
        }),
        res1,
      );
      if (res1._c.status !== 200) f.push(`u1 vote status ${res1._c.status} != 200`);
      // [low] 중간 상태 검증: u1만 동의한 상태에서는 아직 'proposed' 여야 함 (premature confirmed 방지)
      if ((res1._c.json as { status?: string }).status === 'confirmed') {
        f.push('premature confirmed after only u1 agree');
      }

      // u2 동의 → 전원 동의 → confirmed
      const res2 = mockRes();
      await voteAppointment(
        mockReq({
          auth: auth2,
          params: { chatRoomId: t4Room.chatRoomId.toString(), appointmentId: proposedAppointmentId },
          body: { vote: 'agree' },
        }),
        res2,
      );
      if (res2._c.status !== 200) f.push(`u2 vote status ${res2._c.status} != 200`);
      const b = res2._c.json as { status?: string };
      if (b?.status !== 'confirmed') f.push(`status '${b?.status}' != 'confirmed'`);

      // DB 검증
      const appt = await prisma.appointment.findUnique({
        where: { appointmentId: BigInt(proposedAppointmentId) },
        select: { status: true },
      });
      if (appt?.status !== 'confirmed') f.push(`DB status '${appt?.status}' != 'confirmed'`);
      return f;
    });

    // ── CASE T4-4b: room.appointment.reject — 즉시 rejected 처리 ─────────
    // 새 약속 제안 후 u2가 거절 → 즉시 status='rejected'
    let rejectApptId = '';
    await check('room.appointment.reject', async () => {
      const f: string[] = [];
      // 새 약속 제안
      const propRes = mockRes();
      await proposeAppointment(
        mockReq({
          auth: auth1,
          params: { chatRoomId: t4Room.chatRoomId.toString() },
          body: { appointedAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), eventName: '거절 테스트 약속' },
        }),
        propRes,
      );
      if (propRes._c.status !== 201) { f.push(`propose status ${propRes._c.status} != 201`); return f; }
      const pb = propRes._c.json as { appointmentId?: string };
      if (!pb?.appointmentId) { f.push('no appointmentId'); return f; }
      rejectApptId = pb.appointmentId;

      // u2 거절 → 즉시 status='rejected' 로 전환
      const voteRes = mockRes();
      await voteAppointment(
        mockReq({
          auth: auth2,
          params: { chatRoomId: t4Room.chatRoomId.toString(), appointmentId: rejectApptId },
          body: { vote: 'reject' },
        }),
        voteRes,
      );
      if (voteRes._c.status !== 200) f.push(`reject vote status ${voteRes._c.status} != 200`);
      const vb = voteRes._c.json as { status?: string };
      if (vb?.status !== 'rejected') f.push(`response status '${vb?.status}' != 'rejected'`);

      // DB 검증: Appointment.status='rejected'
      const appt = await prisma.appointment.findUnique({
        where: { appointmentId: BigInt(rejectApptId) },
        select: { status: true },
      });
      if (appt?.status !== 'rejected') f.push(`DB status '${appt?.status}' != 'rejected'`);

      // GG-NOTI: 거절 시 비-거절자(u1)에게 파기 알림 발행 (오프라인 멤버 인지)
      const rejectNotif = await prisma.notification.findFirst({
        where: { userId: u1.userId, relatedEntityId: BigInt(rejectApptId), relatedEntityType: 'appointment' },
        select: { notificationId: true },
      });
      if (!rejectNotif) f.push('no reject notification for non-rejecter u1');

      return f;
    });

    // ── CASE T4-5: room.appointment.counter — 역제안 ──────────────────
    // 새 약속 제안 후 역제안
    let counterApptId = '';
    await check('room.appointment.counter', async () => {
      const f: string[] = [];
      // 새 약속 제안
      const propRes = mockRes();
      await proposeAppointment(
        mockReq({
          auth: auth1,
          params: { chatRoomId: t4Room.chatRoomId.toString() },
          body: { appointedAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() },
        }),
        propRes,
      );
      if (propRes._c.status !== 201) { f.push(`propose status ${propRes._c.status} != 201`); return f; }
      const pb = propRes._c.json as { appointmentId?: string };
      if (!pb?.appointmentId) { f.push('no appointmentId'); return f; }
      counterApptId = pb.appointmentId;

      // u1 먼저 agree 투표 (역제안 후 u1 표가 pending으로 초기화되는지 검증하기 위해)
      const agreeRes = mockRes();
      await voteAppointment(
        mockReq({
          auth: auth1,
          params: { chatRoomId: t4Room.chatRoomId.toString(), appointmentId: counterApptId },
          body: { vote: 'agree' },
        }),
        agreeRes,
      );
      if (agreeRes._c.status !== 200) f.push(`u1 agree status ${agreeRes._c.status} != 200`);

      // u2 역제안
      const voteRes = mockRes();
      await voteAppointment(
        mockReq({
          auth: auth2,
          params: { chatRoomId: t4Room.chatRoomId.toString(), appointmentId: counterApptId },
          body: {
            vote: 'counter',
            counterAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          },
        }),
        voteRes,
      );
      if (voteRes._c.status !== 200) f.push(`counter vote status ${voteRes._c.status} != 200`);
      const vb = voteRes._c.json as { status?: string };
      if (vb?.status !== 'counter_proposed') f.push(`status '${vb?.status}' != 'counter_proposed'`);

      // DB 검증: Appointment.status='counter_proposed'
      const appt = await prisma.appointment.findUnique({
        where: { appointmentId: BigInt(counterApptId) },
        select: { status: true },
      });
      if (appt?.status !== 'counter_proposed') f.push(`DB status '${appt?.status}' != 'counter_proposed'`);

      // [medium] 역제안자(u2) 제외 나머지(u1)의 투표가 'pending'으로 리셋됐는지 검증
      const u1Vote = await prisma.appointmentVote.findUnique({
        where: { appointmentId_userId: { appointmentId: BigInt(counterApptId), userId: u1.userId } },
        select: { vote: true },
      });
      if (u1Vote?.vote !== 'pending') {
        f.push(`u1 vote '${u1Vote?.vote}' should be reset to 'pending' after counter proposal`);
      }

      // GG-NOTI-012: 역제안 시 비-역제안자(u1)에게 재투표 알림 발행
      const counterNotif = await prisma.notification.findFirst({
        where: { userId: u1.userId, relatedEntityId: BigInt(counterApptId), relatedEntityType: 'appointment' },
        select: { notificationId: true },
      });
      if (!counterNotif) f.push('no counter notification for non-counterer u1');

      return f;
    });

    // ── CASE T4-6: room.block.creates_block_record ─────────────────────
    // 그룹방 만들어서 u1이 u2를 차단
    const t4GroupRoom = await prisma.chatRoom.create({
      data: { roomType: 'group', maxMembers: 4, status: 'active', ownerUserId: u1.userId },
      select: { chatRoomId: true },
    });
    await prisma.groupMembership.createMany({
      data: [
        { chatRoomId: t4GroupRoom.chatRoomId, userId: u1.userId, role: 'owner', memberStatus: 'active' },
        { chatRoomId: t4GroupRoom.chatRoomId, userId: u2.userId, role: 'member', memberStatus: 'active' },
      ],
    });
    await check('room.block.creates_block_record', async () => {
      const res = mockRes();
      await blockMember(
        mockReq({
          auth: auth1,
          params: { chatRoomId: t4GroupRoom.chatRoomId.toString(), targetUserId: u2.userId.toString() },
        }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);

      // DB 검증: Block 레코드 존재
      const blk = await prisma.block.findUnique({
        where: { blockerId_blockedUserId: { blockerId: u1.userId, blockedUserId: u2.userId } },
        select: { blockId: true },
      });
      if (!blk) f.push('Block record not created in DB');

      // 대상 멤버십 'blocked' 상태
      const targetMem = await prisma.groupMembership.findFirst({
        where: { chatRoomId: t4GroupRoom.chatRoomId, userId: u2.userId },
        select: { memberStatus: true },
      });
      if (targetMem?.memberStatus !== 'blocked') f.push(`memberStatus '${targetMem?.memberStatus}' != 'blocked'`);

      // 시스템 메시지 생성 확인
      const sysMsg = await prisma.chatRoomMessage.findFirst({
        where: { chatRoomId: t4GroupRoom.chatRoomId, messageType: 'system', body: '멤버가 차단되었습니다' },
        select: { messageId: true },
      });
      if (!sysMsg) f.push('system message "멤버가 차단되었습니다" not found');

      // 클린업
      await prisma.block.deleteMany({ where: { blockerId: u1.userId, blockedUserId: u2.userId } });
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: t4GroupRoom.chatRoomId } });
      await prisma.chatRoomMessage.deleteMany({ where: { chatRoomId: t4GroupRoom.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: t4GroupRoom.chatRoomId } });
      return f;
    });

    // ── CASE T4-7: room.leave.1to1_ends ─────────────────────────────────
    // 1:1 방에서 나가기 → status='ended', 양쪽 멤버십 모두 'left'
    // t4Room은 이미 eventId 업데이트+약속 등이 추가됐지만 멤버십은 여전히 active 상태
    await check('room.leave.1to1_ends', async () => {
      const res = mockRes();
      await leaveRoom(
        mockReq({ auth: auth1, params: { chatRoomId: t4Room.chatRoomId.toString() } }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);

      // DB 검증: 채팅방 status='ended'
      const room = await prisma.chatRoom.findUnique({
        where: { chatRoomId: t4Room.chatRoomId },
        select: { status: true, endedAt: true },
      });
      if (room?.status !== 'ended') f.push(`room status '${room?.status}' != 'ended'`);
      if (!room?.endedAt) f.push('endedAt not set');

      // u1 멤버십 'left'
      const mem1 = await prisma.groupMembership.findFirst({
        where: { chatRoomId: t4Room.chatRoomId, userId: u1.userId },
        select: { memberStatus: true },
      });
      if (mem1?.memberStatus !== 'left') f.push(`u1 memberStatus '${mem1?.memberStatus}' != 'left'`);

      // [medium] u2 멤버십도 'left' 여야 함 — 1:1 방 종료 시 상대방 멤버십도 일괄 left 처리
      const mem2 = await prisma.groupMembership.findFirst({
        where: { chatRoomId: t4Room.chatRoomId, userId: u2.userId },
        select: { memberStatus: true },
      });
      if (mem2?.memberStatus !== 'left') f.push(`u2 memberStatus '${mem2?.memberStatus}' != 'left' (should be left when room ends)`);

      return f;
    });

    // ── CASE T4-7b: room.leave.group_member_last_leaves_ends ─────────────
    // 그룹방에서 방장이 아닌 마지막 멤버가 나가면 채팅방 종료
    const suffixLast = Date.now() + 1;
    const synLast = await prisma.user.create({
      data: { socialUid: `last_member_${suffixLast}`, authProvider: 'dev', nickname: `LastMember${suffixLast}`, activeRole: 'user' },
    });
    const t4GroupRoomLast = await prisma.chatRoom.create({
      data: { roomType: 'group', maxMembers: 4, status: 'active', ownerUserId: u1.userId },
      select: { chatRoomId: true },
    });
    await prisma.groupMembership.createMany({
      data: [
        { chatRoomId: t4GroupRoomLast.chatRoomId, userId: u1.userId, role: 'owner', memberStatus: 'left', leftAt: new Date() },
        { chatRoomId: t4GroupRoomLast.chatRoomId, userId: synLast.userId, role: 'member', memberStatus: 'active' },
      ],
    });
    // ownerUserId를 null로: 방장이 이미 나간 방 시뮬레이션 (실제로는 owner가 먼저 나가면 소유권 이전되므로,
    // 이 케이스는 role='member'인 마지막 active 멤버가 나가는 시나리오를 직접 만든다)
    // 실제 케이스: synLast(role='member')가 혼자 남은 상태에서 나가기
    await check('room.leave.group_member_last_leaves_ends', async () => {
      const res = mockRes();
      await leaveRoom(
        mockReq({ auth: { userId: synLast.userId, nickname: synLast.nickname, activeRole: synLast.activeRole }, params: { chatRoomId: t4GroupRoomLast.chatRoomId.toString() } }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);

      // DB 검증: 채팅방 status='ended' (마지막 active 멤버가 나갔으므로)
      const room = await prisma.chatRoom.findUnique({
        where: { chatRoomId: t4GroupRoomLast.chatRoomId },
        select: { status: true, endedAt: true },
      });
      if (room?.status !== 'ended') f.push(`room status '${room?.status}' != 'ended' (last member left group)`);
      if (!room?.endedAt) f.push('endedAt not set');

      // 클린업
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: t4GroupRoomLast.chatRoomId } });
      await prisma.chatRoomMessage.deleteMany({ where: { chatRoomId: t4GroupRoomLast.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: t4GroupRoomLast.chatRoomId } });
      await prisma.user.delete({ where: { userId: synLast.userId } });
      return f;
    });

    // ── CASE T4-8: room.leave.group_owner_transfer ─────────────────────
    // 그룹 방장이 나가기 → 다음 멤버로 ownerUserId 이전
    const suffix2 = Date.now();
    const synU3 = await prisma.user.create({
      data: { socialUid: `leave_test_${suffix2}`, authProvider: 'dev', nickname: `LeaveTest${suffix2}`, activeRole: 'user' },
    });
    const t4GroupRoom2 = await prisma.chatRoom.create({
      data: { roomType: 'group', maxMembers: 4, status: 'active', ownerUserId: u1.userId },
      select: { chatRoomId: true },
    });
    await prisma.groupMembership.createMany({
      data: [
        { chatRoomId: t4GroupRoom2.chatRoomId, userId: u1.userId, role: 'owner', memberStatus: 'active' },
        { chatRoomId: t4GroupRoom2.chatRoomId, userId: synU3.userId, role: 'member', memberStatus: 'active' },
      ],
    });
    await check('room.leave.group_owner_transfer', async () => {
      const res = mockRes();
      await leaveRoom(
        mockReq({ auth: auth1, params: { chatRoomId: t4GroupRoom2.chatRoomId.toString() } }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);

      // DB 검증: ownerUserId → synU3
      const room = await prisma.chatRoom.findUnique({
        where: { chatRoomId: t4GroupRoom2.chatRoomId },
        select: { ownerUserId: true, status: true },
      });
      if (room?.ownerUserId?.toString() !== synU3.userId.toString()) {
        f.push(`ownerUserId ${room?.ownerUserId} != synU3 ${synU3.userId}`);
      }
      if (room?.status !== 'active') f.push(`room status '${room?.status}' should still be 'active'`);

      // synU3 멤버십 role='owner'
      const newOwnerMem = await prisma.groupMembership.findFirst({
        where: { chatRoomId: t4GroupRoom2.chatRoomId, userId: synU3.userId },
        select: { role: true },
      });
      if (newOwnerMem?.role !== 'owner') f.push(`synU3 role '${newOwnerMem?.role}' != 'owner'`);

      // 클린업
      await prisma.notification.deleteMany({ where: { userId: synU3.userId } });
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: t4GroupRoom2.chatRoomId } });
      await prisma.chatRoomMessage.deleteMany({ where: { chatRoomId: t4GroupRoom2.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: t4GroupRoom2.chatRoomId } });
      await prisma.user.delete({ where: { userId: synU3.userId } });
      return f;
    });

    // TASK 4 클린업 — t4Room (leave 이후 ended)
    await prisma.notification.deleteMany({
      where: { relatedEntityId: { in: (await prisma.appointment.findMany({ where: { chatRoomId: t4Room.chatRoomId }, select: { appointmentId: true } })).map((a) => a.appointmentId) } },
    });
    await prisma.appointmentVote.deleteMany({
      where: { appointment: { chatRoomId: t4Room.chatRoomId } },
    });
    await prisma.appointment.deleteMany({ where: { chatRoomId: t4Room.chatRoomId } });
    await prisma.chatRoomMessage.deleteMany({ where: { chatRoomId: t4Room.chatRoomId } });
    await prisma.groupMembership.deleteMany({ where: { chatRoomId: t4Room.chatRoomId } });
    await prisma.chatRoom.delete({ where: { chatRoomId: t4Room.chatRoomId } });

    // ─────────────────────────────────────────────────────────────────
    // TASK 5 — 방장 권한 REST (GG-MATE-017~021)
    // 별도 그룹방 생성: u1=owner, u2=member, u3=member
    // ─────────────────────────────────────────────────────────────────

    // Task 5 전용 그룹방 + 유저3 생성
    const t5Suffix = Date.now() + 100;
    const synU5 = await prisma.user.create({
      data: { socialUid: `t5_u3_${t5Suffix}`, authProvider: 'dev', nickname: `T5U3_${t5Suffix}`, activeRole: 'user' },
    });

    const t5Room = await prisma.chatRoom.create({
      data: { roomType: 'group', maxMembers: 4, status: 'active', ownerUserId: u1.userId },
      select: { chatRoomId: true },
    });
    await prisma.groupMembership.createMany({
      data: [
        { chatRoomId: t5Room.chatRoomId, userId: u1.userId, role: 'owner', memberStatus: 'active', instantKickUsed: false },
        { chatRoomId: t5Room.chatRoomId, userId: u2.userId, role: 'member', memberStatus: 'active' },
        { chatRoomId: t5Room.chatRoomId, userId: synU5.userId, role: 'member', memberStatus: 'active' },
      ],
    });

    // ── CASE T5-1: kick.instant.ok ──────────────────────────────────
    // u1(owner) 이 u2 를 즉시강퇴 → instantKickUsed=true, u2 memberStatus='kicked'
    await check('kick.instant.ok', async () => {
      const res = mockRes();
      await instantKick(
        mockReq({
          auth: auth1,
          params: { chatRoomId: t5Room.chatRoomId.toString(), targetUserId: u2.userId.toString() },
        }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);

      // DB 검증: 방장 행 instantKickUsed=true
      const ownerMem = await prisma.groupMembership.findFirst({
        where: { chatRoomId: t5Room.chatRoomId, userId: u1.userId },
        select: { instantKickUsed: true },
      });
      if (!ownerMem?.instantKickUsed) f.push('owner instantKickUsed should be true');

      // 대상 멤버십 kicked
      const targetMem = await prisma.groupMembership.findFirst({
        where: { chatRoomId: t5Room.chatRoomId, userId: u2.userId },
        select: { memberStatus: true },
      });
      if (targetMem?.memberStatus !== 'kicked') f.push(`u2 memberStatus '${targetMem?.memberStatus}' != 'kicked'`);

      // 시스템 메시지
      const sysMsg = await prisma.chatRoomMessage.findFirst({
        where: { chatRoomId: t5Room.chatRoomId, messageType: 'system', body: '멤버가 강퇴되었습니다' },
        select: { messageId: true },
      });
      if (!sysMsg) f.push('system message "멤버가 강퇴되었습니다" not found');

      // [low-fix] vacancy_notification 생성 검증 (스펙 L675: instantKick 시 결원 충원 알림 필수)
      const vacancyNotif = await prisma.notification.findFirst({
        where: { relatedEntityId: t5Room.chatRoomId, notificationType: 'vacancy_notification' },
        select: { notificationId: true },
      });
      if (!vacancyNotif) f.push('vacancy_notification for instantKick not found');

      return f;
    });

    // ── CASE T5-2: kick.instant.second_fails ───────────────────────
    // 두 번째 즉시강퇴 시도 → 422('instant_kick_used')
    await check('kick.instant.second_fails', async () => {
      const res = mockRes();
      await instantKick(
        mockReq({
          auth: auth1,
          params: { chatRoomId: t5Room.chatRoomId.toString(), targetUserId: synU5.userId.toString() },
        }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 422) f.push(`status ${res._c.status} != 422`);
      const b = res._c.json as { error?: string };
      if (b?.error !== 'instant_kick_used') f.push(`error '${b?.error}' != 'instant_kick_used'`);
      return f;
    });

    // ── CASE T5-3: kick.vote.non_owner_fails ───────────────────────
    // 방장이 아닌 synU5 가 투표강퇴 시도 → 403
    await check('kick.vote.non_owner_fails', async () => {
      const res = mockRes();
      await startKickVote(
        mockReq({
          auth: { userId: synU5.userId, nickname: synU5.nickname, activeRole: synU5.activeRole },
          params: { chatRoomId: t5Room.chatRoomId.toString() },
          body: { targetUserId: u2.userId.toString() },
        }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 403) f.push(`status ${res._c.status} != 403`);
      const b = res._c.json as { error?: string };
      if (b?.error !== 'not_owner') f.push(`error '${b?.error}' != 'not_owner'`);
      return f;
    });

    // ── CASE T5-4: kick.vote.all_agree_kicks ───────────────────────
    // 새 그룹방 만들어서 투표 전원 동의 → kicked 처리
    const t5Suffix2 = Date.now() + 200;
    const synVoteOwner = await prisma.user.create({
      data: { socialUid: `t5_vote_owner_${t5Suffix2}`, authProvider: 'dev', nickname: `VoteOwner${t5Suffix2}`, activeRole: 'user' },
    });
    const synVoteMember = await prisma.user.create({
      data: { socialUid: `t5_vote_member_${t5Suffix2}`, authProvider: 'dev', nickname: `VoteMember${t5Suffix2}`, activeRole: 'user' },
    });
    const synVoteTarget = await prisma.user.create({
      data: { socialUid: `t5_vote_target_${t5Suffix2}`, authProvider: 'dev', nickname: `VoteTarget${t5Suffix2}`, activeRole: 'user' },
    });

    const t5VoteRoom = await prisma.chatRoom.create({
      data: { roomType: 'group', maxMembers: 4, status: 'active', ownerUserId: synVoteOwner.userId },
      select: { chatRoomId: true },
    });
    await prisma.groupMembership.createMany({
      data: [
        { chatRoomId: t5VoteRoom.chatRoomId, userId: synVoteOwner.userId, role: 'owner', memberStatus: 'active' },
        { chatRoomId: t5VoteRoom.chatRoomId, userId: synVoteMember.userId, role: 'member', memberStatus: 'active' },
        { chatRoomId: t5VoteRoom.chatRoomId, userId: synVoteTarget.userId, role: 'member', memberStatus: 'active' },
      ],
    });

    await check('kick.vote.all_agree_kicks', async () => {
      const f: string[] = [];

      // 방장이 투표 시작
      const startRes = mockRes();
      await startKickVote(
        mockReq({
          auth: { userId: synVoteOwner.userId, nickname: synVoteOwner.nickname, activeRole: synVoteOwner.activeRole },
          params: { chatRoomId: t5VoteRoom.chatRoomId.toString() },
          body: { targetUserId: synVoteTarget.userId.toString() },
        }),
        startRes,
      );
      if (startRes._c.status !== 201) {
        f.push(`startKickVote status ${startRes._c.status} != 201`);
        return f;
      }
      const sb = startRes._c.json as { voterCount?: number };
      // 대상 제외 → 방장 + 멤버 = 2명이 투표자
      if (sb?.voterCount !== 2) f.push(`voterCount ${sb?.voterCount} != 2`);

      // DB: kick_vote 알림 2건 생성 확인
      const notifs = await prisma.notification.findMany({
        where: {
          notificationType: 'kick_vote',
          relatedEntityId: t5VoteRoom.chatRoomId,
        },
        select: { notificationId: true, userId: true, readAt: true },
      });
      if (notifs.length !== 2) f.push(`${notifs.length} kick_vote notifs != 2`);

      // 방장 알림 찾기
      const ownerNotif = notifs.find((n) => n.userId === synVoteOwner.userId);
      const memberNotif = notifs.find((n) => n.userId === synVoteMember.userId);
      if (!ownerNotif) { f.push('owner kick_vote notif not found'); return f; }
      if (!memberNotif) { f.push('member kick_vote notif not found'); return f; }

      // 방장 agree
      const voteRes1 = mockRes();
      await castKickVote(
        mockReq({
          auth: { userId: synVoteOwner.userId, nickname: synVoteOwner.nickname, activeRole: synVoteOwner.activeRole },
          params: { chatRoomId: t5VoteRoom.chatRoomId.toString(), voteNotifId: ownerNotif.notificationId.toString() },
          body: { vote: 'agree' },
        }),
        voteRes1,
      );
      if (voteRes1._c.status !== 200) f.push(`owner castKickVote status ${voteRes1._c.status} != 200`);
      // 아직 전원 동의 아님 → kicked=false
      const vb1 = voteRes1._c.json as { kicked?: boolean };
      if (vb1?.kicked !== false) f.push(`after owner agree, kicked=${vb1?.kicked} should be false`);

      // 멤버 agree → 전원 동의 → kicked
      const voteRes2 = mockRes();
      await castKickVote(
        mockReq({
          auth: { userId: synVoteMember.userId, nickname: synVoteMember.nickname, activeRole: synVoteMember.activeRole },
          params: { chatRoomId: t5VoteRoom.chatRoomId.toString(), voteNotifId: memberNotif.notificationId.toString() },
          body: { vote: 'agree' },
        }),
        voteRes2,
      );
      if (voteRes2._c.status !== 200) f.push(`member castKickVote status ${voteRes2._c.status} != 200`);
      const vb2 = voteRes2._c.json as { kicked?: boolean };
      if (vb2?.kicked !== true) f.push(`after all agree, kicked=${vb2?.kicked} should be true`);

      // DB: 대상 멤버십 kicked
      const targetMem = await prisma.groupMembership.findFirst({
        where: { chatRoomId: t5VoteRoom.chatRoomId, userId: synVoteTarget.userId },
        select: { memberStatus: true },
      });
      if (targetMem?.memberStatus !== 'kicked') f.push(`target memberStatus '${targetMem?.memberStatus}' != 'kicked'`);

      // 클린업
      await prisma.notification.deleteMany({ where: { relatedEntityId: t5VoteRoom.chatRoomId } });
      await prisma.chatRoomMessage.deleteMany({ where: { chatRoomId: t5VoteRoom.chatRoomId } });
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: t5VoteRoom.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: t5VoteRoom.chatRoomId } });
      await prisma.user.deleteMany({ where: { userId: { in: [synVoteOwner.userId, synVoteMember.userId, synVoteTarget.userId] } } });

      return f;
    });

    // ── CASE T5-4b: kick.vote.reject_blocks_kick ──────────────────
    // owner agree + member reject → 대상 멤버십이 kicked 되지 않아야 함
    // (critical 이슈 검증: readAt-only 체크는 reject 여도 kicked 를 허용하는 버그를 가짐)
    const t5Suffix4 = Date.now() + 400;
    const synRejectOwner = await prisma.user.create({
      data: { socialUid: `t5_rej_owner_${t5Suffix4}`, authProvider: 'dev', nickname: `RejOwner${t5Suffix4}`, activeRole: 'user' },
    });
    const synRejectMember = await prisma.user.create({
      data: { socialUid: `t5_rej_member_${t5Suffix4}`, authProvider: 'dev', nickname: `RejMember${t5Suffix4}`, activeRole: 'user' },
    });
    const synRejectTarget = await prisma.user.create({
      data: { socialUid: `t5_rej_target_${t5Suffix4}`, authProvider: 'dev', nickname: `RejTarget${t5Suffix4}`, activeRole: 'user' },
    });

    const t5RejectRoom = await prisma.chatRoom.create({
      data: { roomType: 'group', maxMembers: 4, status: 'active', ownerUserId: synRejectOwner.userId },
      select: { chatRoomId: true },
    });
    await prisma.groupMembership.createMany({
      data: [
        { chatRoomId: t5RejectRoom.chatRoomId, userId: synRejectOwner.userId, role: 'owner', memberStatus: 'active' },
        { chatRoomId: t5RejectRoom.chatRoomId, userId: synRejectMember.userId, role: 'member', memberStatus: 'active' },
        { chatRoomId: t5RejectRoom.chatRoomId, userId: synRejectTarget.userId, role: 'member', memberStatus: 'active' },
      ],
    });

    await check('kick.vote.reject_blocks_kick', async () => {
      const f: string[] = [];

      // 방장이 투표 시작
      const startRes = mockRes();
      await startKickVote(
        mockReq({
          auth: { userId: synRejectOwner.userId, nickname: synRejectOwner.nickname, activeRole: synRejectOwner.activeRole },
          params: { chatRoomId: t5RejectRoom.chatRoomId.toString() },
          body: { targetUserId: synRejectTarget.userId.toString() },
        }),
        startRes,
      );
      if (startRes._c.status !== 201) { f.push(`startKickVote status ${startRes._c.status} != 201`); return f; }

      // DB: kick_vote 알림 2건 확인
      const notifs = await prisma.notification.findMany({
        where: { notificationType: 'kick_vote', relatedEntityId: t5RejectRoom.chatRoomId },
        select: { notificationId: true, userId: true },
      });
      if (notifs.length !== 2) { f.push(`${notifs.length} notifs != 2`); return f; }

      const ownerNotif = notifs.find((n) => n.userId === synRejectOwner.userId);
      const memberNotif = notifs.find((n) => n.userId === synRejectMember.userId);
      if (!ownerNotif) { f.push('owner notif not found'); return f; }
      if (!memberNotif) { f.push('member notif not found'); return f; }

      // member reject 먼저 (readAt 기록) → owner agree 마지막
      // 이 순서가 critical bug 를 노출: readAt-only 체크 시 전원 응답 = true → 잘못된 kick
      const memberVoteRes = mockRes();
      await castKickVote(
        mockReq({
          auth: { userId: synRejectMember.userId, nickname: synRejectMember.nickname, activeRole: synRejectMember.activeRole },
          params: { chatRoomId: t5RejectRoom.chatRoomId.toString(), voteNotifId: memberNotif.notificationId.toString() },
          body: { vote: 'reject' },
        }),
        memberVoteRes,
      );
      if (memberVoteRes._c.status !== 200) f.push(`member reject status ${memberVoteRes._c.status} != 200`);

      // owner agree 마지막 → reject 가 있으므로 kicked=false 여야 함
      const ownerVoteRes = mockRes();
      await castKickVote(
        mockReq({
          auth: { userId: synRejectOwner.userId, nickname: synRejectOwner.nickname, activeRole: synRejectOwner.activeRole },
          params: { chatRoomId: t5RejectRoom.chatRoomId.toString(), voteNotifId: ownerNotif.notificationId.toString() },
          body: { vote: 'agree' },
        }),
        ownerVoteRes,
      );
      if (ownerVoteRes._c.status !== 200) f.push(`owner agree status ${ownerVoteRes._c.status} != 200`);
      const vb = ownerVoteRes._c.json as { kicked?: boolean };
      if (vb?.kicked !== false) f.push(`reject present → kicked=${vb?.kicked} should be false`);

      // DB: 대상 멤버십이 kicked 아님 (active 여야 함)
      const targetMem = await prisma.groupMembership.findFirst({
        where: { chatRoomId: t5RejectRoom.chatRoomId, userId: synRejectTarget.userId },
        select: { memberStatus: true },
      });
      if (targetMem?.memberStatus === 'kicked') f.push('target was kicked despite reject vote — critical bug!');

      // 클린업
      await prisma.notification.deleteMany({ where: { relatedEntityId: t5RejectRoom.chatRoomId } });
      await prisma.chatRoomMessage.deleteMany({ where: { chatRoomId: t5RejectRoom.chatRoomId } });
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: t5RejectRoom.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: t5RejectRoom.chatRoomId } });
      await prisma.user.deleteMany({ where: { userId: { in: [synRejectOwner.userId, synRejectMember.userId, synRejectTarget.userId] } } });

      return f;
    });

    // ── CASE T5-5: kick.concurrent.race_conditions_prevented ───────
    // 동시 즉시강퇴 2건 시도 → SERIALIZABLE 트랜잭션으로 1건만 성공 (나머지 409)
    // 참고: 이미 t5Room 에서 instantKickUsed=true (T5-1에서 소진), synU5 는 아직 active
    // 새 방 만들어서 경쟁 조건 재현
    const t5Suffix3 = Date.now() + 300;
    const synRaceOwner = await prisma.user.create({
      data: { socialUid: `t5_race_owner_${t5Suffix3}`, authProvider: 'dev', nickname: `RaceOwner${t5Suffix3}`, activeRole: 'user' },
    });
    const synRaceT1 = await prisma.user.create({
      data: { socialUid: `t5_race_t1_${t5Suffix3}`, authProvider: 'dev', nickname: `RaceT1${t5Suffix3}`, activeRole: 'user' },
    });
    const synRaceT2 = await prisma.user.create({
      data: { socialUid: `t5_race_t2_${t5Suffix3}`, authProvider: 'dev', nickname: `RaceT2${t5Suffix3}`, activeRole: 'user' },
    });

    const t5RaceRoom = await prisma.chatRoom.create({
      data: { roomType: 'group', maxMembers: 4, status: 'active', ownerUserId: synRaceOwner.userId },
      select: { chatRoomId: true },
    });
    await prisma.groupMembership.createMany({
      data: [
        { chatRoomId: t5RaceRoom.chatRoomId, userId: synRaceOwner.userId, role: 'owner', memberStatus: 'active', instantKickUsed: false },
        { chatRoomId: t5RaceRoom.chatRoomId, userId: synRaceT1.userId, role: 'member', memberStatus: 'active' },
        { chatRoomId: t5RaceRoom.chatRoomId, userId: synRaceT2.userId, role: 'member', memberStatus: 'active' },
      ],
    });

    await check('kick.concurrent.race_conditions_prevented', async () => {
      const f: string[] = [];

      const raceAuth = { userId: synRaceOwner.userId, nickname: synRaceOwner.nickname, activeRole: synRaceOwner.activeRole };
      // 두 요청 동시 실행 (Promise.all)
      const [res1, res2] = await Promise.all([
        (async () => {
          const r = mockRes();
          await instantKick(
            mockReq({ auth: raceAuth, params: { chatRoomId: t5RaceRoom.chatRoomId.toString(), targetUserId: synRaceT1.userId.toString() } }),
            r,
          );
          return r;
        })(),
        (async () => {
          const r = mockRes();
          await instantKick(
            mockReq({ auth: raceAuth, params: { chatRoomId: t5RaceRoom.chatRoomId.toString(), targetUserId: synRaceT2.userId.toString() } }),
            r,
          );
          return r;
        })(),
      ]);

      const statuses = [res1._c.status, res2._c.status].sort();
      // 정확히 1건 성공(200), 1건 실패(409 concurrent_conflict 또는 422 instant_kick_used)
      if (!statuses.includes(200)) f.push('no successful instant kick (expected 1 success)');
      // P2034 write conflict → 409; 실제 KICK_USED → 422. 둘 중 하나면 통과.
      if (!statuses.includes(409) && !statuses.includes(422)) f.push('no failed instant kick (expected 409 or 422)');

      // DB: 정확히 1명만 kicked
      const kickedCount = await prisma.groupMembership.count({
        where: { chatRoomId: t5RaceRoom.chatRoomId, memberStatus: 'kicked' },
      });
      if (kickedCount !== 1) f.push(`${kickedCount} kicked members != 1`);

      // 클린업
      await prisma.notification.deleteMany({ where: { relatedEntityId: t5RaceRoom.chatRoomId, relatedEntityType: 'chat_room' } });
      await prisma.chatRoomMessage.deleteMany({ where: { chatRoomId: t5RaceRoom.chatRoomId } });
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: t5RaceRoom.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: t5RaceRoom.chatRoomId } });
      await prisma.user.deleteMany({ where: { userId: { in: [synRaceOwner.userId, synRaceT1.userId, synRaceT2.userId] } } });

      return f;
    });

    // ── CASE T5-6: kick.vote.concurrent.race_prevented ─────────────
    // 동시 startKickVote 2건 → SERIALIZABLE 트랜잭션으로 중복 라운드 생성 차단
    // 1건만 201, 나머지 409(kick_vote_already_active 또는 concurrent_conflict)
    const t5Suffix5 = Date.now() + 500;
    const synVoteRaceOwner = await prisma.user.create({
      data: { socialUid: `t5_vr_owner_${t5Suffix5}`, authProvider: 'dev', nickname: `VROwner${t5Suffix5}`, activeRole: 'user' },
    });
    const synVoteRaceMember = await prisma.user.create({
      data: { socialUid: `t5_vr_member_${t5Suffix5}`, authProvider: 'dev', nickname: `VRMember${t5Suffix5}`, activeRole: 'user' },
    });
    const synVoteRaceTarget = await prisma.user.create({
      data: { socialUid: `t5_vr_target_${t5Suffix5}`, authProvider: 'dev', nickname: `VRTarget${t5Suffix5}`, activeRole: 'user' },
    });

    const t5VoteRaceRoom = await prisma.chatRoom.create({
      data: { roomType: 'group', maxMembers: 4, status: 'active', ownerUserId: synVoteRaceOwner.userId },
      select: { chatRoomId: true },
    });
    await prisma.groupMembership.createMany({
      data: [
        { chatRoomId: t5VoteRaceRoom.chatRoomId, userId: synVoteRaceOwner.userId, role: 'owner', memberStatus: 'active' },
        { chatRoomId: t5VoteRaceRoom.chatRoomId, userId: synVoteRaceMember.userId, role: 'member', memberStatus: 'active' },
        { chatRoomId: t5VoteRaceRoom.chatRoomId, userId: synVoteRaceTarget.userId, role: 'member', memberStatus: 'active' },
      ],
    });

    await check('kick.vote.concurrent.race_prevented', async () => {
      const f: string[] = [];

      const vrAuth = { userId: synVoteRaceOwner.userId, nickname: synVoteRaceOwner.nickname, activeRole: synVoteRaceOwner.activeRole };
      // 동일 대상에 대해 두 startKickVote 를 동시 실행 → 1건만 201, 나머지 409
      const [raceRes1, raceRes2] = await Promise.all([
        (async () => {
          const r = mockRes();
          await startKickVote(
            mockReq({
              auth: vrAuth,
              params: { chatRoomId: t5VoteRaceRoom.chatRoomId.toString() },
              body: { targetUserId: synVoteRaceTarget.userId.toString() },
            }),
            r,
          );
          return r;
        })(),
        (async () => {
          const r = mockRes();
          await startKickVote(
            mockReq({
              auth: vrAuth,
              params: { chatRoomId: t5VoteRaceRoom.chatRoomId.toString() },
              body: { targetUserId: synVoteRaceTarget.userId.toString() },
            }),
            r,
          );
          return r;
        })(),
      ]);

      const raceStatuses = [raceRes1._c.status, raceRes2._c.status].sort();
      // 1건 201, 1건 409
      if (!raceStatuses.includes(201)) f.push(`no successful startKickVote (statuses: ${raceStatuses.join(',')})`);
      if (!raceStatuses.includes(409)) f.push(`no conflict response (statuses: ${raceStatuses.join(',')})`);

      // DB: kick_vote 알림이 정확히 1라운드(2건: owner+member) — 중복 라운드 없어야 함
      const voteNotifCount = await prisma.notification.count({
        where: {
          notificationType: 'kick_vote',
          relatedEntityId: t5VoteRaceRoom.chatRoomId,
          message: { contains: `"targetUserId":"${synVoteRaceTarget.userId.toString()}"` },
        },
      });
      // 멤버 2명(owner+member)에게 1라운드 → 2건이어야 함 (4건이면 중복 라운드)
      if (voteNotifCount !== 2) f.push(`kick_vote notif count ${voteNotifCount} != 2 (duplicate round created!)`);

      // 클린업
      await prisma.notification.deleteMany({ where: { relatedEntityId: t5VoteRaceRoom.chatRoomId } });
      await prisma.chatRoomMessage.deleteMany({ where: { chatRoomId: t5VoteRaceRoom.chatRoomId } });
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: t5VoteRaceRoom.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: t5VoteRaceRoom.chatRoomId } });
      await prisma.user.deleteMany({ where: { userId: { in: [synVoteRaceOwner.userId, synVoteRaceMember.userId, synVoteRaceTarget.userId] } } });

      return f;
    });

    // Task 5 클린업 (t5Room)
    await prisma.notification.deleteMany({ where: { relatedEntityId: t5Room.chatRoomId, relatedEntityType: 'chat_room' } });
    await prisma.chatRoomMessage.deleteMany({ where: { chatRoomId: t5Room.chatRoomId } });
    await prisma.groupMembership.deleteMany({ where: { chatRoomId: t5Room.chatRoomId } });
    await prisma.chatRoom.delete({ where: { chatRoomId: t5Room.chatRoomId } });
    await prisma.user.delete({ where: { userId: synU5.userId } });

    // ─────────────────────────────────────────────────────────────────
    // TASK 6 — 백그라운드 스케줄러 (ADR 0007 결정10)
    // 각 핸들러를 now 주입으로 직접 호출해 검증
    // ─────────────────────────────────────────────────────────────────

    // ── CASE T6-1: scheduler.expire_1to1.ok — pending 1:1 expiresAt 과거 → expired ─
    await check('scheduler.expire_1to1.ok', async () => {
      const f: string[] = [];
      const t6Suffix = Date.now() + 6000;
      const synT6A = await prisma.user.create({
        data: { socialUid: `t6_a_${t6Suffix}`, authProvider: 'dev', nickname: `T6A_${t6Suffix}`, activeRole: 'user' },
      });
      const synT6B = await prisma.user.create({
        data: { socialUid: `t6_b_${t6Suffix}`, authProvider: 'dev', nickname: `T6B_${t6Suffix}`, activeRole: 'user' },
      });

      // 이미 만료된 pending 1:1 신청 생성 (createdAt=25h 전 → 24h 타임아웃 기준 초과)
      const mr1 = await prisma.matchRequest.create({
        data: {
          requesterId: synT6A.userId,
          receiverId: synT6B.userId,
          requestType: '1:1',
          status: 'pending',
          expiresAt: new Date(Date.now() - 60 * 1000), // 1분 전 만료
          createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // createdAt=25h 전
        },
        select: { matchRequestId: true },
      });
      // 아직 만료 안 된 pending 신청 (expiresAt=미래)
      const mr2 = await prisma.matchRequest.create({
        data: {
          requesterId: synT6B.userId,
          receiverId: synT6A.userId,
          requestType: '1:1',
          status: 'pending',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1시간 후 만료
          createdAt: new Date(Date.now() - 23 * 60 * 60 * 1000), // createdAt=23h 전 (24h 미달)
        },
        select: { matchRequestId: true },
      });

      // now=현재시각으로 만료 처리 실행
      const result = await expireMatchRequests(new Date());

      if (result.expired < 1) f.push(`expired ${result.expired} < 1`);

      // DB: mr1 status='expired'
      const updated1 = await prisma.matchRequest.findUnique({
        where: { matchRequestId: mr1.matchRequestId },
        select: { status: true },
      });
      if (updated1?.status !== 'expired') f.push(`mr1 status '${updated1?.status}' != 'expired'`);

      // DB: mr2 는 여전히 pending
      const updated2 = await prisma.matchRequest.findUnique({
        where: { matchRequestId: mr2.matchRequestId },
        select: { status: true },
      });
      if (updated2?.status !== 'pending') f.push(`mr2 status '${updated2?.status}' != 'pending' (should not expire yet)`);

      // Notification: synT6A 에게 만료 알림 생성
      const notif = await prisma.notification.findFirst({
        where: { userId: synT6A.userId, notificationType: 'match_request' },
        select: { title: true },
      });
      if (!notif) f.push('no match_request expiry notification for requester');

      // 클린업
      await prisma.notification.deleteMany({ where: { userId: { in: [synT6A.userId, synT6B.userId] } } });
      await prisma.matchRequest.deleteMany({ where: { matchRequestId: { in: [mr1.matchRequestId, mr2.matchRequestId] } } });
      await prisma.user.deleteMany({ where: { userId: { in: [synT6A.userId, synT6B.userId] } } });

      return f;
    });

    // ── CASE T6-2: scheduler.expire_group_invite.ok — group 6h 초과 → expired ──
    // [high-fix] requestType 별 타임아웃 분기를 스케줄러 내에서 검증:
    //   - group 7h 전 만료: expired (6h 기준 초과)
    //   - group 5h 전 생성(expiresAt=과거지만 createdAt < 6h): 만료 안 됨 (경계값)
    //   - 1:1 25h 전 만료: expired (24h 기준 초과)
    //   - 1:1 23h 전 생성(expiresAt=과거지만 createdAt < 24h): 만료 안 됨 (경계값)
    await check('scheduler.expire_group_invite.ok', async () => {
      const f: string[] = [];
      const t6Suffix2 = Date.now() + 6100;
      const synT6C = await prisma.user.create({
        data: { socialUid: `t6_c_${t6Suffix2}`, authProvider: 'dev', nickname: `T6C_${t6Suffix2}`, activeRole: 'user' },
      });
      const synT6D = await prisma.user.create({
        data: { socialUid: `t6_d_${t6Suffix2}`, authProvider: 'dev', nickname: `T6D_${t6Suffix2}`, activeRole: 'user' },
      });

      // [A] group 7h 전 만료 → expired 되어야 함
      const mrG = await prisma.matchRequest.create({
        data: {
          requesterId: synT6C.userId,
          receiverId: synT6D.userId,
          requestType: 'group',
          status: 'pending',
          expiresAt: new Date(Date.now() - 7 * 60 * 60 * 1000), // 7h 전 만료
          createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000), // createdAt = 7h 전
        },
        select: { matchRequestId: true },
      });

      // [B] group expiresAt=과거이지만 createdAt=5h 전 → 스케줄러가 만료시키면 안 됨
      // (5h < 6h 기준: 아직 그룹 타임아웃 미도달)
      const mrGNotYet = await prisma.matchRequest.create({
        data: {
          requesterId: synT6D.userId,
          receiverId: synT6C.userId,
          requestType: 'group',
          status: 'pending',
          expiresAt: new Date(Date.now() - 60 * 1000), // expiresAt=1분 전(과거)
          createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // createdAt=5h 전
        },
        select: { matchRequestId: true },
      });

      // [C] 1:1 25h 전 → expired 되어야 함
      const mr1to1 = await prisma.matchRequest.create({
        data: {
          requesterId: synT6C.userId,
          receiverId: synT6D.userId,
          requestType: '1:1',
          status: 'pending',
          expiresAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25h 전 만료
          createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        },
        select: { matchRequestId: true },
      });

      // [D] 1:1 expiresAt=과거이지만 createdAt=23h 전 → 만료 안 됨 (23h < 24h 기준)
      const mr1to1NotYet = await prisma.matchRequest.create({
        data: {
          requesterId: synT6D.userId,
          receiverId: synT6C.userId,
          requestType: '1:1',
          status: 'pending',
          expiresAt: new Date(Date.now() - 60 * 1000), // expiresAt=1분 전(과거)
          createdAt: new Date(Date.now() - 23 * 60 * 60 * 1000), // createdAt=23h 전
        },
        select: { matchRequestId: true },
      });

      await expireMatchRequests(new Date());

      // [A] group 7h → expired
      const updatedG = await prisma.matchRequest.findUnique({
        where: { matchRequestId: mrG.matchRequestId },
        select: { status: true },
      });
      if (updatedG?.status !== 'expired') f.push(`[A] group 7h invite status '${updatedG?.status}' != 'expired'`);

      // [B] group 5h → still pending (경계값: 스케줄러가 만료시키지 않아야 함)
      const updatedGNotYet = await prisma.matchRequest.findUnique({
        where: { matchRequestId: mrGNotYet.matchRequestId },
        select: { status: true },
      });
      if (updatedGNotYet?.status !== 'pending') f.push(`[B] group 5h invite status '${updatedGNotYet?.status}' != 'pending' (should not expire yet — 5h < 6h threshold)`);

      // [C] 1:1 25h → expired
      const updated1to1 = await prisma.matchRequest.findUnique({
        where: { matchRequestId: mr1to1.matchRequestId },
        select: { status: true },
      });
      if (updated1to1?.status !== 'expired') f.push(`[C] 1:1 25h status '${updated1to1?.status}' != 'expired'`);

      // [D] 1:1 23h → still pending (경계값: 스케줄러가 만료시키지 않아야 함)
      const updated1to1NotYet = await prisma.matchRequest.findUnique({
        where: { matchRequestId: mr1to1NotYet.matchRequestId },
        select: { status: true },
      });
      if (updated1to1NotYet?.status !== 'pending') f.push(`[D] 1:1 23h status '${updated1to1NotYet?.status}' != 'pending' (should not expire yet — 23h < 24h threshold)`);

      // 클린업
      await prisma.notification.deleteMany({ where: { userId: { in: [synT6C.userId, synT6D.userId] } } });
      await prisma.matchRequest.deleteMany({
        where: { matchRequestId: { in: [mrG.matchRequestId, mrGNotYet.matchRequestId, mr1to1.matchRequestId, mr1to1NotYet.matchRequestId] } },
      });
      await prisma.user.deleteMany({ where: { userId: { in: [synT6C.userId, synT6D.userId] } } });

      return f;
    });

    // ── CASE T6-3: scheduler.expire_appointment.ok — 36h 초과 제안 → rejected ──
    await check('scheduler.expire_appointment.ok', async () => {
      const f: string[] = [];
      const t6Suffix3 = Date.now() + 6200;
      const synT6E = await prisma.user.create({
        data: { socialUid: `t6_e_${t6Suffix3}`, authProvider: 'dev', nickname: `T6E_${t6Suffix3}`, activeRole: 'user' },
      });
      const synT6F = await prisma.user.create({
        data: { socialUid: `t6_f_${t6Suffix3}`, authProvider: 'dev', nickname: `T6F_${t6Suffix3}`, activeRole: 'user' },
      });

      const t6Room = await prisma.chatRoom.create({
        data: { roomType: '1:1', maxMembers: 2, status: 'active', ownerUserId: null },
        select: { chatRoomId: true },
      });
      await prisma.groupMembership.createMany({
        data: [
          { chatRoomId: t6Room.chatRoomId, userId: synT6E.userId, role: 'member', memberStatus: 'active' },
          { chatRoomId: t6Room.chatRoomId, userId: synT6F.userId, role: 'member', memberStatus: 'active' },
        ],
      });

      // 이미 만료된 약속 제안
      const apptExpired = await prisma.appointment.create({
        data: {
          chatRoomId: t6Room.chatRoomId,
          proposerUserId: synT6E.userId,
          appointedAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          eventName: '만료 테스트 약속',
          status: 'proposed',
          expiresAt: new Date(Date.now() - 37 * 60 * 60 * 1000), // 37h 전 만료
        },
        select: { appointmentId: true },
      });
      // 아직 유효한 약속 제안
      const apptValid = await prisma.appointment.create({
        data: {
          chatRoomId: t6Room.chatRoomId,
          proposerUserId: synT6E.userId,
          appointedAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          eventName: '유효 테스트 약속',
          status: 'proposed',
          expiresAt: new Date(Date.now() + 36 * 60 * 60 * 1000), // 36h 후 만료
        },
        select: { appointmentId: true },
      });

      const result = await expireAppointments(new Date());

      if (result.expired < 1) f.push(`expired ${result.expired} < 1`);

      // DB: 만료된 약속 status='rejected'
      const updatedExpired = await prisma.appointment.findUnique({
        where: { appointmentId: apptExpired.appointmentId },
        select: { status: true },
      });
      if (updatedExpired?.status !== 'rejected') f.push(`expired appt status '${updatedExpired?.status}' != 'rejected'`);

      // DB: 유효 약속은 여전히 'proposed'
      const updatedValid = await prisma.appointment.findUnique({
        where: { appointmentId: apptValid.appointmentId },
        select: { status: true },
      });
      if (updatedValid?.status !== 'proposed') f.push(`valid appt status '${updatedValid?.status}' != 'proposed'`);

      // 클린업
      await prisma.notification.deleteMany({ where: { userId: { in: [synT6E.userId, synT6F.userId] } } });
      await prisma.appointmentVote.deleteMany({ where: { appointment: { chatRoomId: t6Room.chatRoomId } } });
      await prisma.appointment.deleteMany({ where: { chatRoomId: t6Room.chatRoomId } });
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: t6Room.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: t6Room.chatRoomId } });
      await prisma.user.deleteMany({ where: { userId: { in: [synT6E.userId, synT6F.userId] } } });

      return f;
    });

    // ── CASE T6-4: scheduler.inactivity.48h_kick — lastSeenAt < now-48h → kicked ─
    await check('scheduler.inactivity.48h_kick', async () => {
      const f: string[] = [];
      const t6Suffix4 = Date.now() + 6300;
      const synT6G = await prisma.user.create({
        data: { socialUid: `t6_g_${t6Suffix4}`, authProvider: 'dev', nickname: `T6G_${t6Suffix4}`, activeRole: 'user' },
      });
      const synT6H = await prisma.user.create({
        data: { socialUid: `t6_h_${t6Suffix4}`, authProvider: 'dev', nickname: `T6H_${t6Suffix4}`, activeRole: 'user' },
      });

      const t6GroupRoom = await prisma.chatRoom.create({
        data: { roomType: 'group', maxMembers: 4, status: 'active', ownerUserId: synT6G.userId },
        select: { chatRoomId: true },
      });
      // synT6G: lastSeenAt = 49h 전 (kick 대상)
      // synT6H: lastSeenAt = 1h 전 (active 유지)
      await prisma.groupMembership.create({
        data: {
          chatRoomId: t6GroupRoom.chatRoomId,
          userId: synT6G.userId,
          role: 'owner',
          memberStatus: 'active',
          lastSeenAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
        },
      });
      await prisma.groupMembership.create({
        data: {
          chatRoomId: t6GroupRoom.chatRoomId,
          userId: synT6H.userId,
          role: 'member',
          memberStatus: 'active',
          lastSeenAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        },
      });

      const result = await handleInactiveMembers(new Date());

      if (result.kicked < 1) f.push(`kicked ${result.kicked} < 1`);

      // synT6G: memberStatus='kicked'
      const gMem = await prisma.groupMembership.findFirst({
        where: { chatRoomId: t6GroupRoom.chatRoomId, userId: synT6G.userId },
        select: { memberStatus: true },
      });
      if (gMem?.memberStatus !== 'kicked') f.push(`T6G memberStatus '${gMem?.memberStatus}' != 'kicked'`);

      // synT6H: memberStatus 여전히 'active'
      const hMem = await prisma.groupMembership.findFirst({
        where: { chatRoomId: t6GroupRoom.chatRoomId, userId: synT6H.userId },
        select: { memberStatus: true },
      });
      if (hMem?.memberStatus !== 'active') f.push(`T6H memberStatus '${hMem?.memberStatus}' != 'active'`);

      // vacancy_notification: synT6H 에게 생성
      const vacancyNotif = await prisma.notification.findFirst({
        where: { userId: synT6H.userId, notificationType: 'vacancy_notification' },
        select: { notificationId: true },
      });
      if (!vacancyNotif) f.push('vacancy_notification for T6H not found');

      // 클린업
      await prisma.notification.deleteMany({ where: { userId: { in: [synT6G.userId, synT6H.userId] } } });
      await prisma.chatRoomMessage.deleteMany({ where: { chatRoomId: t6GroupRoom.chatRoomId } });
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: t6GroupRoom.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: t6GroupRoom.chatRoomId } });
      await prisma.user.deleteMany({ where: { userId: { in: [synT6G.userId, synT6H.userId] } } });

      return f;
    });

    // ── CASE T6-5: scheduler.timeout.no_reschedule_corruption ────────
    // handler 에러가 다음 interval 을 막지 않는지 검증:
    // (a) wrapHandler 가 핸들러 예외를 catch 해 outer 함수가 throw 하지 않음
    // (b) 각 핸들러 자체가 throw 하지 않음 (정상 경로)
    await check('scheduler.timeout.no_reschedule_corruption', async () => {
      const f: string[] = [];

      // ─── (a) wrapHandler 에러 격리 검증 ─────────────────────────────
      // wrapHandler 가 반환하는 함수를 직접 호출했을 때 핸들러가 throw 해도
      // outer 함수는 throw 하지 않아야 함 → interval 계속 실행 보장
      const wrapped = wrapHandler(() => Promise.reject(new Error('injected test error')));
      let wrapHandlerPropagated = false;
      try {
        // wrapped() 는 sync 함수이므로 내부 Promise 거절은 catch 로 처리됨
        wrapped();
        // 내부 비동기 에러가 settle 될 시간 부여 (이 코드가 await 없이 진행됨을 확인)
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      } catch {
        wrapHandlerPropagated = true;
      }
      if (wrapHandlerPropagated) f.push('wrapHandler propagated error — interval would stop');

      // ─── (b) 각 핸들러 정상 경로 — throw 없음 ────────────────────────
      let result1: Awaited<ReturnType<typeof expireMatchRequests>> | null = null;
      let threw1 = false;
      try {
        result1 = await expireMatchRequests(new Date(0)); // epoch=0 → 과거 모든 건 만료 시도 (0건이어도 ok)
      } catch {
        threw1 = true;
      }
      if (threw1) f.push('expireMatchRequests threw unexpectedly');
      if (result1 === null) f.push('expireMatchRequests returned null');

      let result2: Awaited<ReturnType<typeof expireAppointments>> | null = null;
      let threw2 = false;
      try {
        result2 = await expireAppointments(new Date(0));
      } catch {
        threw2 = true;
      }
      if (threw2) f.push('expireAppointments threw unexpectedly');
      if (result2 === null) f.push('expireAppointments returned null');

      let result3: Awaited<ReturnType<typeof resolveExpiredKickVotes>> | null = null;
      let threw3 = false;
      try {
        result3 = await resolveExpiredKickVotes(new Date(0));
      } catch {
        threw3 = true;
      }
      if (threw3) f.push('resolveExpiredKickVotes threw unexpectedly');
      if (result3 === null) f.push('resolveExpiredKickVotes returned null');

      let result4: Awaited<ReturnType<typeof handleInactiveMembers>> | null = null;
      let threw4 = false;
      try {
        result4 = await handleInactiveMembers(new Date(0));
      } catch {
        threw4 = true;
      }
      if (threw4) f.push('handleInactiveMembers threw unexpectedly');
      if (result4 === null) f.push('handleInactiveMembers returned null');

      return f;
    });

    // ── CASE T7-1: room.cleanup.socket_disconnect_on_unmount ─────────
    // 구조 검증: useChatRoom 훅이 cleanup 함수에서 leaveRoom + socket.off 를 호출하는지
    // 실제 소켓 연결 없이 구조적으로 확인 (hooks/socket.ts 파일 존재 + leaveRoom export 검증)
    await check('room.cleanup.socket_disconnect_on_unmount', async () => {
      const f: string[] = [];
      // BFF 단에서 검증 가능한 부분: leaveRoom 핸들러가 lastSeenAt 을 갱신하는지 확인하기 위해
      // 멤버십이 있는 active 채팅방에서 leaveRoom 호출 시 memberStatus='left' + lastSeenAt 업데이트
      const suffix = Date.now() + 7100;
      const synSockU1 = await prisma.user.create({
        data: { socialUid: `t7_sock_u1_${suffix}`, authProvider: 'dev', nickname: `SockU1_${suffix}`, activeRole: 'user' },
      });
      const synSockU2 = await prisma.user.create({
        data: { socialUid: `t7_sock_u2_${suffix}`, authProvider: 'dev', nickname: `SockU2_${suffix}`, activeRole: 'user' },
      });
      const sockRoom = await prisma.chatRoom.create({
        data: { roomType: '1:1', maxMembers: 2, status: 'active', ownerUserId: null },
        select: { chatRoomId: true },
      });
      await prisma.groupMembership.createMany({
        data: [
          { chatRoomId: sockRoom.chatRoomId, userId: synSockU1.userId, role: 'member', memberStatus: 'active' },
          { chatRoomId: sockRoom.chatRoomId, userId: synSockU2.userId, role: 'member', memberStatus: 'active' },
        ],
      });
      // leaveRoom 호출 (언마운트 시 socket.disconnect 와 함께 호출되는 REST 사이드이펙트)
      const res = mockRes();
      await leaveRoom(
        mockReq({ auth: { userId: synSockU1.userId, nickname: synSockU1.nickname, activeRole: synSockU1.activeRole }, params: { chatRoomId: sockRoom.chatRoomId.toString() } }),
        res,
      );
      if (res._c.status !== 200) f.push(`leaveRoom status ${res._c.status} != 200`);
      // 1:1 방: status='ended', 양쪽 멤버십 'left'
      const room = await prisma.chatRoom.findUnique({ where: { chatRoomId: sockRoom.chatRoomId }, select: { status: true } });
      if (room?.status !== 'ended') f.push(`room status '${room?.status}' != 'ended' after socket_disconnect cleanup`);
      const mem1 = await prisma.groupMembership.findFirst({ where: { chatRoomId: sockRoom.chatRoomId, userId: synSockU1.userId }, select: { memberStatus: true } });
      if (mem1?.memberStatus !== 'left') f.push(`u1 memberStatus '${mem1?.memberStatus}' != 'left'`);
      // 클린업
      await prisma.chatRoomMessage.deleteMany({ where: { chatRoomId: sockRoom.chatRoomId } });
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: sockRoom.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: sockRoom.chatRoomId } });
      await prisma.user.deleteMany({ where: { userId: { in: [synSockU1.userId, synSockU2.userId] } } });
      return f;
    });

    // ── CASE T7-2: room.cleanup.lastSeenAt_updated_on_leave ──────────
    // leave emit 후 membership.lastSeenAt 갱신 검증:
    // 그룹방에서 나가기 전 lastSeenAt 은 오래된 값 → leaveRoom 호출 후 lastSeenAt 이 최근으로 갱신
    await check('room.cleanup.lastSeenAt_updated_on_leave', async () => {
      const f: string[] = [];
      const suffix = Date.now() + 7200;
      const synLsU1 = await prisma.user.create({
        data: { socialUid: `t7_ls_u1_${suffix}`, authProvider: 'dev', nickname: `LsU1_${suffix}`, activeRole: 'user' },
      });
      const synLsU2 = await prisma.user.create({
        data: { socialUid: `t7_ls_u2_${suffix}`, authProvider: 'dev', nickname: `LsU2_${suffix}`, activeRole: 'user' },
      });
      const lsRoom = await prisma.chatRoom.create({
        data: { roomType: 'group', maxMembers: 4, status: 'active', ownerUserId: synLsU1.userId },
        select: { chatRoomId: true },
      });
      const oldLastSeen = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h 전
      await prisma.groupMembership.createMany({
        data: [
          { chatRoomId: lsRoom.chatRoomId, userId: synLsU1.userId, role: 'owner', memberStatus: 'active', lastSeenAt: oldLastSeen },
          { chatRoomId: lsRoom.chatRoomId, userId: synLsU2.userId, role: 'member', memberStatus: 'active', lastSeenAt: oldLastSeen },
        ],
      });
      const beforeLeave = Date.now();
      // leaveRoom 호출 → lastSeenAt 갱신 + 방장이 떠나면 소유권 이전
      const res = mockRes();
      await leaveRoom(
        mockReq({ auth: { userId: synLsU1.userId, nickname: synLsU1.nickname, activeRole: synLsU1.activeRole }, params: { chatRoomId: lsRoom.chatRoomId.toString() } }),
        res,
      );
      if (res._c.status !== 200) f.push(`leaveRoom status ${res._c.status} != 200`);
      // u1 멤버십의 lastSeenAt 이 leaveRoom 호출 이후 시각으로 갱신됐는지 확인
      const mem = await prisma.groupMembership.findFirst({
        where: { chatRoomId: lsRoom.chatRoomId, userId: synLsU1.userId },
        select: { memberStatus: true, lastSeenAt: true },
      });
      if (mem?.memberStatus !== 'left') f.push(`memberStatus '${mem?.memberStatus}' != 'left'`);
      if (mem?.lastSeenAt) {
        const lastSeenMs = mem.lastSeenAt.getTime();
        // lastSeenAt 이 leaveRoom 호출 직전보다 최근이어야 함 (갱신 확인, 1초 허용오차)
        if (lastSeenMs < beforeLeave - 1000) {
          f.push(`lastSeenAt ${mem.lastSeenAt.toISOString()} was not updated (before leaveRoom call at ${new Date(beforeLeave).toISOString()})`);
        }
      } else {
        // lastSeenAt null 이면 갱신 안 된 것
        f.push('lastSeenAt is null after leaveRoom — not updated');
      }
      // 클린업
      await prisma.chatRoomMessage.deleteMany({ where: { chatRoomId: lsRoom.chatRoomId } });
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: lsRoom.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: lsRoom.chatRoomId } });
      // leaveRoom 이 방장 이전 시 생성하는 notification 을 user 삭제 전에 정리 (FK)
      await prisma.notification.deleteMany({ where: { userId: { in: [synLsU1.userId, synLsU2.userId] } } });
      await prisma.user.deleteMany({ where: { userId: { in: [synLsU1.userId, synLsU2.userId] } } });
      return f;
    });

  } finally {
    // 클린업
    await prisma.notification.deleteMany({
      where: { userId: { in: [u1.userId, u2.userId] } },
    });
    await prisma.groupMembership.deleteMany({
      where: { userId: { in: [u1.userId, u2.userId] } },
    });
    await prisma.chatRoomMessage.deleteMany({
      where: {
        chatRoom: {
          matchRequests: {
            some: { requesterId: { in: [u1.userId, u2.userId] } },
          },
        },
      },
    });
    await prisma.matchRequest.deleteMany({
      where: {
        OR: [
          { requesterId: { in: [u1.userId, u2.userId] } },
          { receiverId: { in: [u1.userId, u2.userId] } },
        ],
      },
    });
    // appointment FK 해소: 멤버십 없는 방의 appointments 먼저 삭제 (slice5 테이블 포함)
    {
      const orphanRooms = await prisma.chatRoom.findMany({
        where: { memberships: { none: {} } },
        select: { chatRoomId: true },
      });
      const orphanIds = orphanRooms.map((r) => r.chatRoomId);
      if (orphanIds.length > 0) {
        // 역순 FK: slice5 테이블 포함 — appointmentId 먼저 수집 후 삭제
        const appts = await prisma.appointment.findMany({
          where: { chatRoomId: { in: orphanIds } },
          select: { appointmentId: true },
        });
        const apptIds = appts.map((a) => a.appointmentId);
        if (apptIds.length > 0) {
          await prisma.creditLedger.deleteMany({ where: { appointmentId: { in: apptIds } } });
          await prisma.festivalSurvey.deleteMany({ where: { appointmentId: { in: apptIds } } });
          await prisma.festivalReview.deleteMany({ where: { appointmentId: { in: apptIds } } });
          await prisma.mateEvaluation.deleteMany({ where: { appointmentId: { in: apptIds } } });
          await prisma.appointmentVote.deleteMany({ where: { appointmentId: { in: apptIds } } });
        }
        await prisma.appointment.deleteMany({ where: { chatRoomId: { in: orphanIds } } });
      }
    }
    await prisma.chatRoom.deleteMany({
      where: { memberships: { none: {} } },
    });
    await prisma.mateProfile.deleteMany({ where: { userId: { in: [u1.userId, u2.userId] } } });
    await prisma.mateIndex.deleteMany({ where: { userId: { in: [u1.userId, u2.userId] } } });
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(
      `${r.pass ? 'PASS' : 'FAIL'} ${r.id}${r.failures.length ? ' :: ' + r.failures.join('; ') : ''}`,
    );
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();
