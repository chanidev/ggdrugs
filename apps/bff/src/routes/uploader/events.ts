import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma.js';
import { env } from '../../env.js';
import { deleteObjects, presignGet } from '../../lib/s3.js';
import type { UploaderRequest } from '../../middleware/require-uploader.js';
import { trimStr } from './_helpers.js';

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

// approval_documents CHECK chk_doc_mime 와 동기. PDF 허용 후속 마이그레이션 반영.
const DOC_MIME_WHITELIST = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const MIN_DOCS = 2; // A_602: 서류 ≥ 2종
const MAX_DOCS = 5;

function parseBigIntParam(raw: unknown): bigint | null {
  if (typeof raw !== 'string') return null;
  try {
    const n = BigInt(raw);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

function parseIntClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
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
        approvalLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { action: true, reason: true, createdAt: true },
        },
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
    items: rows.map((r) => {
      const latestLog = r.approvalLogs[0];
      return {
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
        // rejected/revision_requested 일 때만 UI 에서 쓸 최신 관리자 사유.
        latestDecision: latestLog
          ? {
              action: latestLog.action,
              reason: latestLog.reason,
              decidedAt: latestLog.createdAt.toISOString(),
            }
          : null,
      };
    }),
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
interface IncomingDoc {
  key: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}

function validateDocs(raw: unknown, uploaderIdStr: string): IncomingDoc[] | { error: string } {
  if (!Array.isArray(raw)) return { error: 'approvalDocuments 배열 필수' };
  if (raw.length < MIN_DOCS) return { error: `서류는 최소 ${MIN_DOCS}개` };
  if (raw.length > MAX_DOCS) return { error: `서류는 최대 ${MAX_DOCS}개` };

  const seenKeys = new Set<string>();
  const docs: IncomingDoc[] = [];
  const expectedPrefix = `doc/${uploaderIdStr}/`;

  for (const item of raw) {
    if (!item || typeof item !== 'object') return { error: 'invalid document entry' };
    const d = item as Record<string, unknown>;
    const key = typeof d.key === 'string' ? d.key : '';
    const filename = typeof d.originalFilename === 'string' ? d.originalFilename.trim() : '';
    const mime = typeof d.mimeType === 'string' ? d.mimeType : '';
    const size = typeof d.fileSizeBytes === 'number' ? d.fileSizeBytes : -1;

    if (!key.startsWith(expectedPrefix)) {
      return { error: `key 가 uploader scope 밖: ${key}` };
    }
    if (seenKeys.has(key)) return { error: `중복 key: ${key}` };
    seenKeys.add(key);
    if (filename.length < 1 || filename.length > 255) {
      return { error: 'originalFilename 필수 1~255자' };
    }
    if (!DOC_MIME_WHITELIST.has(mime)) {
      return { error: `mimeType 허용 외: ${mime}` };
    }
    if (!Number.isInteger(size) || size <= 0 || size > MAX_DOC_BYTES) {
      return { error: `fileSizeBytes 범위 초과: ${size}` };
    }
    docs.push({ key, originalFilename: filename, mimeType: mime, fileSizeBytes: size });
  }
  return docs;
}

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

  // v4.10 — lat/lng 컬럼 DROP 후 location_geom 단일 source. 입력은 그대로 lat/lng 받되
  // INSERT 후 별도 raw UPDATE 로 location_geom 채움.
  const latRaw = b.latitude;
  const lngRaw = b.longitude;
  const latNum =
    latRaw == null || latRaw === '' ? null
      : Number.isFinite(Number(latRaw)) ? Number(Number(latRaw).toFixed(7)) : null;
  const lngNum =
    lngRaw == null || lngRaw === '' ? null
      : Number.isFinite(Number(lngRaw)) ? Number(Number(lngRaw).toFixed(7)) : null;

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

  // 서류 검증 — A_602 필수 요구사항
  const docsResult = validateDocs(b.approvalDocuments, uploader.uploaderId.toString());
  if (!Array.isArray(docsResult)) {
    res.status(400).json({ error: docsResult.error });
    return;
  }
  const docs = docsResult;

  // 이 시점부터는 고아 객체 리스크 영역 — client 가 이미 S3 에 업로드 완료한 docs/poster 를
  // 서버 실패 시 정리한다. FK 검증 실패도 포함.
  async function cleanupOrphans() {
    await deleteObjects(env.S3_BUCKET_APPROVAL_DOCS, docs.map((d) => d.key));
    if (posterImageUrl) {
      const prefix = `/${env.S3_BUCKET_EVENT_POSTERS}/`;
      const idx = posterImageUrl.indexOf(prefix);
      if (idx >= 0) {
        const posterKey = decodeURI(posterImageUrl.slice(idx + prefix.length));
        await deleteObjects(env.S3_BUCKET_EVENT_POSTERS, [posterKey]);
      }
    }
  }

  // FK 검증 — category + region.
  const [category, region] = await Promise.all([
    prisma.eventCategory.findUnique({ where: { categoryCode }, select: { categoryId: true } }),
    prisma.region.findUnique({ where: { regionId }, select: { regionId: true } }),
  ]);
  if (!category) {
    await cleanupOrphans();
    res.status(400).json({ error: `categoryCode=${categoryCode} 비활성` });
    return;
  }
  if (!region) {
    await cleanupOrphans();
    res.status(400).json({ error: `regionId=${regionId.toString()} 없음` });
    return;
  }

  const phase = computePhase(startDate, endDate);

  // 트랜잭션: event insert + approval_documents N rows.
  // docs.file_path 에 MinIO object key 를 그대로 저장 (GET 은 관리자용 presigned).
  // 실패 시 이미 업로드된 서류/포스터 key 를 고아로 남기지 않도록 catch 에서 정리.
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        uploaderId: uploader.uploaderId,
        categoryId: category.categoryId,
        regionId: region.regionId,
        sourceType: 'uploaded',
        title,
        description,
        addressDetail,
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
      // v4.10 — location_geom 별도 raw UPDATE (Unsupported field 라 prisma.create 미지원).
      if (latNum !== null && lngNum !== null) {
        await tx.$executeRaw`
          UPDATE events
          SET location_geom = ST_SetSRID(ST_MakePoint(${lngNum}::float, ${latNum}::float), 4326)
          WHERE event_id = ${event.eventId}
        `;
      }
      await tx.approvalDocument.createMany({
        data: docs.map((d) => ({
          eventId: event.eventId,
          filePath: d.key,
          originalFilename: d.originalFilename,
          mimeType: d.mimeType,
          fileSizeBytes: d.fileSizeBytes,
        })),
      });
      return event;
    });
  } catch (err) {
    await cleanupOrphans();
    throw err;
  }

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

// =============================================================
// A_601b — 업로더 이벤트 수정 재제출
// =============================================================

/**
 * GET /uploader/events/:id — 업로더 본인 이벤트 단건 조회 (수정 폼 prefill 용).
 *
 * requireUploaderActive 뒤. 본인 소유 + 미삭제 이벤트만. 기존 서류는 presigned GET URL 포함.
 * status 와 latestDecision 은 UI 가 "수정 가능 여부" 판단용.
 */
export async function getMyUploaderEvent(req: Request, res: Response) {
  const uploader = (req as UploaderRequest).uploader;
  const eventId = parseBigIntParam(req.params.id);
  if (!eventId) {
    res.status(400).json({ error: 'invalid event id' });
    return;
  }

  const row = await prisma.event.findFirst({
    where: { eventId, uploaderId: uploader.uploaderId, isDeleted: false },
    select: {
      eventId: true,
      title: true,
      description: true,
      addressDetail: true,
      startDate: true,
      endDate: true,
      operatingHours: true,
      targetAudience: true,
      admissionFee: true,
      expectedCompanionPrimary: true,
      expectedCompanionSecondary: true,
      posterImageUrl: true,
      approvalStatus: true,
      phase: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { categoryId: true, categoryCode: true, displayName: true } },
      region: { select: { regionId: true, sidoName: true, sigunguName: true } },
      approvalDocuments: {
        orderBy: { documentId: 'asc' },
        select: {
          documentId: true,
          filePath: true,
          originalFilename: true,
          mimeType: true,
          fileSizeBytes: true,
        },
      },
      approvalLogs: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { action: true, reason: true, createdAt: true },
      },
    },
  });

  if (!row) {
    res.status(404).json({ error: 'event_not_found' });
    return;
  }

  // v4.10 — lat/lng 컬럼 DROP 후 location_geom 단일 source. ST_X/ST_Y derive.
  const coordRows = await prisma.$queryRaw<{ lng: number | null; lat: number | null }[]>`
    SELECT ST_X(location_geom)::float AS lng, ST_Y(location_geom)::float AS lat
    FROM events WHERE event_id = ${eventId} AND location_geom IS NOT NULL
  `;
  const coord = coordRows[0];
  const latitude = coord?.lat != null ? Number(coord.lat).toString() : null;
  const longitude = coord?.lng != null ? Number(coord.lng).toString() : null;

  const documents = await Promise.all(
    row.approvalDocuments.map(async (d) => ({
      documentId: d.documentId.toString(),
      originalFilename: d.originalFilename,
      mimeType: d.mimeType,
      fileSizeBytes: d.fileSizeBytes,
      previewUrl: await presignGet(env.S3_BUCKET_APPROVAL_DOCS, d.filePath, 300),
    })),
  );

  const latestLog = row.approvalLogs[0];
  res.json({
    event: {
      eventId: row.eventId.toString(),
      title: row.title,
      categoryCode: row.category.categoryCode,
      regionId: row.region.regionId.toString(),
      regionLabel: `${row.region.sidoName}${row.region.sigunguName ? ` ${row.region.sigunguName}` : ''}`,
      description: row.description,
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate.toISOString().slice(0, 10),
      addressDetail: row.addressDetail,
      latitude,
      longitude,
      operatingHours: row.operatingHours,
      targetAudience: row.targetAudience,
      admissionFee: row.admissionFee,
      expectedCompanionPrimary: row.expectedCompanionPrimary,
      expectedCompanionSecondary: row.expectedCompanionSecondary,
      posterImageUrl: row.posterImageUrl,
      approvalStatus: row.approvalStatus,
      phase: row.phase,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      documents,
      latestDecision: latestLog
        ? {
            action: latestLog.action,
            reason: latestLog.reason,
            decidedAt: latestLog.createdAt.toISOString(),
          }
        : null,
    },
  });
}

/**
 * PATCH /uploader/events/:id — 업로더 이벤트 수정 재제출.
 *
 * requireUploaderActive 뒤. 본인 소유 + 미삭제 + approvalStatus ∈ {revision_requested, rejected}
 * 일 때만 허용. 성공 시 approval_status='pending' 으로 리셋.
 *
 * body:
 *   title*, categoryCode*, regionId*, startDate*, endDate*,
 *   description?, addressDetail?, operatingHours?, targetAudience?, admissionFee?,
 *   expectedCompanionPrimary?, expectedCompanionSecondary?,
 *   posterImageUrl (null | 새 URL | undefined=유지),
 *   clearPoster (true 면 포스터 제거),
 *   approvalDocuments (신규 세트 — 있으면 기존 전체 교체, 없으면 유지)
 */
export async function updateUploaderEvent(req: Request, res: Response) {
  const uploader = (req as UploaderRequest).uploader;
  const eventId = parseBigIntParam(req.params.id);
  if (!eventId) {
    res.status(400).json({ error: 'invalid event id' });
    return;
  }

  const existing = await prisma.event.findFirst({
    where: { eventId, uploaderId: uploader.uploaderId, isDeleted: false },
    select: {
      eventId: true,
      approvalStatus: true,
      posterImageUrl: true,
      approvalDocuments: { select: { filePath: true } },
    },
  });
  if (!existing) {
    res.status(404).json({ error: 'event_not_found' });
    return;
  }
  if (existing.approvalStatus !== 'revision_requested' && existing.approvalStatus !== 'rejected') {
    res.status(409).json({
      error: 'not_editable',
      status: existing.approvalStatus,
    });
    return;
  }

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

  const primary = b.expectedCompanionPrimary;
  const secondary = b.expectedCompanionSecondary;
  if (primary != null && primary !== '' && !COMPANION_CODES.has(primary)) {
    res.status(400).json({ error: 'expectedCompanionPrimary 값 오류' });
    return;
  }
  if (secondary != null && secondary !== '' && !COMPANION_CODES.has(secondary)) {
    res.status(400).json({ error: 'expectedCompanionSecondary 값 오류' });
    return;
  }

  // 포스터 — 3가지 케이스:
  //   posterImageUrl: string  → 새 URL 로 교체 (이전 포스터 key 삭제)
  //   clearPoster: true        → null 로 (이전 포스터 key 삭제)
  //   그 외                     → 유지
  let posterImageUrl: string | null | undefined;
  let oldPosterKeyToDelete: string | null = null;
  if (b.clearPoster === true) {
    posterImageUrl = null;
    oldPosterKeyToDelete = posterKeyFromUrl(existing.posterImageUrl);
  } else if (typeof b.posterImageUrl === 'string' && b.posterImageUrl.length > 0) {
    posterImageUrl = trimStr(b.posterImageUrl, 500) || null;
    if (posterImageUrl !== existing.posterImageUrl) {
      oldPosterKeyToDelete = posterKeyFromUrl(existing.posterImageUrl);
    }
  } else {
    posterImageUrl = undefined; // no change
  }

  // 서류 — approvalDocuments 가 배열로 오면 전체 교체, 아니면 유지.
  const docsProvided = Array.isArray(b.approvalDocuments);
  let docs: IncomingDoc[] = [];
  if (docsProvided) {
    const parsed = validateDocs(b.approvalDocuments, uploader.uploaderId.toString());
    if (!Array.isArray(parsed)) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    docs = parsed;
  }

  // FK 검증.
  const [category, region] = await Promise.all([
    prisma.eventCategory.findUnique({ where: { categoryCode }, select: { categoryId: true } }),
    prisma.region.findUnique({ where: { regionId }, select: { regionId: true } }),
  ]);
  if (!category) {
    if (docsProvided) await deleteObjects(env.S3_BUCKET_APPROVAL_DOCS, docs.map((d) => d.key));
    res.status(400).json({ error: `categoryCode=${categoryCode} 비활성` });
    return;
  }
  if (!region) {
    if (docsProvided) await deleteObjects(env.S3_BUCKET_APPROVAL_DOCS, docs.map((d) => d.key));
    res.status(400).json({ error: `regionId=${regionId.toString()} 없음` });
    return;
  }

  const phase = computePhase(startDate, endDate);

  const updateData: Prisma.EventUpdateInput = {
    title,
    category: { connect: { categoryId: category.categoryId } },
    region: { connect: { regionId: region.regionId } },
    description,
    addressDetail,
    startDate,
    endDate,
    operatingHours,
    targetAudience,
    admissionFee,
    expectedCompanionPrimary: primary ? primary : null,
    expectedCompanionSecondary: secondary ? secondary : null,
    phase,
    approvalStatus: 'pending',
    approvedAt: null,
  };
  if (posterImageUrl !== undefined) {
    updateData.posterImageUrl = posterImageUrl;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { eventId }, data: updateData });
      if (docsProvided) {
        await tx.approvalDocument.deleteMany({ where: { eventId } });
        await tx.approvalDocument.createMany({
          data: docs.map((d) => ({
            eventId,
            filePath: d.key,
            originalFilename: d.originalFilename,
            mimeType: d.mimeType,
            fileSizeBytes: d.fileSizeBytes,
          })),
        });
      }
    });
  } catch (err) {
    if (docsProvided) {
      await deleteObjects(env.S3_BUCKET_APPROVAL_DOCS, docs.map((d) => d.key));
    }
    throw err;
  }

  // 트랜잭션 성공 후 오래된 객체 정리 (실패해도 응답 영향 없음).
  if (docsProvided) {
    const oldKeys = existing.approvalDocuments.map((d) => d.filePath);
    if (oldKeys.length > 0) await deleteObjects(env.S3_BUCKET_APPROVAL_DOCS, oldKeys);
  }
  if (oldPosterKeyToDelete) {
    await deleteObjects(env.S3_BUCKET_EVENT_POSTERS, [oldPosterKeyToDelete]);
  }

  res.json({
    eventId: eventId.toString(),
    approvalStatus: 'pending',
    phase,
    resubmitted: true,
  });
}

function posterKeyFromUrl(url: string | null): string | null {
  if (!url) return null;
  const prefix = `/${env.S3_BUCKET_EVENT_POSTERS}/`;
  const idx = url.indexOf(prefix);
  if (idx < 0) return null;
  return decodeURI(url.slice(idx + prefix.length));
}
