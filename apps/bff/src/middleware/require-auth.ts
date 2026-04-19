import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';

/**
 * 세션 쿠키 → user 조회. 성공 시 req.auth 채워서 다음 핸들러로, 실패 시 401.
 *
 * 쿠키 이름 / 만료 처리 규칙은 routes/auth.ts 와 동일.
 * (auth.ts /me 는 공개 get-or-null, 이 미들웨어는 반드시 로그인이 필요한 경우에만.)
 */

const COOKIE_NAME = 'alle_sid';

export interface AuthenticatedRequest extends Request {
  auth: { userId: bigint; nickname: string; activeRole: string };
}

function parseSid(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === COOKIE_NAME) return rest.join('=') || null;
  }
  return null;
}

/**
 * optional auth — 쿠키 있으면 req.auth 세팅, 없거나 만료여도 next().
 * 공개 + 인증 시 개인화 응답을 섞는 엔드포인트용 (예: event-detail 에 isBookmarked).
 */
export async function resolveAuth(req: Request, _res: Response, next: NextFunction) {
  const sid = parseSid(req);
  if (!sid) {
    next();
    return;
  }
  const row = await prisma.authSession.findUnique({
    where: { sessionId: sid },
    select: {
      expiresAt: true,
      user: {
        select: {
          userId: true,
          nickname: true,
          activeRole: true,
          isDeleted: true,
        },
      },
    },
  });
  if (row && !row.user.isDeleted && row.expiresAt > new Date()) {
    (req as AuthenticatedRequest).auth = {
      userId: row.user.userId,
      nickname: row.user.nickname,
      activeRole: row.user.activeRole,
    };
  }
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sid = parseSid(req);
  if (!sid) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  const row = await prisma.authSession.findUnique({
    where: { sessionId: sid },
    select: {
      expiresAt: true,
      user: {
        select: {
          userId: true,
          nickname: true,
          activeRole: true,
          isDeleted: true,
        },
      },
    },
  });
  if (!row || row.user.isDeleted || row.expiresAt <= new Date()) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  (req as AuthenticatedRequest).auth = {
    userId: row.user.userId,
    nickname: row.user.nickname,
    activeRole: row.user.activeRole,
  };
  next();
}
