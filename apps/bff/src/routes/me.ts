import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

/** GET /me/credits?page=&limit= — 크레딧 내역 + 잔액 (ADR 0007 결정5, 와이어 9-1)
 *
 * [이슈21] balance = SUM(pointsAmount). 행 없으면 _sum.pointsAmount=null → 0.
 * [오버라이드] appointment_complete 크레딧은 스케줄러 잡(notifyMateEval)에서 생성.
 */
export async function listMyCredits(req: Request, res: Response): Promise<void> {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }

  const page  = Math.max(1, Number.parseInt(typeof req.query['page']  === 'string' ? req.query['page']  : '1',  10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(typeof req.query['limit'] === 'string' ? req.query['limit'] : '20', 10) || 20));

  const [agg, rows] = await Promise.all([
    prisma.creditLedger.aggregate({
      where: { userId: auth.userId },
      _sum: { pointsAmount: true },
    }),
    prisma.creditLedger.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: { ledgerId: true, action: true, pointsAmount: true, appointmentId: true, createdAt: true },
    }),
  ]);

  const balance = agg._sum.pointsAmount ?? 0;

  res.json({
    balance,
    page,
    limit,
    items: rows.map((r) => ({
      ledgerId:      r.ledgerId.toString(),
      action:        r.action,
      pointsAmount:  r.pointsAmount,
      appointmentId: r.appointmentId?.toString() ?? null,
      createdAt:     r.createdAt.toISOString(),
    })),
  });
}

/**
 * PATCH /me/profile — 본인 프로필 수정 (A_807 닉네임 수정).
 * 요구사항정의서 GG-PROFILE-005 구현.
 */
export async function updateMyProfile(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const updates: { nickname?: string } = {};

  if ('nickname' in body) {
    const raw = typeof body.nickname === 'string' ? body.nickname.trim() : null;
    if (!raw || raw.length === 0) {
      res.status(400).json({ error: 'nickname must not be empty' });
      return;
    }
    if (raw.length > 30) {
      res.status(400).json({ error: 'nickname must be 30 chars or less' });
      return;
    }
    updates.nickname = raw;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'no updatable fields provided' });
    return;
  }

  await prisma.user.update({
    where: { userId: auth.userId },
    data: updates,
  });

  res.status(200).json({ ok: true });
}
