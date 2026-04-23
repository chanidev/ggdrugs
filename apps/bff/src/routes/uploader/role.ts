import type { Request, Response } from 'express';
import { prisma } from '../../prisma.js';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';

/**
 * PUT /me/active-role — user ↔ uploader 토글.
 * uploader 로 전환은 approvalStatus='approved' 일 때만 허용.
 * active_role CHECK 제약이 ('user','uploader') 로 한정.
 */
export async function setActiveRole(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const targetRaw = (req.body ?? {}).role;
  if (targetRaw !== 'user' && targetRaw !== 'uploader') {
    res.status(400).json({ error: "role 은 'user' 또는 'uploader'" });
    return;
  }
  if (targetRaw === 'uploader') {
    const profile = await prisma.uploaderProfile.findUnique({
      where: { userId: auth.userId },
      select: { approvalStatus: true },
    });
    if (!profile || profile.approvalStatus !== 'approved') {
      res.status(403).json({
        error: 'uploader_not_approved',
        status: profile?.approvalStatus ?? 'none',
      });
      return;
    }
  }
  await prisma.user.update({
    where: { userId: auth.userId },
    data: { activeRole: targetRaw },
  });
  res.json({ activeRole: targetRaw });
}
