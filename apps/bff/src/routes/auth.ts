import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
import { env } from '../env.js';
import { nextExpiresAt } from '../middleware/require-auth.js';

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
const OAUTH_RETURNTO_COOKIE = 'alle_oauth_returnto'; // A_100 — 원 액션 자동 복귀
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const OAUTH_STATE_TTL_S = 10 * 60; // 10 min

/**
 * A_100 자동 복귀 — same-origin path 만 화이트리스트.
 *
 * 허용: '/events/123', '/me', '/uploader?tab=apply' 같은 path+query
 * 거부: 'https://...' (절대 URL), '//evil.com' (protocol-relative), '../' (path traversal),
 *       길이 > 500 (cookie 부담)
 *
 * null 반환 시 callback 은 기본 '/' 로 fallback.
 */
function parseReturnTo(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > 500) return null;
  // '/' 로 시작하지만 '//' 은 protocol-relative URL 이라 거부
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  // 안전한 path char 만 허용 (path/query/fragment 표준)
  if (!/^[/A-Za-z0-9\-_.~!$&'()*+,;=:@%?#]+$/.test(raw)) return null;
  return raw;
}

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

function kakaoRedirectUri(): string {
  return `${env.WEB_URL}/api/auth/kakao/callback`;
}

async function issueSessionAndRedirect(res: Response, userId: bigint, to: string) {
  const sid = makeSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.authSession.create({
    data: { sessionId: sid, userId, expiresAt },
  });
  const secureFlag = env.NODE_ENV === 'production' ? '; Secure' : '';
  // state 쿠키 만료 + returnTo 쿠키 만료 + 세션 쿠키 세팅 — 3 개 Set-Cookie 동시
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(
      SESSION_TTL_MS / 1000,
    )}${secureFlag}`,
    `${OAUTH_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureFlag}`,
    `${OAUTH_RETURNTO_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureFlag}`,
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
      createdAt: true,
      user: {
        select: {
          userId: true,
          nickname: true,
          activeRole: true,
          isDeleted: true,
          adminProfile: { select: { isActive: true } },
        },
      },
    },
  });
  if (!row || row.user.isDeleted || row.expiresAt <= new Date()) {
    clearSessionCookie(res);
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  // ADR 0004 D-4: lastSeenAt + sliding expiresAt (cap 30d) 동일 statement (fire & forget).
  const now = new Date();
  prisma.authSession
    .update({
      where: { sessionId: sid },
      data: { lastSeenAt: now, expiresAt: nextExpiresAt(row.createdAt, now) },
    })
    .catch(() => {
      /* 조용히 skip */
    });
  res.json({
    user: {
      userId: row.user.userId.toString(),
      nickname: row.user.nickname,
      activeRole: row.user.activeRole,
      isAdmin: !!row.user.adminProfile?.isActive,
    },
  });
}

// =============================================================
// Google OAuth (authorization code flow)
// =============================================================

export async function startGoogle(req: Request, res: Response) {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    res.status(503).json({
      error:
        'google oauth not configured — set GOOGLE_OAUTH_CLIENT_ID/SECRET in .env and register ' +
        `redirect URI ${googleRedirectUri()}`,
    });
    return;
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const returnTo = parseReturnTo(req.query.returnTo); // A_100
  const secureFlag = env.NODE_ENV === 'production' ? '; Secure' : '';
  const cookies = [
    `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${OAUTH_STATE_TTL_S}${secureFlag}`,
  ];
  if (returnTo) {
    // 같은 TTL — state 만료 시 returnTo 도 같이 정리.
    cookies.push(
      `${OAUTH_RETURNTO_COOKIE}=${encodeURIComponent(returnTo)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${OAUTH_STATE_TTL_S}${secureFlag}`,
    );
  }
  res.setHeader('Set-Cookie', cookies);

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

  // A_100 자동 복귀 — returnTo 쿠키 있으면 같은 origin path 로, 없으면 '/' 로.
  const rawReturnTo = parseCookieValue(req, OAUTH_RETURNTO_COOKIE);
  const returnTo = rawReturnTo ? parseReturnTo(decodeURIComponent(rawReturnTo)) : null;
  await issueSessionAndRedirect(res, user.userId, `${env.WEB_URL}${returnTo ?? '/'}`);
}

// =============================================================
// Kakao OAuth (authorization code flow)
// =============================================================

export async function startKakao(req: Request, res: Response) {
  if (!env.KAKAO_REST_API_KEY) {
    res.status(503).json({
      error:
        'kakao oauth not configured — set KAKAO_REST_API_KEY in .env and register ' +
        `redirect URI ${kakaoRedirectUri()} in Kakao Developers console`,
    });
    return;
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const returnTo = parseReturnTo(req.query.returnTo); // A_100
  const secureFlag = env.NODE_ENV === 'production' ? '; Secure' : '';
  const cookies = [
    `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${OAUTH_STATE_TTL_S}${secureFlag}`,
  ];
  if (returnTo) {
    cookies.push(
      `${OAUTH_RETURNTO_COOKIE}=${encodeURIComponent(returnTo)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${OAUTH_STATE_TTL_S}${secureFlag}`,
    );
  }
  res.setHeader('Set-Cookie', cookies);

  const params = new URLSearchParams({
    client_id: env.KAKAO_REST_API_KEY,
    redirect_uri: kakaoRedirectUri(),
    response_type: 'code',
    state,
    // nickname 은 기본 제공. 필요 시 account_email 등 추가.
  });
  res.redirect(`https://kauth.kakao.com/oauth/authorize?${params.toString()}`);
}

interface KakaoTokenResponse {
  access_token?: string;
  token_type?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface KakaoUserMe {
  id?: number;
  properties?: { nickname?: string };
  kakao_account?: {
    profile?: { nickname?: string };
    email?: string;
  };
}

export async function kakaoCallback(req: Request, res: Response) {
  const errorFromKakao =
    typeof req.query.error === 'string' ? req.query.error : null;
  if (errorFromKakao) {
    res.redirect(`${env.WEB_URL}/?auth_error=${encodeURIComponent(errorFromKakao)}`);
    return;
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const cookieState = parseCookieValue(req, OAUTH_STATE_COOKIE);

  if (!code || !state || !cookieState || state !== cookieState) {
    res.status(400).json({ error: 'invalid oauth state' });
    return;
  }
  if (!env.KAKAO_REST_API_KEY) {
    res.status(503).json({ error: 'kakao oauth not configured' });
    return;
  }

  // code → access_token
  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.KAKAO_REST_API_KEY,
      redirect_uri: kakaoRedirectUri(),
      code,
    }),
  });
  const tokenJson = (await tokenRes.json()) as KakaoTokenResponse;
  if (!tokenRes.ok || !tokenJson.access_token) {
    res.status(400).json({
      error: `kakao token exchange failed: ${tokenJson.error ?? 'no access_token'}`,
    });
    return;
  }

  // access_token → /v2/user/me
  const meRes = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const me = (await meRes.json()) as KakaoUserMe;
  if (!meRes.ok || !me.id) {
    res.status(400).json({ error: 'kakao user fetch failed' });
    return;
  }

  const sub = String(me.id);
  const nicknameFromProfile =
    me.kakao_account?.profile?.nickname ?? me.properties?.nickname ?? null;
  const nickname = (nicknameFromProfile ?? `kakao-${sub.slice(-6)}`).slice(0, 50);

  const user = await prisma.user.upsert({
    where: {
      authProvider_socialUid: { authProvider: 'kakao', socialUid: sub },
    },
    update: { lastLoggedInAt: new Date() },
    create: {
      authProvider: 'kakao',
      socialUid: sub,
      nickname,
      lastLoggedInAt: new Date(),
    },
    select: { userId: true },
  });

  // A_100 자동 복귀 — Google callback 과 동일.
  const rawReturnTo = parseCookieValue(req, OAUTH_RETURNTO_COOKIE);
  const returnTo = rawReturnTo ? parseReturnTo(decodeURIComponent(rawReturnTo)) : null;
  await issueSessionAndRedirect(res, user.userId, `${env.WEB_URL}${returnTo ?? '/'}`);
}

export async function logout(req: Request, res: Response) {
  const sid = parseSid(req);
  if (sid) {
    await prisma.authSession.deleteMany({ where: { sessionId: sid } });
  }
  clearSessionCookie(res);
  res.json({ ok: true });
}

/**
 * ADR 0004 D-3: 본인의 모든 디바이스 세션 일괄 로그아웃.
 * 요청 디바이스 포함 — 쿠키도 같이 만료.
 * 인증 실패면 200 ok/0 (idempotent — 이미 로그아웃 상태에서도 안전).
 */
export async function logoutAll(req: Request, res: Response) {
  const sid = parseSid(req);
  if (!sid) {
    clearSessionCookie(res);
    res.json({ ok: true, deleted: 0 });
    return;
  }
  const session = await prisma.authSession.findUnique({
    where: { sessionId: sid },
    select: { userId: true },
  });
  if (!session) {
    clearSessionCookie(res);
    res.json({ ok: true, deleted: 0 });
    return;
  }
  const result = await prisma.authSession.deleteMany({
    where: { userId: session.userId },
  });
  clearSessionCookie(res);
  res.json({ ok: true, deleted: result.count });
}
