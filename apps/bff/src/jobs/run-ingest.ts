#!/usr/bin/env tsx
/**
 * CLI 진입점 — 배치 수동 실행.
 *
 * 사용: `pnpm --filter bff exec tsx src/jobs/run-ingest.ts`
 *       또는 루트에서 `node --import tsx apps/bff/src/jobs/run-ingest.ts`.
 */
import { runTourapiIngest } from './tourapi-ingest.js';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';

async function main() {
  const result = await runTourapiIngest();
  logger.info(result, 'manual ingest completed');
  await prisma.$disconnect();
  // upsert 실패가 있었다면 비정상 종료 코드 (CI/수동 점검용)
  process.exit(result.errors > 0 ? 1 : 0);
}

main().catch(async (err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'manual ingest crashed');
  await prisma.$disconnect().catch(() => {});
  process.exit(2);
});
