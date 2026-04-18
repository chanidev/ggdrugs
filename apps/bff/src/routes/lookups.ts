import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';

/**
 * GET /regions — 필터 드롭다운용 지역 목록.
 *
 * 서울 중심 프로젝트라 서울 sido 의 구 단위 목록 우선 반환.
 * 형상: [{ regionId, sido, sigungu, fullAddress }]
 * 정렬: 서울 전체 → 구 가나다 → 광역시·도 순.
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
    orderBy: [{ sidoName: 'asc' }, { sigunguName: 'asc' }],
  });

  // 서울 먼저, 그 외는 sido 가나다
  const seoul = rows.filter((r) => r.sidoName === '서울');
  const others = rows.filter((r) => r.sidoName !== '서울');

  const items = [...seoul, ...others].map((r) => ({
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
