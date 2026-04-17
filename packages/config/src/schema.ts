import { z } from 'zod';

const nodeEnv = z.enum(['development', 'production', 'test']).default('development');
const logLevel = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info');

const requiredSecret = z.string().min(16, '시크릿은 16자 이상이어야 합니다.');
const optionalKey = z.string().default('');

export const coreSchema = z.object({
  NODE_ENV: nodeEnv,
  LOG_LEVEL: logLevel,
});

export const databaseSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL은 유효한 URL이어야 합니다.'),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
});

export const redisSchema = z.object({
  REDIS_URL: z.string().url(),
});

export const qdrantSchema = z.object({
  QDRANT_URL: z.string().url(),
});

export const s3Schema = z.object({
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET_APPROVAL_DOCS: z.string().min(1),
  S3_BUCKET_REVIEW_PHOTOS: z.string().min(1),
  S3_BUCKET_EVENT_POSTERS: z.string().min(1),
  S3_BUCKET_USER_PHOTOS: z.string().min(1),
});

export const serviceUrlsSchema = z.object({
  BFF_URL: z.string().url(),
  LLM_SERVICE_URL: z.string().url(),
  WEB_URL: z.string().url(),
});

export const externalApiSchema = z.object({
  /** Kakao Maps JavaScript 키 — 브라우저에 노출되는 공개 키. VITE_ 접두어로 web에 주입. */
  VITE_KAKAO_MAP_JS_KEY: optionalKey,
  /** Kakao REST API 키 — 서버 전용 (지오코딩·로컬 검색). BFF에서만 사용. */
  KAKAO_REST_API_KEY: optionalKey,
  GOOGLE_OAUTH_CLIENT_ID: optionalKey,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalKey,
});

export const openaiSchema = z.object({
  OPENAI_API_KEY: optionalKey,
  OPENAI_MODEL_CHAT: z.string().default('gpt-4o'),
  OPENAI_MODEL_FAST: z.string().default('gpt-4o-mini'),
  OPENAI_MODEL_EMBEDDING: z.string().default('text-embedding-3-small'),
});

export const sessionSchema = z.object({
  SESSION_SECRET: requiredSecret,
  JWT_SECRET: requiredSecret,
});

export const fullSchema = coreSchema
  .merge(databaseSchema)
  .merge(redisSchema)
  .merge(qdrantSchema)
  .merge(s3Schema)
  .merge(serviceUrlsSchema)
  .merge(externalApiSchema)
  .merge(openaiSchema)
  .merge(sessionSchema);

export type CoreEnv = z.infer<typeof coreSchema>;
export type DatabaseEnv = z.infer<typeof databaseSchema>;
export type RedisEnv = z.infer<typeof redisSchema>;
export type QdrantEnv = z.infer<typeof qdrantSchema>;
export type S3Env = z.infer<typeof s3Schema>;
export type ServiceUrlsEnv = z.infer<typeof serviceUrlsSchema>;
export type ExternalApiEnv = z.infer<typeof externalApiSchema>;
export type OpenAIEnv = z.infer<typeof openaiSchema>;
export type SessionEnv = z.infer<typeof sessionSchema>;
export type FullEnv = z.infer<typeof fullSchema>;

/**
 * 프로덕션에서 비어있으면 안 되는 외부 API/시크릿 키 목록.
 * dev에서는 optional이지만 NODE_ENV=production일 때 빈 문자열이면 loadEnv가 throw.
 */
export const productionRequiredKeys = [
  'VITE_KAKAO_MAP_JS_KEY',
  'KAKAO_REST_API_KEY',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'OPENAI_API_KEY',
] as const satisfies ReadonlyArray<keyof FullEnv>;
