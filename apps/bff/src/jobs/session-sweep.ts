// ADR 0004 §결정 D-5: 만료된 auth_sessions 행 주기 정리.
// `pnpm --filter bff sweep:sessions` CLI 또는 scheduler.ts::runAll() 후속 단계로 자동 호출.
//
// grace 7d: 만료 직후 즉시 삭제하지 않고 일주일 여유 — 디버깅 시 "세션이 왜 사라졌나"
// 추적 여유. lazy 401 안전망은 require-auth.ts 가 expires_at <= now() 체크로 그대로 보장하므로
// grace 동안 보안 위험 없음.
//
// 인덱스 idx_auth_sessions_expires 가 이미 존재해 DELETE WHERE expires_at < cutoff 효율 OK.
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';

const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export async function runSessionSweep(): Promise<{ deleted: number; cutoff: string }> {
  const cutoff = new Date(Date.now() - GRACE_MS);
  const result = await prisma.authSession.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  return { deleted: result.count, cutoff: cutoff.toISOString() };
}

/**
 * GG-REPORT-006/007: 이용정지 만료 사용자 제재 해제 배치.
 *
 * sanctionStatus='suspended' + sanctionExpiresAt <= now → sanctionStatus='none' 초기화.
 * runAll() 에서 runSessionSweep 과 같은 타이밍에 호출.
 */
export async function runSanctionExpirySweep(): Promise<{ reset: number }> {
  const now = new Date();
  const result = await prisma.user.updateMany({
    where: {
      sanctionStatus: 'suspended',
      sanctionExpiresAt: { lte: now },
    },
    data: {
      sanctionStatus: 'none',
      sanctionExpiresAt: null,
      sanctionReason: null,
    },
  });
  return { reset: result.count };
}

async function main() {
  const log = logger.child({ job: 'session-sweep' });
  try {
    const out = await runSessionSweep();
    log.info(out, 'session sweep done');
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'sweep failed');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Windows/POSIX 양쪽 안전한 CLI 가드 — summarize-events.ts 와 동일 패턴.
const isCliRun =
  process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('session-sweep.ts');
if (isCliRun) {
  void main();
}
