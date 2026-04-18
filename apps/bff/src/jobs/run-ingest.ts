#!/usr/bin/env tsx
/**
 * CLI 진입점 — 전체 소스 배치 수동 실행.
 *
 * 사용: `pnpm --filter bff run ingest` 또는 루트에서
 *   `dotenv -e .env -- tsx apps/bff/src/jobs/run-ingest.ts`.
 *
 * 특정 소스만 실행하려면 인자로 지정:
 *   `... run-ingest.ts tourapi`        (기본은 all)
 *   `... run-ingest.ts seoul-culture`
 *   `... run-ingest.ts kcisa`
 */
import { runTourapiIngest } from './tourapi-ingest.js';
import { runSeoulCultureIngest } from './seoul-culture-ingest.js';
import { runKcisaIngest } from './kcisa-ingest.js';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';

const which = (process.argv[2] ?? 'all').toLowerCase();

async function main() {
  const results: Record<string, unknown> = {};
  if (which === 'tourapi' || which === 'all') results.tourapi = await runTourapiIngest();
  if (which === 'seoul-culture' || which === 'seoul' || which === 'all')
    results['seoul-culture'] = await runSeoulCultureIngest();
  if (which === 'kcisa' || which === 'all') results.kcisa = await runKcisaIngest();

  logger.info(results, 'manual ingest completed');
  await prisma.$disconnect();

  const anyError = Object.values(results).some((r) => typeof r === 'object' && r !== null && 'errors' in r && (r as { errors: number }).errors > 0);
  process.exit(anyError ? 1 : 0);
}

main().catch(async (err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'manual ingest crashed');
  await prisma.$disconnect().catch(() => {});
  process.exit(2);
});
