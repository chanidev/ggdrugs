#!/usr/bin/env tsx
/**
 * CLI 진입점 — 전체 소스 배치 수동 실행.
 *
 * 사용: `pnpm --filter bff run ingest` 또는 루트에서
 *   `dotenv -e .env -- tsx apps/bff/src/jobs/run-ingest.ts`.
 *
 * 특정 소스만 실행하려면 인자로 지정:
 *   `... run-ingest.ts tourapi`              (기본은 all, forward-only)
 *   `... run-ingest.ts tourapi 20240101`     (TourAPI 전용 backfill — 해당 날짜 이후 전체)
 *   `... run-ingest.ts seoul-culture`
 *   `... run-ingest.ts kcisa`
 *   `... run-ingest.ts news-naver`           (approved 이벤트 → 네이버 뉴스 검색 매핑)
 *
 * 주기적 배치는 forward-only (오늘 이후) — 이미 종료된 이벤트는 skip.
 * 초기 backfill 은 TourAPI 에 YYYYMMDD 전달로 재수행 가능.
 */
import { runTourapiIngest } from './tourapi-ingest.js';
import { runSeoulCultureIngest } from './seoul-culture-ingest.js';
import { runKcisaIngest } from './kcisa-ingest.js';
import { runNewsNaverIngest } from './news-naver-ingest.js';
import { runEmbedEvents } from './embed-events.js';
import { runBackfillSummaries } from './summarize-events.js';
import { auditMappingDistributionQuick } from './audit-news-mappings.js';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';

const which = (process.argv[2] ?? 'all').toLowerCase();
const tourapiFloor = process.argv[3]; // YYYYMMDD optional (tourapi 전용)
// `--backfill` 이 아무 위치에 있으면 seoul-culture 를 전체(종료 포함) 재분류 모드로.
const seoulBackfill = process.argv.slice(2).includes('--backfill');
// `--no-summarize` 로 ingest 후 AI 요약 단계를 스킵할 수 있음 (배치 시간 단축 / 비용 회피).
const skipSummarize = process.argv.slice(2).includes('--no-summarize');

async function main() {
  const results: Record<string, unknown> = {};
  if (which === 'tourapi' || which === 'all') {
    results.tourapi = await runTourapiIngest(tourapiFloor);
  }
  if (which === 'seoul-culture' || which === 'seoul' || which === 'all')
    results['seoul-culture'] = await runSeoulCultureIngest({ includePast: seoulBackfill });
  if (which === 'kcisa' || which === 'all') results.kcisa = await runKcisaIngest();
  // news-naver 는 이벤트 ingest 와 독립. 'all' 에 기본 포함하지 않음 — 이벤트 테이블이
  // 비어있는 dev 첫 기동에서 불필요한 네이버 호출을 피하기 위함. 명시 호출만.
  //   news-naver              — 최신 50 이벤트
  //   news-naver --all        — approved 이벤트 전체 (초기 backfill)
  //   news-naver --missing    — mapping 0건인 이벤트만 (incremental)
  if (which === 'news-naver' || which === 'news') {
    const args = process.argv.slice(2);
    const opts: { eventLimit?: number | 'all'; onlyMissing?: boolean } = {};
    if (args.includes('--all')) opts.eventLimit = 'all';
    if (args.includes('--missing')) opts.onlyMissing = true;
    results['news-naver'] = await runNewsNaverIngest(opts);

    // 후속 품질 감사: 분포 + 스테일(threshold 이하) 집계. 0 이 아니면 warn —
    // threshold 변경 과도기에 남아있거나, 저장 로직 버그로 기준치 이하가 새로 들어온
    // 경우 즉시 감지.
    try {
      const audit = await auditMappingDistributionQuick();
      if (audit.staleBelowThreshold > 0) {
        logger.warn({ audit }, 'post-news-ingest audit — below-threshold mappings present');
      } else {
        logger.info({ audit }, 'post-news-ingest audit — distribution ok');
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'post-news-ingest audit failed — ingest 자체는 성공',
      );
    }
  }
  if (which === 'embed-events' || which === 'embed') {
    const args = process.argv.slice(2);
    const opts: { eventLimit?: number | 'all'; onlyMissing?: boolean } = {};
    if (args.includes('--all')) opts.eventLimit = 'all';
    if (args.includes('--missing')) opts.onlyMissing = true;
    results['embed-events'] = await runEmbedEvents(opts);
  }

  logger.info(results, 'manual ingest completed');

  // Ingest 후속: aiSummary 가 비어 있는 행 (= 새 인서트 + description 변경으로 트리거가
  // 캐시를 비운 행) 을 자동 요약. services/llm 의 일일 예산 가드가 비용 상한 역할.
  // --no-summarize 로 비활성화 가능.
  if (!skipSummarize) {
    try {
      const summary = await runBackfillSummaries({});
      logger.info({ summary }, 'post-ingest ai-summary backfill done');
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'post-ingest ai-summary backfill failed — 그래프 ingest 자체는 성공',
      );
    }
  }

  await prisma.$disconnect();

  const anyError = Object.values(results).some((r) => typeof r === 'object' && r !== null && 'errors' in r && (r as { errors: number }).errors > 0);
  process.exit(anyError ? 1 : 0);
}

main().catch(async (err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'manual ingest crashed');
  await prisma.$disconnect().catch(() => {});
  process.exit(2);
});
