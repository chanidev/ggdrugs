import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';
import type { AdminRequest } from '../middleware/require-admin.js';

/**
 * Admin user 관리 라우트 — ADR 0004 D-6 + ADR 0005 E-2/E-4/E-5/E-7.
 *
 *   GET  /admin/users                       — 회원 목록 (필터/검색/페이지) — ADR 0005 E-7 정정
 *   GET  /admin/users/:id                   — 회원 상세 + 활성 세션 수 + 최근 audit
 *   POST /admin/users/:id/revoke-sessions   — ADR 0004 D-6
 *   POST /admin/users/:id/promote           — ADR 0005 E-2
 *   POST /admin/users/:id/demote            — ADR 0005 E-4
 *   PUT  /admin/users/:id/admin-scope       — ADR 0005 E-4
 *   POST /admin/users/:id/soft-delete       — ADR 0005 E-5 (ADR 0004 D-1 활성화)
 *
 * 본 라우트는 requireAuth → requireAdmin 체인 뒤에서만 진입.
 * 모든 mutating endpoint 가 admin_audit_logs 행을 동봉.
 */

const ADMIN_SCOPE_DOMAIN = ['full', 'content_only', 'uploader_review_only', 'security'] as const;
type AdminScope = (typeof ADMIN_SCOPE_DOMAIN)[number];

function parseBigIntParam(raw: unknown): bigint | null {
  if (typeof raw !== 'string') return null;
  try {
    const n = BigInt(raw);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

function parseReason(raw: unknown, min = 10, max = 500): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (s.length < min || s.length > max) return null;
  return s;
}

/**
 * ADR 0004 D-6 (ADR 0005 E-3 정정): 특정 user 의 모든 auth_sessions 강제 폐기.
 *
 * 권한: scope IN ('full','security'). 'security' scope 는 ADR 0005 E-3 에서 추가됨 — 보안
 * 사고 대응 전용 권한 분리.
 *
 * Body: { reason: string (10~500자, 필수) } — audit 추적 목적이라 빈 reason 거부.
 *
 * 부수효과: admin_audit_logs 행 생성 (action='revoke_sessions', target_id=user_id,
 *   payload={ count, reason }). 트랜잭션으로 묶음 — DELETE 와 audit row 가 같이 커밋되거나
 *   같이 롤백되도록.
 */
export async function revokeUserSessions(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const admin = (req as AdminRequest).admin;
  if (admin.scope !== 'full' && admin.scope !== 'security') {
    res.status(403).json({ error: 'admin_scope_full_or_security_required' });
    return;
  }

  const userId = parseBigIntParam(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'invalid user id' });
    return;
  }

  const reason = parseReason((req.body ?? {}).reason);
  if (reason === null) {
    res.status(400).json({ error: 'reason 은 10~500자 문자열 (audit 추적용 필수)' });
    return;
  }

  // 대상 user 존재 확인 — 없는 user 에 대한 audit 행 생성 방지.
  const target = await prisma.user.findUnique({
    where: { userId },
    select: { userId: true },
  });
  if (!target) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }

  const [deleted, audit] = await prisma.$transaction([
    prisma.authSession.deleteMany({ where: { userId } }),
    prisma.adminAuditLog.create({
      data: {
        // admin_audit_logs.admin_id → users(user_id) FK (approval_logs 와 동일 컨벤션).
        // admin_profiles.admin_id 가 아님에 주의.
        adminId: auth.userId,
        action: 'revoke_sessions',
        targetId: userId,
        payload: { reason },
      },
      select: { auditId: true },
    }),
  ]);

  // payload 의 count 를 사후 update — DELETE 결과를 트랜잭션 안에서 알 수 없어 분리.
  await prisma.adminAuditLog.update({
    where: { auditId: audit.auditId },
    data: { payload: { reason, count: deleted.count } },
  });

  res.json({
    userId: userId.toString(),
    deletedSessions: deleted.count,
    auditId: audit.auditId.toString(),
  });
}

// =============================================================
// ADR 0005 E-2 / E-4: admin 승급 / 박탈 / scope 변경
// =============================================================

/**
 * 'full' 권한 검증 + audit 행 생성용 admin 식별.
 * 모든 admin 관리 endpoint 의 1단계 — peer-promote 방지 + reason 검증 + 대상 user 확인.
 * 통과 시 { adminUserId, userId, reason } 반환.
 */
async function requireFullScopeAndTarget(
  req: Request,
  res: Response,
): Promise<{ adminUserId: bigint; userId: bigint; reason: string } | null> {
  const auth = (req as AuthenticatedRequest).auth;
  const admin = (req as AdminRequest).admin;
  if (admin.scope !== 'full') {
    res.status(403).json({ error: 'admin_scope_full_required' });
    return null;
  }
  const userId = parseBigIntParam(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'invalid user id' });
    return null;
  }
  const reason = parseReason((req.body ?? {}).reason);
  if (reason === null) {
    res.status(400).json({ error: 'reason 은 10~500자 문자열 (audit 추적용 필수)' });
    return null;
  }
  return { adminUserId: auth.userId, userId, reason };
}

/**
 * ADR 0005 E-2: 기존 user 를 admin 으로 승급.
 *
 * Body: { scope: AdminScope, reason: string (10~500자) }
 * 사전조건: 대상 user 존재 + is_deleted=false. 이미 admin_profile 있으면 isActive=true 로
 * 재활성화 (re-promote 케이스 흡수).
 */
export async function promoteToAdmin(req: Request, res: Response) {
  const ctx = await requireFullScopeAndTarget(req, res);
  if (!ctx) return;

  const scopeRaw = (req.body ?? {}).scope;
  if (typeof scopeRaw !== 'string' || !ADMIN_SCOPE_DOMAIN.includes(scopeRaw as AdminScope)) {
    res.status(400).json({ error: `scope 은 ${ADMIN_SCOPE_DOMAIN.join('|')} 중 하나` });
    return;
  }
  const scope = scopeRaw as AdminScope;

  const target = await prisma.user.findUnique({
    where: { userId: ctx.userId },
    select: { userId: true, isDeleted: true },
  });
  if (!target || target.isDeleted) {
    res.status(404).json({ error: 'user_not_found_or_deleted' });
    return;
  }

  const [profile, audit] = await prisma.$transaction([
    prisma.adminProfile.upsert({
      where: { userId: ctx.userId },
      update: { scope, isActive: true },
      create: { userId: ctx.userId, scope, isActive: true },
      select: { adminId: true, scope: true, isActive: true },
    }),
    prisma.adminAuditLog.create({
      data: {
        adminId: ctx.adminUserId,
        action: 'admin_promote',
        targetId: ctx.userId,
        payload: { scope, reason: ctx.reason },
      },
      select: { auditId: true },
    }),
  ]);

  res.json({
    userId: ctx.userId.toString(),
    adminId: profile.adminId.toString(),
    scope: profile.scope,
    isActive: profile.isActive,
    auditId: audit.auditId.toString(),
  });
}

/**
 * ADR 0005 E-4: admin 박탈 — admin_profiles.is_active=false 토글.
 *
 * 사전조건: 대상이 admin_profile 보유 + isActive=true. 자기 자신 박탈은 허용 (마지막
 * full-scope admin 박탈 자체는 차단하지 않음 — bootstrap CLI 가 안전망).
 */
export async function demoteAdmin(req: Request, res: Response) {
  const ctx = await requireFullScopeAndTarget(req, res);
  if (!ctx) return;

  const before = await prisma.adminProfile.findUnique({
    where: { userId: ctx.userId },
    select: { adminId: true, scope: true, isActive: true },
  });
  if (!before) {
    res.status(404).json({ error: 'admin_profile_not_found' });
    return;
  }
  if (!before.isActive) {
    res.status(409).json({ error: 'admin_already_inactive' });
    return;
  }

  const [updated, audit] = await prisma.$transaction([
    prisma.adminProfile.update({
      where: { userId: ctx.userId },
      data: { isActive: false },
      select: { adminId: true, scope: true, isActive: true },
    }),
    prisma.adminAuditLog.create({
      data: {
        adminId: ctx.adminUserId,
        action: 'admin_demote',
        targetId: ctx.userId,
        payload: {
          reason: ctx.reason,
          before: { scope: before.scope, isActive: before.isActive },
          after: { isActive: false },
        },
      },
      select: { auditId: true },
    }),
  ]);

  res.json({
    userId: ctx.userId.toString(),
    adminId: updated.adminId.toString(),
    scope: updated.scope,
    isActive: updated.isActive,
    auditId: audit.auditId.toString(),
  });
}

/**
 * ADR 0005 E-4: admin scope 변경.
 *
 * Body: { scope: AdminScope, reason: string }. 동일 scope 재요청은 409 (no-op 방지).
 */
export async function changeAdminScope(req: Request, res: Response) {
  const ctx = await requireFullScopeAndTarget(req, res);
  if (!ctx) return;

  const scopeRaw = (req.body ?? {}).scope;
  if (typeof scopeRaw !== 'string' || !ADMIN_SCOPE_DOMAIN.includes(scopeRaw as AdminScope)) {
    res.status(400).json({ error: `scope 은 ${ADMIN_SCOPE_DOMAIN.join('|')} 중 하나` });
    return;
  }
  const scope = scopeRaw as AdminScope;

  const before = await prisma.adminProfile.findUnique({
    where: { userId: ctx.userId },
    select: { adminId: true, scope: true, isActive: true },
  });
  if (!before) {
    res.status(404).json({ error: 'admin_profile_not_found' });
    return;
  }
  if (before.scope === scope) {
    res.status(409).json({ error: 'scope_unchanged' });
    return;
  }

  const [updated, audit] = await prisma.$transaction([
    prisma.adminProfile.update({
      where: { userId: ctx.userId },
      data: { scope },
      select: { adminId: true, scope: true, isActive: true },
    }),
    prisma.adminAuditLog.create({
      data: {
        adminId: ctx.adminUserId,
        action: 'admin_scope_change',
        targetId: ctx.userId,
        payload: {
          reason: ctx.reason,
          before: { scope: before.scope },
          after: { scope },
        },
      },
      select: { auditId: true },
    }),
  ]);

  res.json({
    userId: ctx.userId.toString(),
    adminId: updated.adminId.toString(),
    scope: updated.scope,
    isActive: updated.isActive,
    auditId: audit.auditId.toString(),
  });
}

// =============================================================
// ADR 0005 E-5: user soft-delete (ADR 0004 D-1 활성화)
// =============================================================

/**
 * ADR 0005 E-5: 일반 user / uploader user 강제 탈퇴.
 *
 * 사전조건 (E-5c): 대상이 admin_profile.isActive=true 보유 시 차단 — 먼저 demote 필요.
 * 동작 (트랜잭션):
 *   1. users.update { isDeleted=true, deletedAt=now }
 *   2. authSession.deleteMany({ userId }) (ADR 0004 D-1 패턴)
 *   3. admin_audit_logs.create (count 사후 update)
 */
export async function softDeleteUser(req: Request, res: Response) {
  const ctx = await requireFullScopeAndTarget(req, res);
  if (!ctx) return;

  const target = await prisma.user.findUnique({
    where: { userId: ctx.userId },
    select: {
      userId: true,
      isDeleted: true,
      adminProfile: { select: { isActive: true } },
    },
  });
  if (!target) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }
  if (target.isDeleted) {
    res.status(409).json({ error: 'user_already_deleted' });
    return;
  }
  // E-5c: admin 활성 상태에서 user soft-delete 차단 — 명시적 demote 가 먼저.
  if (target.adminProfile?.isActive) {
    res.status(409).json({ error: 'admin_profile_active_must_demote_first' });
    return;
  }

  const now = new Date();
  const [, deleted, audit] = await prisma.$transaction([
    prisma.user.update({
      where: { userId: ctx.userId },
      data: { isDeleted: true, deletedAt: now },
    }),
    prisma.authSession.deleteMany({ where: { userId: ctx.userId } }),
    prisma.adminAuditLog.create({
      data: {
        adminId: ctx.adminUserId,
        action: 'user_soft_delete',
        targetId: ctx.userId,
        payload: { reason: ctx.reason },
      },
      select: { auditId: true },
    }),
  ]);

  await prisma.adminAuditLog.update({
    where: { auditId: audit.auditId },
    data: { payload: { reason: ctx.reason, deletedSessionCount: deleted.count } },
  });

  res.json({
    userId: ctx.userId.toString(),
    deletedSessionCount: deleted.count,
    auditId: audit.auditId.toString(),
  });
}

// =============================================================
// ADR 0005 E-7 (정정): 회원 목록/상세 조회 — Members 탭 백킹.
// 모든 조회는 requireAdmin 통과면 OK (scope 무관). 변경은 위 mutating endpoints 가 자체 검증.
// =============================================================

const ROLE_FILTER_DOMAIN = ['all', 'general', 'uploader', 'admin'] as const;
type RoleFilter = (typeof ROLE_FILTER_DOMAIN)[number];

const STATUS_FILTER_DOMAIN = ['all', 'active', 'deleted'] as const;
type StatusFilter = (typeof STATUS_FILTER_DOMAIN)[number];

function intClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * GET /admin/users
 *   ?role=all|general|uploader|admin
 *   ?status=all|active|deleted (default: active)
 *   ?q=<nickname icontains>
 *   ?page=1 &limit=20
 *
 * Response:
 *   { items: AdminUserListItem[], total, byRole, byStatus, page, limit }
 *
 * 회원 목록 + 보유 역할 (uploader/admin) 요약. 활성 세션 수는 상세에서만 (count 부담 회피).
 */
export async function listAdminUsers(req: Request, res: Response) {
  const roleRaw = String(req.query.role ?? 'all');
  const statusRaw = String(req.query.status ?? 'active');
  const role = (ROLE_FILTER_DOMAIN.includes(roleRaw as RoleFilter)
    ? roleRaw
    : 'all') as RoleFilter;
  const status = (STATUS_FILTER_DOMAIN.includes(statusRaw as StatusFilter)
    ? statusRaw
    : 'active') as StatusFilter;
  const q = String(req.query.q ?? '').trim().slice(0, 100);
  const page = intClamp(req.query.page, 1, 1, 10_000);
  const limit = intClamp(req.query.limit, 20, 1, 100);

  // Prisma where 합성.
  const where: Record<string, unknown> = {};
  if (status === 'active') where.isDeleted = false;
  if (status === 'deleted') where.isDeleted = true;
  if (q.length > 0) where.nickname = { contains: q, mode: 'insensitive' };
  if (role === 'uploader') where.uploaderProfile = { isNot: null };
  if (role === 'admin') where.adminProfile = { isNot: null, is: { isActive: true } };
  if (role === 'general') {
    where.uploaderProfile = { is: null };
    where.adminProfile = { is: null };
  }

  const baseScopeForCounts: Record<string, unknown> = {};
  if (status === 'active') baseScopeForCounts.isDeleted = false;
  if (status === 'deleted') baseScopeForCounts.isDeleted = true;
  if (q.length > 0) baseScopeForCounts.nickname = { contains: q, mode: 'insensitive' };

  const [total, rows, totalAll, totalUploader, totalAdmin, totalActive, totalDeleted] =
    await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          userId: true,
          nickname: true,
          authProvider: true,
          activeRole: true,
          isDeleted: true,
          createdAt: true,
          lastLoggedInAt: true,
          uploaderProfile: { select: { uploaderId: true, approvalStatus: true } },
          adminProfile: { select: { adminId: true, scope: true, isActive: true } },
        },
      }),
      // byRole counters — status/q 필터는 유지하되 role 만 빼고 집계.
      prisma.user.count({ where: baseScopeForCounts }),
      prisma.user.count({
        where: { ...baseScopeForCounts, uploaderProfile: { isNot: null } },
      }),
      prisma.user.count({
        where: {
          ...baseScopeForCounts,
          adminProfile: { isNot: null, is: { isActive: true } },
        },
      }),
      // byStatus counters — role/q 필터는 유지하되 status 만 빼고 집계.
      prisma.user.count({
        where: {
          isDeleted: false,
          ...(q.length > 0 ? { nickname: { contains: q, mode: 'insensitive' } } : {}),
          ...(role === 'uploader' ? { uploaderProfile: { isNot: null } } : {}),
          ...(role === 'admin'
            ? { adminProfile: { isNot: null, is: { isActive: true } } }
            : {}),
          ...(role === 'general'
            ? { uploaderProfile: { is: null }, adminProfile: { is: null } }
            : {}),
        },
      }),
      prisma.user.count({
        where: {
          isDeleted: true,
          ...(q.length > 0 ? { nickname: { contains: q, mode: 'insensitive' } } : {}),
          ...(role === 'uploader' ? { uploaderProfile: { isNot: null } } : {}),
          ...(role === 'admin'
            ? { adminProfile: { isNot: null, is: { isActive: true } } }
            : {}),
          ...(role === 'general'
            ? { uploaderProfile: { is: null }, adminProfile: { is: null } }
            : {}),
        },
      }),
    ]);

  res.json({
    page,
    limit,
    total,
    byRole: {
      all: totalAll,
      general: Math.max(0, totalAll - totalUploader - totalAdmin),
      uploader: totalUploader,
      admin: totalAdmin,
    },
    byStatus: { active: totalActive, deleted: totalDeleted },
    items: rows.map((r) => ({
      userId: r.userId.toString(),
      nickname: r.nickname,
      authProvider: r.authProvider,
      activeRole: r.activeRole,
      isDeleted: r.isDeleted,
      createdAt: r.createdAt.toISOString(),
      lastLoggedInAt: r.lastLoggedInAt?.toISOString() ?? null,
      uploader: r.uploaderProfile
        ? {
            uploaderId: r.uploaderProfile.uploaderId.toString(),
            approvalStatus: r.uploaderProfile.approvalStatus,
          }
        : null,
      admin: r.adminProfile
        ? {
            adminId: r.adminProfile.adminId.toString(),
            scope: r.adminProfile.scope,
            isActive: r.adminProfile.isActive,
          }
        : null,
    })),
  });
}

/**
 * GET /admin/users/:id
 *
 * 상세 + 활성 세션 수 + 최근 audit (target_id=userId, 10건). UploaderDetailPanel 처럼
 * 우측 패널 1회 fetch 로 충분한 정보 노출.
 */
export async function getAdminUser(req: Request, res: Response) {
  const userId = parseBigIntParam(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'invalid user id' });
    return;
  }

  const [u, sessionCount, recentAudits] = await Promise.all([
    prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        nickname: true,
        authProvider: true,
        socialUid: true,
        activeRole: true,
        isDeleted: true,
        deletedAt: true,
        createdAt: true,
        lastLoggedInAt: true,
        uploaderProfile: {
          select: {
            uploaderId: true,
            approvalStatus: true,
            approvedAt: true,
            organizationName: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        adminProfile: {
          select: {
            adminId: true,
            scope: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.authSession.count({
      where: { userId, expiresAt: { gt: new Date() } },
    }),
    prisma.adminAuditLog.findMany({
      where: { targetId: userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        auditId: true,
        adminId: true,
        action: true,
        payload: true,
        createdAt: true,
        admin: { select: { nickname: true } },
      },
    }),
  ]);

  if (!u) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }

  res.json({
    user: {
      userId: u.userId.toString(),
      nickname: u.nickname,
      authProvider: u.authProvider,
      // socialUid 는 PII 라 마스킹 — 앞 4 + 뒤 4 만 (Google sub 21자, Kakao id 10자, dev nickname 가변).
      socialUid: u.socialUid.length > 8 ? `${u.socialUid.slice(0, 4)}…${u.socialUid.slice(-4)}` : '***',
      activeRole: u.activeRole,
      isDeleted: u.isDeleted,
      deletedAt: u.deletedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      lastLoggedInAt: u.lastLoggedInAt?.toISOString() ?? null,
    },
    uploader: u.uploaderProfile
      ? {
          uploaderId: u.uploaderProfile.uploaderId.toString(),
          approvalStatus: u.uploaderProfile.approvalStatus,
          approvedAt: u.uploaderProfile.approvedAt?.toISOString() ?? null,
          organizationName: u.uploaderProfile.organizationName,
          createdAt: u.uploaderProfile.createdAt.toISOString(),
          updatedAt: u.uploaderProfile.updatedAt.toISOString(),
        }
      : null,
    admin: u.adminProfile
      ? {
          adminId: u.adminProfile.adminId.toString(),
          scope: u.adminProfile.scope,
          isActive: u.adminProfile.isActive,
          createdAt: u.adminProfile.createdAt.toISOString(),
          updatedAt: u.adminProfile.updatedAt.toISOString(),
        }
      : null,
    activeSessionCount: sessionCount,
    recentAudits: recentAudits.map((a) => ({
      auditId: a.auditId.toString(),
      adminId: a.adminId.toString(),
      adminNickname: a.admin.nickname,
      action: a.action,
      payload: a.payload,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}
