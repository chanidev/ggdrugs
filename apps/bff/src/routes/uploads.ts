import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { env } from '../env.js';
import { presignPut, publicUrl } from '../lib/s3.js';
import type { UploaderRequest } from '../middleware/require-uploader.js';

/**
 * 이벤트 포스터 업로드 presigned URL 발급.
 *
 * POST /uploader/events/poster-upload-url  (requireUploaderActive 뒤)
 *   body: { contentType: 'image/jpeg'|'image/png'|'image/webp', sizeBytes: number }
 *   resp: { uploadUrl, publicUrl, key, expiresIn }
 *
 * 업로더가 실제 파일을 그 URL 로 바로 PUT → 업로드 완료 → publicUrl 을 이벤트
 * posterImageUrl 필드에 넣어 이벤트 업로드 폼 제출.
 *
 * 보안/제한:
 *   - requireUploaderActive 전제 (auth + approved + role=uploader)
 *   - ContentType 화이트리스트
 *   - 사이즈 5MB 상한 (presigned URL 자체는 사이즈 제한 못 거니 클라이언트 가이드 값)
 *   - key prefix 로 uploader scoped: poster/{uploaderId}/{uuid}.{ext}
 *   - presigned URL TTL 15분
 */

const ALLOWED_POSTER_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
// approval_documents 스키마 CHECK 제약 (chk_doc_mime): jpeg/png 만.
// PDF 허용은 스키마 변경(CHECK 완화) + ADR 후속 과제.
const ALLOWED_DOC_MIME = new Set(['image/jpeg', 'image/png']);
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_POSTER_BYTES = 5 * 1024 * 1024;
const MAX_DOC_BYTES = 5 * 1024 * 1024;

export async function posterUploadUrl(req: Request, res: Response) {
  const uploader = (req as UploaderRequest).uploader;
  const body = req.body ?? {};
  const contentType = typeof body.contentType === 'string' ? body.contentType : '';
  const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : -1;

  if (!ALLOWED_POSTER_MIME.has(contentType)) {
    res.status(400).json({
      error: 'unsupported_content_type',
      allowed: [...ALLOWED_POSTER_MIME],
    });
    return;
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_POSTER_BYTES) {
    res.status(400).json({
      error: 'invalid_size',
      max: MAX_POSTER_BYTES,
    });
    return;
  }

  const ext = MIME_TO_EXT[contentType]!;
  const key = `poster/${uploader.uploaderId.toString()}/${randomUUID()}.${ext}`;
  const expiresIn = 900;

  try {
    const uploadUrl = await presignPut(env.S3_BUCKET_EVENT_POSTERS, key, contentType, expiresIn);
    res.json({
      uploadUrl,
      publicUrl: publicUrl(env.S3_BUCKET_EVENT_POSTERS, key),
      key,
      expiresIn,
      maxBytes: MAX_POSTER_BYTES,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    res.status(500).json({ error: 'presign_failed', detail: msg });
  }
}

/**
 * POST /uploader/documents/upload-url (requireUploaderActive)
 *
 * A_602 서류 업로드 단계 1 — presigned PUT URL 발급.
 * 실제 이벤트 insert 는 /uploader/events POST 에서 {approvalDocuments:[...]} 로
 * 받아 트랜잭션 처리. 업로드된 객체 key 는 event_id 가 정해지기 전이라
 * uploader scoped 키(doc/{uploaderId}/{uuid}.{ext}) 로 저장. 이벤트 insert 시
 * approval_documents.file_path 에 그대로 쓰임.
 *
 * 버킷은 approval-docs (비공개). 다운로드는 관리자 전용 엔드포인트(후속)에서
 * presigned GET 으로. 일반 사용자 접근 불가.
 */
export async function documentUploadUrl(req: Request, res: Response) {
  const uploader = (req as UploaderRequest).uploader;
  const body = req.body ?? {};
  const contentType = typeof body.contentType === 'string' ? body.contentType : '';
  const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : -1;

  if (!ALLOWED_DOC_MIME.has(contentType)) {
    res.status(400).json({
      error: 'unsupported_content_type',
      allowed: [...ALLOWED_DOC_MIME],
    });
    return;
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_DOC_BYTES) {
    res.status(400).json({ error: 'invalid_size', max: MAX_DOC_BYTES });
    return;
  }

  const ext = MIME_TO_EXT[contentType]!;
  const key = `doc/${uploader.uploaderId.toString()}/${randomUUID()}.${ext}`;
  const expiresIn = 900;

  try {
    const uploadUrl = await presignPut(env.S3_BUCKET_APPROVAL_DOCS, key, contentType, expiresIn);
    res.json({
      uploadUrl,
      key,
      expiresIn,
      maxBytes: MAX_DOC_BYTES,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    res.status(500).json({ error: 'presign_failed', detail: msg });
  }
}
