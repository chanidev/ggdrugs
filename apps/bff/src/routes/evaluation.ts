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
 *   - [오버라이드] 크레딧 3종 (모두 트랜잭션 내):
 *     mate_eval_complete +10 — 메이트 평가 1건당
 *     review_complete +10    — 후기 최초 제출 1회 (FestivalReview 신규 생성 시)
 *     appointment_complete +10 — 스케줄러 잡(notifyMateEval)에서 적립 — 여기서는 미생성
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
const CREDIT_MATE_EVAL    = 10; // ADR 0007 결정5 — 액수 Open items, 10으로 가정
const CREDIT_REVIEW       = 10; // review_complete +10 (ADR 0007 결정5, 동일 액수 가정)

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
  // [리뷰 low] targetMembership active-only 정책 (ADR 결정):
  //   평가 대상이 kicked/left 상태인 경우에도 평가를 허용할지 여부는 요구사항이 모호하다.
  //   현재 구현은 "평가 시점에 active 멤버만 평가 가능"(가장 엄격한 해석)을 채택한다.
  //   근거: 약속 완료 후 곧바로 평가(appointedAt 경과 직후)하는 것이 정상 흐름이며,
  //   이 시점에 kicked/left인 경우는 비정상 시나리오(예: 무단이탈 후 평가 회피)로 간주.
  //   만약 "약속 당시 멤버였으면 평가 가능" 정책으로 변경해야 한다면
  //   memberStatus IN ('active', 'left', 'kicked') 로 조건 완화 필요 — ADR 개정 선행.
  //   슬라이스5 하니스(CASE 12)에서 kicked 멤버 평가 차단을 회귀 검증한다.
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

  // [이슈23] trim 전 raw에 대해 byte 검증, trim 후 빈 문자열이면 null.
  // 스펙: 공백 포함 원본 문자열 기준 30 UTF-8 byte 초과 시 거부.
  // '  가나다라마바사아자차  '(앞뒤 공백 포함 36 bytes)는 trim 전 검증 → 400.
  const commentInput = typeof body['comment'] === 'string' ? body['comment'] : '';
  if (commentInput && Buffer.byteLength(commentInput, 'utf8') > 30) {
    res.status(400).json({ error: 'comment_too_long' }); return;
  }
  const comment = commentInput.trim() || null;

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

      // festivalReview.upsert 전 존재 여부 확인 — review_complete 크레딧 1회성 적립에 사용.
      // 그룹 N-1 시나리오: u1이 u2·u3를 각각 평가하는 2번째 POST에서 FestivalReview가 이미
      // 존재하므로 upsert는 no-op. review_complete 크레딧은 최초 생성 시 1회만 적립한다.
      // dedup 방어선(1차): existingReview 조회 (READ COMMITTED 하에서 선행 트랜잭션이 커밋된 행 감지).
      // dedup 최종 방어선: uq_credit_review_complete_user partial unique index
      //   (migration.sql 20260530140000_phase2_eval_credit 에 정의).
      //   TOCTOU 경합(동시 rapid-retry / client double-tap) 시에도 DB가 중복 삽입을 P2002로 거부.
      //   uq_festival_review_pair 는 FestivalReview 행의 중복 삽입을 막는 인덱스이며
      //   credit_ledgers review_complete dedup 과는 무관하다.
      const existingReview = await tx.festivalReview.findUnique({
        where: { appointmentId_userId: { appointmentId, userId: auth.userId } },
        select: { reviewId: true },
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

      // review_complete 크레딧 적립 +10 (최초 후기 제출 시 1회).
      // FestivalReview가 신규 생성(existingReview=null)인 경우에만 시도.
      // 그룹 N-1에서 2번째 이후 평가 POST는 FestivalReview가 이미 존재(existingReview!=null)
      // → 이 블록을 건너뜀으로써 review_complete 중복 적립 방지 (1차 방어).
      // TOCTOU 경합(동시 rapid-retry / client double-tap)에 대한 최종 방어선은
      // uq_credit_review_complete_user partial unique index — P2002 throw 시 무시(idempotent).
      if (!existingReview) {
        try {
          await tx.creditLedger.create({
            data: {
              userId: auth.userId,
              action: 'review_complete',
              pointsAmount: CREDIT_REVIEW,
              appointmentId,
            },
          });
        } catch (creditErr) {
          // uq_credit_review_complete_user 위반: 동시 rapid-retry 등으로 이미 적립됨 → 무시(idempotent).
          if (!(creditErr instanceof Prisma.PrismaClientKnownRequestError && creditErr.code === 'P2002')) {
            throw creditErr;
          }
        }
      }

      // [오버라이드] 크레딧 적립: mate_eval_complete +10
      // appointment_complete는 스케줄러 잡(notifyMateEval)에서 별도 적립.
      //
      // [리뷰 medium] mate_eval_complete dedup 분석:
      //   dedup 단위 = (appointmentId, evaluatorUserId, evaluatedUserId) — 평가 1건당 1크레딧.
      //   credit_ledgers에 evaluated_user_id 컬럼이 없어 DB-level partial unique index로
      //   이 세 컬럼 단위를 표현할 수 없다 (스키마 변경 금지 제약).
      //
      //   findFirst({ where: { userId, action, appointmentId } }) 로 1차 방어를 추가하면
      //   그룹 N-1에서 u1→u2 크레딧 삽입 후 u1→u3 요청 시 findFirst가 기존 행을 감지해
      //   두 번째 +10을 차단하게 된다 — 의도된 설계(Case 11: N-1 각 +10)를 깨뜨린다.
      //
      //   따라서 단독 dedup 방어선으로 uq_mate_eval_pair UNIQUE 제약을 사용한다:
      //     - HTTP 재전송(동일 evaluatedUserId): ev.create → P2002 → catch(P2002) → 409.
      //       credit insert에 도달하지 않으므로 중복 크레딧 발생 불가.
      //     - Prisma interactive transaction은 기본 auto-retry 없음.
      //       커밋 후 응답 유실 시 클라이언트 재전송 → ev.create P2002 → 409 (위와 동일).
      //     - 그룹 N-1: evaluatedUserId가 다른 별도 요청 → 각 트랜잭션에서 ev.create 성공
      //       → 각각 +10 적립 (의도됨).
      //   결론: uq_mate_eval_pair가 유일한 필요충분 dedup 방어선.
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
