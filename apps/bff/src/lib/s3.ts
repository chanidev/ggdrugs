import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env.js';

/**
 * MinIO (S3 호환) 공용 클라이언트.
 *
 * forcePathStyle 필수 — MinIO 는 가상 호스팅 스타일(my-bucket.minio.local)
 * 을 지원하지 않는다. AWS SDK v3 기본은 path-style false.
 *
 * credentials 는 컨테이너 내부 통신이라도 zod 검증으로 필수.
 */

let _s3: S3Client | null = null;

export function getS3(): S3Client {
  if (_s3) return _s3;
  _s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
    forcePathStyle: true,
  });
  return _s3;
}

/**
 * 읽기용 canonical URL — BFF 내부와 Web 이 공유하는 공개 접근 URL.
 * 버킷이 public-read 정책을 갖고 있다는 전제 (dev: `mc anonymous set download`).
 * prod 전환 시 CDN 앞단 배치하거나 presigned GET 으로 교체.
 */
export function publicUrl(bucket: string, key: string): string {
  const base = env.S3_ENDPOINT.replace(/\/$/, '');
  return `${base}/${bucket}/${encodeURI(key)}`;
}

export async function presignPut(
  bucket: string,
  key: string,
  contentType: string,
  expiresSeconds = 900,
): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(getS3(), cmd, { expiresIn: expiresSeconds });
}

export async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await getS3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    const e = err as { $metadata?: { httpStatusCode?: number }; name?: string };
    if (e.$metadata?.httpStatusCode === 404) return false;
    if (e.name === 'NotFound' || e.name === 'NoSuchKey') return false;
    throw err;
  }
}
