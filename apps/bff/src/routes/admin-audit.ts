import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';

/**
 * 관리자 — 감사 로그 조회 (A_700 Audit 탭).
 *
 *   GET /admin/audit-logs        — approval_logs (이벤트 심사) 페이지네이션
 *   GET /admin/admin-audit-logs  — admin_audit_logs (admin 보안·운영 액션) 페이지네이션
 *
 * 두 테이블이 분리된 이유: approval_logs 는 event_id NOT NULL FK (이벤트 심사 전용).
 * admin_audit_logs 는 user/세션/권한 등 event 무관 액션 — ADR 0004 D-6 / ADR 0005.
 * UI 의 source filter (이벤트 / admin / 전체) 가 두 endpoint 를 분기 호출.
 */

function parseIntClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function parseBigIntQuery(raw: unknown): bigint | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const n = BigInt(raw);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

const ALLOWED_ACTIONS = new Set(['approved', 'revision_requested', 'rejected']);

/**
 * GET /admin/audit-logs
 *
 * query:
 *   eventId, adminId — 선택 필터
 *   action           — approved | revision_requested | rejected | any
 *   page, limit
 */
export async function listAdminAuditLogs(req: Request, res: Response) {
  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  const limit = parseIntClamp(req.query.limit, 50, 1, 200);

  const where: Prisma.ApprovalLogWhereInput = {};
  const eventId = parseBigIntQuery(req.query.eventId);
  if (eventId) where.eventId = eventId;
  const adminId = parseBigIntQuery(req.query.adminId);
  if (adminId) where.adminId = adminId;
  const actionRaw = typeof req.query.action === 'string' ? req.query.action : 'any';
  if (actionRaw !== 'any' && ALLOWED_ACTIONS.has(actionRaw)) {
    where.action = actionRaw;
  }

  const [total, rows, breakdown] = await Promise.all([
    prisma.approvalLog.count({ where }),
    prisma.approvalLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { logId: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        logId: true,
        eventId: true,
        adminId: true,
        action: true,
        reason: true,
        createdAt: true,
        event: {
          select: {
            title: true,
            approvalStatus: true,
            isDeleted: true,
            uploader: { select: { organizationName: true } },
          },
        },
        admin: { select: { nickname: true } },
      },
    }),
    prisma.approvalLog.groupBy({
      by: ['action'],
      _count: { _all: true },
    }),
  ]);

  const byAction: Record<string, number> = { approved: 0, revision_requested: 0, rejected: 0 };
  for (const row of breakdown) byAction[row.action] = row._count._all;

  res.json({
    page,
    limit,
    total,
    byAction,
    items: rows.map((r) => ({
      logId: r.logId.toString(),
      eventId: r.eventId.toString(),
      eventTitle: r.event?.title ?? '(삭제된 이벤트)',
      eventAvailable: !!r.event && !r.event.isDeleted,
      eventCurrentStatus: r.event?.approvalStatus ?? null,
      organizationName: r.event?.uploader?.organizationName ?? null,
      adminId: r.adminId.toString(),
      adminNickname: r.admin?.nickname ?? '(관리자)',
      action: r.action,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

// =============================================================
// ADR 0005 후속: admin_audit_logs (admin 보안·운영 액션) 조회.
// =============================================================

const ADMIN_AUDIT_ACTIONS = new Set([
  'revoke_sessions',
  'admin_promote',
  'admin_demote',
  'admin_scope_change',
  'user_soft_delete',
  'uploader_decision',
]);

/**
 * GET /admin/admin-audit-logs
 *
 * query:
 *   action         — revoke_sessions | admin_promote | ... | any
 *   adminId        — 행위자 user_id 필터 (선택)
 *   targetUserId   — 대상 user_id 필터 (선택). target_id IS NOT NULL 행만.
 *   page, limit
 *
 * 응답: items[].targetNickname 동봉 (target_id 가 user_id 가정 — admin 액션 모두 user 대상).
 */
export async function listAdminAuditAdminLogs(req: Request, res: Response) {
  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  const limit = parseIntClamp(req.query.limit, 50, 1, 200);

  const where: Prisma.AdminAuditLogWhereInput = {};
  const actionRaw = typeof req.query.action === 'string' ? req.query.action : 'any';
  if (actionRaw !== 'any' && ADMIN_AUDIT_ACTIONS.has(actionRaw)) {
    where.action = actionRaw;
  }
  const adminId = parseBigIntQuery(req.query.adminId);
  if (adminId) where.adminId = adminId;
  const targetUserId = parseBigIntQuery(req.query.targetUserId);
  if (targetUserId) where.targetId = targetUserId;

  const [total, rows, breakdown] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { auditId: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        auditId: true,
        adminId: true,
        action: true,
        targetId: true,
        payload: true,
        createdAt: true,
        admin: { select: { nickname: true } },
      },
    }),
    prisma.adminAuditLog.groupBy({
      by: ['action'],
      _count: { _all: true },
    }),
  ]);

  // target_id 가 nullable BIGINT user_id — 한 번에 batch lookup 으로 nickname 채움.
  const targetIds = Array.from(
    new Set(rows.map((r) => r.targetId).filter((x): x is bigint => x !== null)),
  );
  const targetUsers = targetIds.length
    ? await prisma.user.findMany({
        where: { userId: { in: targetIds } },
        select: { userId: true, nickname: true, isDeleted: true },
      })
    : [];
  const targetMap = new Map(
    targetUsers.map((u) => [u.userId.toString(), { nickname: u.nickname, isDeleted: u.isDeleted }]),
  );

  const byAction: Record<string, number> = {
    revoke_sessions: 0,
    admin_promote: 0,
    admin_demote: 0,
    admin_scope_change: 0,
    user_soft_delete: 0,
    uploader_decision: 0,
  };
  for (const row of breakdown) byAction[row.action] = row._count._all;

  res.json({
    page,
    limit,
    total,
    byAction,
    items: rows.map((r) => {
      const t = r.targetId ? targetMap.get(r.targetId.toString()) ?? null : null;
      return {
        auditId: r.auditId.toString(),
        adminId: r.adminId.toString(),
        adminNickname: r.admin?.nickname ?? '(관리자)',
        action: r.action,
        targetId: r.targetId?.toString() ?? null,
        targetNickname: t?.nickname ?? null,
        targetDeleted: t?.isDeleted ?? null,
        payload: r.payload,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  });
}
