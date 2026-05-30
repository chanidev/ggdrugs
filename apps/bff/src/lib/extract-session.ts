/**
 * extract-session.ts — requireAuth(HTTP) 와 io.use(Socket.IO) 양쪽에서
 * 동일한 세션 검증 로직을 공유하는 헬퍼.
 *
 * 쿠키명: 'alle_sid' 고정.
 * 검증: isDeleted + expiresAt > now. 실패 시 null 반환.
 *
 * 이 함수는 DB 터치(touchSession/sliding TTL) 를 하지 않는다.
 * HTTP requireAuth 경로에서는 touchSession 을 별도 호출할 것.
 */

import type { PrismaClient } from '@prisma/client';

const COOKIE_NAME = 'alle_sid';

/** cookieHeader 에서 alle_sid 값을 파싱. 없으면 null. */
export function parseSidFromCookieHeader(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === COOKIE_NAME) return rest.join('=') || null;
  }
  return null;
}

export interface SessionInfo {
  userId: bigint;
  sessionId: string;
  createdAt: Date;
  /** HTTP 경로 전용 — socket 경로에서는 undefined */
  nickname?: string;
  /** HTTP 경로 전용 — socket 경로에서는 undefined */
  activeRole?: string;
}

/**
 * 쿠키 헤더 문자열을 받아 세션을 검증하고, 유효하면 세션 정보를 반환.
 * 미인증/만료/삭제계정이면 null 반환.
 *
 * withUserFields=true (HTTP 경로) 시 nickname/activeRole 도 포함해 반환.
 */
export async function extractSession(
  cookieHeader: string | undefined,
  prisma: PrismaClient,
  withUserFields = false,
): Promise<SessionInfo | null> {
  const sid = parseSidFromCookieHeader(cookieHeader);
  if (!sid) return null;

  const row = await prisma.authSession.findUnique({
    where: { sessionId: sid },
    select: {
      expiresAt: true,
      createdAt: true,
      user: {
        select: {
          userId: true,
          isDeleted: true,
          nickname: true,
          activeRole: true,
        },
      },
    },
  });

  if (!row) return null;
  if (row.user.isDeleted) return null;
  if (row.expiresAt <= new Date()) return null;

  const base: SessionInfo = {
    userId: row.user.userId,
    sessionId: sid,
    createdAt: row.createdAt,
  };

  if (withUserFields) {
    base.nickname = row.user.nickname;
    base.activeRole = row.user.activeRole;
  }

  return base;
}
