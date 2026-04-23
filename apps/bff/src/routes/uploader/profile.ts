import type { Request, Response } from 'express';
import { prisma } from '../../prisma.js';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import { shapeUploaderProfile } from './_helpers.js';

/** GET /me/uploader — 본인 업로더 프로파일. */
export async function getMyUploader(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const row = await prisma.uploaderProfile.findUnique({
    where: { userId: auth.userId },
    select: {
      uploaderId: true,
      organizationName: true,
      contactPhone: true,
      contactEmail: true,
      approvalStatus: true,
      approvedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!row) {
    res.status(404).json({ error: 'uploader_profile_not_found' });
    return;
  }
  res.json({ uploader: shapeUploaderProfile(row) });
}
