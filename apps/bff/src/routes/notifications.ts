import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

/**
 * A_500 / A_203 알림 센터 API.
 *
 *   GET  /me/notifications?limit=20&unreadOnly=true
 *   GET  /me/notifications/unread-count        — Header 벨 뱃지
 *   POST /me/notifications/:id/read
 *   POST /me/notifications/read-all
 */

function parseIntClamp(raw: unknown, fb: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fb;
  return Math.min(Math.max(n, min), max);
}

function parseBigIntParam(raw: unknown): bigint | null {
  if (typeof raw !== 'string') return null;
  try {
    const n = BigInt(raw);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

export async function listMyNotifications(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const limit = parseIntClamp(req.query.limit, 20, 1, 100);
  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  const unreadOnly = req.query.unreadOnly === 'true';

  const where = unreadOnly
    ? { userId: auth.userId, readAt: null }
    : { userId: auth.userId };

  const [total, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        notificationId: true,
        eventId: true,
        title: true,
        message: true,
        readAt: true,
        createdAt: true,
        event: {
          select: {
            eventId: true,
            title: true,
            approvalStatus: true,
            isDeleted: true,
          },
        },
      },
    }),
  ]);

  res.json({
    page,
    limit,
    total,
    items: rows.map((r) => ({
      notificationId: r.notificationId.toString(),
      eventId: r.eventId?.toString() ?? null,
      title: r.title,
      message: r.message,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      // 이벤트가 소프트 삭제/취소됐으면 링크 비활성화.
      eventAvailable:
        r.event != null && !r.event.isDeleted && r.event.approvalStatus === 'approved',
    })),
  });
}

export async function unreadCount(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const count = await prisma.notification.count({
    where: { userId: auth.userId, readAt: null },
  });
  res.json({ count });
}

export async function markNotificationRead(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const id = parseBigIntParam(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const existing = await prisma.notification.findUnique({
    where: { notificationId: id },
    select: { userId: true, readAt: true },
  });
  if (!existing || existing.userId !== auth.userId) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (!existing.readAt) {
    await prisma.notification.update({
      where: { notificationId: id },
      data: { readAt: new Date() },
    });
  }
  res.json({ ok: true });
}

export async function markAllNotificationsRead(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const result = await prisma.notification.updateMany({
    where: { userId: auth.userId, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true, updated: result.count });
}
