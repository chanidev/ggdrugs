import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';

/**
 * GET /events/stats — 집계용.
 *
 * 공개 이벤트의 카테고리별 · phase 별 count.
 *  - 전체목록 chip (축제 N · 박람회 N · ...) 용.
 *  - A_203 "곧 열리는" / 진행중 / 종료 tab count.
 *
 * 응답:
 *   {
 *     total: number,
 *     categories: [{ code: 'festival', label: '축제', count: 1234 }, ...],
 *     phases:     { upcoming: n, ongoing: n, ended: n }
 *   }
 */
export async function eventsStats(_req: Request, res: Response) {
  const baseWhere = { approvalStatus: 'approved' as const, isDeleted: false };

  const [total, byCategory, byPhase] = await Promise.all([
    prisma.event.count({ where: baseWhere }),
    prisma.event.groupBy({
      by: ['categoryId'],
      where: baseWhere,
      _count: { _all: true },
    }),
    prisma.event.groupBy({
      by: ['phase'],
      where: baseWhere,
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

  const phases = { upcoming: 0, ongoing: 0, ended: 0 };
  for (const g of byPhase) {
    if (g.phase in phases) {
      phases[g.phase as keyof typeof phases] = g._count._all;
    }
  }

  res.json({ total, categories, phases });
}
