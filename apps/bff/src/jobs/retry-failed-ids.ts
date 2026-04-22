// One-off: news-naver 429 재시도 — /tmp/failed_event_ids.txt 내 eventId 목록만 처리.
// concurrency=1 로 순차. 완료 시 남은 매핑 0 건인 event 를 보고.
import { readFileSync } from 'node:fs';
import { runNewsNaverIngest } from './news-naver-ingest.js';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';

async function main() {
  const path = process.argv[2] ?? '/tmp/failed_event_ids.txt';
  const ids = readFileSync(path, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map((s) => BigInt(s));

  logger.info({ count: ids.length, path }, 'retry-failed-ids start');

  let processed = 0;
  let articlesUpserted = 0;
  let mappingsUpserted = 0;
  let skipped = 0;
  let errors = 0;
  const lastReport = { t: Date.now() };

  for (const id of ids) {
    const r = await runNewsNaverIngest({ onlyEventId: id });
    processed += 1;
    articlesUpserted += r.articlesUpserted;
    mappingsUpserted += r.mappingsUpserted;
    skipped += r.skipped;
    errors += r.errors;
    if (Date.now() - lastReport.t > 30_000) {
      lastReport.t = Date.now();
      logger.info(
        { processed, total: ids.length, articlesUpserted, mappingsUpserted, skipped, errors },
        'progress',
      );
    }
  }

  logger.info(
    { processed, total: ids.length, articlesUpserted, mappingsUpserted, skipped, errors },
    'done',
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
