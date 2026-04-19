import { prisma } from '../prisma.js';
import { env } from '../env.js';
import { logger } from '../logger.js';

/**
 * events.ai_summary backfill — description 이 있고 ai_summary 가 없는 행을 대상으로
 * services/llm `/summarize` 호출 → DB update.
 *
 * 동시성 5, failure 시 해당 행 skip (다음 실행에서 재시도).
 * 재실행 시 이미 ai_summary 있는 행은 건너뛴다 (WHERE ai_summary IS NULL).
 */

interface SummarizeInput {
  title: string;
  description: string | null;
  categoryName: string | null;
  vibes: string[];
  regionName: string | null;
}

async function summarizeOne(input: SummarizeInput): Promise<string | null> {
  const res = await fetch(`${env.LLM_SERVICE_URL}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { summary?: string };
  const s = (data.summary ?? '').trim();
  return s.length > 0 ? s : null;
}

interface BackfillOptions {
  /** description 없어도 title + category fallback 으로 요약할지. 기본 false (설명 있는 것만). */
  includeNoDescription?: boolean;
  /** 처리할 최대 건수. 비용 상한. */
  limit?: number;
  /** 병렬도. OpenAI tier 1 기준 5 안전. */
  concurrency?: number;
}

export async function runBackfillSummaries(options: BackfillOptions = {}): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  const log = logger.child({ job: 'backfill-ai-summary' });
  const concurrency = options.concurrency ?? 5;
  const limit = options.limit ?? 10_000;

  const where = options.includeNoDescription
    ? { aiSummary: null, isDeleted: false, approvalStatus: 'approved' as const }
    : {
        aiSummary: null,
        isDeleted: false,
        approvalStatus: 'approved' as const,
        description: { not: null },
      };

  const rows = await prisma.event.findMany({
    where,
    take: limit,
    select: {
      eventId: true,
      title: true,
      description: true,
      category: { select: { displayName: true } },
      region: { select: { sidoName: true, sigunguName: true } },
      vibeAssignments: { select: { vibe: { select: { vibeName: true } } } },
    },
  });
  log.info({ total: rows.length, includeNoDescription: !!options.includeNoDescription }, 'start');

  let processed = 0;
  let updated = 0;
  let errors = 0;

  // 간단한 pool: concurrency 만큼 병렬 worker.
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const idx = cursor++;
      if (idx >= rows.length) return;
      const r = rows[idx]!;
      processed++;
      try {
        const regionName = r.region.sigunguName
          ? `${r.region.sidoName} ${r.region.sigunguName}`
          : r.region.sidoName;
        const summary = await summarizeOne({
          title: r.title,
          description: r.description,
          categoryName: r.category.displayName,
          vibes: r.vibeAssignments.map((va) => va.vibe.vibeName),
          regionName,
        });
        if (summary) {
          await prisma.event.update({
            where: { eventId: r.eventId },
            data: { aiSummary: summary, aiSummaryAt: new Date() },
          });
          updated++;
        } else {
          errors++;
        }
      } catch (err) {
        errors++;
        log.error({ err, eventId: r.eventId.toString() }, 'summarize failed');
      }
      if (processed % 50 === 0) {
        log.info({ processed, updated, errors, total: rows.length }, 'progress');
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  log.info({ processed, updated, errors }, 'done');
  return { processed, updated, errors };
}

// CLI: `pnpm backfill:summary [--include-no-description] [--limit N]`
// Windows 와 POSIX 양쪽 import.meta.url 매칭을 피하려 argv 기반 단순 체크.
const isCliRun =
  process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('summarize-events.ts');
if (isCliRun) {
  const args = process.argv.slice(2);
  const include = args.includes('--include-no-description');
  const limitArg = args.indexOf('--limit');
  const opts: BackfillOptions = { includeNoDescription: include };
  if (limitArg >= 0) {
    const n = Number(args[limitArg + 1]);
    if (Number.isFinite(n)) opts.limit = n;
  }
  runBackfillSummaries(opts)
    .then((r) => {
      console.log('[backfill-ai-summary]', r);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[backfill-ai-summary] fatal', err);
      process.exit(1);
    });
}
