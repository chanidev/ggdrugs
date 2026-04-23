import { runTourapiIngest } from './tourapi-ingest.js';
import { runSeoulCultureIngest } from './seoul-culture-ingest.js';
import { runKcisaIngest } from './kcisa-ingest.js';
import { runBackfillSummaries } from './summarize-events.js';
import { runNewsNaverIngest } from './news-naver-ingest.js';
import { runEmbedEvents } from './embed-events.js';
import { auditMappingDistributionQuick } from './audit-news-mappings.js';
import { runSessionSweep } from './session-sweep.js';
import { runTasteAggregation } from './aggregate-taste-profiles.js';
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
 * 파이프라인 순서(공공 소스 이벤트 한정):
 *   1. tourapi / seoul-culture / kcisa ingest (병렬) — 이벤트 upsert, approvalStatus='approved'
 *   2. summarize-events backfill — aiSummary 비어있는 신규 행 요약
 *   3. news-naver 매핑 (onlyMissing=true, eventLimit='all') — 관련 기사 upsert
 *   4. embed-events (onlyMissing=true, eventLimit='all') — Qdrant alle-events 반영
 *   5. audit quick — 분포 + below-threshold 집계, 있으면 warn
 *   6. session sweep (ADR 0004 D-5) — 만료된 auth_sessions 행 정리 (grace 7d)
 *   7. taste aggregation (G-5) — 활성 user 의 user_taste_profiles 갱신
 *
 * 업로더 제출 이벤트는 별도 경로(admin-uploaders.ts 승인 훅) 로 동일 2~5단계를 단건 처리.
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

  // 공공 소스는 approvalStatus='approved' 로 바로 DB 인서트 — admin 승인 훅이 안 탄다.
  // 그래서 여기서 후속 파이프라인을 직접 트리거해 신규 이벤트가 검색·매핑에도 즉시 들어가게 한다.
  // onlyMissing 플래그로 기존에 처리된 이벤트는 자동 skip.
  log.info('post-ingest pipeline: summary → news mapping → embed → audit');

  try {
    const summary = await runBackfillSummaries({});
    log.info({ summary }, 'post-ingest ai-summary backfill done');
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'ai-summary backfill failed');
  }

  try {
    const news = await runNewsNaverIngest({ onlyMissing: true, eventLimit: 'all' });
    log.info({ news }, 'post-ingest news-naver mapping done');
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'news-naver mapping failed');
  }

  try {
    const embed = await runEmbedEvents({ onlyMissing: true, eventLimit: 'all' });
    log.info({ embed }, 'post-ingest embed-events done');
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'embed-events failed');
  }

  try {
    const audit = await auditMappingDistributionQuick();
    if (audit.staleBelowThreshold > 0) {
      log.warn({ audit }, 'post-ingest audit — below-threshold mappings present');
    } else {
      log.info({ audit }, 'post-ingest audit — distribution ok');
    }
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'audit failed');
  }

  // ADR 0004 D-5: 만료된 auth_sessions 정리. lazy 401 안전망이 보안은 보장하므로 실패해도
  // warn 만 — 다음 라운드에서 재시도.
  try {
    const sweep = await runSessionSweep();
    log.info({ sweep }, 'post-ingest session sweep done');
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'session sweep failed');
  }

  // G-5: user_taste_profiles 일일 집계 — 활성 user 의 top 1 dimension 갱신.
  // 추천 endpoint (/me/recommendations) 가 이 결과를 source 로 사용. 실패해도 추천은 빈
  // 결과로 graceful degrade.
  try {
    const taste = await runTasteAggregation();
    log.info({ taste }, 'post-ingest taste aggregation done');
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'taste aggregation failed');
  }
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
