import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';
import { extractSession } from '../lib/extract-session.js';

/**
 * 세션 쿠키 → user 조회. 성공 시 req.auth 채워서 다음 핸들러로, 실패 시 401.
 *
 * 쿠키 이름 / 만료 처리 규칙은 routes/auth.ts 와 동일.
 * (auth.ts /me 는 공개 get-or-null, 이 미들웨어는 반드시 로그인이 필요한 경우에만.)
 *
 * Sliding + cap (ADR 0004 D-4): 세션 검증 성공 시 last_seen_at 과 함께
 *   expires_at = MIN(now()+SLIDING_TTL, created_at+ABSOLUTE_CAP) 로 갱신.
 *   같은 UPDATE 한 statement 라 추가 IO 없음. fire-and-forget.
 *
 * 세션 파싱/검증 로직은 extractSession (lib/extract-session.ts) 에서 공유.
 * Socket.IO io.use() 미들웨어도 동일 함수를 사용한다 (withUserFields=false).
 */

export const SESSION_SLIDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;       // 7d sliding
export const SESSION_ABSOLUTE_CAP_MS = 30 * 24 * 60 * 60 * 1000;     // 30d max from createdAt

export interface AuthenticatedRequest extends Request {
  auth: { userId: bigint; nickname: string; activeRole: string };
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
  // extractSession 내부에서 alle_sid 파싱 + 만료/삭제 검증 일괄 처리.
  // null 반환이면 미인증이므로 추가 early-return 불필요.
  const session = await extractSession(req.headers.cookie, prisma, true);
  if (session && session.nickname && session.activeRole) {
    (req as AuthenticatedRequest).auth = {
      userId: session.userId,
      nickname: session.nickname,
      activeRole: session.activeRole,
    };
    touchSession(session.sessionId, session.createdAt);
  }
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // extractSession 내부에서 alle_sid 파싱 + 만료/삭제 검증 일괄 처리.
  // null 반환이면 미인증 → 401. 중복 parseSid 호출 제거.
  const session = await extractSession(req.headers.cookie, prisma, true);
  if (!session || !session.nickname || !session.activeRole) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  (req as AuthenticatedRequest).auth = {
    userId: session.userId,
    nickname: session.nickname,
    activeRole: session.activeRole,
  };
  touchSession(session.sessionId, session.createdAt);
  next();
}

/**
 * 유효한(만료 전) 이용정지 여부. (GG-REPORT-006/009)
 *
 * 컨벤션: actionAdminReport(admin-reports.ts)는 항상 non-null sanctionExpiresAt을 설정.
 *   sanctionExpiresAt=null 은 "만료됨/정지 없음" → suspended + null = 정지 해제로 취급.
 *   runSanctionExpirySweep 실행 전일 수 있어 앱 레이어에서도 만료 여부를 확인한다.
 *   match-request.ts / getRecommendations(mate.ts) 의 수신측 판정과 동일한 술어.
 */
export function isActivelySuspended(
  user: { sanctionStatus: string; sanctionExpiresAt: Date | null },
  now = new Date(),
): boolean {
  return (
    user.sanctionStatus === 'suspended' &&
    user.sanctionExpiresAt != null &&
    user.sanctionExpiresAt > now
  );
}

/**
 * requireAuth 뒤에 체이닝 — 발신측 제재 가드. (GG-REPORT-006/009)
 *
 * 정지된 사용자가 글/댓글/좋아요/신고/차단/매칭신청/채팅을 계속 수행하던 비대칭 갭을
 * 막는다(수신측만 막혀 있던 문제). 유효 정지면 403 sanction_active.
 * req.auth 가 채워져 있어야 하므로 반드시 requireAuth 다음에 배치한다.
 */
export async function requireNotSuspended(req: Request, res: Response, next: NextFunction) {
  const { auth } = req as AuthenticatedRequest;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { userId: auth.userId },
    select: { sanctionStatus: true, sanctionExpiresAt: true },
  });
  if (user && isActivelySuspended(user)) {
    res.status(403).json({
      error: 'sanction_active',
      detail: 'account suspended',
      sanctionExpiresAt: user.sanctionExpiresAt?.toISOString() ?? null,
    });
    return;
  }
  next();
}
