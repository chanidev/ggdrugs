import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';

/**
 * GET /events/stats — 집계용.
 *
 * 현재 공개 이벤트의 카테고리별 count. 전체목록 chip (축제 N · 박람회 N · ...) 용.
 * 추후 phase 별·region 별 breakdown 추가 가능.
 *
 * 응답:
 *   {
 *     total: number,
 *     categories: [{ code: 'festival', label: '축제', count: 1234 }, ...]
 *   }
 *
 * `all` pseudo-카테고리는 total 로 표현. 클라이언트가 원하면 직접 삽입.
 */
export async function eventsStats(_req: Request, res: Response) {
  const [total, byCategory] = await Promise.all([
    prisma.event.count({
      where: { approvalStatus: 'approved', isDeleted: false },
    }),
    prisma.event.groupBy({
      by: ['categoryId'],
      where: { approvalStatus: 'approved', isDeleted: false },
      _count: { _all: true },
    }),
  ]);

  const categoryRows = await prisma.eventCategory.findMany({
    select: { categoryId: true, categoryCode: true, displayName: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  });

  const countByCategoryId = new Map<string, number>();
  for (const g of byCategory) {
    countByCategoryId.set(g.categoryId.toString(), g._count._all);
  }

  const categories = categoryRows.map((c) => ({
    code: c.categoryCode,
    label: c.displayName,
    count: countByCategoryId.get(c.categoryId.toString()) ?? 0,
  }));

  res.json({ total, categories });
}
