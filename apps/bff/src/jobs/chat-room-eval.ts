/**
 * chat-room-eval.ts — in-process 검증 하니스 (PASS/FAIL)
 * Task 3: 신청 REST (1:1 A_803 / 그룹 A_804 / 수락·거절·목록)
 * Task 4: 채팅방 REST (메시지이력/약속/이벤트선택/나가기/차단 A_805)
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
} from '../routes/chat-room.js';

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
