import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';
import type { UploaderRequest } from '../middleware/require-uploader.js';

/**
 * 업로더 역할(자기 계정) 관련 엔드포인트.
 *
 *  GET  /me/uploader            — 본인 업로더 프로파일 조회 (없으면 404)
 *  POST /me/uploader/apply      — 승급 신청 (A_600 lite)
 *  GET  /me/uploader/events     — 본인 등록 이벤트 (A_601)
 *  POST /uploader/events        — 이벤트 업로드 (A_602)
 *  PUT  /me/active-role         — user ↔ uploader 토글
 *
 * 스키마 gap 참고: CLAUDE.md §8-1 "이름·주민번호" 는 ADR 필요 (후속). 현 패스는
 * organizationName·contactPhone·contactEmail 만 수집.
 */

const EVENT_TYPE_CODES = new Set([
  'festival',
  'expo',
  'symposium',
  'conference',
  'exhibition',
  'performance',
  'education',
  'movie',
]);

const COMPANION_CODES = new Set(['family', 'friend', 'couple', 'solo']);

function parseIntClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function trimStr(raw: unknown, max: number): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s.slice(0, max);
}

function parseYmd(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function todayUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function computePhase(start: Date, end: Date): 'upcoming' | 'ongoing' | 'ended' {
  const today = todayUtcMidnight();
  if (today < start) return 'upcoming';
  if (today > end) return 'ended';
  return 'ongoing';
}

function shapeUploaderProfile(p: {
  uploaderId: bigint;
  organizationName: string;
  contactPhone: string;
  contactEmail: string;
  approvalStatus: string;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    uploaderId: p.uploaderId.toString(),
    organizationName: p.organizationName,
    contactPhone: p.contactPhone,
    contactEmail: p.contactEmail,
    approvalStatus: p.approvalStatus,
    approvedAt: p.approvedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** GET /me/uploader — 본인 업로더 프로파일. */
export async function getMyUploader(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const row = await prisma.uploaderProfile.findUnique({
    where: { userId: auth.userId },
    select: {
      uploaderId: true,
      organizationName: true,
      contactPhone: true,
      contactEmail: true,
      approvalStatus: true,
      approvedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!row) {
    res.status(404).json({ error: 'uploader_profile_not_found' });
    return;
  }
  res.json({ uploader: shapeUploaderProfile(row) });
}

/** POST /me/uploader/apply — 업로더 승급 신청. */
export async function applyUploader(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const body = req.body ?? {};

  const organizationName = trimStr(body.organizationName, 100);
  const contactPhone = trimStr(body.contactPhone, 20);
  const contactEmail = trimStr(body.contactEmail, 255);

  if (organizationName.length < 2) {
    res.status(400).json({ error: 'organizationName 은 최소 2자' });
    return;
  }
  if (!/^[0-9+\-\s()]{7,20}$/.test(contactPhone)) {
    res.status(400).json({ error: 'contactPhone 형식이 올바르지 않습니다' });
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
    res.status(400).json({ error: 'contactEmail 형식이 올바르지 않습니다' });
    return;
  }

  // 기존 프로파일 있으면: rejected 면 재신청(상태 pending 으로 되돌리며 정보 갱신), 그 외는 409.
  const existing = await prisma.uploaderProfile.findUnique({
    where: { userId: auth.userId },
    select: { uploaderId: true, approvalStatus: true },
  });

  if (existing) {
    if (existing.approvalStatus === 'rejected' || existing.approvalStatus === 'revision_requested') {
      // 재신청 허용 — 상태 pending 으로 되돌림.
      const updated = await prisma.uploaderProfile.update({
        where: { userId: auth.userId },
        data: {
          organizationName,
          contactPhone,
          contactEmail,
          approvalStatus: 'pending',
          approvedAt: null,
        },
        select: {
          uploaderId: true,
          organizationName: true,
          contactPhone: true,
          contactEmail: true,
          approvalStatus: true,
          approvedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      res.status(200).json({ uploader: shapeUploaderProfile(updated), resubmitted: true });
      return;
    }
    res.status(409).json({
      error: 'uploader_profile_exists',
      status: existing.approvalStatus,
    });
    return;
  }

  const created = await prisma.uploaderProfile.create({
    data: {
      userId: auth.userId,
      organizationName,
      contactPhone,
      contactEmail,
      approvalStatus: 'pending',
    },
    select: {
      uploaderId: true,
      organizationName: true,
      contactPhone: true,
      contactEmail: true,
      approvalStatus: true,
      approvedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(201).json({ uploader: shapeUploaderProfile(created) });
}

/**
 * PUT /me/active-role — user ↔ uploader 토글.
 * uploader 로 전환은 approvalStatus='approved' 일 때만 허용.
 * active_role CHECK 제약이 ('user','uploader') 로 한정.
 */
export async function setActiveRole(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const targetRaw = (req.body ?? {}).role;
  if (targetRaw !== 'user' && targetRaw !== 'uploader') {
    res.status(400).json({ error: "role 은 'user' 또는 'uploader'" });
    return;
  }
  if (targetRaw === 'uploader') {
    const profile = await prisma.uploaderProfile.findUnique({
      where: { userId: auth.userId },
      select: { approvalStatus: true },
    });
    if (!profile || profile.approvalStatus !== 'approved') {
      res.status(403).json({
        error: 'uploader_not_approved',
        status: profile?.approvalStatus ?? 'none',
      });
      return;
    }
  }
  await prisma.user.update({
    where: { userId: auth.userId },
    data: { activeRole: targetRaw },
  });
  res.json({ activeRole: targetRaw });
}

/**
 * GET /me/uploader/events — 본인 등록 이벤트 (A_601).
 *
 * requireUploaderApproved 후에 체결. 쿼리:
 *   approvalStatus  pending | approved | revision_requested | rejected | any (기본 any)
 *   phase           upcoming | ongoing | ended (콤마 구분 허용)
 *   page, limit
 *
 * 집계 라벨 제공 — 상태별 카운트 (UI 탭 전환용).
 */
export async function listMyUploaderEvents(req: Request, res: Response) {
  const uploader = (req as UploaderRequest).uploader;
  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  const limit = parseIntClamp(req.query.limit, 20, 1, 100);

  const where: Prisma.EventWhereInput = {
    uploaderId: uploader.uploaderId,
    isDeleted: false,
  };
  const approvalQ = typeof req.query.approvalStatus === 'string' ? req.query.approvalStatus : 'any';
  const allowedStatus = new Set(['pending', 'approved', 'revision_requested', 'rejected']);
  if (approvalQ !== 'any' && allowedStatus.has(approvalQ)) {
    where.approvalStatus = approvalQ;
  }
  const phasesRaw = typeof req.query.phase === 'string' ? req.query.phase : '';
  if (phasesRaw) {
    const allowed = new Set(['upcoming', 'ongoing', 'ended']);
    const phases = phasesRaw.split(',').map((p) => p.trim()).filter((p) => allowed.has(p));
    if (phases.length > 0) where.phase = { in: phases };
  }

  // 상태별 카운트 (탭용). status 필터 적용 전의 전체 기준.
  const [total, rows, statusBreakdown] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { eventId: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        eventId: true,
        title: true,
        phase: true,
        approvalStatus: true,
        startDate: true,
        endDate: true,
        posterImageUrl: true,
        createdAt: true,
        category: { select: { categoryCode: true, displayName: true } },
        region: { select: { regionId: true, sidoName: true, sigunguName: true } },
      },
    }),
    prisma.event.groupBy({
      by: ['approvalStatus'],
      where: { uploaderId: uploader.uploaderId, isDeleted: false },
      _count: { _all: true },
    }),
  ]);

  const byStatus: Record<string, number> = {
    pending: 0,
    approved: 0,
    revision_requested: 0,
    rejected: 0,
  };
  for (const row of statusBreakdown) byStatus[row.approvalStatus] = row._count._all;

  res.json({
    page,
    limit,
    total,
    byStatus,
    items: rows.map((r) => ({
      eventId: r.eventId.toString(),
      title: r.title,
      phase: r.phase,
      approvalStatus: r.approvalStatus,
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate.toISOString().slice(0, 10),
      posterImageUrl: r.posterImageUrl,
      createdAt: r.createdAt.toISOString(),
      category: { code: r.category.categoryCode, name: r.category.displayName },
      region: {
        regionId: r.region.regionId.toString(),
        sido: r.region.sidoName,
        sigungu: r.region.sigunguName,
      },
    })),
  });
}

/**
 * POST /uploader/events — A_602 이벤트 업로드.
 *
 * requireUploaderActive (auth + approved + activeRole=uploader) 뒤에서.
 *
 * Body:
 *   title*          문자열 1~200자
 *   categoryCode*   enum EVENT_TYPE_CODES
 *   regionId*       bigint
 *   description     null | 1~10_000자
 *   startDate*      YYYY-MM-DD
 *   endDate*        YYYY-MM-DD, >= startDate
 *   addressDetail   null | 1~255자
 *   latitude,longitude  null | number (범위 검증 X — 추후 geocode 스텝 도입)
 *   operatingHours  null | 1~100자
 *   targetAudience  null | 1~100자
 *   admissionFee    null | 1~100자
 *   expectedCompanionPrimary     null | COMPANION_CODES
 *   expectedCompanionSecondary   null | COMPANION_CODES
 *   posterImageUrl  null | URL (500자 제한)
 *
 * 승인 흐름: source_type=uploaded, approval_status=pending, phase 자동 계산.
 * 실제 공개는 관리자 승인 뒤(POST /admin/events/:id/approve)에만.
 */
export async function createUploaderEvent(req: Request, res: Response) {
  const uploader = (req as UploaderRequest).uploader;
  const b = req.body ?? {};

  const title = trimStr(b.title, 200);
  if (title.length < 1) {
    res.status(400).json({ error: 'title 필수' });
    return;
  }
  const categoryCode = typeof b.categoryCode === 'string' ? b.categoryCode : '';
  if (!EVENT_TYPE_CODES.has(categoryCode)) {
    res.status(400).json({ error: `categoryCode 은 ${[...EVENT_TYPE_CODES].join('|')} 중 하나` });
    return;
  }
  let regionId: bigint;
  try {
    regionId = BigInt(typeof b.regionId === 'string' || typeof b.regionId === 'number' ? b.regionId : '0');
    if (regionId <= 0n) throw new Error('bad');
  } catch {
    res.status(400).json({ error: 'regionId 필수' });
    return;
  }
  const startDate = parseYmd(b.startDate);
  const endDate = parseYmd(b.endDate);
  if (!startDate || !endDate) {
    res.status(400).json({ error: 'startDate/endDate 는 YYYY-MM-DD' });
    return;
  }
  if (endDate < startDate) {
    res.status(400).json({ error: 'endDate < startDate' });
    return;
  }

  const description = b.description == null ? null : trimStr(b.description, 10_000) || null;
  const addressDetail = b.addressDetail == null ? null : trimStr(b.addressDetail, 255) || null;
  const operatingHours = b.operatingHours == null ? null : trimStr(b.operatingHours, 100) || null;
  const targetAudience = b.targetAudience == null ? null : trimStr(b.targetAudience, 100) || null;
  const admissionFee = b.admissionFee == null ? null : trimStr(b.admissionFee, 100) || null;
  const posterImageUrl = b.posterImageUrl == null ? null : trimStr(b.posterImageUrl, 500) || null;

  const latRaw = b.latitude;
  const lngRaw = b.longitude;
  const latitude =
    latRaw == null || latRaw === ''
      ? null
      : Number.isFinite(Number(latRaw))
        ? new Prisma.Decimal(Number(latRaw).toFixed(7))
        : null;
  const longitude =
    lngRaw == null || lngRaw === ''
      ? null
      : Number.isFinite(Number(lngRaw))
        ? new Prisma.Decimal(Number(lngRaw).toFixed(7))
        : null;

  const primary = b.expectedCompanionPrimary;
  const secondary = b.expectedCompanionSecondary;
  if (primary != null && !COMPANION_CODES.has(primary)) {
    res.status(400).json({ error: 'expectedCompanionPrimary 값 오류' });
    return;
  }
  if (secondary != null && !COMPANION_CODES.has(secondary)) {
    res.status(400).json({ error: 'expectedCompanionSecondary 값 오류' });
    return;
  }

  // FK 검증 — category + region.
  const [category, region] = await Promise.all([
    prisma.eventCategory.findUnique({ where: { categoryCode }, select: { categoryId: true } }),
    prisma.region.findUnique({ where: { regionId }, select: { regionId: true } }),
  ]);
  if (!category) {
    res.status(400).json({ error: `categoryCode=${categoryCode} 비활성` });
    return;
  }
  if (!region) {
    res.status(400).json({ error: `regionId=${regionId.toString()} 없음` });
    return;
  }

  const phase = computePhase(startDate, endDate);

  const created = await prisma.event.create({
    data: {
      uploaderId: uploader.uploaderId,
      categoryId: category.categoryId,
      regionId: region.regionId,
      sourceType: 'uploaded',
      title,
      description,
      addressDetail,
      latitude,
      longitude,
      startDate,
      endDate,
      operatingHours,
      targetAudience,
      admissionFee,
      expectedCompanionPrimary: primary ?? null,
      expectedCompanionSecondary: secondary ?? null,
      posterImageUrl,
      approvalStatus: 'pending',
      phase,
    },
    select: {
      eventId: true,
      title: true,
      approvalStatus: true,
      phase: true,
      startDate: true,
      endDate: true,
      createdAt: true,
    },
  });

  res.status(201).json({
    event: {
      eventId: created.eventId.toString(),
      title: created.title,
      approvalStatus: created.approvalStatus,
      phase: created.phase,
      startDate: created.startDate.toISOString().slice(0, 10),
      endDate: created.endDate.toISOString().slice(0, 10),
      createdAt: created.createdAt.toISOString(),
    },
  });
}
