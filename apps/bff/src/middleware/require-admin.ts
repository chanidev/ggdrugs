import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from './require-auth.js';

/**
 * requireAdmin — requireAuth 이후 체인에서 사용.
 *
 * 정책 (ADR 0001 §3):
 *   관리자 자격 = admin_profiles 행 존재 + isActive=true.
 *   active_role CHECK 제약이 ('user','uploader') 로 한정되어 있어 admin 은
 *   active_role 로 표현하지 않음. admin_profiles 존재 여부만 확인.
 *
 * 성공 시 req.admin 에 adminId/scope 첨부. 실패 시 403 (인증 실패는 401 별도).
 */

export interface AdminRequest extends AuthenticatedRequest {
  admin: { adminId: bigint; scope: string };
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    // requireAuth 가 앞에 없으면 여기 들어올 수 없지만 방어적으로.
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  const profile = await prisma.adminProfile.findUnique({
    where: { userId: auth.userId },
    select: { adminId: true, scope: true, isActive: true },
  });
  if (!profile || !profile.isActive) {
    res.status(403).json({ error: 'admin_required' });
    return;
  }
  (req as AdminRequest).admin = { adminId: profile.adminId, scope: profile.scope };
  next();
}
