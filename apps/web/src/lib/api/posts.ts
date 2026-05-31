import { BFF_URL, withCredentials } from './client.js';

export type PostCategory = 'festival_story' | 'mate_finder' | 'free';

export interface PostListItem {
  postId: string;
  category: PostCategory;
  title: string;
  authorUserId: string;
  authorNickname: string;
  commentCount: number;
  likeCount: number;
  createdAt: string;
}

export interface PostListResponse {
  page: number;
  limit: number;
  total: number;
  items: PostListItem[];
}

export interface CommentNode {
  commentId: string;
  parentCommentId: string | null;
  authorUserId: string;
  authorNickname: string;
  body: string;
  createdAt: string;
  isMine: boolean;
  replies: CommentNode[];
}

export interface PostDetail {
  postId: string;
  category: PostCategory;
  title: string;
  body: string;
  authorUserId: string;
  authorNickname: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  isMine: boolean;
  createdAt: string;
  comments: CommentNode[];
}

/** BFF createPost 응답 — body 필드를 포함한 실제 반환 형태. */
export interface CreatePostResponse {
  postId: string;
  category: PostCategory;
  title: string;
  body: string;
  authorNickname: string;
  likeCount: number;
  commentCount: number;
  createdAt: string;
}

export async function fetchPosts(
  query: { category?: PostCategory; page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<PostListResponse> {
  const sp = new URLSearchParams();
  if (query.category) sp.set('category', query.category);
  if (query.page != null) sp.set('page', String(query.page));
  if (query.limit != null) sp.set('limit', String(query.limit));
  const qs = sp.toString();
  const res = await fetch(
    `${BFF_URL}/community/posts${qs ? `?${qs}` : ''}`,
    withCredentials(signal != null ? { signal } : {}),
  );
  if (!res.ok) throw new Error(`GET /community/posts ${res.status}`);
  return (await res.json()) as PostListResponse;
}

export async function fetchPostDetail(id: string, signal?: AbortSignal): Promise<PostDetail> {
  const res = await fetch(
    `${BFF_URL}/community/posts/${encodeURIComponent(id)}`,
    withCredentials(signal != null ? { signal } : {}),
  );
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`GET /community/posts/${id} ${res.status}`);
  return (await res.json()) as PostDetail;
}

export async function createPost(
  body: { category: PostCategory; title: string; body: string },
): Promise<CreatePostResponse> {
  const res = await fetch(
    `${BFF_URL}/community/posts`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`POST /community/posts ${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as CreatePostResponse;
}

export async function updatePost(id: string, body: { title: string; body: string }): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/community/posts/${encodeURIComponent(id)}`,
    withCredentials({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`PATCH /community/posts/${id} ${res.status}`);
}

export async function deletePost(id: string): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/community/posts/${encodeURIComponent(id)}`,
    withCredentials({ method: 'DELETE' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`DELETE /community/posts/${id} ${res.status}`);
}

export async function togglePostLike(id: string): Promise<{ liked: boolean; likeCount: number }> {
  const res = await fetch(
    `${BFF_URL}/community/posts/${encodeURIComponent(id)}/like`,
    withCredentials({ method: 'POST' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`POST /community/posts/${id}/like ${res.status}`);
  return (await res.json()) as { liked: boolean; likeCount: number };
}

export async function createComment(
  postId: string,
  body: { body: string; parentCommentId?: string },
): Promise<CommentNode> {
  const res = await fetch(
    `${BFF_URL}/community/posts/${encodeURIComponent(postId)}/comments`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 422) throw new Error('REPLY_TO_REPLY_NOT_ALLOWED');
  if (!res.ok) throw new Error(`POST /community/posts/${postId}/comments ${res.status}`);
  return (await res.json()) as CommentNode;
}

export async function updateComment(id: string, body: { body: string }): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/community/comments/${encodeURIComponent(id)}`,
    withCredentials({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`PATCH /community/comments/${id} ${res.status}`);
}

export async function deleteComment(id: string): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/community/comments/${encodeURIComponent(id)}`,
    withCredentials({ method: 'DELETE' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`DELETE /community/comments/${id} ${res.status}`);
}

// TranslateLang 타입은 PostDetailPage에서 translateLang state 선언에 사용.
// 번역 API 호출은 apps/web/src/lib/api/translate.ts의 translatePostContent를 사용한다.
export type TranslateLang = 'en' | 'vi' | 'zh' | 'ja' | 'fr';
