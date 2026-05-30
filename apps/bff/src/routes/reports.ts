/**
 * reports.ts — 신고 접수 라우트 (GG-REPORT-001~003, GG-REPORT-008)
 *
 * POST /community/reports           — createReport  (신고 접수, 4 surface)
 * GET  /me/reports                  — listMyReports (내가 제출한 신고 목록)
 * POST /community/users/:targetUserId/block — blockUser (일반 차단, GG-REPORT-008)
 *
 * 채팅방 차단(blockMember)은 chat-room.ts 에 별도 유지.
 * blockUser 는 GroupMembership 변경 없이 Block.create 만 수행.
 */

import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

// ─── 상수 ────────────────────────────────────────────────────────────────────

const TARGET_TYPES = new Set(['post', 'comment', 'chat_message', 'mate_eval']);
const REASONS = new Set(['spam', 'abuse', 'harassment', 'obscene', 'no_show', 'etc']);

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function parseIntClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function parseBigId(raw: unknown): bigint | null {
  const s = typeof raw === 'string' ? raw : '';
  try {
    const n = BigInt(s);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

// ─── targetEntityId 존재 확인 + 소유자 교차 검증 ────────────────────────────
//
// 악의적 신고 방지: 게시글/댓글/메시지/평가의 실제 작성자가 targetUserId와
// 일치하는지 확인. 불일치 시 400 반환 (null 반환 신호).
//
// 반환값: 'ok' | 'not_found' | 'owner_mismatch'

async function checkTargetEntityWithOwner(
  targetType: string,
  targetEntityId: bigint,
  targetUserId: bigint,
): Promise<'ok' | 'not_found' | 'owner_mismatch'> {
  switch (targetType) {
    case 'post': {
      const post = await prisma.post.findFirst({
        where: { postId: targetEntityId, isDeleted: false },
        select: { userId: true },
      });
      if (!post) return 'not_found';
      if (BigInt(post.userId) !== BigInt(targetUserId)) return 'owner_mismatch';
      return 'ok';
    }
    case 'comment': {
      const comment = await prisma.comment.findFirst({
        where: { commentId: targetEntityId, isDeleted: false },
        select: { userId: true },
      });
      if (!comment) return 'not_found';
      if (BigInt(comment.userId) !== BigInt(targetUserId)) return 'owner_mismatch';
      return 'ok';
    }
    case 'chat_message': {
      const msg = await prisma.chatRoomMessage.findFirst({
        where: { messageId: targetEntityId },
        select: { senderUserId: true },
      });
      if (!msg) return 'not_found';
      // 시스템 메시지(senderUserId=null)는 신고 불가
      if (msg.senderUserId === null) return 'owner_mismatch';
      if (BigInt(msg.senderUserId) !== BigInt(targetUserId)) return 'owner_mismatch';
      return 'ok';
    }
    case 'mate_eval': {
      const ev = await prisma.mateEvaluation.findFirst({
        where: { evalId: targetEntityId },
        select: { evaluatorUserId: true },
      });
      if (!ev) return 'not_found';
      if (BigInt(ev.evaluatorUserId) !== BigInt(targetUserId)) return 'owner_mismatch';
      return 'ok';
    }
    default:
      return 'not_found';
  }
}

// ─── POST /community/reports ─────────────────────────────────────────────────

/**
 * createReport — 신고 접수 (GG-REPORT-001~003)
 *
 * surface: post / comment / chat_message / mate_eval
 * 중복 방지: (reporterId, targetType, targetEntityId) + status IN ('pending','reviewed') → 409
 * dismissed 후 재신고 허용.
 */
export async function createReport(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  // 1. 입력 검증
  const targetUserId = parseBigId(body.targetUserId);
  if (!targetUserId) {
    res.status(400).json({ error: 'invalid targetUserId' });
    return;
  }

  // 자기 자신 신고 방지 — 명시적 BigInt 변환으로 런타임 타입 안전 보장
  if (BigInt(targetUserId) === BigInt(auth.userId)) {
    res.status(400).json({ error: 'cannot_report_self' });
    return;
  }

  const targetType = typeof body.targetType === 'string' ? body.targetType : '';
  if (!TARGET_TYPES.has(targetType)) {
    res.status(400).json({ error: 'invalid targetType', allowed: [...TARGET_TYPES] });
    return;
  }

  const targetEntityId = parseBigId(body.targetEntityId);
  if (!targetEntityId) {
    res.status(400).json({ error: 'invalid targetEntityId' });
    return;
  }

  const reason = typeof body.reason === 'string' ? body.reason : '';
  if (!REASONS.has(reason)) {
    res.status(400).json({ error: 'invalid reason', allowed: [...REASONS] });
    return;
  }

  const detail = typeof body.detail === 'string' ? body.detail.trim() : undefined;
  if (detail !== undefined && detail.length > 500) {
    res.status(400).json({ error: 'detail too long (max 500 chars)' });
    return;
  }

  // 2. targetUser 존재 확인
  const targetUser = await prisma.user.findFirst({
    where: { userId: targetUserId, isDeleted: false },
    select: { userId: true },
  });
  if (!targetUser) {
    res.status(404).json({ error: 'target_user_not_found' });
    return;
  }

  // 3. targetEntityId 존재 확인 + 소유자 교차 검증 (악의적 신고 방지)
  const entityCheck = await checkTargetEntityWithOwner(targetType, targetEntityId, targetUserId);
  if (entityCheck === 'not_found') {
    res.status(404).json({ error: 'target_entity_not_found' });
    return;
  }
  if (entityCheck === 'owner_mismatch') {
    res.status(400).json({ error: 'target_entity_owner_mismatch' });
    return;
  }

  // 4. 중복 신고 방지 (pending|reviewed 상태만 — dismissed 후 재신고 허용)
  const duplicate = await prisma.report.findFirst({
    where: {
      reporterId: auth.userId,
      targetType,
      targetEntityId,
      status: { in: ['pending', 'reviewed'] },
    },
    select: { reportId: true },
  });
  if (duplicate) {
    res.status(409).json({ error: 'already_reported' });
    return;
  }

  // 5. 신고 생성
  const report = await prisma.report.create({
    data: {
      reporterId: auth.userId,
      targetUserId,
      targetType,
      targetEntityId,
      reason,
      detail: detail ?? null,
    },
    select: { reportId: true },
  });

  res.status(201).json({ reportId: report.reportId.toString() });
}

// ─── GET /me/reports ─────────────────────────────────────────────────────────

/**
 * listMyReports — 내가 제출한 신고 목록
 */
export async function listMyReports(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  const limit = parseIntClamp(req.query.limit, 20, 1, 100);
  const statusRaw = typeof req.query.status === 'string' ? req.query.status : 'any';

  const where = {
    reporterId: auth.userId,
    ...(statusRaw !== 'any' && ['pending', 'reviewed', 'dismissed'].includes(statusRaw)
      ? { status: statusRaw }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { reportId: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        reportId: true,
        targetUserId: true,
        targetType: true,
        targetEntityId: true,
        reason: true,
        detail: true,
        status: true,
        adminAction: true,
        adminNote: true,
        createdAt: true,
        reviewedAt: true,
        targetUser: { select: { nickname: true } },
      },
    }),
  ]);

  res.json({
    page,
    limit,
    total,
    items: rows.map((r) => ({
      reportId: r.reportId.toString(),
      targetUserId: r.targetUserId.toString(),
      targetUserNickname: r.targetUser.nickname,
      targetType: r.targetType,
      targetEntityId: r.targetEntityId.toString(),
      reason: r.reason,
      detail: r.detail,
      status: r.status,
      adminAction: r.adminAction,
      adminNote: r.adminNote,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
  });
}

// ─── POST /community/users/:targetUserId/block ───────────────────────────────

/**
 * blockUser — 일반 차단 API (GG-REPORT-008)
 *
 * chatRoomId 없는 surface (게시글, 댓글 등) 에서 신고+차단 조합을 위한 엔드포인트.
 * Block.create 만 수행 — GroupMembership 변경 없음.
 * 기존 blockMember (chat-room.ts) 와 병존.
 */
export async function blockUser(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const targetUserId = parseBigId(req.params.targetUserId);
  if (!targetUserId) {
    res.status(400).json({ error: 'invalid targetUserId' });
    return;
  }

  // 자기 자신 차단 방지 — 명시적 BigInt 변환으로 런타임 타입 안전 보장
  if (BigInt(targetUserId) === BigInt(auth.userId)) {
    res.status(400).json({ error: 'cannot_block_self' });
    return;
  }

  // 대상 user 존재 확인
  const targetUser = await prisma.user.findFirst({
    where: { userId: targetUserId, isDeleted: false },
    select: { userId: true },
  });
  if (!targetUser) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }

  // 중복 차단 확인
  const existing = await prisma.block.findFirst({
    where: { blockerId: auth.userId, blockedUserId: targetUserId },
    select: { blockId: true },
  });
  if (existing) {
    res.status(409).json({ error: 'already_blocked' });
    return;
  }

  const block = await prisma.block.create({
    data: { blockerId: auth.userId, blockedUserId: targetUserId },
    select: { blockId: true },
  });

  res.status(201).json({ blockId: block.blockId.toString() });
}
