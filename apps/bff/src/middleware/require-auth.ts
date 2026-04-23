import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';

/**
 * 세션 쿠키 → user 조회. 성공 시 req.auth 채워서 다음 핸들러로, 실패 시 401.
 *
 * 쿠키 이름 / 만료 처리 규칙은 routes/auth.ts 와 동일.
 * (auth.ts /me 는 공개 get-or-null, 이 미들웨어는 반드시 로그인이 필요한 경우에만.)
 *
 * Sliding + cap (ADR 0004 D-4): 세션 검증 성공 시 last_seen_at 과 함께
 *   expires_at = MIN(now()+SLIDING_TTL, created_at+ABSOLUTE_CAP) 로 갱신.
 *   같은 UPDATE 한 statement 라 추가 IO 없음. fire-and-forget.
 */

const COOKIE_NAME = 'alle_sid';
export const SESSION_SLIDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;       // 7d sliding
export const SESSION_ABSOLUTE_CAP_MS = 30 * 24 * 60 * 60 * 1000;     // 30d max from createdAt

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
 * 새 expires_at = MIN(now()+sliding, created_at+cap). cap 도달 후 그대로 두면
 * 다음 요청에서 expires_at <= now() 으로 401 → 재로그인 강제.
 */
export function nextExpiresAt(createdAt: Date, now = new Date()): Date {
  const slid = new Date(now.getTime() + SESSION_SLIDING_TTL_MS).getTime();
  const cap = new Date(createdAt.getTime() + SESSION_ABSOLUTE_CAP_MS).getTime();
  return new Date(Math.min(slid, cap));
}

/**
 * 검증 성공 직후 호출 — last_seen_at + expires_at 갱신을 단일 UPDATE 로.
 * 실패는 조용히 무시 (lazy 401 안전망 + 다음 요청에 재시도).
 */
function touchSession(sessionId: string, createdAt: Date): void {
  const now = new Date();
  prisma.authSession
    .update({
      where: { sessionId },
      data: { lastSeenAt: now, expiresAt: nextExpiresAt(createdAt, now) },
    })
    .catch(() => {
      /* 조용히 skip */
    });
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
      createdAt: true,
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
    touchSession(sid, row.createdAt);
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
      createdAt: true,
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
  touchSession(sid, row.createdAt);
  next();
}
