/**
 * evaluation.ts — A_900 메이트평가 + A_901 축제설문/후기 단일 제출 (Slice 5)
 *
 * POST /community/appointments/:appointmentId/evaluate
 *   - requireAuth
 *   - [오버라이드] 1:1/그룹 모두 지원 — roomType='1:1' 게이트 삭제.
 *     그룹이면 참가자 N-1 전원 대상 (evaluatedUserId = 동일 chatRoomId 멤버 검증).
 *   - [오버라이드] "다녀온 후" 게이트:
 *     appointment.status='confirmed' AND appointedAt <= now() 일 때만 허용.
 *     아니면 409 not_attended_yet.
 *   - [이슈4] Appointment.eventId 게이트 (null 시 400 event_required)
 *   - [이슈7] evaluatedUserId가 동일 chatRoomId 멤버인지 검증
 *   - MateEvaluation + FestivalSurvey + FestivalReview + CreditLedger 원자 저장
 *   - [오버라이드] 크레딧 2종: mate_eval_complete +10 (트랜잭션 내)
 *     appointment_complete +10 (스케줄러 잡에서 적립 — 여기서는 미생성)
 *   - best-effort: updateMateIndex(evaluatedUserId)
 *
 * GET /community/appointments/:appointmentId/evaluation
 *   - requireAuth
 *   - 본인이 제출한 평가 조회 ([이슈9] 클라이언트 마운트 시 사전 차단용)
 */
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';
import { updateMateIndex } from '../lib/mate-index-updater.js';

const REPORTED_FOR_VALUES = new Set(['inappropriate', 'harassing', 'no_show', 'etc']);
const CREDIT_MATE_EVAL = 10; // ADR 0007 결정5 — 액수 Open items, 10으로 가정

function parseBigId(raw: unknown): bigint | null {
  const s = typeof raw === 'string' ? raw : '';
  try {
    const n = BigInt(s);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

function parseLikert(v: unknown): number | null {
  const n =
    typeof v === 'number' ? v
    : typeof v === 'string' ? Number.parseInt(v, 10)
    : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export async function submitEvaluation(req: Request, res: Response): Promise<void> {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }

  const appointmentId = parseBigId(req.params['appointmentId']);
  if (!appointmentId) { res.status(400).json({ error: 'invalid appointmentId' }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;

  // ── Step A: 약속 존재 확인 ────────────────────────────────────────────
  const appointment = await prisma.appointment.findUnique({
    where: { appointmentId },
    select: { status: true, chatRoomId: true, eventId: true, appointedAt: true },
  });
  if (!appointment) { res.status(404).json({ error: 'appointment_not_found' }); return; }

  // ── [오버라이드] "다녀온 후" 게이트:
  //    confirmed 상태 + appointedAt <= now() 일 때만 허용
  //    appointment_not_confirmed: 아직 확정되지 않은 약속
  //    not_attended_yet: 확정됐지만 약속일이 아직 경과 안 됨
  if (appointment.status !== 'confirmed') {
    res.status(409).json({ error: 'appointment_not_confirmed' }); return;
  }
  const now = new Date();
  if (!appointment.appointedAt || appointment.appointedAt > now) {
    res.status(409).json({ error: 'not_attended_yet' }); return;
  }

  // ── [이슈4] eventId 게이트 ─────────────────────────────────────────────
  if (!appointment.eventId) {
    res.status(400).json({ error: 'event_required' }); return;
  }

  // ── Step B: 요청자가 채팅방 active 멤버인지 확인 ────────────────────────
  const myMembership = await prisma.groupMembership.findUnique({
    where: { chatRoomId_userId: { chatRoomId: appointment.chatRoomId, userId: auth.userId } },
    select: { memberStatus: true },
  });
  if (!myMembership || myMembership.memberStatus !== 'active') {
    res.status(403).json({ error: 'not_a_member' }); return;
  }

  // ── Step C: A_900 메이트평가 필드 검증 ────────────────────────────────
  const evaluatedUserId = parseBigId(body['evaluatedUserId']);
  if (!evaluatedUserId) { res.status(400).json({ error: 'evaluatedUserId required' }); return; }
  if (evaluatedUserId === auth.userId) { res.status(400).json({ error: 'cannot_eval_self' }); return; }

  // ── [이슈7] evaluatedUserId가 동일 chatRoomId active 멤버인지 검증 ─────
  // [오버라이드] 그룹 지원: roomType 게이트 삭제.
  // [이슈review:important] memberStatus='active' 비대칭 수정 — kicked/left 전 멤버는 평가 대상 불가.
  const targetMembership = await prisma.groupMembership.findUnique({
    where: { chatRoomId_userId: { chatRoomId: appointment.chatRoomId, userId: evaluatedUserId } },
    select: { memberStatus: true },
  });
  if (!targetMembership || targetMembership.memberStatus !== 'active') {
    res.status(400).json({ error: 'evaluated_user_not_in_room' }); return;
  }

  const ratingStars = parseLikert(body['ratingStars']);
  if (!ratingStars) { res.status(400).json({ error: 'ratingStars 1~5 required' }); return; }

  const q1 = parseLikert(body['q1']);
  const q2 = parseLikert(body['q2']);
  const q3 = parseLikert(body['q3']);
  const q4 = parseLikert(body['q4']);
  if (!q1 || !q2 || !q3 || !q4) { res.status(400).json({ error: 'q1~q4 1~5 required' }); return; }

  // [이슈23] trim 전 raw에 대해 byte 검증, trim 후 빈 문자열이면 null
  const commentRaw = typeof body['comment'] === 'string' ? body['comment'].trim() : '';
  if (commentRaw && Buffer.byteLength(commentRaw, 'utf8') > 30) {
    res.status(400).json({ error: 'comment_too_long' }); return;
  }
  const comment = commentRaw || null;

  const reportedFor =
    typeof body['reportedFor'] === 'string' && REPORTED_FOR_VALUES.has(body['reportedFor'])
      ? body['reportedFor']
      : null;

  // ── Step D: A_901 설문/후기 필드 검증 ─────────────────────────────────
  const atmosphere = parseLikert(body['atmosphere']);
  const program    = parseLikert(body['program']);
  const food       = parseLikert(body['food']);
  const safety     = parseLikert(body['safety']);
  const transport  = parseLikert(body['transport']);
  if (!atmosphere || !program || !food || !safety || !transport) {
    res.status(400).json({ error: 'survey fields 1~5 required' }); return;
  }

  const reviewBody = typeof body['reviewBody'] === 'string' ? body['reviewBody'].trim() : '';
  if (!reviewBody) { res.status(400).json({ error: 'reviewBody required' }); return; }
  if (reviewBody.length > 5000) { res.status(400).json({ error: 'reviewBody_too_long' }); return; }

  const photoUrls: string[] = Array.isArray(body['photoUrls'])
    ? (body['photoUrls'] as unknown[]).filter((u): u is string => typeof u === 'string').slice(0, 10)
    : [];

  const reviewRating = parseLikert(body['reviewRating']);
  if (!reviewRating) { res.status(400).json({ error: 'reviewRating 1~5 required' }); return; }

  // ── Step E: 트랜잭션 저장 ────────────────────────────────────────────
  let evalId: bigint;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const ev = await tx.mateEvaluation.create({
        data: {
          appointmentId,
          evaluatorUserId: auth.userId,
          evaluatedUserId,
          ratingStars,
          q1, q2, q3, q4,
          comment,
          reportedFor,
        },
        select: { evalId: true },
      });

      // [이슈review:critical] N-1 그룹 평가 시맨틱:
      // FestivalSurvey/FestivalReview는 UNIQUE (appointmentId, userId) — 참가자당 1회.
      // 그룹 N인 방에서 u1이 u2·u3를 각각 평가할 때 2번째 POST부터는 이미 존재하므로 skip.
      // upsert({update:{}}) = "create if not exists, otherwise no-op" 패턴.
      await tx.festivalSurvey.upsert({
        where: { appointmentId_userId: { appointmentId, userId: auth.userId } },
        create: {
          appointmentId,
          userId: auth.userId,
          atmosphere, program, food, safety, transport,
        },
        update: {}, // no-op: 이미 존재하면 변경 없음
      });

      await tx.festivalReview.upsert({
        where: { appointmentId_userId: { appointmentId, userId: auth.userId } },
        create: {
          appointmentId,
          userId: auth.userId,
          eventId: appointment.eventId,   // [이슈4] Appointment.eventId 복사
          ratingStars: reviewRating,
          body: reviewBody,
          photoUrls,
        },
        update: {}, // no-op: 이미 존재하면 변경 없음
      });

      // [오버라이드] 크레딧 적립: mate_eval_complete +10
      // appointment_complete는 스케줄러 잡(notifyMateEval)에서 별도 적립
      await tx.creditLedger.create({
        data: {
          userId: auth.userId,
          action: 'mate_eval_complete',
          pointsAmount: CREDIT_MATE_EVAL,
          appointmentId,
        },
      });

      return ev;
    });
    evalId = result.evalId;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      res.status(409).json({ error: 'already_submitted' }); return;
    }
    throw e;
  }

  // ── Step F: MateIndex 갱신 (best-effort, 트랜잭션 밖) ────────────────
  try {
    await updateMateIndex(evaluatedUserId);
  } catch (e) {
    logger.warn(
      { err: e, evaluatedUserId: evaluatedUserId.toString() },
      'updateMateIndex failed (non-fatal)',
    );
  }

  // PII: comment 내용 로그 출력 금지
  logger.info(
    { action: 'mate_eval_submit', evaluatorUserId: auth.userId.toString(), appointmentId: appointmentId.toString() },
    'evaluation submitted',
  );

  res.status(201).json({ evalId: evalId.toString() });
}

/** [이슈9] GET — 마운트 시 중복 제출 사전 차단용. 미제출이면 204. */
export async function getMyEvaluation(req: Request, res: Response): Promise<void> {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }

  const appointmentId = parseBigId(req.params['appointmentId']);
  if (!appointmentId) { res.status(400).json({ error: 'invalid appointmentId' }); return; }

  const ev = await prisma.mateEvaluation.findFirst({
    where: { appointmentId, evaluatorUserId: auth.userId },
    select: { evalId: true, evaluatedUserId: true, ratingStars: true, createdAt: true },
  });

  if (!ev) { res.status(204).end(); return; }
  res.json({
    evalId:          ev.evalId.toString(),
    evaluatedUserId: ev.evaluatedUserId.toString(),
    ratingStars:     ev.ratingStars,
    createdAt:       ev.createdAt.toISOString(),
  });
}
