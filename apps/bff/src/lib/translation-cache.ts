/**
 * 게시글 번역 결과 Redis 캐시 helpers.
 *
 * 캐시 키 prefix: post:translation:{postId}:{targetLang}
 * TTL: 7일 (604800초)
 * 기존 Socket.IO adapter 키(socket.io#*) 및 stream-cache 키와 충돌 없음 — prefix 분리.
 * 무마이그레이션: Redis만 사용, Prisma 스키마 변경 없음. (이슈 22)
 */
import { getRedisClient } from './redis-client.js';

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7d = 604800s

function cacheKey(postId: string, lang: string): string {
  return `post:translation:${postId}:${lang}`;
}

export async function getTranslationCache(postId: string, lang: string): Promise<string | null> {
  return getRedisClient().get(cacheKey(postId, lang));
}

export async function setTranslationCache(postId: string, lang: string, translated: string): Promise<void> {
  await getRedisClient().set(cacheKey(postId, lang), translated, 'EX', TTL_SECONDS);
}
