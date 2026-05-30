import type { SupportedLanguage } from '../i18n.js';

const BFF_URL = import.meta.env.VITE_BFF_URL ?? 'http://localhost:3000';

export interface PostTranslationResponse {
  postId: string;
  originalBody: string;
  translatedBody: string;
  targetLanguage: string;
  cached: boolean;
}

export async function translatePostContent(
  postId: string,
  targetLanguage: SupportedLanguage,
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
  if (!res.ok) throw new Error(`translate ${res.status}`);
  return (await res.json()) as PostTranslationResponse;
}
