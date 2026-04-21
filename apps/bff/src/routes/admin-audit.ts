import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';

/**
 * 관리자 — approval_logs 감사 로그 조회 (A_700c).
 *
 * 이벤트 승인/보완/반려 결정의 감사 기록. eventId·adminId·action 으로 필터.
 * 업로더 승급 로그는 별도 테이블이 없어 현재는 event 결정만 보여준다(후속 ADR).
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
