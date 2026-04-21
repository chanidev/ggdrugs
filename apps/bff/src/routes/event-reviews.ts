import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { callLlm } from '../llm-client.js';
import { publicUrl } from '../lib/s3.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

/** 리뷰 작성 후 fire-and-forget 으로 LLM sentiment 분류 → DB 업데이트. */
async function classifyAndStoreSentiment(reviewId: bigint, text: string): Promise<void> {
  try {
    const data = await callLlm<{ sentiment?: string }>('/sentiment', { text });
    if (!data) return;
    const s = data.sentiment;
    if (s !== 'positive' && s !== 'negative' && s !== 'neutral') return;
    await prisma.review.update({ where: { reviewId }, data: { sentiment: s } });
  } catch (err) {
    logger.warn({ err, reviewId: reviewId.toString() }, 'sentiment classify failed');
  }
}

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
        sentiment: true,
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
    sentiment: r.sentiment,
    createdAt: r.createdAt.toISOString(),
    photos: r.photos.map((p) => ({
      url: publicUrl(env.S3_BUCKET_REVIEW_PHOTOS, p.filePath),
      sortOrder: p.sortOrder,
    })),
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

  // 사진 0~5장 (A_501). uploader scoped key prefix (review/{userId}/) 강제.
  const photosRaw = (req.body ?? {}).photos;
  interface IncomingPhoto {
    key: string;
    originalFilename: string;
    mimeType: string;
    fileSizeBytes: number;
  }
  const photos: IncomingPhoto[] = [];
  if (photosRaw !== undefined && photosRaw !== null) {
    if (!Array.isArray(photosRaw)) {
      res.status(400).json({ error: 'photos 배열' });
      return;
    }
    if (photosRaw.length > 5) {
      res.status(400).json({ error: 'photos 최대 5장' });
      return;
    }
    const expectedPrefix = `review/${auth.userId.toString()}/`;
    const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const seen = new Set<string>();
    for (const item of photosRaw) {
      if (!item || typeof item !== 'object') {
        res.status(400).json({ error: 'invalid photo entry' });
        return;
      }
      const d = item as Record<string, unknown>;
      const key = typeof d.key === 'string' ? d.key : '';
      const filename = typeof d.originalFilename === 'string' ? d.originalFilename.trim() : '';
      const mime = typeof d.mimeType === 'string' ? d.mimeType : '';
      const size = typeof d.fileSizeBytes === 'number' ? d.fileSizeBytes : -1;
      if (!key.startsWith(expectedPrefix)) {
        res.status(400).json({ error: `key 가 user scope 밖: ${key}` });
        return;
      }
      if (seen.has(key)) {
        res.status(400).json({ error: `중복 key: ${key}` });
        return;
      }
      seen.add(key);
      if (filename.length < 1 || filename.length > 255) {
        res.status(400).json({ error: 'originalFilename 1~255자' });
        return;
      }
      if (!allowedMime.has(mime)) {
        res.status(400).json({ error: `mimeType: ${mime}` });
        return;
      }
      if (!Number.isInteger(size) || size <= 0 || size > 5 * 1024 * 1024) {
        res.status(400).json({ error: `fileSizeBytes: ${size}` });
        return;
      }
      photos.push({ key, originalFilename: filename, mimeType: mime, fileSizeBytes: size });
    }
  }

  // event 유효성 — 공개 상태 아니면 작성 불가
  const event = await prisma.event.findFirst({
    where: { eventId, approvalStatus: 'approved', isDeleted: false },
    select: { eventId: true, phase: true, endDate: true },
  });
  if (!event) {
    res.status(404).json({ error: 'event not found' });
    return;
  }
  // 2026-04-21 정책 변경: 기존 GG-REVIEW-001 (종료일 이후 작성) 완화.
  // 진행 중·예정 이벤트도 리뷰 작성 가능 (기대평·라이브 리뷰 허용).
  // phase check 제거. endDate 는 UI 힌트용으로만 사용.

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

      if (photos.length > 0) {
        await tx.reviewPhoto.createMany({
          data: photos.map((p, i) => ({
            reviewId: review.reviewId,
            filePath: p.key,
            originalFilename: p.originalFilename,
            mimeType: p.mimeType,
            fileSizeBytes: p.fileSizeBytes,
            sortOrder: i,
          })),
        });
      }

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

    // fire-and-forget: LLM sentiment 분류 → DB update (응답 후 비동기).
    void classifyAndStoreSentiment(created.reviewId, created.body);

    res.status(201).json({
      reviewId: created.reviewId.toString(),
      nickname: created.user.nickname,
      rating: created.rating,
      body: created.body,
      createdAt: created.createdAt.toISOString(),
      sentiment: null, // 작성 직후엔 아직 분류 전
      photos: photos.map((p, i) => ({
        url: publicUrl(env.S3_BUCKET_REVIEW_PHOTOS, p.key),
        sortOrder: i,
      })),
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: '이미 리뷰를 작성한 이벤트입니다' });
      return;
    }
    throw err;
  }
}

/**
 * DELETE /reviews/:id — 본인 리뷰 soft-delete. tx 로 event.review_count·avg_rating 재계산.
 */
export async function deleteMyReview(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const idStr = typeof req.params.id === 'string' ? req.params.id : '';
  let reviewId: bigint;
  try {
    reviewId = BigInt(idStr);
    if (reviewId <= 0n) throw new Error('invalid id');
  } catch {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  const existing = await prisma.review.findUnique({
    where: { reviewId },
    select: { reviewId: true, userId: true, eventId: true, isDeleted: true },
  });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ error: 'review not found' });
    return;
  }
  if (existing.userId !== auth.userId) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.review.update({
      where: { reviewId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    const agg = await tx.review.aggregate({
      where: { eventId: existing.eventId, isDeleted: false },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const avg = agg._avg.rating ?? 0;
    await tx.event.update({
      where: { eventId: existing.eventId },
      data: {
        reviewCount: agg._count._all,
        avgRating: new Prisma.Decimal(Number(avg).toFixed(2)),
      },
    });
  });

  res.json({ ok: true });
}
