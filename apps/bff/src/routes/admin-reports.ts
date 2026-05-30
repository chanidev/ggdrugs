/**
 * admin-reports.ts — 관리자 신고 모더레이션 라우트 (GG-REPORT-004~007, A_701)
 *
 * GET  /admin/reports                     — listAdminReports   (신고 목록, GG-004)
 * GET  /admin/reports/:reportId           — getAdminReport     (신고 상세+콘텐츠, GG-005)
 * POST /admin/reports/:reportId/action    — actionAdminReport  (조치 결정, GG-006/007)
 *
 * 권한: requireAuth → requireAdmin (req.admin.scope 체크)
 * 조치: 경고/허위신고/기각 = full|content_only, 이용정지 = full 전용
 * 원자성: Prisma 트랜잭션 — User sanction + Report status + AdminAuditLog + Notification
 */

import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import type { AdminRequest } from '../middleware/require-admin.js';

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

const VALID_STATUSES = new Set(['pending', 'reviewed', 'dismissed', 'any']);
const VALID_TARGET_TYPES = new Set(['post', 'comment', 'chat_message', 'mate_eval', 'any']);
// VALID_ACTIONS: 입력 action 허용값 (4종).
// DB admin_action 컬럼은 NULL|warned|suspended|false_report — dismissed 시 null 저장.
// 'dismissed' 구분은 응답의 status 필드로 확인. (review: medium — 명시 주석)
const VALID_ACTIONS = new Set(['warned', 'suspended', 'false_report', 'dismissed']);

// ─── GET /admin/reports ──────────────────────────────────────────────────────

/**
 * listAdminReports — 신고 목록 (GG-REPORT-004)
 *
 * query: status(기본 pending), targetType, page, limit
 * 응답: byStatus 통계 포함
 */
export async function listAdminReports(req: Request, res: Response) {
  // requireAdmin middleware guarantees req.admin is populated before this handler.
  const admin = (req as AdminRequest).admin!;

  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  const limit = parseIntClamp(req.query.limit, 20, 1, 100);
  const statusRaw = typeof req.query.status === 'string' ? req.query.status : 'pending';
  const targetTypeRaw = typeof req.query.targetType === 'string' ? req.query.targetType : 'any';

  const whereFilter: Record<string, unknown> = {};
  if (statusRaw !== 'any' && VALID_STATUSES.has(statusRaw)) {
    whereFilter.status = statusRaw;
  }
  if (targetTypeRaw !== 'any' && VALID_TARGET_TYPES.has(targetTypeRaw)) {
    whereFilter.targetType = targetTypeRaw;
  }

  const [total, rows, statusBreakdown] = await Promise.all([
    prisma.report.count({ where: whereFilter }),
    prisma.report.findMany({
      where: whereFilter,
      orderBy: [{ createdAt: 'desc' }, { reportId: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        reportId: true,
        reporterId: true,
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
        reporter: { select: { nickname: true } },
        targetUser: { select: { nickname: true } },
      },
    }),
    // byStatus 통계 — 전체 (targetType 필터 무관하게 상태별 전체 카운트)
    prisma.report.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ]);

  const byStatus: Record<string, number> = { pending: 0, reviewed: 0, dismissed: 0 };
  for (const row of statusBreakdown) {
    if (row.status in byStatus) byStatus[row.status] = row._count._all;
  }

  res.json({
    page,
    limit,
    total,
    byStatus,
    items: rows.map((r) => ({
      reportId: r.reportId.toString(),
      reporterId: r.reporterId.toString(),
      reporterNickname: r.reporter.nickname,
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

// ─── GET /admin/reports/:reportId ───────────────────────────────────────────

/**
 * getAdminReport — 신고 상세 + targetContent (GG-REPORT-005)
 *
 * targetContent:
 *   post: { title, body }
 *   comment: { body }
 *   chat_message: { body, messageType }
 *   mate_eval: { ratingStars, comment, reportedFor }
 */
export async function getAdminReport(req: Request, res: Response) {
  // requireAdmin middleware guarantees req.admin is populated before this handler.
  void (req as AdminRequest).admin!;

  const reportId = parseBigId(req.params.reportId);
  if (!reportId) {
    res.status(400).json({ error: 'invalid reportId' });
    return;
  }

  const report = await prisma.report.findUnique({
    where: { reportId },
    select: {
      reportId: true,
      reporterId: true,
      targetUserId: true,
      targetType: true,
      targetEntityId: true,
      reason: true,
      detail: true,
      status: true,
      adminId: true,
      adminAction: true,
      adminNote: true,
      createdAt: true,
      reviewedAt: true,
      reporter: { select: { nickname: true } },
      targetUser: { select: { nickname: true, sanctionStatus: true } },
      admin: { select: { nickname: true } },
    },
  });

  if (!report) {
    res.status(404).json({ error: 'report_not_found' });
    return;
  }

  // targetContent 인라인 로드
  let targetContent: Record<string, unknown> | null = null;
  const eid = report.targetEntityId;
  switch (report.targetType) {
    case 'post': {
      const post = await prisma.post.findFirst({
        where: { postId: eid },
        select: { title: true, body: true },
      });
      if (post) targetContent = { title: post.title, body: post.body };
      break;
    }
    case 'comment': {
      const comment = await prisma.comment.findFirst({
        where: { commentId: eid },
        select: { body: true },
      });
      if (comment) targetContent = { body: comment.body };
      break;
    }
    case 'chat_message': {
      const msg = await prisma.chatRoomMessage.findFirst({
        where: { messageId: eid },
        select: { body: true, messageType: true },
      });
      if (msg) targetContent = { body: msg.body, messageType: msg.messageType };
      break;
    }
    case 'mate_eval': {
      const ev = await prisma.mateEvaluation.findFirst({
        where: { evalId: eid },
        select: { ratingStars: true, comment: true, reportedFor: true },
      });
      if (ev) targetContent = { ratingStars: ev.ratingStars, comment: ev.comment, reportedFor: ev.reportedFor };
      break;
    }
  }

  res.json({
    reportId: report.reportId.toString(),
    reporterId: report.reporterId.toString(),
    reporterNickname: report.reporter.nickname,
    targetUserId: report.targetUserId.toString(),
    targetUserNickname: report.targetUser.nickname,
    targetUserSanctionStatus: report.targetUser.sanctionStatus,
    targetType: report.targetType,
    targetEntityId: report.targetEntityId.toString(),
    reason: report.reason,
    detail: report.detail,
    status: report.status,
    adminId: report.adminId?.toString() ?? null,
    adminNickname: report.admin?.nickname ?? null,
    adminAction: report.adminAction,
    adminNote: report.adminNote,
    createdAt: report.createdAt.toISOString(),
    reviewedAt: report.reviewedAt?.toISOString() ?? null,
    targetContent,
  });
}

// ─── POST /admin/reports/:reportId/action ────────────────────────────────────

/**
 * actionAdminReport — 조치 결정 (GG-REPORT-006/007)
 *
 * scope 검증:
 *   경고/허위신고/기각 — full | content_only
 *   이용정지           — full 전용
 *
 * 원자 트랜잭션: Report status + User sanction + AdminAuditLog + Notification
 */
export async function actionAdminReport(req: Request, res: Response) {
  // requireAdmin middleware guarantees req.admin is populated before this handler.
  const adminReq = req as AdminRequest;
  const admin = adminReq.admin!;

  const reportId = parseBigId(req.params.reportId);
  if (!reportId) {
    res.status(400).json({ error: 'invalid reportId' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = typeof body.action === 'string' ? body.action : '';
  if (!VALID_ACTIONS.has(action)) {
    res.status(400).json({ error: 'invalid action', allowed: [...VALID_ACTIONS] });
    return;
  }

  // scope 검증: 경고/허위신고/기각 = full|content_only, 이용정지 = full 전용
  const { scope } = admin;
  if (scope !== 'full' && scope !== 'content_only') {
    res.status(403).json({ error: 'admin_scope_content_required' });
    return;
  }
  if (action === 'suspended' && scope !== 'full') {
    res.status(403).json({ error: 'admin_scope_full_required' });
    return;
  }

  const note = typeof body.note === 'string' ? body.note.trim() : undefined;
  const suspendDaysRaw = body.suspendDays;

  // 이용정지 시 suspendDays 필수 검증 (1~365)
  let suspendDays: number | undefined;
  if (action === 'suspended') {
    const d =
      typeof suspendDaysRaw === 'number'
        ? suspendDaysRaw
        : typeof suspendDaysRaw === 'string'
          ? Number.parseInt(suspendDaysRaw, 10)
          : NaN;
    if (!Number.isFinite(d) || d < 1 || d > 365) {
      res.status(400).json({ error: 'suspendDays_required', detail: 'action=suspended requires suspendDays in 1~365' });
      return;
    }
    suspendDays = d;
  }

  // 신고 조회 + pending 확인
  const report = await prisma.report.findUnique({
    where: { reportId },
    select: {
      reportId: true,
      status: true,
      reporterId: true,
      targetUserId: true,
      targetType: true,
      targetEntityId: true,
    },
  });

  if (!report) {
    res.status(404).json({ error: 'report_not_found' });
    return;
  }
  if (report.status !== 'pending') {
    res.status(409).json({ error: 'already_reviewed', currentStatus: report.status });
    return;
  }

  const now = new Date();

  // 원자 트랜잭션
  const result = await prisma.$transaction(async (tx) => {
    let auditAction: string;
    let notificationTarget: bigint;
    let notificationTitle: string;
    let notificationMessage: string;

    if (action === 'warned') {
      // 1a) User 경고 처리
      // sanctionExpiresAt: null — 이전에 suspended였던 경우 만료일 오염 방지 (review: medium)
      await tx.user.update({
        where: { userId: report.targetUserId },
        data: {
          sanctionStatus: 'warned',
          sanctionExpiresAt: null,
          sanctionReason: note ?? null,
        },
      });
      auditAction = 'report_action_warned';
      notificationTarget = report.targetUserId;
      notificationTitle = '경고 조치 안내';
      notificationMessage = note
        ? `신고 검토 결과 경고 조치가 적용되었습니다. 사유: ${note}`
        : '신고 검토 결과 경고 조치가 적용되었습니다.';
    } else if (action === 'suspended') {
      // 1b) User 이용정지 처리
      const sanctionExpiresAt = new Date(Date.now() + suspendDays! * 86_400_000);
      await tx.user.update({
        where: { userId: report.targetUserId },
        data: {
          sanctionStatus: 'suspended',
          sanctionExpiresAt,
          sanctionReason: note ?? null,
        },
      });
      auditAction = 'report_action_suspended';
      notificationTarget = report.targetUserId;
      notificationTitle = '이용정지 조치 안내';
      notificationMessage = `${suspendDays!}일간 이용정지 조치가 적용되었습니다.${note ? ` 사유: ${note}` : ''}`;
    } else if (action === 'false_report') {
      // 1c) 허위신고 — 피신고자 아닌 신고자에게 알림
      auditAction = 'report_action_false_report';
      notificationTarget = report.reporterId;
      notificationTitle = '허위신고 처리 안내';
      notificationMessage = '제출하신 신고가 허위신고로 처리되었습니다.';
    } else {
      // action === 'dismissed'
      auditAction = 'report_dismissed';
      notificationTarget = report.reporterId;
      notificationTitle = '신고 기각 안내';
      notificationMessage = '제출하신 신고가 검토 결과 기각 처리되었습니다.';
    }

    // 2) Report 상태 업데이트
    const finalStatus = action === 'dismissed' ? 'dismissed' : 'reviewed';
    const finalAdminAction = action === 'dismissed' ? null : action;
    await tx.report.update({
      where: { reportId },
      data: {
        status: finalStatus,
        adminId: admin.adminId,
        adminAction: finalAdminAction,
        adminNote: note ?? null,
        reviewedAt: now,
      },
    });

    // 3) AdminAuditLog 생성
    const auditLog = await tx.adminAuditLog.create({
      data: {
        adminId: admin.adminId,
        action: auditAction,
        targetId: action === 'false_report' || action === 'dismissed' ? null : report.targetUserId,
        payload: {
          reportId: reportId.toString(),
          targetUserId: report.targetUserId.toString(),
          reporterId: report.reporterId.toString(),
          action,
          note: note ?? null,
          ...(suspendDays ? { suspendDays } : {}),
        },
      },
      select: { auditId: true },
    });

    // 4) Notification 생성 — notificationType='report_action'
    await tx.notification.create({
      data: {
        userId: notificationTarget,
        title: notificationTitle,
        message: notificationMessage,
        scheduledAt: now,
        isSent: true,
        sentAt: now,
        notificationType: 'report_action',
        relatedEntityId: reportId,
        relatedEntityType: 'report',
      },
    });

    return { auditId: auditLog.auditId };
  });

  res.json({
    reportId: reportId.toString(),
    status: action === 'dismissed' ? 'dismissed' : 'reviewed',
    adminAction: action === 'dismissed' ? null : action,
    auditId: result.auditId.toString(),
  });
}
