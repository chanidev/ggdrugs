import { runTourapiIngest } from './tourapi-ingest.js';
import { runSeoulCultureIngest } from './seoul-culture-ingest.js';
import { runKcisaIngest } from './kcisa-ingest.js';
import { logger } from '../logger.js';
import { env } from '../env.js';

/**
 * 일일 배치 스케줄러.
 *
 * 전략:
 * - 서버 기동 2s 뒤에 즉시 1회 실행 (첫 배포/개발 시 빠른 피드백).
 * - 이후 24h 간격 setInterval.
 * - 각 소스는 키 없으면 자체 no-op.
 * - 수평 확장·크래시 복구까지 신경쓰면 BullMQ 로 교체 검토 (redis 이미 있음).
 *
 * env.NODE_ENV 가 'test' 면 실행하지 않음.
 */

const DAILY_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 2_000;

let started = false;

async function runAll(): Promise<void> {
  const log = logger.child({ job: 'daily-batch' });
  log.info('run all ingest sources');
  const results = await Promise.allSettled([
    runTourapiIngest(),
    runSeoulCultureIngest(),
    runKcisaIngest(),
  ]);
  results.forEach((r, i) => {
    const name = ['tourapi', 'seoul-culture', 'kcisa'][i];
    if (r.status === 'rejected') {
      log.error({ source: name, err: r.reason instanceof Error ? r.reason.message : String(r.reason) }, 'source crashed');
    } else {
      log.info({ source: name, ...r.value }, 'source done');
    }
  });
}

export function startScheduler(): void {
  if (started) {
    logger.warn('scheduler already started');
    return;
  }
  if (env.NODE_ENV === 'test') return;

  const configured = [
    env.TOUR_API_KEY ? 'tourapi' : null,
    env.SEOUL_OPEN_API_KEY ? 'seoul-culture' : null,
    env.KCISA_API_KEY ? 'kcisa' : null,
  ].filter((x): x is string => x !== null);

  if (configured.length === 0) {
    logger.warn('no ingest API keys configured — scheduler not started');
    return;
  }
  started = true;

  const tick = () => {
    runAll().catch((err) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'scheduled ingest failed');
    });
  };

  setTimeout(tick, STARTUP_DELAY_MS);
  setInterval(tick, DAILY_MS);
  logger.info({ everyMs: DAILY_MS, startupDelayMs: STARTUP_DELAY_MS, sources: configured }, 'ingest scheduler started');
}

/** CLI/수동 실행용 — 전체 소스 1회 동기 실행 후 결과 집계. */
export { runAll };
