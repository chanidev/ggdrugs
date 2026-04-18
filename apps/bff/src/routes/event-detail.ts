import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';

/**
 * GET /events/:id — 단일 이벤트 상세.
 *
 * 공개 응답 조건:
 *   - approval_status = 'approved'
 *   - is_deleted = false
 *
 * 응답 형상은 /events 목록과 동일한 EventItem 확장판:
 *   - 기본 필드 전부 +
 *   - addressDetail, sourceType, crawlOrigin, externalSourceId (프로비넌스)
 *   - createdAt / updatedAt (메타)
 */
export async function getEventDetail(req: Request, res: Response) {
  const idStr = typeof req.params.id === 'string' ? req.params.id : '';
  let id: bigint;
  try {
    id = BigInt(idStr);
    if (id <= 0n) throw new Error('invalid id');
  } catch {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  const row = await prisma.event.findFirst({
    where: { eventId: id, approvalStatus: 'approved', isDeleted: false },
    select: {
      eventId: true,
      title: true,
      description: true,
      addressDetail: true,
      startDate: true,
      endDate: true,
      phase: true,
      latitude: true,
      longitude: true,
      posterImageUrl: true,
      bookmarkCount: true,
      avgRating: true,
      reviewCount: true,
      sourceType: true,
      crawlOrigin: true,
      externalSourceId: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { categoryCode: true, displayName: true } },
      region: {
        select: {
          regionId: true,
          sidoName: true,
          sigunguName: true,
          dongName: true,
          fullAddress: true,
        },
      },
      vibeAssignments: {
        select: {
          vibe: { select: { vibeId: true, vibeName: true, vibeGroup: true } },
        },
      },
    },
  });

  if (!row) {
    res.status(404).json({ error: 'not found' });
    return;
  }

  res.json({
    eventId: row.eventId.toString(),
    title: row.title,
    description: row.description,
    addressDetail: row.addressDetail,
    category: {
      code: row.category.categoryCode,
      name: row.category.displayName,
    },
    region: {
      regionId: row.region.regionId.toString(),
      sidoName: row.region.sidoName,
      sigunguName: row.region.sigunguName,
      dongName: row.region.dongName,
      fullAddress: row.region.fullAddress,
    },
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate.toISOString().slice(0, 10),
    phase: row.phase,
    latitude: row.latitude ? Number(row.latitude) : null,
    longitude: row.longitude ? Number(row.longitude) : null,
    posterImageUrl: row.posterImageUrl,
    bookmarkCount: row.bookmarkCount,
    avgRating: Number(row.avgRating),
    reviewCount: row.reviewCount,
    vibes: row.vibeAssignments.map((va) => ({
      vibeId: va.vibe.vibeId.toString(),
      name: va.vibe.vibeName,
      group: va.vibe.vibeGroup,
    })),
    source: {
      type: row.sourceType,
      crawlOrigin: row.crawlOrigin,
      externalId: row.externalSourceId,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
