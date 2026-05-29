import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { listPosts, getPostDetail, createPost, updatePost, deletePost, toggleLike, createComment, updateComment, deleteComment, POST_TTL_MS } from '../routes/posts.js';

interface MockReq { params?: Record<string, string>; query?: Record<string, string>; body?: unknown; auth?: { userId: bigint; nickname: string; activeRole: string }; }
interface Captured { status: number; json: unknown; }

function mockRes(): Response & { _c: Captured } {
  const c: Captured = { status: 200, json: undefined };
  const res = {
    _c: c,
    status(s: number) { c.status = s; return this; },
    json(b: unknown) { c.json = b; return this; },
  } as unknown as Response & { _c: Captured };
  return res;
}
function mockReq(r: MockReq): Request {
  return { params: r.params ?? {}, query: r.query ?? {}, body: r.body ?? {}, auth: r.auth } as unknown as Request;
}

interface CaseResult { id: string; pass: boolean; failures: string[]; }
const results: CaseResult[] = [];
function check(id: string, fn: () => Promise<string[]>) {
  return fn().then((failures) => results.push({ id, pass: failures.length === 0, failures }))
    .catch((e) => results.push({ id, pass: false, failures: [`threw: ${String(e)}`] }));
}

async function main() {
  // 시드: 테스트 유저 1명 (실 세션 불요 — auth 객체를 직접 주입).
  const u = await prisma.user.findFirst({ where: { isDeleted: false }, select: { userId: true, nickname: true, activeRole: true } });
  if (!u) { console.error('no user to test with'); process.exit(1); }
  const auth = { userId: u.userId, nickname: u.nickname, activeRole: u.activeRole };

  let createdPostId = '';
  try {
    // CASE create: 게시글 작성 → 201 + postId 반환
    await check('post.create.ok', async () => {
      const res = mockRes();
      await createPost(mockReq({ auth, body: { category: 'free', title: 'eval 제목', body: 'eval 본문입니다' } }), res);
      const f: string[] = [];
      if (res._c.status !== 201) f.push(`status ${res._c.status} != 201`);
      const b = res._c.json as { postId?: string };
      if (!b?.postId) f.push('no postId'); else createdPostId = b.postId;
      return f;
    });

    // CASE create invalid category → 400
    await check('post.create.bad_category', async () => {
      const res = mockRes();
      await createPost(mockReq({ auth, body: { category: 'nope', title: 'xx', body: 'yyy' } }), res);
      return res._c.status === 400 ? [] : [`status ${res._c.status} != 400`];
    });

    // CASE list: free 카테고리에 방금 글 + 페이지네이션 필드 검증
    await check('post.list.free', async () => {
      const res = mockRes();
      await listPosts(mockReq({ query: { category: 'free' } }), res);
      const b = res._c.json as { items?: Array<{ postId: string }>; page?: number; limit?: number; total?: number };
      const f: string[] = [];
      if (!b?.items?.some((i) => i.postId === createdPostId)) f.push('created post not in list');
      if (!b?.page || !b?.limit || b?.total === undefined) f.push('missing pagination fields');
      return f;
    });

    // CASE detail: 작성자 본인 → isMine true, liked false
    await check('post.detail.isMine', async () => {
      const res = mockRes();
      await getPostDetail(mockReq({ params: { id: createdPostId }, auth }), res);
      const b = res._c.json as { isMine?: boolean; liked?: boolean };
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status}`);
      if (b?.isMine !== true) f.push('isMine != true');
      if (b?.liked !== false) f.push('liked != false');
      return f;
    });

    // CASE detail 404 (없는 id)
    await check('post.detail.404', async () => {
      const res = mockRes();
      await getPostDetail(mockReq({ params: { id: '999999999' } }), res);
      return res._c.status === 404 ? [] : [`status ${res._c.status} != 404`];
    });

    // CASE 만료 비노출 (GG-POST-010/011/012): expires_at 를 과거로 직접 갱신 →
    //   목록 미포함 + 상세 404 (→ 종속 댓글/대댓글도 동반 비노출).
    await check('post.expired.hidden', async () => {
      const f: string[] = [];
      await prisma.post.update({
        where: { postId: BigInt(createdPostId) },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      const rl = mockRes();
      await listPosts(mockReq({ query: { category: 'free' } }), rl);
      const lb = rl._c.json as { items?: Array<{ postId: string }> };
      if (lb?.items?.some((i) => i.postId === createdPostId)) f.push('expired post still in list');
      const rd = mockRes();
      await getPostDetail(mockReq({ params: { id: createdPostId }, auth }), rd);
      if (rd._c.status !== 404) f.push(`expired detail ${rd._c.status} != 404`);
      // 후속 댓글 케이스를 위해 만료 복구.
      await prisma.post.update({
        where: { postId: BigInt(createdPostId) },
        data: { expiresAt: new Date(Date.now() + POST_TTL_MS) },
      });
      return f;
    });
    // CASE comment: 작성 → 201, root parent null
    let rootCommentId = '';
    await check('comment.create.ok', async () => {
      const res = mockRes();
      await createComment(mockReq({ params: { id: createdPostId }, auth, body: { body: '댓글 본문' } }), res);
      const b = res._c.json as { commentId?: string; parentCommentId?: string | null };
      const f: string[] = [];
      if (res._c.status !== 201) f.push(`status ${res._c.status}`);
      if (!b?.commentId) f.push('no commentId'); else rootCommentId = b.commentId;
      if (b?.parentCommentId !== null) f.push('root parent must be null');
      return f;
    });

    // CASE commentCount: 댓글 작성 후 게시글 상세의 commentCount 가 1로 갱신됐는지 별도 확인.
    await check('comment.create.commentCount', async () => {
      const rg = mockRes();
      await getPostDetail(mockReq({ params: { id: createdPostId }, auth }), rg);
      const gb = rg._c.json as { commentCount?: number };
      return gb?.commentCount === 1 ? [] : [`commentCount ${gb?.commentCount} != 1`];
    });

    // CASE comment update: 본인 댓글 수정 → 200 + 수정된 body/updatedAt 반환 (GG-POST-006)
    await check('comment.update.ok', async () => {
      const res = mockRes();
      await updateComment(mockReq({ params: { id: rootCommentId }, auth, body: { body: '수정된 댓글' } }), res);
      const b = res._c.json as { commentId?: string; body?: string; updatedAt?: string };
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status}`);
      if (b?.body !== '수정된 댓글') f.push(`body "${b?.body}" != "수정된 댓글"`);
      if (!b?.updatedAt) f.push('no updatedAt');
      return f;
    });

    // CASE comment update forbidden: 다른 userId → 403 (GG-POST-006)
    await check('comment.update.forbidden', async () => {
      const otherAuth = { userId: auth.userId + 1n, nickname: 'other', activeRole: 'user' };
      const res = mockRes();
      await updateComment(mockReq({ params: { id: rootCommentId }, auth: otherAuth, body: { body: '탈취 시도' } }), res);
      return res._c.status === 403 ? [] : [`status ${res._c.status} != 403`];
    });

    // CASE reply: 대댓글 1단계 OK
    let replyId = '';
    await check('comment.reply.ok', async () => {
      const res = mockRes();
      await createComment(mockReq({ params: { id: createdPostId }, auth, body: { body: '대댓글', parentCommentId: rootCommentId } }), res);
      const b = res._c.json as { commentId?: string; parentCommentId?: string | null };
      if (b?.commentId) replyId = b.commentId;
      return b?.parentCommentId === rootCommentId ? [] : ['reply parent mismatch'];
    });

    // CASE reply-to-reply: depth 2 금지 → 422 (GG-POST-003)
    await check('comment.reply.depth2_blocked', async () => {
      const res = mockRes();
      await createComment(mockReq({ params: { id: createdPostId }, auth, body: { body: 'x', parentCommentId: replyId } }), res);
      return res._c.status === 422 ? [] : [`status ${res._c.status} != 422`];
    });

    // CASE comment delete: 본인 → soft-delete 성공(200) + 상세 트리에서 제외
    await check('comment.delete.excluded', async () => {
      const rd = mockRes();
      await deleteComment(mockReq({ params: { id: replyId }, auth }), rd);
      const f: string[] = [];
      if (rd._c.status !== 200) f.push(`delete status ${rd._c.status}`);
      // 게시글은 soft-delete 자식이 있어도 생존 → detail 200, 단 삭제된 대댓글은 트리에서 빠짐.
      const rg = mockRes();
      await getPostDetail(mockReq({ params: { id: createdPostId }, auth }), rg);
      const gb = rg._c.json as { comments?: Array<{ commentId: string; replies: Array<{ commentId: string }> }> };
      const stillThere = gb?.comments?.some((c) => c.replies.some((r) => r.commentId === replyId));
      if (stillThere) f.push('deleted reply still in tree');
      return f;
    });
    // CASE post update: 본인 → 200
    await check('post.update.ok', async () => {
      const res = mockRes();
      await updatePost(mockReq({ params: { id: createdPostId }, auth, body: { title: '수정된 제목', body: '수정된 본문' } }), res);
      return res._c.status === 200 ? [] : [`status ${res._c.status}`];
    });

    // CASE like toggle: on(liked true, count 1) → off(liked false, count 0)
    await check('post.like.toggle', async () => {
      const r1 = mockRes();
      await toggleLike(mockReq({ params: { id: createdPostId }, auth }), r1);
      const b1 = r1._c.json as { liked?: boolean; likeCount?: number };
      const r2 = mockRes();
      await toggleLike(mockReq({ params: { id: createdPostId }, auth }), r2);
      const b2 = r2._c.json as { liked?: boolean; likeCount?: number };
      const f: string[] = [];
      if (b1?.liked !== true || b1?.likeCount !== 1) f.push(`first toggle ${JSON.stringify(b1)}`);
      if (b2?.liked !== false || b2?.likeCount !== 0) f.push(`second toggle ${JSON.stringify(b2)}`);
      return f;
    });

    // CASE post delete: 본인 → soft-delete, 이후 detail 404
    await check('post.delete.then404', async () => {
      const rd = mockRes();
      await deletePost(mockReq({ params: { id: createdPostId }, auth }), rd);
      const rg = mockRes();
      await getPostDetail(mockReq({ params: { id: createdPostId }, auth }), rg);
      const f: string[] = [];
      if (rd._c.status !== 200) f.push(`delete status ${rd._c.status}`);
      if (rg._c.status !== 404) f.push(`after-delete detail ${rg._c.status} != 404`);
      return f;
    });
  } finally {
    // 테스트 픽스처 정리 — 반복 실행 시 DB 오염 방지.
    if (createdPostId) {
      await prisma.post.delete({ where: { postId: BigInt(createdPostId) } }).catch(() => { /* 이미 없으면 무시 */ });
    }
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id}${r.failures.length ? ' :: ' + r.failures.join('; ') : ''}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}
void main();
