import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { env } from '../env.js';
import { logger } from '../logger.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

/**
 * G-5: GET /me/recommendations — taste profile 기반 추천 이벤트.
 *
 * Hybrid 알고리즘 (2026-04-23 정교화):
 *   1. PRIMARY (Qdrant personalized) — 사용자의 최근 북마크 10 + 리뷰 5 를 seed 로 묶어
 *      services/llm /events/personalized 호출. seed 들의 vector 평균 → kNN.
 *      seed 자체와 이미 본 이벤트는 결과에서 제외.
 *   2. FALLBACK (SQL OR) — Qdrant 503 / hits=0 / seed 0 인 경우, 기존 user_taste_profiles
 *      KV 매칭으로 graceful degrade (preferred_category / region / vibe).
 *
 * empty state 분기:
 *   - reason='no_taste_signals' → 시그널 없음 (북마크/리뷰 0)
 *   - reason='no_valid_signals' → taste 손상 + Qdrant 0 동시
 *   - reason='qdrant_unavailable' → 정상 SQL fallback 사용 표기
 *   - reason=null → 정상 (Qdrant 또는 SQL 결과 있음)
 */

const LLM_TIMEOUT_MS = 5000;

function intClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

interface QdrantHit {
  eventId: string;
  score: number;
  payload: Record<string, unknown>;
}

/** services/llm /events/personalized 호출. seed 0 또는 LLM 다운 시 null. */
async function fetchPersonalizedHits(
  seedIds: bigint[],
  excludeIds: bigint[],
  limit: number,
): Promise<QdrantHit[] | null> {
  if (seedIds.length === 0) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.LLM_SERVICE_URL}/events/personalized`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed_event_ids: seedIds.map((id) => Number(id)),
        limit,
        exclude_ids: excludeIds.map((id) => Number(id)),
        score_threshold: 0.25, // personalized 는 mean vector 라 specificity 약함 — threshold 살짝 낮춤
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      logger.warn(
        { status: res.status },
        'personalized recommendations LLM call non-2xx, falling back to SQL',
      );
      return null;
    }
    const data = (await res.json()) as { hits?: QdrantHit[] };
    return data.hits ?? [];
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'personalized recommendations LLM call failed, falling back to SQL',
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function listMyRecommendations(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const limit = intClamp(req.query.limit, 10, 1, 50);

  // 1. Seed 수집 — 최근 북마크 10 + 비삭제 리뷰 5 (createdAt desc).
  const [bookmarks, reviews] = await Promise.all([
    prisma.bookmark.findMany({
      where: { userId: auth.userId, event: { isDeleted: false } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { eventId: true },
    }),
    prisma.review.findMany({
      where: { userId: auth.userId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { eventId: true },
    }),
  ]);
  const seedIds: bigint[] = Array.from(
    new Set([...bookmarks, ...reviews].map((r) => r.eventId.toString())),
  ).map((s) => BigInt(s));
  // 사용자가 이미 본/저장한 이벤트는 제외 — seed 외에도 모든 북마크 (10 초과분) 까지 포함하면
  // 좋지만 비용 vs 효과 — seed=excludeBase 면 충분.
  const excludeIds = seedIds;

  // 2. PRIMARY — Qdrant personalized.
  const personalizedHits = await fetchPersonalizedHits(seedIds, excludeIds, limit * 2);

  if (personalizedHits && personalizedHits.length > 0) {
    // hits 의 eventId → Prisma resolve. approved + 미삭제 + phase!='ended' 추가 필터.
    const ids = personalizedHits
      .map((h) => {
        try {
          return BigInt(h.eventId);
        } catch {
          return null;
        }
      })
      .filter((x): x is bigint => x !== null);
    const events = await prisma.event.findMany({
      where: {
        eventId: { in: ids },
        approvalStatus: 'approved',
        isDeleted: false,
        phase: { not: 'ended' },
      },
      select: {
        eventId: true,
        title: true,
        posterImageUrl: true,
        startDate: true,
        endDate: true,
        phase: true,
        category: { select: { categoryCode: true, displayName: true } },
        region: { select: { sidoName: true, sigunguName: true, fullAddress: true } },
      },
    });

    // hits 순서 보존 (kNN score desc). score 도 응답에 포함.
    const eventMap = new Map(events.map((e) => [e.eventId.toString(), e]));
    const items = personalizedHits
      .map((h) => {
        const e = eventMap.get(h.eventId);
        if (!e) return null;
        return {
          eventId: e.eventId.toString(),
          title: e.title,
          posterImageUrl: e.posterImageUrl,
          startDate: e.startDate.toISOString().slice(0, 10),
          endDate: e.endDate.toISOString().slice(0, 10),
          phase: e.phase,
          categoryName: e.category.displayName,
          region: {
            sidoName: e.region.sidoName,
            sigunguName: e.region.sigunguName,
            fullAddress: e.region.fullAddress,
          },
          score: Math.round(h.score * 1000) / 1000,
          matchedDimensions: ['semantic'], // Qdrant 기반은 semantic 단일 dimension
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, limit);

    if (items.length > 0) {
      res.json({
        items,
        source: 'qdrant_personalized',
        seedCount: seedIds.length,
        reason: null,
      });
      return;
    }
    // Qdrant hits 있었지만 모두 stale/소실 → fallback 진입
  }

  // 3. FALLBACK — user_taste_profiles SQL OR.
  const profiles = await prisma.userTasteProfile.findMany({
    where: { userId: auth.userId },
    select: { tasteDimension: true, tasteValue: true },
  });

  if (profiles.length === 0) {
    res.json({
      items: [],
      source: 'fallback_sql',
      seedCount: seedIds.length,
      reason: 'no_taste_signals',
    });
    return;
  }

  const dims: Record<string, string> = {};
  for (const p of profiles) dims[p.tasteDimension] = p.tasteValue;

  const orClauses: Prisma.EventWhereInput[] = [];
  if (dims.preferred_category) {
    orClauses.push({ category: { categoryCode: dims.preferred_category } });
  }
  if (dims.preferred_region) {
    try {
      orClauses.push({ regionId: BigInt(dims.preferred_region) });
    } catch {
      // 손상된 값 무시
    }
  }
  if (dims.preferred_vibe) {
    try {
      orClauses.push({
        vibeAssignments: { some: { vibeId: BigInt(dims.preferred_vibe) } },
      });
    } catch {
      // 손상된 값 무시
    }
  }

  if (orClauses.length === 0) {
    res.json({
      items: [],
      source: 'fallback_sql',
      seedCount: seedIds.length,
      reason: 'no_valid_signals',
    });
    return;
  }

  const events = await prisma.event.findMany({
    where: {
      approvalStatus: 'approved',
      isDeleted: false,
      phase: { not: 'ended' },
      OR: orClauses,
      // seed 이벤트 제외
      ...(excludeIds.length > 0 ? { eventId: { notIn: excludeIds } } : {}),
    },
    orderBy: [{ startDate: 'asc' }, { eventId: 'asc' }],
    take: limit,
    select: {
      eventId: true,
      title: true,
      posterImageUrl: true,
      startDate: true,
      endDate: true,
      phase: true,
      categoryId: true,
      regionId: true,
      category: { select: { categoryCode: true, displayName: true } },
      region: { select: { regionId: true, sidoName: true, sigunguName: true, fullAddress: true } },
      vibeAssignments: { select: { vibeId: true } },
    },
  });

  const items = events.map((e) => {
    const matched: string[] = [];
    if (dims.preferred_category && e.category.categoryCode === dims.preferred_category) {
      matched.push('category');
    }
    if (dims.preferred_region && e.regionId.toString() === dims.preferred_region) {
      matched.push('region');
    }
    if (
      dims.preferred_vibe &&
      e.vibeAssignments.some((va) => va.vibeId.toString() === dims.preferred_vibe)
    ) {
      matched.push('vibe');
    }
    return {
      eventId: e.eventId.toString(),
      title: e.title,
      posterImageUrl: e.posterImageUrl,
      startDate: e.startDate.toISOString().slice(0, 10),
      endDate: e.endDate.toISOString().slice(0, 10),
      phase: e.phase,
      categoryName: e.category.displayName,
      region: {
        sidoName: e.region.sidoName,
        sigunguName: e.region.sigunguName,
        fullAddress: e.region.fullAddress,
      },
      matchedDimensions: matched,
    };
  });

  res.json({
    items,
    source: 'fallback_sql',
    tasteSignals: dims,
    seedCount: seedIds.length,
    reason: personalizedHits === null ? 'qdrant_unavailable' : null,
  });
}
