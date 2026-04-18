import { runTourapiIngest } from './tourapi-ingest.js';
import { logger } from '../logger.js';
import { env } from '../env.js';

/**
 * 로컬·단일-인스턴스 전제의 단순 스케줄러.
 *
 * 전략:
 * - 서버 기동 2s 뒤에 즉시 1회 실행 (첫 배포/개발 시 빠른 피드백).
 * - 이후 24h 간격 setInterval.
 * - 수평 확장·크래시 복구까지 신경쓰면 BullMQ 로 교체 검토 (redis 이미 있음).
 *
 * env.NODE_ENV 가 'test' 면 실행하지 않음 (테스트 격리).
 * TOUR_API_KEY 가 비어있어도 실행하지 않음 (개발 환경 방어).
 */

const DAILY_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 2_000;

let started = false;

export function startScheduler(): void {
  if (started) {
    logger.warn('scheduler already started');
    return;
  }
  if (env.NODE_ENV === 'test') return;
  if (!env.TOUR_API_KEY) {
    logger.warn('TOUR_API_KEY is empty — TourAPI ingest scheduler not started');
    return;
  }
  started = true;

  const tick = () => {
    runTourapiIngest().catch((err) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'scheduled ingest failed');
    });
  };

  setTimeout(tick, STARTUP_DELAY_MS);
  setInterval(tick, DAILY_MS);
  logger.info({ everyMs: DAILY_MS, startupDelayMs: STARTUP_DELAY_MS }, 'TourAPI ingest scheduler started');
}
