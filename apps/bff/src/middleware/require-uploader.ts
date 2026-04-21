import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from './require-auth.js';

/**
 * 업로더 역할 미들웨어.
 *
 * 두 단계:
 *   requireUploaderApproved — uploader_profile(approved) 만 체크. 상태 조회·이벤트 목록 등에 사용.
 *   requireUploaderActive   — approved + users.active_role='uploader' 양쪽 체크. 쓰기 작업(이벤트 업로드)에 사용.
 *
 * active_role 체크 이유 (CLAUDE.md §5-1): "1계정 = 복수역할 토글" 모델. 사용자가 uploader
 * 로 전환한 상태에서만 업로드가 가능해야 기본 탐색 중 실수 업로드를 막는다.
 */

export interface UploaderRequest extends AuthenticatedRequest {
  uploader: { uploaderId: bigint };
}

async function loadApprovedUploader(userId: bigint) {
  return prisma.uploaderProfile.findUnique({
    where: { userId },
    select: { uploaderId: true, approvalStatus: true },
  });
}

export async function requireUploaderApproved(req: Request, res: Response, next: NextFunction) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  const profile = await loadApprovedUploader(auth.userId);
  if (!profile || profile.approvalStatus !== 'approved') {
    res.status(403).json({ error: 'uploader_not_approved', status: profile?.approvalStatus ?? 'none' });
    return;
  }
  (req as UploaderRequest).uploader = { uploaderId: profile.uploaderId };
  next();
}

export async function requireUploaderActive(req: Request, res: Response, next: NextFunction) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  if (auth.activeRole !== 'uploader') {
    res.status(403).json({ error: 'active_role_not_uploader', current: auth.activeRole });
    return;
  }
  const profile = await loadApprovedUploader(auth.userId);
  if (!profile || profile.approvalStatus !== 'approved') {
    res.status(403).json({ error: 'uploader_not_approved', status: profile?.approvalStatus ?? 'none' });
    return;
  }
  (req as UploaderRequest).uploader = { uploaderId: profile.uploaderId };
  next();
}
