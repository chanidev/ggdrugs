// Event↔기사 매핑 품질 감사 — 분포 통계 + 랜덤 샘플 마크다운 리포트.
// `pnpm --filter bff audit:news-mappings [--samples N] [--bands 0.55,0.60,0.65,0.70,0.80]`
// 기본: 구간별 샘플 6건, 분포 표, drift 지표 (같은 기관 여부, 제목 overlap 길이).
// 출력 stdout 마크다운. 파이프로 파일 저장 가능.
import { prisma } from '../prisma.js';

interface Args {
  samplesPerBand: number;
  bandEdges: number[];
}

function parseArgs(argv: string[]): Args {
  const out: Args = { samplesPerBand: 6, bandEdges: [0.55, 0.6, 0.65, 0.7, 0.8, 0.9, 1.0] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--samples' && argv[i + 1]) {
      const n = Number.parseInt(argv[++i] ?? '', 10);
      if (Number.isFinite(n) && n > 0) out.samplesPerBand = Math.min(n, 50);
    } else if (a === '--bands' && argv[i + 1]) {
      const parts = (argv[++i] ?? '')
        .split(',')
        .map((s) => Number.parseFloat(s.trim()))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 1);
      if (parts.length >= 2) out.bandEdges = parts.sort((a, b) => a - b);
    }
  }
  return out;
}

function bandLabel(lo: number, hi: number): string {
  return `${lo.toFixed(2)}-${hi.toFixed(2)}`;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[\[\]()·,.:;!?'"“”‘’…—–\-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

function titleOverlap(eventTitle: string, articleTitle: string): number {
  const a = tokenize(eventTitle);
  const b = tokenize(articleTitle);
  if (a.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit += 1;
  return hit;
}

interface Distribution {
  band: string;
  lo: number;
  hi: number;
  count: number;
  pctOfTotal: number;
  distinctEvents: number;
}

interface Sample {
  band: string;
  score: number;
  eventId: string;
  eventTitle: string;
  articleTitle: string;
  sourceName: string;
  publishedAt: string | null;
  sharedTokens: number;
}

async function gatherDistribution(edges: number[]): Promise<Distribution[]> {
  const total = await prisma.eventArticleMapping.count();
  const rows: Distribution[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i]!;
    const hi = edges[i + 1]!;
    const [count, distinct] = await Promise.all([
      prisma.eventArticleMapping.count({
        where: {
          relevanceScore: { gte: lo, lt: i === edges.length - 2 ? hi + 0.001 : hi },
        },
      }),
      prisma.eventArticleMapping
        .findMany({
          where: {
            relevanceScore: { gte: lo, lt: i === edges.length - 2 ? hi + 0.001 : hi },
          },
          select: { eventId: true },
          distinct: ['eventId'],
        })
        .then((r) => r.length),
    ]);
    rows.push({
      band: bandLabel(lo, hi),
      lo,
      hi,
      count,
      pctOfTotal: total > 0 ? (count / total) * 100 : 0,
      distinctEvents: distinct,
    });
  }
  return rows;
}

async function gatherSamples(edges: number[], samplesPerBand: number): Promise<Sample[]> {
  const out: Sample[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i]!;
    const hi = edges[i + 1]!;
    // Prisma 는 random order 네이티브 지원 안 됨 — raw query 로 구간 내 난수 샘플.
    const rows = await prisma.$queryRawUnsafe<
      {
        relevance_score: string;
        event_id: bigint;
        event_title: string;
        article_title: string;
        source_name: string;
        published_at: Date | null;
      }[]
    >(
      `
      SELECT
        m.relevance_score::text AS relevance_score,
        m.event_id,
        e.title AS event_title,
        a.title AS article_title,
        a.source_name,
        a.published_at
      FROM event_article_mappings m
      JOIN events e ON e.event_id = m.event_id
      JOIN news_articles a ON a.article_id = m.article_id
      WHERE m.relevance_score >= $1 AND m.relevance_score < $2
      ORDER BY random()
      LIMIT $3
    `,
      lo,
      i === edges.length - 2 ? hi + 0.001 : hi,
      samplesPerBand,
    );
    for (const r of rows) {
      out.push({
        band: bandLabel(lo, hi),
        score: Number.parseFloat(r.relevance_score),
        eventId: r.event_id.toString(),
        eventTitle: r.event_title,
        articleTitle: r.article_title,
        sourceName: r.source_name,
        publishedAt: r.published_at?.toISOString().slice(0, 10) ?? null,
        sharedTokens: titleOverlap(r.event_title, r.article_title),
      });
    }
  }
  return out;
}

function renderMarkdown(dist: Distribution[], samples: Sample[], totalMappings: number): string {
  const lines: string[] = [];
  lines.push(`# Event-Article Mapping Audit`);
  lines.push('');
  lines.push(`생성: ${new Date().toISOString()}`);
  lines.push(`총 mapping 행: **${totalMappings}**`);
  lines.push('');

  lines.push('## 점수 분포');
  lines.push('');
  lines.push('| 구간 | count | % | distinct events |');
  lines.push('|---|---:|---:|---:|');
  for (const d of dist) {
    lines.push(
      `| ${d.band} | ${d.count} | ${d.pctOfTotal.toFixed(1)}% | ${d.distinctEvents} |`,
    );
  }
  lines.push('');

  // 밴드별 평균 token overlap — 드리프트 지표.
  const byBand = new Map<string, Sample[]>();
  for (const s of samples) {
    const arr = byBand.get(s.band) ?? [];
    arr.push(s);
    byBand.set(s.band, arr);
  }
  lines.push('## 드리프트 지표 (샘플 기반)');
  lines.push('');
  lines.push('이벤트 제목과 기사 제목 간 공유 토큰 수 (2글자+) 평균. 낮을수록 의미 기반 매칭');
  lines.push('비중이 큰 것 — embedding 이 끌어올렸지만 키워드 부족. 너무 낮은 밴드에서는 노이즈 의심.');
  lines.push('');
  lines.push('| 구간 | samples | avg shared tokens |');
  lines.push('|---|---:|---:|');
  for (const d of dist) {
    const arr = byBand.get(d.band) ?? [];
    const avg =
      arr.length > 0 ? arr.reduce((a, b) => a + b.sharedTokens, 0) / arr.length : 0;
    lines.push(`| ${d.band} | ${arr.length} | ${avg.toFixed(2)} |`);
  }
  lines.push('');

  lines.push('## 샘플 (밴드별 랜덤)');
  for (const d of dist) {
    const arr = byBand.get(d.band) ?? [];
    lines.push('');
    lines.push(`### ${d.band} (${arr.length} 샘플, 전체 ${d.count}건)`);
    if (arr.length === 0) {
      lines.push('샘플 없음.');
      continue;
    }
    lines.push('');
    lines.push('| score | 이벤트 | 기사 | 출처 | 공유토큰 |');
    lines.push('|---:|---|---|---|---:|');
    for (const s of arr) {
      const trunc = (t: string, n: number) =>
        t.length > n ? t.slice(0, n - 1).replace(/\|/g, '\\|') + '…' : t.replace(/\|/g, '\\|');
      lines.push(
        `| ${s.score.toFixed(3)} | ${trunc(s.eventTitle, 60)} | ${trunc(s.articleTitle, 70)} | ${s.sourceName} | ${s.sharedTokens} |`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * news-naver ingest 등이 끝난 뒤 자동 호출용 경량 감사.
 * 샘플은 찍지 않고 분포/드리프트 지표만 계산해서 logger 로 흘림. 스테일 밴드
 * (< MIN_SCORE_WITH_EMBEDDING, 현재 0.60) 가 0 이 아니면 warn.
 */
export async function auditMappingDistributionQuick(minScore = 0.6): Promise<{
  total: number;
  perBand: { band: string; count: number }[];
  staleBelowThreshold: number;
}> {
  const total = await prisma.eventArticleMapping.count();
  const edges = [0.5, 0.55, 0.6, 0.65, 0.7, 0.8, 0.9, 1.01];
  const perBand: { band: string; count: number }[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i]!;
    const hi = edges[i + 1]!;
    const count = await prisma.eventArticleMapping.count({
      where: { relevanceScore: { gte: lo, lt: hi } },
    });
    perBand.push({ band: `${lo.toFixed(2)}-${hi.toFixed(2)}`, count });
  }
  const staleBelowThreshold = await prisma.eventArticleMapping.count({
    where: { relevanceScore: { lt: minScore } },
  });
  return { total, perBand, staleBelowThreshold };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [total, dist, samples] = await Promise.all([
    prisma.eventArticleMapping.count(),
    gatherDistribution(args.bandEdges),
    gatherSamples(args.bandEdges, args.samplesPerBand),
  ]);
  const md = renderMarkdown(dist, samples, total);
  process.stdout.write(md);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
