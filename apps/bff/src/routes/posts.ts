import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

const CATEGORIES = new Set(['festival_story', 'mate_finder', 'free']);
export const POST_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d (GG-POST-010)

// 댓글 트리 노드 — 명시 interface 로 self-referential 추론(ts7022) 회피.
export interface CommentNodeOut {
  commentId: string;
  parentCommentId: string | null;
  authorUserId: string;
  authorNickname: string;
  body: string;
  createdAt: string;
  isMine: boolean;
  replies: CommentNodeOut[];
}

// posts.ts 전용 private 헬퍼 (bookmarks.ts 의 parseIntClamp 는 export 안 되어 있어 재사용 불가 → 자체 정의).
function parseIntClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
function parseBigId(raw: unknown): bigint | null {
  const s = typeof raw === 'string' ? raw : '';
  try { const n = BigInt(s); return n > 0n ? n : null; } catch { return null; }
}

/** GET /community/posts?category=&page=&limit= — 만료 전 게시글 목록 (GG-COMM-004). category 생략=전체. */
export async function listPosts(req: Request, res: Response) {
  const cat = typeof req.query.category === 'string' ? req.query.category : '';
  if (cat && !CATEGORIES.has(cat)) { res.status(400).json({ error: 'invalid category' }); return; }
  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  const limit = parseIntClamp(req.query.limit, 20, 1, 100);

  const where: Prisma.PostWhereInput = {
    isDeleted: false,
    expiresAt: { gt: new Date() }, // GG-POST-010 만료 비노출
    ...(cat ? { category: cat } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { postId: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        postId: true, category: true, title: true, likeCount: true,
        commentCount: true, createdAt: true,
        user: { select: { nickname: true } },
      },
    }),
  ]);

  res.json({
    page, limit, total,
    items: rows.map((p) => ({
      postId: p.postId.toString(),
      category: p.category,
      title: p.title,
      authorNickname: p.user.nickname,
      commentCount: p.commentCount,
      likeCount: p.likeCount,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}

/** GET /community/posts/:id — 상세 + 댓글/대댓글 트리 (GG-POST-001/005). resolveAuth 로 liked/isMine. */
export async function getPostDetail(req: Request, res: Response) {
  const postId = parseBigId(req.params.id);
  if (!postId) { res.status(400).json({ error: 'invalid id' }); return; }
  const auth = (req as AuthenticatedRequest).auth as AuthenticatedRequest['auth'] | undefined;

  const post = await prisma.post.findFirst({
    where: { postId, isDeleted: false, expiresAt: { gt: new Date() } },
    select: {
      postId: true, category: true, title: true, body: true, likeCount: true,
      commentCount: true, createdAt: true, userId: true,
      user: { select: { nickname: true } },
      comments: {
        where: { isDeleted: false },
        orderBy: [{ createdAt: 'asc' }, { commentId: 'asc' }],
        select: {
          commentId: true, parentCommentId: true, body: true, createdAt: true,
          userId: true, user: { select: { nickname: true } },
        },
      },
    },
  });
  if (!post) { res.status(404).json({ error: 'not found' }); return; }

  const liked = auth
    ? (await prisma.postLike.count({ where: { postId, userId: auth.userId } })) > 0
    : false;

  // 댓글 트리 구성 (대댓글 1단계). 반환 타입 명시(CommentNodeOut).
  type Flat = (typeof post.comments)[number];
  const toNode = (c: Flat): CommentNodeOut => ({
    commentId: c.commentId.toString(),
    parentCommentId: c.parentCommentId ? c.parentCommentId.toString() : null,
    authorUserId: c.userId.toString(),
    authorNickname: c.user.nickname,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    isMine: auth ? c.userId === auth.userId : false,
    replies: [],
  });
  const byId = new Map<string, CommentNodeOut>();
  const roots: CommentNodeOut[] = [];
  for (const c of post.comments) byId.set(c.commentId.toString(), toNode(c));
  for (const c of post.comments) {
    const node = byId.get(c.commentId.toString())!;
    if (c.parentCommentId && byId.has(c.parentCommentId.toString())) {
      byId.get(c.parentCommentId.toString())!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  res.json({
    postId: post.postId.toString(),
    category: post.category,
    title: post.title,
    body: post.body,
    authorUserId: post.userId.toString(),
    authorNickname: post.user.nickname,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    liked,
    isMine: auth ? post.userId === auth.userId : false,
    createdAt: post.createdAt.toISOString(),
    comments: roots,
  });
}

/** POST /community/posts/:id/comments — 댓글/대댓글 (requireAuth). 대댓글 depth 1 강제(GG-POST-003). */
export async function createComment(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }
  const postId = parseBigId(req.params.id);
  if (!postId) { res.status(400).json({ error: 'invalid id' }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (text.length < 1 || text.length > 1000) { res.status(400).json({ error: 'body 는 1~1000자' }); return; }

  const parentRaw = body.parentCommentId;
  let parentCommentId: bigint | null = null;
  if (parentRaw !== undefined && parentRaw !== null && parentRaw !== '') {
    parentCommentId = parseBigId(parentRaw);
    if (!parentCommentId) { res.status(400).json({ error: 'invalid parentCommentId' }); return; }
  }

  // post 존재 확인 + 댓글 생성 + commentCount 갱신 — 모두 하나의 트랜잭션 안에서 실행.
  // (post 존재 체크를 트랜잭션 밖에서 먼저 수행하면 체크 후 expiresAt 경과/soft-delete 가
  //  발생하는 race window 가 생기므로, tx 안으로 이동하여 단일 직렬화 단위로 처리한다.)
  let earlyErr: { status: number; body: object } | null = null;

  const created = await prisma.$transaction(async (tx) => {
    const post = await tx.post.findFirst({
      where: { postId, isDeleted: false, expiresAt: { gt: new Date() } },
      select: { postId: true },
    });
    if (!post) { earlyErr = { status: 404, body: { error: 'post not found' } }; return null; }

    if (parentCommentId !== null) {
      // postId 동봉 — 부모가 같은 게시글 소속이 아니면 404 (cross-post parent 방어).
      const parent = await tx.comment.findFirst({
        where: { commentId: parentCommentId, postId, isDeleted: false },
        select: { parentCommentId: true },
      });
      if (!parent) { earlyErr = { status: 404, body: { error: 'parent comment not found' } }; return null; }
      // depth 1 강제 — 대댓글에 답글 불가 (GG-POST-003). 요청 형식은 유효하나 도메인 규칙 위반 → 422.
      if (parent.parentCommentId !== null) {
        earlyErr = { status: 422, body: { error: 'reply_to_reply_not_allowed' } };
        return null;
      }
    }

    const c = await tx.comment.create({
      data: { postId, userId: auth.userId, parentCommentId, body: text },
      select: { commentId: true, parentCommentId: true, body: true, createdAt: true },
    });
    const count = await tx.comment.count({ where: { postId, isDeleted: false } });
    await tx.post.update({ where: { postId }, data: { commentCount: count } });
    return c;
  });

  if (earlyErr) {
    const { status, body } = earlyErr as { status: number; body: object };
    res.status(status).json(body);
    return;
  }
  if (!created) { res.status(500).json({ error: 'internal error' }); return; }

  res.status(201).json({
    commentId: created.commentId.toString(),
    parentCommentId: created.parentCommentId ? created.parentCommentId.toString() : null,
    authorUserId: auth.userId.toString(),
    authorNickname: auth.nickname,
    body: created.body,
    createdAt: created.createdAt.toISOString(),
    isMine: true,
    replies: [],
  });
}

/** PATCH /community/comments/:id — 본인 댓글 수정 (GG-POST-006). */
export async function updateComment(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }
  const commentId = parseBigId(req.params.id);
  if (!commentId) { res.status(400).json({ error: 'invalid id' }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (text.length < 1 || text.length > 1000) { res.status(400).json({ error: 'body 는 1~1000자' }); return; }

  const existing = await prisma.comment.findUnique({
    where: { commentId },
    select: { commentId: true, userId: true, isDeleted: true },
  });
  if (!existing || existing.isDeleted) { res.status(404).json({ error: 'comment not found' }); return; }
  if (existing.userId !== auth.userId) { res.status(403).json({ error: 'forbidden' }); return; }

  const updated = await prisma.comment.update({
    where: { commentId },
    data: { body: text },
    select: { commentId: true, body: true, updatedAt: true },
  });
  res.json({ commentId: updated.commentId.toString(), body: updated.body, updatedAt: updated.updatedAt.toISOString() });
}

/** DELETE /community/comments/:id — 본인 댓글 soft-delete (GG-POST-007). commentCount 재계산. */
export async function deleteComment(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }
  const commentId = parseBigId(req.params.id);
  if (!commentId) { res.status(400).json({ error: 'invalid id' }); return; }

  const existing = await prisma.comment.findUnique({
    where: { commentId },
    select: { commentId: true, userId: true, postId: true, isDeleted: true },
  });
  if (!existing || existing.isDeleted) { res.status(404).json({ error: 'comment not found' }); return; }
  if (existing.userId !== auth.userId) { res.status(403).json({ error: 'forbidden' }); return; }

  await prisma.$transaction(async (tx) => {
    await tx.comment.update({ where: { commentId }, data: { isDeleted: true, deletedAt: new Date() } });
    const count = await tx.comment.count({ where: { postId: existing.postId, isDeleted: false } });
    await tx.post.update({ where: { postId: existing.postId }, data: { commentCount: count } });
  });
  res.json({ ok: true });
}

/** POST /community/posts — 글쓰기 (requireAuth). expiresAt = now + 7d. */
export async function createPost(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const category = typeof body.category === 'string' ? body.category : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';

  if (!CATEGORIES.has(category)) { res.status(400).json({ error: 'invalid category' }); return; }
  if (title.length < 2 || title.length > 200) { res.status(400).json({ error: 'title 은 2~200자' }); return; }
  if (text.length < 2 || text.length > 5000) { res.status(400).json({ error: 'body 는 2~5000자' }); return; }

  const created = await prisma.post.create({
    data: {
      userId: auth.userId, category, title, body: text,
      expiresAt: new Date(Date.now() + POST_TTL_MS),
    },
    select: { postId: true, category: true, title: true, body: true, createdAt: true },
  });

  res.status(201).json({
    postId: created.postId.toString(),
    category: created.category,
    title: created.title,
    body: created.body,
    authorNickname: auth.nickname,
    likeCount: 0,
    commentCount: 0,
    createdAt: created.createdAt.toISOString(),
  });
}
