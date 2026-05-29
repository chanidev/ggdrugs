/**
 * posts.ts API 클라이언트 통합 테스트 (msw + vitest).
 *
 * VITE_BFF_URL=http://localhost (vite.config.ts test.env) → BFF_URL='http://localhost'
 *
 * 검증 항목:
 *  - fetchPosts: category 필터 → 올바른 쿼리스트링 구성
 *  - fetchPostDetail: 정상 응답 commentCount 포함 / 404 → NOT_FOUND 에러 매핑
 *  - createPost: 401 → UNAUTHENTICATED 에러 매핑
 *  - createComment: 422 → REPLY_TO_REPLY_NOT_ALLOWED 에러 매핑
 *  - updatePost: 401 → UNAUTHENTICATED, 403 → FORBIDDEN 에러 매핑
 *  - deletePost: 403 → FORBIDDEN 에러 매핑
 *  - togglePostLike: { liked, likeCount } 응답 shape 검증
 *  - signal threading: AbortSignal 전달 시 정상 동작
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import {
  fetchPosts,
  fetchPostDetail,
  createPost,
  createComment,
  updatePost,
  deletePost,
  togglePostLike,
  type PostListResponse,
  type PostDetail,
} from './posts.js';

// VITE_BFF_URL=http://localhost (vite.config.ts test.env 에서 주입).
const BASE = 'http://localhost';

// 마지막으로 캡처된 요청 URL (쿼리스트링 검증용).
let capturedUrl = '';

const server = setupServer(
  // GET /community/posts
  http.get(`${BASE}/community/posts`, ({ request }) => {
    capturedUrl = request.url;
    const body: PostListResponse = {
      page: 1,
      limit: 20,
      total: 1,
      items: [
        {
          postId: 'p1',
          category: 'free',
          title: '테스트 게시글',
          authorNickname: '작성자',
          commentCount: 0,
          likeCount: 0,
          createdAt: '2026-05-29T00:00:00.000Z',
        },
      ],
    };
    return HttpResponse.json(body);
  }),

  // GET /community/posts/post-ok — 정상 (commentCount 포함)
  http.get(`${BASE}/community/posts/post-ok`, () => {
    const body: PostDetail = {
      postId: 'post-ok',
      category: 'free',
      title: '제목',
      body: '본문',
      authorUserId: 'u1',
      authorNickname: '작성자',
      likeCount: 0,
      commentCount: 3,
      liked: false,
      isMine: true,
      createdAt: '2026-05-29T00:00:00.000Z',
      comments: [],
    };
    return HttpResponse.json(body);
  }),

  // GET /community/posts/not-found-id — 404
  http.get(`${BASE}/community/posts/not-found-id`, () => {
    return new HttpResponse(null, { status: 404 });
  }),

  // POST /community/posts — 401
  http.post(`${BASE}/community/posts`, () => {
    return new HttpResponse(null, { status: 401 });
  }),

  // POST /community/posts/post-ok/comments — 422
  http.post(`${BASE}/community/posts/post-ok/comments`, () => {
    return new HttpResponse(null, { status: 422 });
  }),

  // PATCH /community/posts/post-401 — 401
  http.patch(`${BASE}/community/posts/post-401`, () => {
    return new HttpResponse(null, { status: 401 });
  }),

  // PATCH /community/posts/post-403 — 403
  http.patch(`${BASE}/community/posts/post-403`, () => {
    return new HttpResponse(null, { status: 403 });
  }),

  // DELETE /community/posts/post-403 — 403
  http.delete(`${BASE}/community/posts/post-403`, () => {
    return new HttpResponse(null, { status: 403 });
  }),

  // POST /community/posts/post-ok/like — 정상 응답 { liked, likeCount }
  http.post(`${BASE}/community/posts/post-ok/like`, () => {
    return HttpResponse.json({ liked: true, likeCount: 1 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  capturedUrl = '';
});
afterAll(() => server.close());

describe('fetchPosts', () => {
  it('category 필터가 쿼리스트링으로 인코딩된다', async () => {
    await fetchPosts({ category: 'festival_story' });
    expect(capturedUrl).toContain('category=festival_story');
  });

  it('page/limit 이 쿼리스트링에 포함된다', async () => {
    await fetchPosts({ page: 2, limit: 10 });
    expect(capturedUrl).toContain('page=2');
    expect(capturedUrl).toContain('limit=10');
  });

  it('필터 없으면 쿼리스트링 없이 호출된다', async () => {
    await fetchPosts({});
    const url = new URL(capturedUrl);
    expect(url.search).toBe('');
  });

  it('정상 응답을 PostListResponse 형태로 반환한다', async () => {
    const result = await fetchPosts({});
    expect(result.page).toBe(1);
    expect(result.items[0]?.postId).toBe('p1');
  });

  it('AbortSignal 을 전달해도 정상 응답을 반환한다', async () => {
    const ctrl = new AbortController();
    const result = await fetchPosts({}, ctrl.signal);
    expect(result.items.length).toBe(1);
  });
});

describe('fetchPostDetail', () => {
  it('정상 응답에 commentCount 필드가 포함된다', async () => {
    const detail = await fetchPostDetail('post-ok');
    expect(detail.commentCount).toBe(3);
  });

  it('404 응답 → NOT_FOUND 에러를 던진다', async () => {
    await expect(fetchPostDetail('not-found-id')).rejects.toThrow('NOT_FOUND');
  });
});

describe('createPost', () => {
  it('401 응답 → UNAUTHENTICATED 에러를 던진다', async () => {
    await expect(
      createPost({ category: 'free', title: '제목', body: '본문입니다' }),
    ).rejects.toThrow('UNAUTHENTICATED');
  });
});

describe('createComment', () => {
  it('422 응답 → REPLY_TO_REPLY_NOT_ALLOWED 에러를 던진다', async () => {
    await expect(
      createComment('post-ok', { body: '대댓글', parentCommentId: 'some-reply' }),
    ).rejects.toThrow('REPLY_TO_REPLY_NOT_ALLOWED');
  });
});

describe('updatePost', () => {
  it('401 응답 → UNAUTHENTICATED 에러를 던진다', async () => {
    await expect(
      updatePost('post-401', { title: '수정제목', body: '수정본문' }),
    ).rejects.toThrow('UNAUTHENTICATED');
  });

  it('403 응답 → FORBIDDEN 에러를 던진다', async () => {
    await expect(
      updatePost('post-403', { title: '수정제목', body: '수정본문' }),
    ).rejects.toThrow('FORBIDDEN');
  });
});

describe('deletePost', () => {
  it('403 응답 → FORBIDDEN 에러를 던진다', async () => {
    await expect(deletePost('post-403')).rejects.toThrow('FORBIDDEN');
  });
});

describe('togglePostLike', () => {
  it('정상 응답 shape { liked: boolean, likeCount: number } 를 반환한다', async () => {
    const result = await togglePostLike('post-ok');
    expect(result).toHaveProperty('liked');
    expect(result).toHaveProperty('likeCount');
    expect(typeof result.liked).toBe('boolean');
    expect(typeof result.likeCount).toBe('number');
    expect(result.liked).toBe(true);
    expect(result.likeCount).toBe(1);
  });
});
