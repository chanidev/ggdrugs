/**
 * mate-index-updater.ts — MateIndex 가중 이동평균 갱신 (Slice 5, ADR 0007 결정4)
 *
 * 공식:
 *   rawScore = (ratingStars*10 + avg(q1~q4)*10) / 2  → 0~100 범위
 *   newIndex = round(prevIndex * 0.6 + rawScore * 0.4) → 최근값 40% 반영
 *
 * [이슈10] penalty: 최신 평가(evals[0])에 reportedFor가 있을 때만 -3 (1회성).
 *   윈도우 전체 카운트 방식 폐기 — 이미 반영된 감점 중복 누적 방지.
 *
 * [이슈6/26] 불변 원칙: prisma.mateIndex.UPDATE 전용 — create 금지.
 *   MateIndex 행은 Slice2(mate.ts createMateProfile)에서 indexValue=50으로 생성됨.
 *   행 미존재 시 RecordNotFound 에러 throw (fail-fast).
 */
import { prisma } from '../prisma.js';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export async function updateMateIndex(evaluatedUserId: bigint): Promise<void> {
  const evals = await prisma.mateEvaluation.findMany({
    where: { evaluatedUserId },
    select: { ratingStars: true, q1: true, q2: true, q3: true, q4: true, reportedFor: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  if (evals.length === 0) return;

  // [이슈6] update 전용 — 행 없으면 findUniqueOrThrow가 에러 throw
  const current = await prisma.mateIndex.findUniqueOrThrow({
    where: { userId: evaluatedUserId },
    select: { indexValue: true },
  });
  const prevIndex = current.indexValue;

  // 최신 평가 점수 (가중 이동평균용 최근값)
  const latest = evals[0]!;
  const avgQ = (latest.q1 + latest.q2 + latest.q3 + latest.q4) / 4;
  const rawScore = (latest.ratingStars * 10 + avgQ * 10) / 2;

  // [이슈10] penalty: 최신 평가에 신고가 있을 때만 -3 (1회성)
  const penalty = latest.reportedFor !== null ? 3 : 0;

  const newIndex = clamp(Math.round(prevIndex * 0.6 + rawScore * 0.4) - penalty, 0, 100);

  await prisma.mateIndex.update({
    where: { userId: evaluatedUserId },
    data: { indexValue: newIndex },
  });
}
