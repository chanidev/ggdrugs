import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

/**
 * GET /events/:id/reviews — A_501 리뷰 목록.
 *
 * 공개 응답 조건:
 *   - parent event.approvalStatus = 'approved' AND isDeleted = false
 *   - review.isDeleted = false
 *
 * 쿼리:
 *   page   1 이상 정수 (기본 1)
 *   limit  1~100 정수 (기본 20)
 *
 * 정렬: createdAt DESC (idx_reviews_event 활용).
 *
 * 응답:
 *   { page, limit, total, avgRating, items: [{ reviewId, nickname, rating, body, createdAt, photos: [{ path, sortOrder }] }] }
 *
 * 작성은 인증 필요 — 현재 단계에서는 미구현. Phase 1 에서 POST 추가.
 */
export async function listEventReviews(req: Request, res: Response) {
  const idStr = typeof req.params.id === 'string' ? req.params.id : '';
  let eventId: bigint;
  try {
    eventId = BigInt(idStr);
    if (eventId <= 0n) throw new Error('invalid id');
  } catch {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  const limit = parseIntClamp(req.query.limit, 20, 1, 100);

  const event = await prisma.event.findFirst({
    where: { eventId, approvalStatus: 'approved', isDeleted: false },
    select: { eventId: true, avgRating: true, reviewCount: true },
  });
  if (!event) {
    res.status(404).json({ error: 'not found' });
    return;
  }

  const where = { eventId, isDeleted: false };

  const [total, rows] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { reviewId: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        reviewId: true,
        rating: true,
        body: true,
        createdAt: true,
        user: { select: { nickname: true } },
        photos: {
          orderBy: { sortOrder: 'asc' },
          select: { filePath: true, sortOrder: true },
        },
      },
    }),
  ]);

  const items = rows.map((r) => ({
    reviewId: r.reviewId.toString(),
    nickname: r.user.nickname,
    rating: r.rating,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    photos: r.photos.map((p) => ({ path: p.filePath, sortOrder: p.sortOrder })),
  }));

  res.json({
    page,
    limit,
    total,
    avgRating: Number(event.avgRating),
    items,
  });
}

function parseIntClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * POST /events/:id/reviews — 리뷰 작성 (요구사항 A_501).
 *
 *  - 인증 필수 (requireAuth 미들웨어 선행 가정).
 *  - 1인 1리뷰 (unique (user_id, event_id)) — 중복 시 409.
 *  - 트랜잭션: review 삽입 + events.review_count / avg_rating 재계산.
 *  - rating 1~5 정수, body 최소 2자 ~ 최대 2000자.
 */
export async function createEventReview(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const idStr = typeof req.params.id === 'string' ? req.params.id : '';
  let eventId: bigint;
  try {
    eventId = BigInt(idStr);
    if (eventId <= 0n) throw new Error('invalid id');
  } catch {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  const ratingRaw = (req.body ?? {}).rating;
  const bodyRaw = ((req.body ?? {}).body ?? '').toString().trim();
  const rating = typeof ratingRaw === 'number' ? ratingRaw : Number.parseInt(String(ratingRaw), 10);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'rating 은 1~5 정수' });
    return;
  }
  if (bodyRaw.length < 2 || bodyRaw.length > 2000) {
    res.status(400).json({ error: 'body 는 2~2000자' });
    return;
  }

  // event 유효성 — 공개 상태 아니면 작성 불가
  const event = await prisma.event.findFirst({
    where: { eventId, approvalStatus: 'approved', isDeleted: false },
    select: { eventId: true },
  });
  if (!event) {
    res.status(404).json({ error: 'event not found' });
    return;
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          userId: auth.userId,
          eventId,
          rating,
          body: bodyRaw,
        },
        select: {
          reviewId: true,
          rating: true,
          body: true,
          createdAt: true,
          user: { select: { nickname: true } },
        },
      });

      // event 집계 재계산 — 삭제되지 않은 리뷰만.
      const agg = await tx.review.aggregate({
        where: { eventId, isDeleted: false },
        _avg: { rating: true },
        _count: { _all: true },
      });
      const avgRaw = agg._avg.rating ?? 0;
      await tx.event.update({
        where: { eventId },
        data: {
          reviewCount: agg._count._all,
          avgRating: new Prisma.Decimal(Number(avgRaw).toFixed(2)),
        },
      });

      return review;
    });

    res.status(201).json({
      reviewId: created.reviewId.toString(),
      nickname: created.user.nickname,
      rating: created.rating,
      body: created.body,
      createdAt: created.createdAt.toISOString(),
      photos: [],
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: '이미 리뷰를 작성한 이벤트입니다' });
      return;
    }
    throw err;
  }
}
