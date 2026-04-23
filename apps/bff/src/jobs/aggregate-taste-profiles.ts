// G-5: user_taste_profiles 일일 집계 — 북마크/리뷰 시그널 → top-1 dimension upsert.
//
// 3 dimensions (taste_dimension VARCHAR(30) 한도 내):
//   preferred_category  — events.category_code (예: 'festival', 'exhibition')
//   preferred_region    — events.region_id (BigInt → string)
//   preferred_vibe      — event_vibe_assignments.vibe_id (BigInt → string)
//
// 시그널 = 북마크 + 비삭제 리뷰. 두 쪽 모두 user 의 명시적 선호 표현.
// TIES 처리: COUNT DESC, 동수일 때 createdAt 최신 우선 (raw SQL ORDER BY 2번째 키).
// 활성 user 만 (최근 30일 시그널 있는 user) — 비활성 user 는 skip 해 비용 절약.
//
// 트리거: scheduler.ts::runAll() 후속 단계 + `pnpm aggregate:taste` CLI.
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';

const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

async function findActiveUserIds(): Promise<bigint[]> {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS);
  // 최근 30일 안에 북마크나 리뷰 작성한 user.
  const rows = await prisma.$queryRaw<{ user_id: bigint }[]>`
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM bookmarks WHERE created_at >= ${cutoff}
      UNION
      SELECT user_id FROM reviews WHERE created_at >= ${cutoff} AND is_deleted = false
    ) sig
  `;
  return rows.map((r) => r.user_id);
}

async function topCategoryFor(userId: bigint): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ category_code: string }[]>`
    SELECT c.category_code, COUNT(*)::int AS cnt, MAX(sig.ts) AS latest
    FROM (
      SELECT event_id, created_at AS ts FROM bookmarks WHERE user_id = ${userId}
      UNION ALL
      SELECT event_id, created_at AS ts FROM reviews WHERE user_id = ${userId} AND is_deleted = false
    ) sig
    JOIN events e ON e.event_id = sig.event_id
    JOIN event_categories c ON c.category_id = e.category_id
    GROUP BY c.category_code
    ORDER BY cnt DESC, latest DESC
    LIMIT 1
  `;
  return rows[0]?.category_code ?? null;
}

async function topRegionFor(userId: bigint): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ region_id: bigint }[]>`
    SELECT e.region_id, COUNT(*)::int AS cnt, MAX(sig.ts) AS latest
    FROM (
      SELECT event_id, created_at AS ts FROM bookmarks WHERE user_id = ${userId}
      UNION ALL
      SELECT event_id, created_at AS ts FROM reviews WHERE user_id = ${userId} AND is_deleted = false
    ) sig
    JOIN events e ON e.event_id = sig.event_id
    GROUP BY e.region_id
    ORDER BY cnt DESC, latest DESC
    LIMIT 1
  `;
  return rows[0]?.region_id?.toString() ?? null;
}

async function topVibeFor(userId: bigint): Promise<string | null> {
  // vibe 는 event 자체에 N개 매핑돼있어 분포 더 풍부 — 단일 max 잡기.
  const rows = await prisma.$queryRaw<{ vibe_id: bigint }[]>`
    SELECT va.vibe_id, COUNT(*)::int AS cnt, MAX(sig.ts) AS latest
    FROM (
      SELECT event_id, created_at AS ts FROM bookmarks WHERE user_id = ${userId}
      UNION ALL
      SELECT event_id, created_at AS ts FROM reviews WHERE user_id = ${userId} AND is_deleted = false
    ) sig
    JOIN event_vibe_assignments va ON va.event_id = sig.event_id
    GROUP BY va.vibe_id
    ORDER BY cnt DESC, latest DESC
    LIMIT 1
  `;
  return rows[0]?.vibe_id?.toString() ?? null;
}

async function aggregateForUser(userId: bigint): Promise<{ updated: number }> {
  const [category, region, vibe] = await Promise.all([
    topCategoryFor(userId),
    topRegionFor(userId),
    topVibeFor(userId),
  ]);

  const dims: Array<[string, string | null]> = [
    ['preferred_category', category],
    ['preferred_region', region],
    ['preferred_vibe', vibe],
  ];

  let updated = 0;
  for (const [dim, val] of dims) {
    if (val === null) {
      // 시그널 0 인 dimension 은 기존 행 정리 (stale 제거).
      await prisma.userTasteProfile.deleteMany({
        where: { userId, tasteDimension: dim },
      });
      continue;
    }
    await prisma.userTasteProfile.upsert({
      where: { userId_tasteDimension: { userId, tasteDimension: dim } },
      update: { tasteValue: val },
      create: { userId, tasteDimension: dim, tasteValue: val },
    });
    updated += 1;
  }
  return { updated };
}

export async function runTasteAggregation(): Promise<{
  scanned: number;
  updated: number;
  errors: number;
}> {
  const log = logger.child({ job: 'taste-aggregation' });
  const activeUsers = await findActiveUserIds();
  log.info({ count: activeUsers.length }, 'active users to aggregate');

  let updated = 0;
  let errors = 0;
  for (const userId of activeUsers) {
    try {
      const r = await aggregateForUser(userId);
      updated += r.updated;
    } catch (err) {
      errors += 1;
      log.warn(
        { userId: userId.toString(), err: err instanceof Error ? err.message : String(err) },
        'aggregate failed for user',
      );
    }
  }
  return { scanned: activeUsers.length, updated, errors };
}

async function main() {
  const log = logger.child({ job: 'taste-aggregation' });
  try {
    const out = await runTasteAggregation();
    log.info(out, 'taste aggregation done');
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      'aggregation failed',
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

const isCliRun =
  process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('aggregate-taste-profiles.ts');
if (isCliRun) {
  void main();
}
