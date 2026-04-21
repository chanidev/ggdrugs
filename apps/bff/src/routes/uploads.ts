import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { env } from '../env.js';
import { presignPut, publicUrl } from '../lib/s3.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';
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
// approval_documents CHECK (chk_doc_mime) 와 동기. 마이그레이션
// 20260421110000_allow_pdf_in_approval_docs 로 PDF 허용.
const ALLOWED_DOC_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);
// 리뷰 사진은 image 만 — review_photos 테이블엔 CHECK 없지만 product 정책.
const ALLOWED_REVIEW_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const MAX_POSTER_BYTES = 5 * 1024 * 1024;
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const MAX_REVIEW_PHOTO_BYTES = 5 * 1024 * 1024;

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

/**
 * POST /reviews/photos/upload-url  (requireAuth 만 — 일반 사용자)
 *
 * A_501 리뷰 사진 presigned PUT URL. 이벤트 리뷰 작성 시 최대 5장.
 * key: review/{userId}/{uuid}.{ext}, review-photos 버킷(public download).
 * 포스터와 같은 공개 정책 — <img> 로 리뷰 카드에 직접 렌더.
 */
export async function reviewPhotoUploadUrl(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const body = req.body ?? {};
  const contentType = typeof body.contentType === 'string' ? body.contentType : '';
  const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : -1;

  if (!ALLOWED_REVIEW_PHOTO_MIME.has(contentType)) {
    res.status(400).json({
      error: 'unsupported_content_type',
      allowed: [...ALLOWED_REVIEW_PHOTO_MIME],
    });
    return;
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_REVIEW_PHOTO_BYTES) {
    res.status(400).json({ error: 'invalid_size', max: MAX_REVIEW_PHOTO_BYTES });
    return;
  }

  const ext = MIME_TO_EXT[contentType]!;
  const key = `review/${auth.userId.toString()}/${randomUUID()}.${ext}`;
  const expiresIn = 900;

  try {
    const uploadUrl = await presignPut(env.S3_BUCKET_REVIEW_PHOTOS, key, contentType, expiresIn);
    res.json({
      uploadUrl,
      publicUrl: publicUrl(env.S3_BUCKET_REVIEW_PHOTOS, key),
      key,
      expiresIn,
      maxBytes: MAX_REVIEW_PHOTO_BYTES,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    res.status(500).json({ error: 'presign_failed', detail: msg });
  }
}
