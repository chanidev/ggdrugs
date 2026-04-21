import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

/**
 * 관리자 — A_700 part 2 업로더 승급 심사 + 업로드 이벤트 심사.
 *
 *   GET  /admin/uploaders                                 — 목록(상태 필터)
 *   POST /admin/uploaders/:id/decision                    — 승인/보완요청/반려
 *   POST /admin/events/:id/decision                       — 업로드 이벤트 승인/보완/반려
 *
 * 승인 결정 액션: approved | revision_requested | rejected.
 * approval_logs 에는 이벤트 심사만 기록 (uploader 승급 로그는 테이블 미정의 — 후속).
 */

const DECISION_ACTIONS = new Set(['approved', 'revision_requested', 'rejected']);

function parseIntClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function parseBigIntParam(raw: unknown): bigint | null {
  if (typeof raw !== 'string') return null;
  try {
    const n = BigInt(raw);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

/** GET /admin/uploaders?status=pending */
export async function listAdminUploaders(req: Request, res: Response) {
  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  const limit = parseIntClamp(req.query.limit, 20, 1, 100);

  const statusRaw = typeof req.query.status === 'string' ? req.query.status : 'pending';
  const allowedStatus = new Set(['pending', 'approved', 'revision_requested', 'rejected', 'any']);
  const status = allowedStatus.has(statusRaw) ? statusRaw : 'pending';

  const where: Prisma.UploaderProfileWhereInput = {};
  if (status !== 'any') where.approvalStatus = status;

  const [total, rows, byStatus] = await Promise.all([
    prisma.uploaderProfile.count({ where }),
    prisma.uploaderProfile.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        uploaderId: true,
        organizationName: true,
        contactPhone: true,
        contactEmail: true,
        approvalStatus: true,
        approvedAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            userId: true,
            nickname: true,
            authProvider: true,
            activeRole: true,
          },
        },
      },
    }),
    prisma.uploaderProfile.groupBy({
      by: ['approvalStatus'],
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = {
    pending: 0,
    approved: 0,
    revision_requested: 0,
    rejected: 0,
  };
  for (const row of byStatus) counts[row.approvalStatus] = row._count._all;

  res.json({
    page,
    limit,
    total,
    byStatus: counts,
    items: rows.map((r) => ({
      uploaderId: r.uploaderId.toString(),
      organizationName: r.organizationName,
      contactPhone: r.contactPhone,
      contactEmail: r.contactEmail,
      approvalStatus: r.approvalStatus,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      user: {
        userId: r.user.userId.toString(),
        nickname: r.user.nickname,
        authProvider: r.user.authProvider,
        activeRole: r.user.activeRole,
      },
    })),
  });
}

/**
 * GET /admin/uploaders/:id — 프로파일 상세 + 이벤트 집계 + 최근 이벤트.
 *
 *  기본정보      uploader_profiles 행 + user
 *  eventStats    approval_status 별 카운트 (사용자가 올린 이벤트 규모 판단)
 *  recentEvents  최근 5개 이벤트 (title/status/phase/start·end/createdAt)
 *
 * 관리자가 승급 결정 내리기 전 "이 사람 뭘 올렸나" 근거 확인용.
 * 등록 이벤트 없어도 (처음 신청이면) 빈 값 반환.
 */
export async function getAdminUploader(req: Request, res: Response) {
  const uploaderId = parseBigIntParam(req.params.id);
  if (!uploaderId) {
    res.status(400).json({ error: 'invalid uploader id' });
    return;
  }

  const profile = await prisma.uploaderProfile.findUnique({
    where: { uploaderId },
    select: {
      uploaderId: true,
      organizationName: true,
      contactPhone: true,
      contactEmail: true,
      approvalStatus: true,
      approvedAt: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          userId: true,
          nickname: true,
          authProvider: true,
          activeRole: true,
          createdAt: true,
        },
      },
    },
  });
  if (!profile) {
    res.status(404).json({ error: 'uploader_not_found' });
    return;
  }

  const [statusRows, recentRows] = await Promise.all([
    prisma.event.groupBy({
      by: ['approvalStatus'],
      where: { uploaderId, isDeleted: false },
      _count: { _all: true },
    }),
    prisma.event.findMany({
      where: { uploaderId, isDeleted: false },
      orderBy: [{ createdAt: 'desc' }, { eventId: 'desc' }],
      take: 5,
      select: {
        eventId: true,
        title: true,
        approvalStatus: true,
        phase: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        category: { select: { displayName: true } },
      },
    }),
  ]);

  const eventStats: Record<string, number> = {
    pending: 0,
    approved: 0,
    revision_requested: 0,
    rejected: 0,
  };
  for (const row of statusRows) eventStats[row.approvalStatus] = row._count._all;

  res.json({
    uploader: {
      uploaderId: profile.uploaderId.toString(),
      organizationName: profile.organizationName,
      contactPhone: profile.contactPhone,
      contactEmail: profile.contactEmail,
      approvalStatus: profile.approvalStatus,
      approvedAt: profile.approvedAt?.toISOString() ?? null,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      user: {
        userId: profile.user.userId.toString(),
        nickname: profile.user.nickname,
        authProvider: profile.user.authProvider,
        activeRole: profile.user.activeRole,
        createdAt: profile.user.createdAt.toISOString(),
      },
    },
    eventStats,
    recentEvents: recentRows.map((r) => ({
      eventId: r.eventId.toString(),
      title: r.title,
      approvalStatus: r.approvalStatus,
      phase: r.phase,
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate.toISOString().slice(0, 10),
      createdAt: r.createdAt.toISOString(),
      categoryName: r.category.displayName,
    })),
  });
}

/**
 * POST /admin/uploaders/:id/decision
 * body: { action: 'approved'|'revision_requested'|'rejected', reason?: string }
 *
 * approved 로 전이 시 approvedAt=now. rejected/revision_requested 는 approvedAt null.
 */
export async function decideUploader(req: Request, res: Response) {
  const uploaderId = parseBigIntParam(req.params.id);
  if (!uploaderId) {
    res.status(400).json({ error: 'invalid uploader id' });
    return;
  }
  const action = (req.body ?? {}).action;
  if (!DECISION_ACTIONS.has(action)) {
    res.status(400).json({ error: `action 은 ${[...DECISION_ACTIONS].join('|')} 중 하나` });
    return;
  }

  const existing = await prisma.uploaderProfile.findUnique({
    where: { uploaderId },
    select: { uploaderId: true, userId: true, approvalStatus: true },
  });
  if (!existing) {
    res.status(404).json({ error: 'uploader_not_found' });
    return;
  }

  const updated = await prisma.uploaderProfile.update({
    where: { uploaderId },
    data: {
      approvalStatus: action,
      approvedAt: action === 'approved' ? new Date() : null,
    },
    select: {
      uploaderId: true,
      approvalStatus: true,
      approvedAt: true,
      updatedAt: true,
    },
  });

  res.json({
    uploaderId: updated.uploaderId.toString(),
    approvalStatus: updated.approvalStatus,
    approvedAt: updated.approvedAt?.toISOString() ?? null,
    updatedAt: updated.updatedAt.toISOString(),
  });
}

/**
 * POST /admin/events/:id/decision
 * body: { action: 'approved'|'revision_requested'|'rejected', reason?: string }
 *
 * approval_logs 에 기록. event.approvedAt 은 approved 일 때만 세팅.
 * source_type='uploaded' 만 허용 (크롤 이벤트는 이미 auto-approved 로 들어옴).
 */
export async function decideEventUpload(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const eventId = parseBigIntParam(req.params.id);
  if (!eventId) {
    res.status(400).json({ error: 'invalid event id' });
    return;
  }
  const action = (req.body ?? {}).action;
  if (!DECISION_ACTIONS.has(action)) {
    res.status(400).json({ error: `action 은 ${[...DECISION_ACTIONS].join('|')} 중 하나` });
    return;
  }
  const reasonRaw = (req.body ?? {}).reason;
  const reason = typeof reasonRaw === 'string' && reasonRaw.trim().length > 0
    ? reasonRaw.trim().slice(0, 2000)
    : null;

  const event = await prisma.event.findUnique({
    where: { eventId },
    select: { eventId: true, sourceType: true, approvalStatus: true, isDeleted: true },
  });
  if (!event || event.isDeleted) {
    res.status(404).json({ error: 'event_not_found' });
    return;
  }
  if (event.sourceType !== 'uploaded') {
    res.status(409).json({ error: 'only_uploaded_events_need_review' });
    return;
  }

  await prisma.$transaction([
    prisma.event.update({
      where: { eventId },
      data: {
        approvalStatus: action,
        approvedAt: action === 'approved' ? new Date() : null,
      },
    }),
    prisma.approvalLog.create({
      data: {
        eventId,
        adminId: auth.userId, // approval_logs.admin_id → user_id FK
        action,
        reason,
      },
    }),
  ]);

  res.json({
    eventId: eventId.toString(),
    approvalStatus: action,
    reason,
  });
}
