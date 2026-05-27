import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';

/**
 * GET /regions — 필터 드롭다운용 지역 목록.
 *
 * 형상: [{ regionId, sido, sigungu, fullAddress }]
 * 정렬: sido 가나다 → sigungu 가나다. 광역 row(sigungu=null) 는 각 sido 의 첫 항목.
 * Client(FilterSearchPanel) 가 sido 별 그룹핑 담당.
 */
export async function listRegions(_req: Request, res: Response) {
  const rows = await prisma.region.findMany({
    where: { dongName: null }, // 구 단위까지만 (동 레벨 제외)
    select: {
      regionId: true,
      sidoName: true,
      sigunguName: true,
      fullAddress: true,
    },
    orderBy: [
      { sidoName: 'asc' },
      // sigunguName NULL (광역 row) 이 먼저 오도록 — Prisma 는 NULL FIRST 가 기본
      { sigunguName: 'asc' },
    ],
  });

  const items = rows.map((r) => ({
    regionId: r.regionId.toString(),
    sido: r.sidoName,
    sigungu: r.sigunguName,
    fullAddress: r.fullAddress,
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
