import type { TranslateLang } from './posts.js';

const BFF_URL = import.meta.env.VITE_BFF_URL ?? 'http://localhost:3000';

export interface PostTranslationResponse {
  postId: string;
  originalBody: string;
  translatedBody: string;
  targetLanguage: string;
  cached: boolean;
}

/**
 * 게시글 본문을 지정 언어로 번역 요청.
 * targetLanguage는 BFF SUPPORTED_LANGS('en'|'vi'|'zh'|'ja'|'fr')와 동일한 TranslateLang 타입으로 제한.
 * ko는 BFF 400을 유발하므로 호출 측에서 항상 제외한다 (useLanguage 필터).
 */
export async function translatePostContent(
  postId: string,
  targetLanguage: TranslateLang,
): Promise<PostTranslationResponse> {
  const res = await fetch(
    `${BFF_URL}/community/posts/${encodeURIComponent(postId)}/translate`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLanguage }),
    },
  );
  if (res.status === 404) throw new Error('POST_NOT_FOUND');
  if (res.status === 400) throw new Error('INVALID_LANG');
  // BFF LLM 장애 시 503 반환 — translateUnavailable i18n 키 표시.
  if (res.status === 503) throw new Error('LLM_UNAVAILABLE');
  if (!res.ok) throw new Error(`translate ${res.status}`);
  return (await res.json()) as PostTranslationResponse;
}
