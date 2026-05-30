import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { callLlm } from '../llm-client.js';
import { getTranslationCache, setTranslationCache } from '../lib/translation-cache.js';

const SUPPORTED_LANGS = new Set(['en', 'vi', 'zh', 'ja', 'fr']);

function parseBigId(raw: unknown): bigint | null {
  try { const n = BigInt(String(raw ?? '')); return n > 0n ? n : null; } catch { return null; }
}

interface LlmTranslateResponse { translated: string }

/**
 * POST /community/posts/:id/translate
 * Request body: { targetLanguage: 'en'|'vi'|'zh'|'ja'|'fr' }
 * Response: { postId, originalBody, translatedBody, targetLanguage, cached }
 *
 * 에러 처리 & 폴백 정책 (이슈 23):
 *  - LLM rate-limit/타임아웃/502 → originalBody 그대로 반환 (graceful degradation)
 *  - Redis 에러 → 캐시 miss로 간주, 번역 계속 진행
 *  - 게시글 없음 → 404
 *  - 인증: 비로그인도 가능 (resolveAuth 사용, requireAuth 아님)
 *
 * 캐시 키: post:translation:{postId}:{lang}  TTL: 7d (604800s)
 */
export async function translatePost(req: Request, res: Response): Promise<void> {
  const postId = parseBigId(req.params.id);
  if (!postId) { res.status(400).json({ error: 'invalid id' }); return; }

  const targetLanguage = String((req.body as Record<string, unknown>)?.targetLanguage ?? '');
  if (!SUPPORTED_LANGS.has(targetLanguage)) {
    res.status(400).json({ error: 'unsupported targetLanguage. Use: en, vi, zh, ja, fr' });
    return;
  }

  const post = await prisma.post.findFirst({
    where: { postId, isDeleted: false, expiresAt: { gt: new Date() } },
    select: { postId: true, body: true },
  });
  if (!post) { res.status(404).json({ error: 'post not found' }); return; }

  const postIdStr = post.postId.toString();

  // Redis 캐시 확인 (에러 시 miss로 처리)
  const cached = await getTranslationCache(postIdStr, targetLanguage).catch(() => null);
  if (cached !== null) {
    res.json({ postId: postIdStr, originalBody: post.body, translatedBody: cached, targetLanguage, cached: true });
    return;
  }

  // LLM 호출 — 실패 시 originalBody 폴백 (graceful degradation)
  const llmResult = await callLlm<LlmTranslateResponse>('/translate-post', {
    content: post.body,
    target_lang: targetLanguage,
  }).catch(() => null);

  const translatedBody = llmResult?.translated ?? post.body;
  const wasTranslated = !!llmResult?.translated;

  // 번역 성공 시에만 캐시 저장
  if (wasTranslated) {
    await setTranslationCache(postIdStr, targetLanguage, translatedBody).catch(() => undefined);
  }

  res.json({ postId: postIdStr, originalBody: post.body, translatedBody, targetLanguage, cached: false });
}
