import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
import { env } from '../env.js';

/**
 * Auth 루트 — dev-login stub + Google OAuth (authorization code flow).
 *
 *  POST /auth/dev-login         { nickname } → 세션 생성 + cookie (dev only)
 *  GET  /auth/google            → state 쿠키 + Google 인증 URL 로 302
 *  GET  /auth/google/callback   → code↔token 교환 + id_token 검증 +
 *                                 user upsert + 세션 쿠키 + 웹 루트로 302
 *  GET  /auth/me                → { user } | 401
 *  POST /auth/logout            → cookie clear + session row 삭제
 *
 * Redirect URI (Google 콘솔에 등록): `${WEB_URL}/api/auth/google/callback`.
 * (Vite dev proxy 경유 → 쿠키 same-origin.)
 */

const COOKIE_NAME = 'alle_sid';
const OAUTH_STATE_COOKIE = 'alle_oauth_state';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const OAUTH_STATE_TTL_S = 10 * 60; // 10 min

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

function parseCookieValue(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=') || null;
  }
  return null;
}

function parseSid(req: Request): string | null {
  return parseCookieValue(req, COOKIE_NAME);
}

function googleRedirectUri(): string {
  // Vite dev proxy 경유 경로 — Google 콘솔에도 이 URI 를 등록.
  return `${env.WEB_URL}/api/auth/google/callback`;
}

async function issueSessionAndRedirect(res: Response, userId: bigint, to: string) {
  const sid = makeSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.authSession.create({
    data: { sessionId: sid, userId, expiresAt },
  });
  const secureFlag = env.NODE_ENV === 'production' ? '; Secure' : '';
  // state 쿠키 만료 + 세션 쿠키 세팅 — 2 개 Set-Cookie 동시
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(
      SESSION_TTL_MS / 1000,
    )}${secureFlag}`,
    `${OAUTH_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureFlag}`,
  ]);
  res.redirect(to);
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

// =============================================================
// Google OAuth (authorization code flow)
// =============================================================

export async function startGoogle(_req: Request, res: Response) {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    res.status(503).json({
      error:
        'google oauth not configured — set GOOGLE_OAUTH_CLIENT_ID/SECRET in .env and register ' +
        `redirect URI ${googleRedirectUri()}`,
    });
    return;
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const secureFlag = env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${OAUTH_STATE_TTL_S}${secureFlag}`,
  );

  const params = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenInfo {
  sub?: string;
  aud?: string;
  iss?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  error?: string;
}

export async function googleCallback(req: Request, res: Response) {
  const errorFromGoogle =
    typeof req.query.error === 'string' ? req.query.error : null;
  if (errorFromGoogle) {
    // 사용자가 동의 취소 등. 홈으로 돌려보내되 에러 플래그 쿼리 스트링으로.
    res.redirect(`${env.WEB_URL}/?auth_error=${encodeURIComponent(errorFromGoogle)}`);
    return;
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const cookieState = parseCookieValue(req, OAUTH_STATE_COOKIE);

  if (!code || !state || !cookieState || state !== cookieState) {
    res.status(400).json({ error: 'invalid oauth state' });
    return;
  }
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    res.status(503).json({ error: 'google oauth not configured' });
    return;
  }

  // code → token 교환
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const tokenJson = (await tokenRes.json()) as GoogleTokenResponse;
  if (!tokenRes.ok || !tokenJson.id_token) {
    res.status(400).json({
      error: `google token exchange failed: ${tokenJson.error ?? 'no id_token'}`,
    });
    return;
  }

  // id_token 검증 — Google tokeninfo endpoint.
  const infoRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenJson.id_token)}`,
  );
  const info = (await infoRes.json()) as GoogleTokenInfo;
  if (
    !infoRes.ok ||
    !info.sub ||
    info.aud !== env.GOOGLE_OAUTH_CLIENT_ID ||
    (info.iss !== 'https://accounts.google.com' && info.iss !== 'accounts.google.com')
  ) {
    res.status(400).json({
      error: `google id_token invalid: ${info.error ?? 'aud/iss mismatch'}`,
    });
    return;
  }

  const sub = info.sub;
  const nickname = (info.name ?? info.email ?? 'user').slice(0, 50);

  // upsert user — provider='google'
  const user = await prisma.user.upsert({
    where: {
      authProvider_socialUid: { authProvider: 'google', socialUid: sub },
    },
    update: { lastLoggedInAt: new Date() },
    create: {
      authProvider: 'google',
      socialUid: sub,
      nickname,
      lastLoggedInAt: new Date(),
    },
    select: { userId: true },
  });

  await issueSessionAndRedirect(res, user.userId, `${env.WEB_URL}/`);
}

export async function logout(req: Request, res: Response) {
  const sid = parseSid(req);
  if (sid) {
    await prisma.authSession.deleteMany({ where: { sessionId: sid } });
  }
  clearSessionCookie(res);
  res.json({ ok: true });
}
