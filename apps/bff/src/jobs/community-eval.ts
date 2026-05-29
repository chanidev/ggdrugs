import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { listPosts, getPostDetail, createPost } from '../routes/posts.js';

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

  // CASE create: 게시글 작성 → 201 + postId 반환
  let createdPostId = '';
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
      data: { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    return f;
  });

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id}${r.failures.length ? ' :: ' + r.failures.join('; ') : ''}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}
void main();
