import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

/**
 * G-5: GET /me/recommendations — taste profile 기반 추천 이벤트.
 *
 * 알고리즘:
 *   1. user_taste_profiles 에서 본인 행 모두 조회 (preferred_category / preferred_region / preferred_vibe)
 *   2. WHERE OR (categoryCode=cat) (regionId=reg) (vibe match)
 *   3. AND approvalStatus='approved' AND isDeleted=false AND phase!='ended'
 *   4. ORDER BY startDate ASC LIMIT N (가까운 미래 우선)
 *
 * 시그널 0 인 user 는 빈 배열 반환 + reason='no_taste_signals' (UI 가 empty state 분기).
 *
 * 일일 집계가 user_taste_profiles 갱신 → 본 endpoint 는 단순 read.
 */

function intClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export async function listMyRecommendations(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const limit = intClamp(req.query.limit, 10, 1, 50);

  const profiles = await prisma.userTasteProfile.findMany({
    where: { userId: auth.userId },
    select: { tasteDimension: true, tasteValue: true },
  });

  if (profiles.length === 0) {
    res.json({ items: [], tasteSignals: {}, reason: 'no_taste_signals' });
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
    res.json({ items: [], tasteSignals: dims, reason: 'no_valid_signals' });
    return;
  }

  const events = await prisma.event.findMany({
    where: {
      approvalStatus: 'approved',
      isDeleted: false,
      phase: { not: 'ended' },
      OR: orClauses,
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

  // matchedDimensions: 각 이벤트가 어떤 dimension 과 매칭됐는지 (UI tooltip 용).
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
      // events.start_date 는 @db.Date — bookmarks 패턴 따라 'YYYY-MM-DD' 로 정규화.
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

  res.json({ items, tasteSignals: dims, reason: null });
}
