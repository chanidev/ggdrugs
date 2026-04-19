import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

/**
 * Bookmarks — A_302 (상세페이지 북마크 토글) + A_500 (내 북마크 목록).
 *
 *   POST   /events/:id/bookmark   — idempotent 생성. 이미 있으면 그대로 200.
 *   DELETE /events/:id/bookmark   — idempotent 삭제. 없어도 200.
 *   GET    /me/bookmarks          — 내 북마크 목록 (이벤트 요약 포함).
 *
 * 각 mutation 은 events.bookmark_count 를 트랜잭션으로 갱신.
 */

function parseEventId(raw: unknown): bigint | null {
  const s = typeof raw === 'string' ? raw : '';
  try {
    const n = BigInt(s);
    if (n <= 0n) return null;
    return n;
  } catch {
    return null;
  }
}

export async function addBookmark(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const eventId = parseEventId(req.params.id);
  if (!eventId) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  const event = await prisma.event.findFirst({
    where: { eventId, approvalStatus: 'approved', isDeleted: false },
    select: { eventId: true },
  });
  if (!event) {
    res.status(404).json({ error: 'event not found' });
    return;
  }

  await prisma.$transaction(async (tx) => {
    try {
      await tx.bookmark.create({
        data: { userId: auth.userId, eventId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // 이미 북마크한 상태 — 멱등성 유지, count 갱신 skip.
        return;
      }
      throw err;
    }
    const count = await tx.bookmark.count({ where: { eventId } });
    await tx.event.update({
      where: { eventId },
      data: { bookmarkCount: count },
    });
  });

  const total = await prisma.bookmark.count({ where: { eventId } });
  res.json({ bookmarked: true, bookmarkCount: total });
}

export async function removeBookmark(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const eventId = parseEventId(req.params.id);
  if (!eventId) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const del = await tx.bookmark.deleteMany({
      where: { userId: auth.userId, eventId },
    });
    if (del.count === 0) return; // 없음 — 멱등.
    const count = await tx.bookmark.count({ where: { eventId } });
    await tx.event.update({
      where: { eventId },
      data: { bookmarkCount: count },
    });
  });

  const total = await prisma.bookmark.count({ where: { eventId } });
  res.json({ bookmarked: false, bookmarkCount: total });
}

export async function listMyReviews(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  const limit = parseIntClamp(req.query.limit, 20, 1, 100);

  const where: Prisma.ReviewWhereInput = {
    userId: auth.userId,
    isDeleted: false,
    event: { approvalStatus: 'approved', isDeleted: false },
  };

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
        event: {
          select: {
            eventId: true,
            title: true,
            posterImageUrl: true,
            startDate: true,
            endDate: true,
            region: { select: { sidoName: true, sigunguName: true, fullAddress: true } },
          },
        },
      },
    }),
  ]);

  const items = rows.map((r) => ({
    reviewId: r.reviewId.toString(),
    rating: r.rating,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    event: {
      eventId: r.event.eventId.toString(),
      title: r.event.title,
      posterImageUrl: r.event.posterImageUrl,
      startDate: r.event.startDate.toISOString().slice(0, 10),
      endDate: r.event.endDate.toISOString().slice(0, 10),
      region: {
        sidoName: r.event.region.sidoName,
        sigunguName: r.event.region.sigunguName,
        fullAddress: r.event.region.fullAddress,
      },
    },
  }));

  res.json({ page, limit, total, items });
}

export async function listMyBookmarks(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  const limit = parseIntClamp(req.query.limit, 20, 1, 100);

  const where: Prisma.BookmarkWhereInput = {
    userId: auth.userId,
    event: { approvalStatus: 'approved', isDeleted: false },
  };

  const [total, rows] = await Promise.all([
    prisma.bookmark.count({ where }),
    prisma.bookmark.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { bookmarkId: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        bookmarkId: true,
        createdAt: true,
        event: {
          select: {
            eventId: true,
            title: true,
            startDate: true,
            endDate: true,
            phase: true,
            latitude: true,
            longitude: true,
            posterImageUrl: true,
            bookmarkCount: true,
            avgRating: true,
            reviewCount: true,
            category: { select: { categoryCode: true, displayName: true } },
            region: {
              select: {
                regionId: true,
                sidoName: true,
                sigunguName: true,
                dongName: true,
                fullAddress: true,
              },
            },
            vibeAssignments: {
              select: {
                vibe: { select: { vibeId: true, vibeName: true, vibeGroup: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const items = rows.map((r) => ({
    bookmarkId: r.bookmarkId.toString(),
    bookmarkedAt: r.createdAt.toISOString(),
    event: {
      eventId: r.event.eventId.toString(),
      title: r.event.title,
      category: {
        code: r.event.category.categoryCode,
        name: r.event.category.displayName,
      },
      region: {
        regionId: r.event.region.regionId.toString(),
        sidoName: r.event.region.sidoName,
        sigunguName: r.event.region.sigunguName,
        dongName: r.event.region.dongName,
        fullAddress: r.event.region.fullAddress,
      },
      startDate: r.event.startDate.toISOString().slice(0, 10),
      endDate: r.event.endDate.toISOString().slice(0, 10),
      phase: r.event.phase,
      latitude: r.event.latitude ? Number(r.event.latitude) : null,
      longitude: r.event.longitude ? Number(r.event.longitude) : null,
      posterImageUrl: r.event.posterImageUrl,
      bookmarkCount: r.event.bookmarkCount,
      avgRating: Number(r.event.avgRating),
      reviewCount: r.event.reviewCount,
      vibes: r.event.vibeAssignments.map((va) => ({
        vibeId: va.vibe.vibeId.toString(),
        name: va.vibe.vibeName,
        group: va.vibe.vibeGroup,
      })),
    },
  }));

  res.json({ page, limit, total, items });
}

function parseIntClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
