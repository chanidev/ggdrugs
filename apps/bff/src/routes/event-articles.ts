import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';

/**
 * A_400 관련 기사 — 이벤트 상세에 붙는 뉴스 매핑 조회.
 *
 * GET /events/:id/articles?limit=5&offset=0
 *
 * event_article_mappings 에서 relevance_score DESC 로 정렬. 본문은 반환하지 않고
 * 제목 · 출처 · 발행일 · 원문 URL 만. 요약(summary) 이 있으면 preview 용으로 보냄.
 *
 * limit × offset 기반 페이징. 상세 페이지는 5건씩 페이지 네비게이션 사용, 요약 패널은
 * limit=3 단일 요청.
 */

function parseIntClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export async function listEventArticles(req: Request, res: Response) {
  const raw = req.params.id;
  let eventId: bigint;
  try {
    if (typeof raw !== 'string') throw new Error('bad');
    eventId = BigInt(raw);
    if (eventId <= 0n) throw new Error('bad');
  } catch {
    res.status(400).json({ error: 'invalid event id' });
    return;
  }

  // 이벤트 존재 + 노출 가능 확인 — 비공개·삭제 이벤트의 기사를 노출하지 않음.
  const event = await prisma.event.findFirst({
    where: { eventId, isDeleted: false, approvalStatus: 'approved' },
    select: { eventId: true },
  });
  if (!event) {
    res.status(404).json({ error: 'event_not_found' });
    return;
  }

  const limit = parseIntClamp(req.query.limit, 5, 1, 20);
  const offset = parseIntClamp(req.query.offset, 0, 0, 10_000);

  const [total, rows] = await Promise.all([
    prisma.eventArticleMapping.count({ where: { eventId } }),
    prisma.eventArticleMapping.findMany({
      where: { eventId },
      orderBy: [{ relevanceScore: 'desc' }, { matchedAt: 'desc' }],
      skip: offset,
      take: limit,
      select: {
        mappingId: true,
        relevanceScore: true,
        matchedAt: true,
        article: {
          select: {
            articleId: true,
            sourceName: true,
            authorName: true,
            articleCategory: true,
            title: true,
            originalUrl: true,
            summary: true,
            publishedAt: true,
          },
        },
      },
    }),
  ]);

  res.json({
    total,
    limit,
    offset,
    items: rows.map((r) => ({
      mappingId: r.mappingId.toString(),
      articleId: r.article.articleId.toString(),
      title: r.article.title,
      sourceName: r.article.sourceName,
      authorName: r.article.authorName,
      articleCategory: r.article.articleCategory,
      originalUrl: r.article.originalUrl,
      summary: r.article.summary,
      publishedAt: r.article.publishedAt?.toISOString() ?? null,
      relevanceScore: Number(r.relevanceScore),
      matchedAt: r.matchedAt.toISOString(),
    })),
  });
}
