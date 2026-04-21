import { prisma } from '../prisma.js';

/**
 * eval:summary — AI 요약 spot-check 용 랜덤 샘플러.
 *
 * 사용:
 *   pnpm eval:summary --n 20 [--with-description-only]
 *
 * 출력:
 *   각 샘플마다 event_id, title, region, category, description(발췌), ai_summary,
 *   생성 시점(ai_summary_at), description_hash 여부 표시.
 *
 * 목적:
 *   - 사람이 직접 읽어서 "사실 지어냄 / 이모지 / 과장" 여부를 찾는다.
 *   - 프롬프트 튜닝 전후 비교.
 */

interface Options {
  n: number;
  withDescriptionOnly: boolean;
}

function parseArgs(argv: string[]): Options {
  const args = argv.slice(2);
  let n = 10;
  const nIdx = args.indexOf('--n');
  if (nIdx >= 0) {
    const v = Number(args[nIdx + 1]);
    if (Number.isFinite(v) && v > 0) n = Math.min(100, Math.floor(v));
  }
  return {
    n,
    withDescriptionOnly: args.includes('--with-description-only'),
  };
}

function excerpt(s: string | null, max = 200): string {
  if (!s) return '(없음)';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  const where: Record<string, unknown> = {
    approvalStatus: 'approved',
    isDeleted: false,
    aiSummary: { not: null },
  };
  if (opts.withDescriptionOnly) where.description = { not: null };

  // 전체 개수 → OFFSET 랜덤 뽑기 (Postgres RANDOM() ORDER BY 보다 Prisma-friendly).
  const total = await prisma.event.count({ where });
  if (total === 0) {
    console.log('[eval:summary] ai_summary 가 채워진 이벤트가 없음. 먼저 backfill 실행 필요.');
    return;
  }

  const picks = Math.min(opts.n, total);
  const seen = new Set<number>();
  while (seen.size < picks) seen.add(Math.floor(Math.random() * total));
  const offsets = [...seen].sort((a, b) => a - b);

  console.log(`\n[eval:summary] total=${total}, sampling=${picks}\n`);
  let i = 0;
  for (const offset of offsets) {
    const [row] = await prisma.event.findMany({
      where,
      skip: offset,
      take: 1,
      select: {
        eventId: true,
        title: true,
        description: true,
        aiSummary: true,
        aiSummaryAt: true,
        descriptionHash: true,
        category: { select: { displayName: true } },
        region: { select: { sidoName: true, sigunguName: true } },
      },
      orderBy: { eventId: 'asc' },
    });
    if (!row) continue;

    const region = row.region.sigunguName
      ? `${row.region.sidoName} ${row.region.sigunguName}`
      : row.region.sidoName;

    const line = '─'.repeat(80);
    console.log(line);
    console.log(`#${++i} event_id=${row.eventId.toString()}  ${region}  ${row.category.displayName}`);
    console.log(`title       : ${row.title}`);
    console.log(`description : ${excerpt(row.description, 200)}`);
    console.log(`ai_summary  : ${row.aiSummary ?? '(없음)'}`);
    const at = row.aiSummaryAt ? row.aiSummaryAt.toISOString().slice(0, 19) : '(없음)';
    const hashMark = row.descriptionHash ? `hash=${row.descriptionHash.slice(0, 8)}…` : 'hash=null';
    console.log(`meta        : at=${at}  ${hashMark}`);
  }
  console.log('─'.repeat(80));
  console.log(`\n[eval:summary] done — ${i}/${picks} 샘플 표시.\n`);
}

const isCliRun =
  process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('eval-summaries.ts');
if (isCliRun) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[eval:summary] fatal', err);
      process.exit(1);
    });
}
