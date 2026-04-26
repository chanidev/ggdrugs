/**
 * chat:rank-bench — hybrid combiner A/B 평가 harness.
 *
 * 목적:
 *   v3.3 의 `max(vec, kw)` combiner 대비 weighted/single-source 가 LLM-judge 관점에서
 *   유의미한 개선을 주는지 측정. semantic-search.md OQ 의 v4 후보 "Hybrid score tuning".
 *
 * 사용:
 *   pnpm -F bff bench:chat-rank                 # 전체 (3 repeat × 6 config × 12 query)
 *   pnpm -F bff bench:chat-rank --repeat 1      # 빠른 smoke
 *   pnpm -F bff bench:chat-rank --query proper-noun-illust  # 단일 query
 *   pnpm -F bff bench:chat-rank --verbose       # 상세 로그
 *
 * 사전조건: LLM(8000) + Postgres(5433) + Qdrant(6333) 기동. OPENAI_API_KEY 활성.
 *
 * 출력:
 *   - stdout: per-config 요약 표 + verdict
 *   - file:   llm_wiki/wiki/audit/chat-rank-bench-YYYY-MM-DD.md
 *
 * 비용: 1회 = 6 config × 12 query × 1 judge call ≈ 72 호출 ≈ ~$0.05.
 *       repeat=3 → ~$0.15 (rerank 호출은 hit fetch 후 config 별로 동일하게 호출되므로 별도).
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  combineHits,
  fetchKeywordHits,
  fetchVectorHits,
  resolveAndRank,
  type ChatSuggestion,
  type CombinerMode,
  type HybridHit,
  type SemanticOpts,
} from '../routes/chat.js';
import { env } from '../env.js';
import { prisma } from '../prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const QUERIES_PATH = join(__dirname, 'chat-rank-bench-queries.json');

interface BenchQuery {
  id: string;
  category: string;
  userTexts: string[];
  filters: SemanticOpts['filters'];
  specificDate: string | null;
}

interface QueriesFile {
  version: number;
  note: string;
  queries: BenchQuery[];
}

interface ConfigSpec {
  id: string;
  mode: CombinerMode;
}

const CONFIGS: ConfigSpec[] = [
  { id: 'max', mode: { kind: 'max' } },
  { id: 'w0.5-0.5', mode: { kind: 'weighted', alpha: 0.5, beta: 0.5 } },
  { id: 'w0.7-0.3', mode: { kind: 'weighted', alpha: 0.7, beta: 0.3 } },
  { id: 'w0.3-0.7', mode: { kind: 'weighted', alpha: 0.3, beta: 0.7 } },
  { id: 'vec', mode: { kind: 'vec' } },
  { id: 'kw', mode: { kind: 'kw' } },
];

interface JudgeScoreItem {
  eventId: string;
  score: number;
  reason: string;
}

async function callJudge(query: string, suggestions: ChatSuggestion[]): Promise<JudgeScoreItem[]> {
  if (suggestions.length === 0) return [];
  const candidates = suggestions.map((s) => ({
    eventId: s.eventId,
    title: s.title,
    category: s.category.name,
    region: s.region.sigunguName ?? s.region.sidoName,
    startDate: s.startDate,
    endDate: s.endDate,
    matchReason: s.matchReason ?? '',
  }));
  // 위치 편향 차단을 위해 셔플.
  const shuffled = candidates
    .map((c) => ({ c, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.c);
  const r = await fetch(`${env.LLM_SERVICE_URL}/judge/relevance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ query, candidates: shuffled }),
  });
  if (!r.ok) throw new Error(`judge ${r.status}`);
  const j = (await r.json()) as { scores?: JudgeScoreItem[] };
  return j.scores ?? [];
}

interface ConfigRunResult {
  configId: string;
  topIds: string[];           // top-5 (rerank 후) eventIds
  poolIds: string[];          // top-12 rerank pool ids (resolveAndRank 가 sort 한 후 상위 12)
  judgeScores: Map<string, number>;  // eventId → 0-3
  judgeReasons: Map<string, string>;
  dcg: number;                // Σ rel_i / log2(rank_i+1) over final top-5
  latencyMs: number;
}

interface QueryRunResult {
  queryId: string;
  vecHitCount: number;
  kwHitCount: number;
  configs: ConfigRunResult[];
}

async function runQueryAcrossConfigs(
  q: BenchQuery,
  vec: HybridHit[],
  kw: HybridHit[],
  rerankQuery: string,
  opts: SemanticOpts,
  verbose: boolean,
): Promise<ConfigRunResult[]> {
  const out: ConfigRunResult[] = [];
  for (const cfg of CONFIGS) {
    const t0 = Date.now();
    let suggestions: ChatSuggestion[] = [];
    try {
      suggestions = await resolveAndRank({
        vectorHits: vec,
        keywordHits: kw,
        opts: { ...opts, combiner: cfg.mode },
        rerankQuery,
      });
    } catch (err) {
      if (verbose) console.error(`[${q.id}/${cfg.id}] resolveAndRank failed`, err);
    }
    // pool ids = top-12 by score (resolveAndRank 내부에서 score-desc sort 후 rerank 풀로 12 사용)
    // 외부 노출은 final top-5 만이지만, score-desc 기준 top-12 를 reconstruct 하기 어려우므로
    // 여기선 final top-5 ids 만 추적 — pool overlap 은 final overlap 으로 대체.
    const topIds = suggestions.slice(0, 5).map((s) => s.eventId);
    const poolIds = suggestions.map((s) => s.eventId); // rerank 후 ≤5

    let judgeScores = new Map<string, number>();
    let judgeReasons = new Map<string, string>();
    if (suggestions.length > 0) {
      try {
        const scored = await callJudge(rerankQuery, suggestions);
        judgeScores = new Map(scored.map((s) => [s.eventId, s.score]));
        judgeReasons = new Map(scored.map((s) => [s.eventId, s.reason]));
      } catch (err) {
        if (verbose) console.error(`[${q.id}/${cfg.id}] judge failed`, err);
      }
    }

    // DCG over final top-5 (rank 1..5).
    let dcg = 0;
    for (let i = 0; i < topIds.length; i++) {
      const rel = judgeScores.get(topIds[i]!) ?? 0;
      dcg += rel / Math.log2(i + 2); // log2(rank+1), rank=i+1
    }

    const latencyMs = Date.now() - t0;
    out.push({ configId: cfg.id, topIds, poolIds, judgeScores, judgeReasons, dcg, latencyMs });

    if (verbose) {
      console.log(
        `  [${cfg.id.padEnd(9)}] DCG=${dcg.toFixed(2)} top=${topIds.length} latency=${latencyMs}ms`,
      );
    }
  }
  return out;
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const uni = sa.size + sb.size - inter;
  return uni === 0 ? 1 : inter / uni;
}

interface ConfigAggregate {
  configId: string;
  avgDcg: number;
  totalDcg: number;
  avgPoolSize: number;
  jaccardTop5VsMax: number;
  avgLatencyMs: number;
  zeroResultQueries: number;
}

function aggregate(runs: QueryRunResult[][]): ConfigAggregate[] {
  // runs[repeat][query].configs[config]
  const out: ConfigAggregate[] = [];
  for (const cfg of CONFIGS) {
    const dcgs: number[] = [];
    const poolSizes: number[] = [];
    const jacs: number[] = [];
    const latencies: number[] = [];
    let zeroCount = 0;
    for (const repeatRuns of runs) {
      for (const qr of repeatRuns) {
        const c = qr.configs.find((x) => x.configId === cfg.id);
        const baseline = qr.configs.find((x) => x.configId === 'max');
        if (!c || !baseline) continue;
        dcgs.push(c.dcg);
        poolSizes.push(c.poolIds.length);
        jacs.push(jaccard(c.topIds, baseline.topIds));
        latencies.push(c.latencyMs);
        if (c.topIds.length === 0) zeroCount++;
      }
    }
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const avg = (xs: number[]) => (xs.length === 0 ? 0 : sum(xs) / xs.length);
    out.push({
      configId: cfg.id,
      avgDcg: avg(dcgs),
      totalDcg: sum(dcgs),
      avgPoolSize: avg(poolSizes),
      jaccardTop5VsMax: avg(jacs),
      avgLatencyMs: avg(latencies),
      zeroResultQueries: zeroCount,
    });
  }
  return out;
}

interface Verdict {
  winner: string;          // configId or 'max'
  reason: string;
  promoteRecommended: boolean;
}

function decide(agg: ConfigAggregate[]): Verdict {
  const max = agg.find((a) => a.configId === 'max');
  if (!max) return { winner: 'max', reason: 'no baseline', promoteRecommended: false };
  let bestNonMax: ConfigAggregate | null = null;
  for (const a of agg) {
    if (a.configId === 'max') continue;
    if (!bestNonMax || a.avgDcg > bestNonMax.avgDcg) bestNonMax = a;
  }
  if (!bestNonMax) return { winner: 'max', reason: 'no candidates', promoteRecommended: false };

  const dcgImprovement = (bestNonMax.avgDcg - max.avgDcg) / Math.max(max.avgDcg, 0.001);
  const passDcg = dcgImprovement >= 0.05;
  const passOverlap = bestNonMax.jaccardTop5VsMax >= 0.85;

  const fmtPct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
  if (passDcg && passOverlap) {
    return {
      winner: bestNonMax.configId,
      reason: `DCG ${fmtPct(dcgImprovement)} vs max, top5 jaccard ${bestNonMax.jaccardTop5VsMax.toFixed(2)}`,
      promoteRecommended: true,
    };
  }
  if (passDcg && !passOverlap) {
    return {
      winner: bestNonMax.configId,
      reason: `DCG ${fmtPct(dcgImprovement)} but top5 jaccard ${bestNonMax.jaccardTop5VsMax.toFixed(2)} < 0.85 — borderline, human review`,
      promoteRecommended: false,
    };
  }
  return {
    winner: 'max',
    reason: `best alt (${bestNonMax.configId}) DCG ${fmtPct(dcgImprovement)} — under 5% threshold`,
    promoteRecommended: false,
  };
}

function fmtTable(rows: Array<Record<string, string>>, cols: string[]): string {
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => (r[c] ?? '').length)));
  const sep = '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|';
  const head = '| ' + cols.map((c, i) => c.padEnd(widths[i]!)).join(' | ') + ' |';
  const body = rows
    .map((r) => '| ' + cols.map((c, i) => (r[c] ?? '').padEnd(widths[i]!)).join(' | ') + ' |')
    .join('\n');
  return `${head}\n${sep}\n${body}`;
}

interface Args {
  repeat: number;
  query?: string;
  verbose: boolean;
  outDir?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { repeat: 3, verbose: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repeat') out.repeat = Number(argv[++i] ?? '3');
    else if (a === '--query') {
      const v = argv[++i];
      if (v) out.query = v;
    } else if (a === '--verbose') out.verbose = true;
    else if (a === '--out-dir') {
      const v = argv[++i];
      if (v) out.outDir = v;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const file = JSON.parse(readFileSync(QUERIES_PATH, 'utf-8')) as QueriesFile;
  const queries = args.query ? file.queries.filter((q) => q.id === args.query) : file.queries;
  if (queries.length === 0) {
    console.error(`no queries match --query ${args.query ?? '(all)'}`);
    process.exit(1);
  }

  console.log(`chat-rank-bench — ${queries.length} query × ${CONFIGS.length} config × ${args.repeat} repeat`);
  console.log(`base: ${env.LLM_SERVICE_URL}`);
  console.log('─'.repeat(72));

  const t0all = Date.now();
  const allRuns: QueryRunResult[][] = [];

  for (let rep = 1; rep <= args.repeat; rep++) {
    console.log(`\n=== repeat ${rep}/${args.repeat} ===`);
    const repeatRuns: QueryRunResult[] = [];
    for (const q of queries) {
      console.log(`[${q.id}]`);
      // hit fetch — config 간 공유.
      const rerankQuery = q.userTexts.slice(-3).join('\n').slice(0, 500);
      const lastUser = q.userTexts[q.userTexts.length - 1] ?? '';
      const filter: Record<string, unknown> = {};
      if (q.filters.eventTypes?.length) filter.categoryCode = q.filters.eventTypes;
      const opts: SemanticOpts = {
        userTexts: q.userTexts,
        filters: q.filters,
        specificDate: q.specificDate,
        regionIds: [],
      };
      let vec: HybridHit[] = [];
      let kw: HybridHit[] = [];
      try {
        [vec, kw] = await Promise.all([
          fetchVectorHits(rerankQuery, filter),
          fetchKeywordHits(lastUser.slice(0, 120)),
        ]);
      } catch (err) {
        console.error(`[${q.id}] hit fetch failed`, err);
      }
      console.log(`  vecHits=${vec.length} kwHits=${kw.length}`);

      const configs = await runQueryAcrossConfigs(q, vec, kw, rerankQuery, opts, args.verbose);
      repeatRuns.push({ queryId: q.id, vecHitCount: vec.length, kwHitCount: kw.length, configs });
    }
    allRuns.push(repeatRuns);
  }

  const totalSec = Math.round((Date.now() - t0all) / 1000);
  console.log(`\n[bench] total ${totalSec}s\n`);

  const agg = aggregate(allRuns);
  const verdict = decide(agg);

  // ----- Markdown report -----
  const today = new Date().toISOString().slice(0, 10);
  const summaryRows = agg.map((a) => ({
    config: a.configId,
    avg_dcg: a.avgDcg.toFixed(3),
    total_dcg: a.totalDcg.toFixed(2),
    avg_pool: a.avgPoolSize.toFixed(2),
    jac_top5_vs_max: a.jaccardTop5VsMax.toFixed(3),
    avg_latency_ms: a.avgLatencyMs.toFixed(0),
    zero_results: String(a.zeroResultQueries),
  }));

  const perQueryLines: string[] = [];
  for (let rep = 0; rep < allRuns.length; rep++) {
    perQueryLines.push(`\n#### Repeat ${rep + 1}/${allRuns.length}\n`);
    for (const qr of allRuns[rep] ?? []) {
      perQueryLines.push(`**${qr.queryId}** (vec=${qr.vecHitCount}, kw=${qr.kwHitCount})`);
      for (const c of qr.configs) {
        const ids = c.topIds.length === 0 ? '(empty)' : c.topIds.join(', ');
        perQueryLines.push(`  - ${c.configId.padEnd(9)} dcg=${c.dcg.toFixed(2)} top=[${ids}]`);
      }
    }
  }

  const md = [
    `# chat-rank-bench — ${today}`,
    '',
    `**Repeat**: ${args.repeat} · **Queries**: ${queries.length} · **Configs**: ${CONFIGS.length} · **Total**: ${totalSec}s`,
    '',
    '## Verdict',
    '',
    `- **Winner**: \`${verdict.winner}\``,
    `- **Promote**: ${verdict.promoteRecommended ? '✅ YES' : '❌ NO'}`,
    `- **Reason**: ${verdict.reason}`,
    '',
    '## Summary by config',
    '',
    fmtTable(summaryRows, ['config', 'avg_dcg', 'total_dcg', 'avg_pool', 'jac_top5_vs_max', 'avg_latency_ms', 'zero_results']),
    '',
    '## Per-query × config (raw)',
    perQueryLines.join('\n'),
    '',
    '## Method',
    '',
    '- **Hit fetch**: query 당 1회 (vector via Qdrant `/events/search` 0.25 threshold, keyword via pg_trgm `<<%` 0.30 threshold). 6 config 가 동일 hit pool 재사용.',
    '- **Combiner**: `combineHits()` (chat.ts) — `max | weighted(α,β) | vec | kw`.',
    '- **Resolve + rerank**: `resolveAndRank()` — Prisma phase/period filter + LLM `/events/rerank` (≥6 candidates and query ≥8 chars).',
    '- **Judge**: LLM `/judge/relevance` — gpt-4o-mini graded 0~3 with shuffled candidate order to remove position bias.',
    '- **DCG**: Σ rel_i / log₂(rank_i + 1) over final top-5.',
    '- **Decision rule**: promote iff `avg_dcg[best] ≥ avg_dcg[max] × 1.05` AND `jac_top5_vs_max[best] ≥ 0.85`.',
    '',
  ].join('\n');

  const outDir = args.outDir ?? join(__dirname, '..', '..', '..', '..', 'llm_wiki', 'wiki', 'audit');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `chat-rank-bench-${today}.md`);
  writeFileSync(outPath, md, 'utf-8');

  // ----- stdout summary -----
  console.log('Summary:');
  console.log(fmtTable(summaryRows, ['config', 'avg_dcg', 'total_dcg', 'jac_top5_vs_max', 'avg_latency_ms', 'zero_results']));
  console.log('');
  console.log(`Verdict: winner=${verdict.winner} promote=${verdict.promoteRecommended ? 'YES' : 'NO'}`);
  console.log(`Reason: ${verdict.reason}`);
  console.log(`\nReport written: ${outPath}`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('chat-rank-bench fatal:', err);
  process.exit(1);
});
