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

    // ── CASE 3b: comment raw 검증 (이슈23 스펙) — 공백 포함 >30 bytes raw → 400 ──────
    // '가나다라마바사아자차' = 30 bytes. 앞에 공백 1바이트 추가 = 31 bytes (raw) → 400.
    // trim 후는 30 bytes (PASS 조건)이지만 raw 기준 거부 — 스펙(이슈23) 정합성 검증.
    await check('eval.comment.raw_byte_check', async () => {
      const rawOverLimit = ' 가나다라마바사아자차'; // 1 + 30 = 31 bytes raw → 400
      const res = mockRes();
      await submitEvaluation(
        mockReq({ auth: { userId: u2.userId, nickname: u2.nickname, activeRole: u2.activeRole }, params: { appointmentId: appt.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u1.userId.toString(), comment: rawOverLimit } }),
        res,
      );
      return res._c.status === 400 ? [] : [`status ${res._c.status} != 400 (raw byte 31 > 30 should be rejected even if trimmed is 30 bytes)`];
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

    // ── CASE 7b: [리뷰 medium] review_complete 크레딧 적립 검증 ─────────
    // FestivalReview 최초 제출 시 review_complete +10 이 생성됐는지 확인.
    await check('credit.review_complete.created', async () => {
      const ledger = await prisma.creditLedger.findFirst({
        where: { userId: auth1.userId, action: 'review_complete', appointmentId: appt.appointmentId },
        select: { pointsAmount: true },
      });
      const f: string[] = [];
      if (!ledger) f.push('CreditLedger review_complete row not found');
      if (ledger?.pointsAmount !== 10) f.push(`pointsAmount ${ledger?.pointsAmount} != 10`);
      return f;
    });

    // ── CASE 7c: [리뷰 critical] review_complete TOCTOU 시뮬레이션 ──────────
    // 사전에 review_complete 크레딧 행을 수동 삽입 후 submitEvaluation 호출.
    // → review_complete는 uq_credit_review_complete_user 위반(P2002) → idempotent 무시.
    // → 응답 201 && reviewCreditCount === 1 (중복 삽입 없음) 검증.
    //
    // 별도 채팅방/약속 픽스처를 사용해 CASE 1~2의 상태와 격리.
    await check('credit.review_complete.toctou_idempotent', async () => {
      const toctouRoom = await prisma.chatRoom.create({
        data: { roomType: '1:1', status: 'active', maxMembers: 2 },
        select: { chatRoomId: true },
      });
      await prisma.groupMembership.createMany({ data: [
        { chatRoomId: toctouRoom.chatRoomId, userId: u1.userId, role: 'member', memberStatus: 'active' },
        { chatRoomId: toctouRoom.chatRoomId, userId: u2.userId, role: 'member', memberStatus: 'active' },
      ]});
      const toctouAppt = await prisma.appointment.create({
        data: {
          chatRoomId: toctouRoom.chatRoomId,
          proposerUserId: u1.userId,
          status: 'confirmed',
          eventId: event.eventId,
          appointedAt: new Date(Date.now() - 60 * 60 * 1000), // 과거
          expiresAt: new Date(Date.now() + 36 * 3600 * 1000),
        },
        select: { appointmentId: true },
      });

      // TOCTOU 시뮬레이션: submitEvaluation 호출 전에 review_complete 크레딧을 수동 선행 삽입.
      // (실제 TOCTOU 시나리오: 동시 rapid-retry에서 첫 요청이 커밋 직후 두 번째 요청의
      //  review_complete insert가 이미 행을 만든 상황)
      await prisma.creditLedger.create({
        data: {
          userId: auth1.userId,
          action: 'review_complete',
          pointsAmount: 10, // CREDIT_REVIEW 상수 값 (evaluation.ts 내부 상수)
          appointmentId: toctouAppt.appointmentId,
        },
      });

      const res = mockRes();
      await submitEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: toctouAppt.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u2.userId.toString() } }),
        res,
      );

      const f: string[] = [];
      // 201 응답 (review_complete P2002는 idempotent 처리돼야 함 — 500 반환 금지)
      if (res._c.status !== 201) f.push(`status ${res._c.status} != 201 (TOCTOU: review_complete P2002 should be swallowed, not 500)`);
      // review_complete 크레딧 행은 정확히 1개 (중복 삽입 없음)
      const reviewCreditCount = await prisma.creditLedger.count({
        where: { userId: auth1.userId, action: 'review_complete', appointmentId: toctouAppt.appointmentId },
      });
      if (reviewCreditCount !== 1) f.push(`review_complete credit count ${reviewCreditCount} != 1 (expected exactly 1, TOCTOU dedup violated)`);

      // 클린업
      await prisma.creditLedger.deleteMany({ where: { appointmentId: toctouAppt.appointmentId } });
      await prisma.festivalReview.deleteMany({ where: { appointmentId: toctouAppt.appointmentId } });
      await prisma.festivalSurvey.deleteMany({ where: { appointmentId: toctouAppt.appointmentId } });
      await prisma.mateEvaluation.deleteMany({ where: { appointmentId: toctouAppt.appointmentId } });
      await prisma.appointment.delete({ where: { appointmentId: toctouAppt.appointmentId } });
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: toctouRoom.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: toctouRoom.chatRoomId } });
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
      // [리뷰 low] 두 번째 notifyMateEval 호출 전후 appointment_complete 크레딧 카운트도 검증.
      // [리뷰 지적] 두 번째 호출도 픽스처 범위([appt.appointmentId])로 격리 — DB 전체 오염 방지.
      const beforeNotif = await prisma.notification.count({
        where: { notificationType: 'mate_eval', relatedEntityId: appt.appointmentId, relatedEntityType: 'appointment' },
      });
      const beforeCredit = await prisma.creditLedger.count({
        where: { action: 'appointment_complete', appointmentId: appt.appointmentId },
      });
      await notifyMateEval(new Date(), [appt.appointmentId]);
      const afterNotif = await prisma.notification.count({
        where: { notificationType: 'mate_eval', relatedEntityId: appt.appointmentId, relatedEntityType: 'appointment' },
      });
      const afterCredit = await prisma.creditLedger.count({
        where: { action: 'appointment_complete', appointmentId: appt.appointmentId },
      });
      if (afterNotif !== beforeNotif) f.push(`dedup failed: notification count ${beforeNotif} → ${afterNotif} (should be unchanged)`);
      // [리뷰 low] appointment_complete 크레딧 dedup 검증: 두 번째 실행 후 카운트 증가 없어야 함.
      if (afterCredit !== beforeCredit) f.push(`dedup failed: appointment_complete credit count ${beforeCredit} → ${afterCredit} (should be unchanged)`);

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

      // review_complete 크레딧 dedup 검증:
      // u1→u2 (1차 POST) 에서 FestivalReview 신규 생성 → review_complete 1행 적립.
      // u1→u3 (2차 POST) 에서 FestivalReview 이미 존재 → review_complete 건너뜀.
      // uq_credit_review_complete_user partial unique index가 TOCTOU 경합도 막는지 확인.
      const reviewCreditCount = await prisma.creditLedger.count({
        where: { appointmentId: groupAppt3.appointmentId, userId: u1.userId, action: 'review_complete' },
      });
      if (reviewCreditCount !== 1) f.push('creditLedger review_complete count ' + reviewCreditCount + ' != 1 (dedup broken in group N-1)');

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

    // ── CASE 13: [리뷰 low] appointment_complete dedup — 다중 메이트 평가 후 1회만 적립 검증 ──
    // N=3 그룹에서 u1이 u2·u3 각각을 평가(mate_eval_complete 2행)한 뒤
    // notifyMateEval을 실행해도 u1의 appointment_complete는 정확히 1행만 존재해야 한다.
    // uq_credit_appt_complete_user partial unique index가 중복 삽입을 막는지 검증.
    await check('scheduler.appointment_complete.no_double_count_for_multi_eval', async () => {
      // 3인 그룹방 생성
      const u3b = await prisma.user.findFirst({
        where: { isDeleted: false, userId: { notIn: [u1.userId, u2.userId] } },
        select: { userId: true, nickname: true, activeRole: true },
      });
      if (!u3b) return ['need 3+ users for CASE 13'];

      const groupRoom13 = await prisma.chatRoom.create({
        data: { roomType: 'group', status: 'active', maxMembers: 4 },
        select: { chatRoomId: true },
      });
      await prisma.groupMembership.createMany({ data: [
        { chatRoomId: groupRoom13.chatRoomId, userId: u1.userId, role: 'owner', memberStatus: 'active' },
        { chatRoomId: groupRoom13.chatRoomId, userId: u2.userId, role: 'member', memberStatus: 'active' },
        { chatRoomId: groupRoom13.chatRoomId, userId: u3b.userId, role: 'member', memberStatus: 'active' },
      ]});
      const groupAppt13 = await prisma.appointment.create({
        data: {
          chatRoomId: groupRoom13.chatRoomId,
          proposerUserId: u1.userId,
          status: 'confirmed',
          eventId: event.eventId,
          appointedAt: new Date(Date.now() - 30 * 60 * 1000), // 과거
          expiresAt: new Date(Date.now() + 36 * 3600 * 1000),
        },
        select: { appointmentId: true },
      });
      await prisma.mateIndex.upsert({
        where: { userId: u3b.userId },
        create: { userId: u3b.userId, indexValue: 50 },
        update: {},
      });

      const f: string[] = [];

      // u1 → u2 평가 (mate_eval_complete 1행)
      const r1 = mockRes();
      await submitEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: groupAppt13.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u2.userId.toString() } }),
        r1,
      );
      if (r1._c.status !== 201) f.push(`u1→u2 eval status ${r1._c.status} != 201`);

      // u1 → u3 평가 (mate_eval_complete 2행, FestivalSurvey/Review skip)
      const r2 = mockRes();
      await submitEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: groupAppt13.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u3b.userId.toString() } }),
        r2,
      );
      if (r2._c.status !== 201) f.push(`u1→u3 eval status ${r2._c.status} != 201`);

      // 이 시점: u1은 mate_eval_complete 2행, appointment_complete 0행
      const evalCredits = await prisma.creditLedger.count({
        where: { appointmentId: groupAppt13.appointmentId, userId: u1.userId, action: 'mate_eval_complete' },
      });
      if (evalCredits !== 2) f.push(`mate_eval_complete count ${evalCredits} != 2 before notifyMateEval`);

      // notifyMateEval 실행 — u1·u2·u3 각 1행 appointment_complete 적립
      await notifyMateEval(new Date(), [groupAppt13.appointmentId]);

      // u1의 appointment_complete는 정확히 1행 (N=2 평가를 했어도 중복 없음)
      const apptCredits1 = await prisma.creditLedger.count({
        where: { appointmentId: groupAppt13.appointmentId, userId: u1.userId, action: 'appointment_complete' },
      });
      if (apptCredits1 !== 1) f.push(`u1 appointment_complete count ${apptCredits1} != 1 (dedup violated)`);

      // u2, u3도 각 1행
      const apptCredits2 = await prisma.creditLedger.count({
        where: { appointmentId: groupAppt13.appointmentId, userId: u2.userId, action: 'appointment_complete' },
      });
      if (apptCredits2 !== 1) f.push(`u2 appointment_complete count ${apptCredits2} != 1`);

      const apptCredits3 = await prisma.creditLedger.count({
        where: { appointmentId: groupAppt13.appointmentId, userId: u3b.userId, action: 'appointment_complete' },
      });
      if (apptCredits3 !== 1) f.push(`u3 appointment_complete count ${apptCredits3} != 1`);

      // 두 번째 notifyMateEval — 이미 처리됨(모든 크레딧 존재) → skip (성능 최적화 검증)
      const result2 = await notifyMateEval(new Date(), [groupAppt13.appointmentId]);
      // 성능 최적화: 모든 멤버가 크레딧 보유 → 약속 처리 수 = 0 (skip)
      if (result2.appointmentsProcessed !== 0) {
        f.push(`2nd run appointmentsProcessed ${result2.appointmentsProcessed} != 0 (expected fully-processed skip)`);
      }

      // 클린업
      await prisma.notification.deleteMany({
        where: { notificationType: 'mate_eval', relatedEntityId: groupAppt13.appointmentId, relatedEntityType: 'appointment' },
      });
      await prisma.creditLedger.deleteMany({ where: { appointmentId: groupAppt13.appointmentId } });
      await prisma.festivalReview.deleteMany({ where: { appointmentId: groupAppt13.appointmentId } });
      await prisma.festivalSurvey.deleteMany({ where: { appointmentId: groupAppt13.appointmentId } });
      await prisma.mateEvaluation.deleteMany({ where: { appointmentId: groupAppt13.appointmentId } });
      await prisma.appointment.delete({ where: { appointmentId: groupAppt13.appointmentId } });
      await prisma.groupMembership.deleteMany({ where: { chatRoomId: groupRoom13.chatRoomId } });
      await prisma.chatRoom.delete({ where: { chatRoomId: groupRoom13.chatRoomId } });

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
