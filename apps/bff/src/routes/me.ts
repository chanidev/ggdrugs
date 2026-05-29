import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

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
