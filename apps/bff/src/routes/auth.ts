import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
import { env } from '../env.js';

/**
 * Auth 루트 — Stage 1 (dev 전용 로그인 stub).
 *
 *  POST /auth/dev-login   { nickname: string } → 세션 생성 + cookie 세팅
 *  GET  /auth/me           → { user } | 401
 *  POST /auth/logout       → cookie clear + session row 삭제
 *
 * Stage 2 에서 /auth/google/* OAuth 콜백으로 대체. 세션 shape 은 유지.
 */

const COOKIE_NAME = 'alle_sid';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function makeSessionId(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function setSessionCookie(res: Response, sid: string, expiresAt: Date) {
  // dev: HttpOnly + SameSite=Lax + Path=/ (same-origin via vite proxy).
  // prod over HTTPS 에서는 Secure 추가.
  const parts = [
    `${COOKIE_NAME}=${sid}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${Math.floor((expiresAt.getTime() - Date.now()) / 1000)}`,
  ];
  if (env.NODE_ENV === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res: Response) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  );
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

/** dev 모드에서만 허용 — prod 에서는 404. */
export async function devLogin(req: Request, res: Response) {
  if (env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'not found' });
    return;
  }

  const raw = (req.body?.nickname ?? '').toString().trim();
  if (!raw || raw.length > 50) {
    res.status(400).json({ error: 'nickname 은 1~50자 문자열' });
    return;
  }

  // socialUid = nickname 그대로 (dev 전용 stub). provider='dev'.
  const user = await prisma.user.upsert({
    where: {
      authProvider_socialUid: { authProvider: 'dev', socialUid: raw },
    },
    update: { lastLoggedInAt: new Date(), nickname: raw },
    create: {
      authProvider: 'dev',
      socialUid: raw,
      nickname: raw,
      lastLoggedInAt: new Date(),
    },
    select: {
      userId: true,
      nickname: true,
      activeRole: true,
    },
  });

  const sid = makeSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.authSession.create({
    data: { sessionId: sid, userId: user.userId, expiresAt },
  });
  setSessionCookie(res, sid, expiresAt);

  res.json({
    user: {
      userId: user.userId.toString(),
      nickname: user.nickname,
      activeRole: user.activeRole,
    },
  });
}

export async function me(req: Request, res: Response) {
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
    clearSessionCookie(res);
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  // sliding expiry — 요청마다 lastSeenAt 갱신 (fire & forget).
  prisma.authSession
    .update({ where: { sessionId: sid }, data: { lastSeenAt: new Date() } })
    .catch(() => {
      /* 조용히 skip */
    });
  res.json({
    user: {
      userId: row.user.userId.toString(),
      nickname: row.user.nickname,
      activeRole: row.user.activeRole,
    },
  });
}

export async function logout(req: Request, res: Response) {
  const sid = parseSid(req);
  if (sid) {
    await prisma.authSession.deleteMany({ where: { sessionId: sid } });
  }
  clearSessionCookie(res);
  res.json({ ok: true });
}
