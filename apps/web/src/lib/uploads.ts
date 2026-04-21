import {
  requestDocumentUploadUrl,
  requestPosterUploadUrl,
  requestReviewPhotoUploadUrl,
  requestUploaderSignupDocumentUploadUrl,
  uploadToPresignedUrl,
  type ReviewPhotoMeta,
  type UploaderDocumentMeta,
  type UploaderSignupDocumentMeta,
} from './api';

/**
 * 파일 업로드 오케스트레이션 공용 헬퍼.
 *
 *  - uploadPoster(file)            → publicUrl | null
 *  - uploadDocuments(files)        → UploaderDocumentMeta[]
 *  - (확장) uploadReviewPhotos    → review_photos 버킷, 다음 패스
 *
 * 각 헬퍼는 presign → S3 PUT → 메타데이터 반환을 단일 책임으로 처리.
 * Picker 컴포넌트는 파일 staging 만 관리하고 실제 업로드는 여기서.
 *
 * 에러는 항상 throw — 호출자가 UI 피드백 결정.
 */

export async function uploadPoster(file: File): Promise<string> {
  const presign = await requestPosterUploadUrl({
    contentType: file.type,
    sizeBytes: file.size,
  });
  await uploadToPresignedUrl(presign.uploadUrl, file);
  return presign.publicUrl;
}

export async function uploadDocuments(
  files: File[],
): Promise<UploaderDocumentMeta[]> {
  const out: UploaderDocumentMeta[] = [];
  for (const f of files) {
    const presign = await requestDocumentUploadUrl({
      contentType: f.type,
      sizeBytes: f.size,
    });
    await uploadToPresignedUrl(presign.uploadUrl, f);
    out.push({
      key: presign.key,
      originalFilename: f.name.slice(0, 255),
      mimeType: f.type,
      fileSizeBytes: f.size,
    });
  }
  return out;
}

export async function uploadReviewPhotos(files: File[]): Promise<ReviewPhotoMeta[]> {
  const out: ReviewPhotoMeta[] = [];
  for (const f of files) {
    const presign = await requestReviewPhotoUploadUrl({
      contentType: f.type,
      sizeBytes: f.size,
    });
    await uploadToPresignedUrl(presign.uploadUrl, f);
    out.push({
      key: presign.key,
      originalFilename: f.name.slice(0, 255),
      mimeType: f.type,
      fileSizeBytes: f.size,
    });
  }
  return out;
}

export async function uploadUploaderSignupDocuments(
  files: File[],
): Promise<UploaderSignupDocumentMeta[]> {
  const out: UploaderSignupDocumentMeta[] = [];
  for (const f of files) {
    const presign = await requestUploaderSignupDocumentUploadUrl({
      contentType: f.type,
      sizeBytes: f.size,
    });
    await uploadToPresignedUrl(presign.uploadUrl, f);
    out.push({
      key: presign.key,
      originalFilename: f.name.slice(0, 255),
      mimeType: f.type,
      fileSizeBytes: f.size,
    });
  }
  return out;
}
