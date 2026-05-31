/**
 * 게시글 번역 결과 Redis 캐시 helpers.
 *
 * 캐시 키 prefix: post:translation:{postId}:{targetLang}:{contentHash}
 * TTL: 7일 (604800초)
 * 기존 Socket.IO adapter 키(socket.io#*) 및 stream-cache 키와 충돌 없음 — prefix 분리.
 * 무마이그레이션: Redis만 사용, Prisma 스키마 변경 없음. (이슈 22)
 *
 * contentHash: 게시글 본문 sha256(앞 16hex). 본문이 수정되면 키가 바뀌어 자동으로
 *   캐시 miss → 재번역. (구 키는 TTL 만료로 자연 소멸.) 본문 해시 누락 시 수정된
 *   게시글이 최대 7일간 옛 번역을 노출하던 stale-serve 버그 방어선.
 */
import { createHash } from 'node:crypto';
import { getRedisClient } from './redis-client.js';

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7d = 604800s

/** 본문 → 짧은 콘텐츠 해시 (캐시 키 세그먼트용). */
export function contentHash(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

function cacheKey(postId: string, lang: string, hash: string): string {
  return `post:translation:${postId}:${lang}:${hash}`;
}

export async function getTranslationCache(postId: string, lang: string, hash: string): Promise<string | null> {
  return getRedisClient().get(cacheKey(postId, lang, hash));
}

export async function setTranslationCache(postId: string, lang: string, hash: string, translated: string): Promise<void> {
  await getRedisClient().set(cacheKey(postId, lang, hash), translated, 'EX', TTL_SECONDS);
}
