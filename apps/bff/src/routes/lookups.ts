import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';

/**
 * GET /regions — 필터 드롭다운용 지역 목록.
 *
 * 형상: [{ regionId, sido, sigungu, fullAddress, centerLat, centerLng }]
 * 정렬: sido 가나다 → sigungu 가나다 (NULLS FIRST → 광역 row 가 각 sido 의 첫 항목).
 * Client(FilterSearchPanel) 가 sido 별 그룹핑 담당.
 *
 * centerLat/Lng — chip 클릭 시 지도 panTo anchor. 자치구 row 의 center 가 NULL 이면
 * 같은 sido 의 광역 row 좌표로 COALESCE (대부분의 광역시 자치구는 광역 좌표 fallback).
 */
export async function listRegions(_req: Request, res: Response) {
  type RegionRow = {
    region_id: bigint;
    sido_name: string;
    sigungu_name: string | null;
    full_address: string;
    center_lat: string | null;
    center_lng: string | null;
  };
  const rows = await prisma.$queryRaw<RegionRow[]>`
    SELECT r.region_id,
           r.sido_name,
           r.sigungu_name,
           r.full_address,
           COALESCE(r.center_lat, p.center_lat)::text AS center_lat,
           COALESCE(r.center_lng, p.center_lng)::text AS center_lng
    FROM regions r
    LEFT JOIN regions p
      ON p.sido_name = r.sido_name
     AND p.sigungu_name IS NULL
     AND p.dong_name IS NULL
    WHERE r.dong_name IS NULL
    ORDER BY r.sido_name ASC, r.sigungu_name ASC NULLS FIRST
  `;

  const items = rows.map((r) => ({
    regionId: r.region_id.toString(),
    sido: r.sido_name,
    sigungu: r.sigungu_name,
    fullAddress: r.full_address,
    centerLat: r.center_lat !== null ? Number(r.center_lat) : null,
    centerLng: r.center_lng !== null ? Number(r.center_lng) : null,
  }));
  res.json({ items });
}

/**
 * GET /vibes — 필터 드롭다운용 이벤트 성향 목록.
 * 형상: [{ vibeId, name, group }]
 * 정렬: group → name.
 */
export async function listVibes(_req: Request, res: Response) {
  const rows = await prisma.eventVibe.findMany({
    where: { isActive: true },
    select: { vibeId: true, vibeName: true, vibeGroup: true },
    orderBy: [{ vibeGroup: 'asc' }, { vibeName: 'asc' }],
  });
  res.json({
    items: rows.map((r) => ({
      vibeId: r.vibeId.toString(),
      name: r.vibeName,
      group: r.vibeGroup,
    })),
  });
}
