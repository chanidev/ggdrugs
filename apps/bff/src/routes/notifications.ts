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

  // kick_vote 알림은 readAt 이 영구적으로 null 이라 unreadOnly 목록에서도 제외해야
  // 배지 카운터(unreadCount)와 의미적으로 일관성을 유지할 수 있다.
  const where = unreadOnly
    ? { userId: auth.userId, readAt: null, NOT: { notificationType: 'kick_vote' } }
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
  // kick_vote 알림은 readAt 을 투표 완료 마커로 사용하지 않아 readAt 이 영구적으로 null 상태.
  // 배지 카운터가 과대계상 되지 않도록 kick_vote 를 제외한다.
  // (markAllNotificationsRead 와 동일한 exclusion 정책)
  const count = await prisma.notification.count({
    where: { userId: auth.userId, readAt: null, NOT: { notificationType: 'kick_vote' } },
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
    select: { userId: true, readAt: true, notificationType: true },
  });
  if (!existing || existing.userId !== auth.userId) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  // [critical-fix] kick_vote 알림은 readAt 을 '투표 완료' 마커로 쓰지 않으므로
  // 알림센터 read 엔드포인트에서 readAt 세트를 건너뛴다.
  // 투표 완료는 castKickVote 에서 message.voteResult 로만 기록한다.
  if (existing.notificationType === 'kick_vote') {
    res.json({ ok: true });
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
  // [critical-fix] kick_vote 알림은 readAt 이 투표 완료 마커로 dual-use 되지 않도록 제외.
  // 투표 완료 마커는 message.voteResult 필드이며 castKickVote 에서만 기록한다.
  const result = await prisma.notification.updateMany({
    where: { userId: auth.userId, readAt: null, NOT: { notificationType: 'kick_vote' } },
    data: { readAt: new Date() },
  });
  res.json({ ok: true, updated: result.count });
}
