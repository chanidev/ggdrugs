import { createHash } from 'node:crypto';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';
import { callLlm } from '../llm-client.js';
import { runEmbedEvents } from './embed-events.js';

/**
 * events.ai_summary backfill — description 이 있고 ai_summary 가 없는 행을 대상으로
 * services/llm `/summarize` 호출 → DB update.
 *
 * 동시성 5, failure 시 해당 행 skip (다음 실행에서 재시도).
 * 재실행 시 이미 ai_summary 있는 행은 건너뛴다 (WHERE ai_summary IS NULL).
 *
 * description_hash 캐시: 성공 시 MD5(description) 을 함께 저장. description 이 변경되면
 * DB 트리거(fn_invalidate_ai_summary_on_description_change) 가 ai_summary / ai_summary_at /
 * description_hash 를 NULL 로 되돌리므로, 다음 backfill 에서 자동 재요약 대상이 된다.
 */

function descriptionMd5(desc: string | null): string | null {
  if (!desc) return null;
  return createHash('md5').update(desc, 'utf8').digest('hex');
}

interface SummarizeInput {
  title: string;
  description: string | null;
  categoryName: string | null;
  vibes: string[];
  regionName: string | null;
}

async function summarizeOne(input: SummarizeInput): Promise<string | null> {
  const data = await callLlm<{ summary?: string }>('/summarize', input);
  if (!data) return null;
  const s = (data.summary ?? '').trim();
  return s.length > 0 ? s : null;
}

interface BackfillOptions {
  /** true 면 description 있는 이벤트만. 기본은 false — description 없는 이벤트도 title+category 로 요약. */
  withDescriptionOnly?: boolean;
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

  const where = options.withDescriptionOnly
    ? {
        aiSummary: null,
        isDeleted: false,
        approvalStatus: 'approved' as const,
        description: { not: null },
      }
    : { aiSummary: null, isDeleted: false, approvalStatus: 'approved' as const };

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
  log.info({ total: rows.length, withDescriptionOnly: !!options.withDescriptionOnly }, 'start');

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
            data: {
              aiSummary: summary,
              aiSummaryAt: new Date(),
              descriptionHash: descriptionMd5(r.description),
            },
          });
          updated++;
          // aiSummary 가 embed 텍스트의 핵심이므로 갱신됐으면 Qdrant 에 재임베딩.
          // 같은 워커 안에서 await — 동시성이 summarize 와 동일 pool(5) 로 bound 된다.
          // 실패는 삼킨다 (주기 embed:events:missing 배치가 커버).
          try {
            await runEmbedEvents({ onlyEventId: r.eventId });
          } catch {
            // no-op
          }
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

// CLI: `pnpm backfill:summary [--with-description-only] [--limit N]`
// 기본은 description 유무와 무관하게 approved & aiSummary IS NULL 인 이벤트 전체.
// Windows 와 POSIX 양쪽 import.meta.url 매칭을 피하려 argv 기반 단순 체크.
const isCliRun =
  process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('summarize-events.ts');
if (isCliRun) {
  const args = process.argv.slice(2);
  const withDescOnly = args.includes('--with-description-only');
  const limitArg = args.indexOf('--limit');
  const opts: BackfillOptions = { withDescriptionOnly: withDescOnly };
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
