import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { env } from '../env.js';
import { presignGet } from '../lib/s3.js';

/**
 * GET /admin/events/:id/documents
 *
 * 업로드 이벤트(source_type='uploaded')의 approval_documents 리스트 + 각 파일의
 * 짧은 TTL presigned GET URL 을 반환. 관리자가 심사 화면에서 이미지 미리보기.
 *
 *  TTL 5분 — 탭 열어두고 장시간 자리 비울 때 URL 만료되면 재요청.
 *  approval-docs 버킷은 비공개라 presigned GET 없이는 접근 불가.
 */
export async function listAdminEventDocuments(req: Request, res: Response) {
  const idStr = typeof req.params.id === 'string' ? req.params.id : '';
  let eventId: bigint;
  try {
    eventId = BigInt(idStr);
    if (eventId <= 0n) throw new Error('bad');
  } catch {
    res.status(400).json({ error: 'invalid event id' });
    return;
  }

  const event = await prisma.event.findFirst({
    where: { eventId, isDeleted: false },
    select: { eventId: true, sourceType: true },
  });
  if (!event) {
    res.status(404).json({ error: 'event_not_found' });
    return;
  }

  const rows = await prisma.approvalDocument.findMany({
    where: { eventId },
    orderBy: { documentId: 'asc' },
    select: {
      documentId: true,
      filePath: true,
      originalFilename: true,
      mimeType: true,
      fileSizeBytes: true,
      createdAt: true,
    },
  });

  const items = await Promise.all(
    rows.map(async (r) => ({
      documentId: r.documentId.toString(),
      originalFilename: r.originalFilename,
      mimeType: r.mimeType,
      fileSizeBytes: r.fileSizeBytes,
      createdAt: r.createdAt.toISOString(),
      previewUrl: await presignGet(env.S3_BUCKET_APPROVAL_DOCS, r.filePath, 300),
    })),
  );

  res.json({
    eventId: event.eventId.toString(),
    sourceType: event.sourceType,
    expiresIn: 300,
    items,
  });
}
