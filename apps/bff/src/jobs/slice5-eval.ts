/**
 * slice5-eval.ts — Slice 5 in-process 검증 하니스 (PASS/FAIL)
 * 실행: npm run slice5:eval (apps/bff 에서)
 *
 * [오버라이드] 전체 구현:
 *   - 그룹 평가: roomType='1:1' 게이트 삭제. 그룹 약속도 지원.
 *   - "다녀온 후" 게이트: confirmed && appointedAt <= now() 일 때만 허용. 아니면 409 not_attended_yet.
 *   - mate_eval 알림: notifyMateEval() 잡 실행 검증.
 *   - 크레딧 2종: appointment_complete (스케줄러) + mate_eval_complete (평가 제출 시).
 *
 * [이슈8]  mate-eval.ts 수정 없음. 이 파일만 신규 생성.
 * [이슈24] Case 3: 31-byte 문자열('가나다라마바사아자차a') → 400.
 */
import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { submitEvaluation, getMyEvaluation } from '../routes/evaluation.js';
import { listMyCredits } from '../routes/me.js';
import { updateMateIndex } from '../lib/mate-index-updater.js';
import { notifyMateEval } from './chat-scheduler.js';

interface MockAuth { userId: bigint; nickname: string; activeRole: string; }
interface MockReq {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  auth?: MockAuth;
}
interface Captured { status: number; json: unknown; }

function mockRes(): Response & { _c: Captured } {
  const c: Captured = { status: 200, json: undefined };
  return {
    _c: c,
    status(s: number) { c.status = s; return this; },
    json(b: unknown) { c.json = b; return this; },
    end() { return this; },
  } as unknown as Response & { _c: Captured };
}

function mockReq(r: MockReq): Request {
  return { params: r.params ?? {}, query: r.query ?? {}, body: r.body ?? {}, auth: r.auth } as unknown as Request;
}

interface CaseResult { id: string; pass: boolean; failures: string[]; }
const results: CaseResult[] = [];

function check(id: string, fn: () => Promise<string[]>) {
  return fn()
    .then((f) => results.push({ id, pass: f.length === 0, failures: f }))
    .catch((e) => results.push({ id, pass: false, failures: [`threw: ${String(e)}`] }));
}

const BASE_EVAL_BODY = {
  ratingStars: 4,
  q1: 4, q2: 3, q3: 5, q4: 4,
  comment: '재밌었어요',   // UTF-8 15 bytes → OK
  reportedFor: null,
  atmosphere: 4, program: 3, food: 4, safety: 5, transport: 3,
  reviewBody: '정말 즐거운 축제였습니다.',
  reviewRating: 4,
  photoUrls: [],
};

async function main() {
  // ── 픽스처 준비 ────────────────────────────────────────────────────────
  const u1 = await prisma.user.findFirst({ where: { isDeleted: false }, select: { userId: true, nickname: true, activeRole: true } });
  const u2 = await prisma.user.findFirst({ where: { isDeleted: false, userId: { not: u1!.userId } }, select: { userId: true, nickname: true, activeRole: true } });
  if (!u1 || !u2) { console.error('need 2+ users'); process.exit(1); }

  const auth1: MockAuth = { userId: u1.userId, nickname: u1.nickname, activeRole: u1.activeRole };

  // 이벤트 1건 (eventId 픽스처 — [이슈4])
  const event = await prisma.event.findFirst({ where: { approvalStatus: 'approved' }, select: { eventId: true } });
  if (!event) { console.error('need 1+ approved event'); process.exit(1); }

  // [오버라이드] 1:1 채팅방 (roomType 게이트 삭제됐으므로 1:1로 테스트)
  const room = await prisma.chatRoom.create({
    data: { roomType: '1:1', status: 'active', maxMembers: 2 },
    select: { chatRoomId: true },
  });
  await prisma.groupMembership.createMany({ data: [
    { chatRoomId: room.chatRoomId, userId: u1.userId, role: 'member', memberStatus: 'active' },
    { chatRoomId: room.chatRoomId, userId: u2.userId, role: 'member', memberStatus: 'active' },
  ]});

  // [오버라이드] appointedAt = 과거 (1시간 전) — "다녀온 후" 게이트 통과
  const pastAppointedAt = new Date(Date.now() - 60 * 60 * 1000); // 1시간 전
  const appt = await prisma.appointment.create({
    data: {
      chatRoomId: room.chatRoomId,
      proposerUserId: u1.userId,
      status: 'confirmed',
      eventId: event.eventId,
      appointedAt: pastAppointedAt,    // [오버라이드] 과거 시각 — 게이트 통과
      expiresAt: new Date(Date.now() + 36 * 3600 * 1000),
    },
    select: { appointmentId: true },
  });

  // "아직 안 다녀온" 약속: confirmed + appointedAt = 미래
  const futureAppointedAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24시간 후
  const futureAppt = await prisma.appointment.create({
    data: {
      chatRoomId: room.chatRoomId,
      proposerUserId: u1.userId,
      status: 'confirmed',
      eventId: event.eventId,
      appointedAt: futureAppointedAt,  // 미래 → not_attended_yet
      expiresAt: new Date(Date.now() + 36 * 3600 * 1000),
    },
    select: { appointmentId: true },
  });

  // 미확정 약속 게이트용
  const pendingAppt = await prisma.appointment.create({
    data: { chatRoomId: room.chatRoomId, proposerUserId: u1.userId, status: 'proposed', eventId: event.eventId, expiresAt: new Date(Date.now() + 3600 * 1000) },
    select: { appointmentId: true },
  });

  // MateIndex 픽스처 ([이슈26])
  await prisma.mateIndex.upsert({
    where: { userId: u2.userId },
    create: { userId: u2.userId, indexValue: 50 },
    update: {},
  });

  try {
    // ── CASE 1: 정상 평가 제출 201 ──────────────────────────────────────
    await check('eval.submit.ok', async () => {
      const res = mockRes();
      await submitEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: appt.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u2.userId.toString() } }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 201) f.push(`status ${res._c.status} != 201`);
      if (!(res._c.json as { evalId?: string })?.evalId) f.push('no evalId');
      return f;
    });

    // ── CASE 2: 중복 제출 409 ──────────────────────────────────────────
    await check('eval.submit.duplicate_409', async () => {
      const res = mockRes();
      await submitEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: appt.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u2.userId.toString() } }),
        res,
      );
      return res._c.status === 409 ? [] : [`status ${res._c.status} != 409`];
    });

    // ── CASE 3: comment 31 byte 초과 400 ([이슈24]) ────────────────────
    await check('eval.comment.too_long', async () => {
      // '가나다라마바사아자차' = 30 bytes (PASS), 'a' 추가 = 31 bytes → 400
      const longComment = '가나다라마바사아자차a';
      const res = mockRes();
      // 다른 u2 평가용: u2→u1 평가 방향 사용 (u2 auth, 평가 대상 u1)
      await submitEvaluation(
        mockReq({ auth: { userId: u2.userId, nickname: u2.nickname, activeRole: u2.activeRole }, params: { appointmentId: appt.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u1.userId.toString(), comment: longComment } }),
        res,
      );
      return res._c.status === 400 ? [] : [`status ${res._c.status} != 400 (comment_too_long)`];
    });

    // ── CASE 4: [오버라이드] "다녀온 후" 게이트 — appointedAt 미래 → 409 not_attended_yet ──
    await check('eval.gate.not_attended_yet', async () => {
      const res = mockRes();
      await submitEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: futureAppt.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u2.userId.toString() } }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 409) f.push(`status ${res._c.status} != 409 (expected not_attended_yet gate)`);
      const b = res._c.json as { error?: string };
      if (b?.error !== 'not_attended_yet') f.push(`error '${b?.error}' != 'not_attended_yet'`);
      return f;
    });

    // ── CASE 5: 미확정 약속 게이트 409 appointment_not_confirmed ─────────
    await check('eval.gate.not_confirmed', async () => {
      const res = mockRes();
      await submitEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: pendingAppt.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u2.userId.toString() } }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 409) f.push(`status ${res._c.status} != 409`);
      const b = res._c.json as { error?: string };
      if (b?.error !== 'appointment_not_confirmed') f.push(`error '${b?.error}' != 'appointment_not_confirmed'`);
      return f;
    });

    // ── CASE 6: GET evaluation (제출 후 조회) ───────────────────────────
    await check('eval.get.ok', async () => {
      const res = mockRes();
      await getMyEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: appt.appointmentId.toString() } }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
      const b = res._c.json as { evalId?: string; ratingStars?: number };
      if (!b?.evalId) f.push('no evalId');
      if (b?.ratingStars !== 4) f.push(`ratingStars ${b?.ratingStars} != 4`);
      return f;
    });

    // ── CASE 7: CreditLedger mate_eval_complete 적립 검증 ────────────────
    await check('credit.mate_eval_complete.created', async () => {
      const ledger = await prisma.creditLedger.findFirst({
        where: { userId: auth1.userId, action: 'mate_eval_complete', appointmentId: appt.appointmentId },
        select: { pointsAmount: true },
      });
      const f: string[] = [];
      if (!ledger) f.push('CreditLedger mate_eval_complete row not found');
      if (ledger?.pointsAmount !== 10) f.push(`pointsAmount ${ledger?.pointsAmount} != 10`);
      return f;
    });

    // ── CASE 8: GET /me/credits 잔액 반영 ────────────────────────────────
    await check('credit.balance.ok', async () => {
      const res = mockRes();
      await listMyCredits(mockReq({ auth: auth1, query: { page: '1', limit: '20' } }), res);
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
      const b = res._c.json as { balance?: number; items?: unknown[] };
      if (typeof b?.balance !== 'number') f.push('no balance field');
      if ((b?.balance ?? -1) < 10) f.push(`balance ${b?.balance} < 10`);
      if (!Array.isArray(b?.items)) f.push('items not array');
      return f;
    });

    // ── CASE 9: MateIndex 갱신 검증 ([이슈10] penalty 1회성) ──────────────
    await check('mateIndex.updated', async () => {
      await updateMateIndex(u2.userId);
      const idx = await prisma.mateIndex.findUnique({ where: { userId: u2.userId }, select: { indexValue: true } });
      const f: string[] = [];
      if (!idx) f.push('MateIndex not found');
      // stars=4, q avg=4 → rawScore=(40+40)/2=40 → 50*0.6+40*0.4=46, reportedFor=null → penalty=0 → 46
      if (idx && idx.indexValue === 50) f.push('indexValue unchanged (expected 46)');
      if (idx && (idx.indexValue < 0 || idx.indexValue > 100)) f.push(`indexValue ${idx.indexValue} out of range`);
      return f;
    });

    // ── CASE 10: [오버라이드] notifyMateEval 잡 — mate_eval 알림 + appointment_complete 크레딧 ──
    // [이슈: Case10 격리] appointmentIds 필터 전달 → 픽스처 범위만 처리, DB 전체 오염 방지.
    await check('scheduler.notifyMateEval.ok', async () => {
      const result = await notifyMateEval(new Date(), [appt.appointmentId]);
      const f: string[] = [];
      // appt는 confirmed + appointedAt 과거 → 처리 대상
      if (result.appointmentsProcessed < 1) f.push(`appointmentsProcessed ${result.appointmentsProcessed} < 1`);
      // 알림 생성 확인 (u1 또는 u2 중 하나)
      const mateEvalNotif = await prisma.notification.findFirst({
        where: {
          notificationType: 'mate_eval',
          relatedEntityId: appt.appointmentId,
          relatedEntityType: 'appointment',
        },
        select: { notificationId: true },
      });
      if (!mateEvalNotif) f.push('mate_eval notification not found after notifyMateEval');

      // appointment_complete 크레딧 확인 (u1 또는 u2)
      const appointmentCredit = await prisma.creditLedger.findFirst({
        where: {
          action: 'appointment_complete',
          appointmentId: appt.appointmentId,
        },
        select: { ledgerId: true, pointsAmount: true },
      });
      if (!appointmentCredit) f.push('appointment_complete credit not found after notifyMateEval');
      if (appointmentCredit && appointmentCredit.pointsAmount !== 10) f.push(`appointment_complete pointsAmount ${appointmentCredit.pointsAmount} != 10`);

      // dedup: 두 번 실행해도 알림/크레딧 중복 없음
      const before = await prisma.notification.count({
        where: { notificationType: 'mate_eval', relatedEntityId: appt.appointmentId, relatedEntityType: 'appointment' },
      });
      await notifyMateEval(new Date());
      const after = await prisma.notification.count({
        where: { notificationType: 'mate_eval', relatedEntityId: appt.appointmentId, relatedEntityType: 'appointment' },
      });
      if (after !== before) f.push(`dedup failed: notification count ${before} → ${after} (should be unchanged)`);

      return f;
    });

    // ── CASE 11: [오버라이드] 그룹방 평가 지원 + N=3 N-1 다중 평가 시맨틱 검증 ──────
    // N=3: u1이 u2와 u3를 각각 별도 POST로 평가.
    // 버그: FestivalSurvey/FestivalReview는 (appointmentId, userId) UNIQUE라서
    //       2번째 제출에서 P2002가 발생했었음. "skip if exists" 패턴으로 수정 후 통과.
    await check('eval.group.n3.all_pass', async () => {
      // 3인 그룹방 생성
      const u3 = await prisma.user.findFirst({
        where: { isDeleted: false, userId: { notIn: [u1.userId, u2.userId] } },
        select: { userId: true, nickname: true, activeRole: true },
      });
      if (!u3) return ['need 3+ users for N=3 group test'];

      const groupRoom3 = await prisma.chatRoom.create({
        data: { roomType: 'group', status: 'active', maxMembers: 4 },
        select: { chatRoomId: true },
      });
      await prisma.groupMembership.createMany({ data: [
        { chatRoomId: groupRoom3.chatRoomId, userId: u1.userId, role: 'owner', memberStatus: 'active' },
        { chatRoomId: groupRoom3.chatRoomId, userId: u2.userId, role: 'member', memberStatus: 'active' },
        { chatRoomId: groupRoom3.chatRoomId, userId: u3.userId, role: 'member', memberStatus: 'active' },
      ]});
      const groupAppt3 = await prisma.appointment.create({
        data: {
          chatRoomId: groupRoom3.chatRoomId,
          proposerUserId: u1.userId,
          status: 'confirmed',
          eventId: event.eventId,
          appointedAt: new Date(Date.now() - 30 * 60 * 1000),
          expiresAt: new Date(Date.now() + 36 * 3600 * 1000),
        },
        select: { appointmentId: true },
      });

      // MateIndex for u3
      await prisma.mateIndex.upsert({
        where: { userId: u3.userId },
        create: { userId: u3.userId, indexValue: 50 },
        update: {},
      });

      const f: string[] = [];

      // 1차: u1 → u2 평가 (최초 제출 — FestivalSurvey/FestivalReview 생성)
      const res1 = mockRes();
      await submitEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: groupAppt3.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u2.userId.toString() } }),
        res1,
      );
      if (res1._c.status !== 201) f.push(`u1→u2 eval status ${res1._c.status} != 201`);

      // 2차: u1 → u3 평가 (동일 appointmentId + 동일 userId → FestivalSurvey/FestivalReview skip)
      // 버그 수정 전에는 P2002 → 409 already_submitted 오류. 수정 후 201.
      const res2 = mockRes();
      await submitEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: groupAppt3.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u3.userId.toString() } }),
        res2,
      );
      if (res2._c.status !== 201) f.push(`u1→u3 eval status ${res2._c.status} != 201 (N-1 multi-eval bug: FestivalSurvey/Review skip-if-exists not applied)`);

      // MateEvaluation이 2행 존재 (u1→u2, u1→u3)
      const evalCount = await prisma.mateEvaluation.count({
        where: { appointmentId: groupAppt3.appointmentId, evaluatorUserId: u1.userId },
      });
      if (evalCount !== 2) f.push(`mateEvaluation count ${evalCount} != 2 (expected N-1=2 rows)`);

      // FestivalSurvey는 u1 기준 1행만 존재 (skip-if-exists)
      const surveyCount = await prisma.festivalSurvey.count({
        where: { appointmentId: groupAppt3.appointmentId, userId: u1.userId },
      });
      if (surveyCount !== 1) f.push(`festivalSurvey count ${surveyCount} != 1 (should be 1 per user)`);

      // CreditLedger mate_eval_complete은 2행 (각 평가마다 +10)
      const creditCount = await prisma.creditLedger.count({
        where: { appointmentId: groupAppt3.appointmentId, userId: u1.userId, action: 'mate_eval_complete' },
      });
      if (creditCount !== 2) f.push(`creditLedger mate_eval_complete count ${creditCount} != 2`);

      // 클린업
      await prisma.creditLedger.deleteMany({ where: { appointmentId: groupAppt3.appointmentId } });
      await prisma.festivalReview.deleteMany({ where: { appointmentId: groupAppt3.appointmentId } });
      await prisma.festivalSurvey.deleteMany({ where: { appointmentId: groupAppt3.appointmentId } });
      await prisma.mateEvaluation.deleteMany({ where: { appointmentId: groupAppt3.appointmentId } });
      await prisma.appointment.delete({ where: { appointmentId: groupAppt3.appointmentId } });
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: groupRoom3.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: groupRoom3.chatRoomId } });

      return f;
    });

    // ── CASE 12: targetMembership active 검증 — kicked 멤버는 평가 대상 불가 ──────
    await check('eval.target_member.kicked_rejected', async () => {
      const kickedRoom = await prisma.chatRoom.create({
        data: { roomType: '1:1', status: 'active', maxMembers: 2 },
        select: { chatRoomId: true },
      });
      await prisma.groupMembership.createMany({ data: [
        { chatRoomId: kickedRoom.chatRoomId, userId: u1.userId, role: 'member', memberStatus: 'active' },
        { chatRoomId: kickedRoom.chatRoomId, userId: u2.userId, role: 'member', memberStatus: 'kicked' }, // kicked!
      ]});
      const kickedAppt = await prisma.appointment.create({
        data: {
          chatRoomId: kickedRoom.chatRoomId,
          proposerUserId: u1.userId,
          status: 'confirmed',
          eventId: event.eventId,
          appointedAt: new Date(Date.now() - 30 * 60 * 1000),
          expiresAt: new Date(Date.now() + 36 * 3600 * 1000),
        },
        select: { appointmentId: true },
      });

      const res = mockRes();
      await submitEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: kickedAppt.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u2.userId.toString() } }),
        res,
      );

      const f: string[] = [];
      if (res._c.status !== 400) f.push(`status ${res._c.status} != 400 (kicked member should be rejected as eval target)`);

      // 클린업 (역순 FK: 평가 관련 행은 400 반환 시 생성 안 됨)
      await prisma.creditLedger.deleteMany({ where: { appointmentId: kickedAppt.appointmentId } });
      await prisma.festivalReview.deleteMany({ where: { appointmentId: kickedAppt.appointmentId } });
      await prisma.festivalSurvey.deleteMany({ where: { appointmentId: kickedAppt.appointmentId } });
      await prisma.mateEvaluation.deleteMany({ where: { appointmentId: kickedAppt.appointmentId } });
      await prisma.appointment.delete({ where: { appointmentId: kickedAppt.appointmentId } });
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: kickedRoom.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: kickedRoom.chatRoomId } });
      return f;
    });

  } finally {
    // 픽스처 정리 (역순 FK)
    await prisma.notification.deleteMany({
      where: { notificationType: 'mate_eval', relatedEntityId: appt.appointmentId, relatedEntityType: 'appointment' },
    });
    await prisma.creditLedger.deleteMany({ where: { appointmentId: { in: [appt.appointmentId, futureAppt.appointmentId, pendingAppt.appointmentId] } } });
    await prisma.mateEvaluation.deleteMany({ where: { appointmentId: { in: [appt.appointmentId, futureAppt.appointmentId] } } });
    await prisma.festivalSurvey.deleteMany({ where: { appointmentId: { in: [appt.appointmentId, futureAppt.appointmentId] } } });
    await prisma.festivalReview.deleteMany({ where: { appointmentId: { in: [appt.appointmentId, futureAppt.appointmentId] } } });
    await prisma.appointment.deleteMany({ where: { appointmentId: { in: [appt.appointmentId, futureAppt.appointmentId, pendingAppt.appointmentId] } } });
    await prisma.groupMembership.deleteMany({ where: { chatRoomId: room.chatRoomId } });
    await prisma.chatRoom.delete({ where: { chatRoomId: room.chatRoomId } });
    await prisma.mateIndex.upsert({
      where: { userId: u2.userId },
      create: { userId: u2.userId, indexValue: 50 },
      update: { indexValue: 50 }, // 원복
    });
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id}${r.failures.length ? ' :: ' + r.failures.join('; ') : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();
