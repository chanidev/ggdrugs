import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';

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
