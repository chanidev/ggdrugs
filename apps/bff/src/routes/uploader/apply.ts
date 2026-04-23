import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma.js';
import { env } from '../../env.js';
import { deleteObjects } from '../../lib/s3.js';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import {
  REJECTED_REAPPLY_COOLDOWN_MS,
  computeReapplyGate,
  shapeUploaderProfile,
  trimStr,
} from './_helpers.js';

const SIGNUP_DOC_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_SIGNUP_DOC_BYTES = 5 * 1024 * 1024;
const MIN_SIGNUP_DOCS = 1;
const MAX_SIGNUP_DOCS = 5;

interface SignupDoc {
  key: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}

function validateSignupDocs(raw: unknown, userIdStr: string): SignupDoc[] | { error: string } {
  if (!Array.isArray(raw)) return { error: 'documents 배열 필수' };
  if (raw.length < MIN_SIGNUP_DOCS) return { error: `서류 최소 ${MIN_SIGNUP_DOCS}개` };
  if (raw.length > MAX_SIGNUP_DOCS) return { error: `서류 최대 ${MAX_SIGNUP_DOCS}개` };
  const expectedPrefix = `uploader-doc/${userIdStr}/`;
  const seen = new Set<string>();
  const out: SignupDoc[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return { error: 'invalid document entry' };
    const d = item as Record<string, unknown>;
    const key = typeof d.key === 'string' ? d.key : '';
    const filename = typeof d.originalFilename === 'string' ? d.originalFilename.trim() : '';
    const mime = typeof d.mimeType === 'string' ? d.mimeType : '';
    const size = typeof d.fileSizeBytes === 'number' ? d.fileSizeBytes : -1;
    if (!key.startsWith(expectedPrefix)) return { error: `key 가 user scope 밖: ${key}` };
    if (seen.has(key)) return { error: `중복 key: ${key}` };
    seen.add(key);
    if (filename.length < 1 || filename.length > 255) return { error: 'originalFilename 1~255자' };
    if (!SIGNUP_DOC_MIME.has(mime)) return { error: `mimeType 허용 외: ${mime}` };
    if (!Number.isInteger(size) || size <= 0 || size > MAX_SIGNUP_DOC_BYTES) {
      return { error: `fileSizeBytes 범위 초과: ${size}` };
    }
    out.push({ key, originalFilename: filename, mimeType: mime, fileSizeBytes: size });
  }
  return out;
}

/**
 * POST /me/uploader/apply — 업로더 승급 신청 (ADR 0003 반영).
 *
 * body:
 *   organizationName, contactPhone, contactEmail, realName        (모두 필수)
 *   businessRegistrationNumber (10자리) XOR ciHash (88자 Base64)  (정확히 하나 필수)
 *   documents: [{key, originalFilename, mimeType, fileSizeBytes}] (1~5장)
 *
 * 주민등록번호는 받지 않음 (§24-2).
 */
export async function applyUploader(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const body = req.body ?? {};

  const organizationName = trimStr(body.organizationName, 100);
  const contactPhone = trimStr(body.contactPhone, 20);
  const contactEmail = trimStr(body.contactEmail, 255);
  const realName = trimStr(body.realName, 50);

  if (organizationName.length < 2) {
    res.status(400).json({ error: 'organizationName 은 최소 2자' });
    return;
  }
  if (realName.length < 1) {
    res.status(400).json({ error: 'realName 필수' });
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

  // 신원 확인: 기관=사업자등록번호 / 개인=CI. XOR.
  const bizRaw = typeof body.businessRegistrationNumber === 'string'
    ? body.businessRegistrationNumber.trim()
    : null;
  const ciRaw = typeof body.ciHash === 'string' ? body.ciHash.trim() : null;
  const businessRegistrationNumber = bizRaw && bizRaw.length > 0 ? bizRaw : null;
  const ciHash = ciRaw && ciRaw.length > 0 ? ciRaw : null;
  if (!businessRegistrationNumber && !ciHash) {
    res.status(400).json({ error: 'businessRegistrationNumber 또는 ciHash 중 하나 필수' });
    return;
  }
  if (businessRegistrationNumber && ciHash) {
    res.status(400).json({ error: 'businessRegistrationNumber 와 ciHash 동시 제출 불가' });
    return;
  }
  if (businessRegistrationNumber && !/^[0-9]{10}$/.test(businessRegistrationNumber)) {
    res.status(400).json({ error: 'businessRegistrationNumber 는 10자리 숫자' });
    return;
  }
  if (ciHash && ciHash.length !== 88) {
    res.status(400).json({ error: 'ciHash 는 88자 본인인증 CI' });
    return;
  }

  // 서류 검증 (최소 1개, 최대 5개).
  const docsResult = validateSignupDocs(body.documents, auth.userId.toString());
  if (!Array.isArray(docsResult)) {
    res.status(400).json({ error: docsResult.error });
    return;
  }
  const docs = docsResult;

  // 기존 프로파일 핸들링 + 고아 정리 (업로드 실패 시 S3 객체 정리).
  async function cleanupOrphans() {
    await deleteObjects(env.S3_BUCKET_APPROVAL_DOCS, docs.map((d) => d.key));
  }

  const existing = await prisma.uploaderProfile.findUnique({
    where: { userId: auth.userId },
    select: { uploaderId: true, approvalStatus: true, updatedAt: true },
  });

  // rejected 재신청 쿨다운 (7d) — gate.canReapply=false 면 즉시 거부.
  if (existing && existing.approvalStatus === 'rejected') {
    const gate = computeReapplyGate(existing);
    if (!gate.canReapply) {
      await cleanupOrphans();
      res.status(429).json({
        error: 'reapply_cooldown_active',
        canReapplyAt: gate.canReapplyAt,
        cooldownDays: REJECTED_REAPPLY_COOLDOWN_MS / (24 * 60 * 60 * 1000),
      });
      return;
    }
  }

  if (existing && existing.approvalStatus !== 'rejected' && existing.approvalStatus !== 'revision_requested') {
    await cleanupOrphans();
    res.status(409).json({ error: 'uploader_profile_exists', status: existing.approvalStatus });
    return;
  }

  try {
    let saved;
    if (existing) {
      // 재신청: 기존 서류 삭제 후 신규 insert. 프로파일 update.
      const oldDocs = await prisma.uploaderDocument.findMany({
        where: { uploaderId: existing.uploaderId },
        select: { filePath: true },
      });
      await prisma.$transaction(async (tx) => {
        await tx.uploaderDocument.deleteMany({ where: { uploaderId: existing.uploaderId } });
        await tx.uploaderProfile.update({
          where: { userId: auth.userId },
          data: {
            organizationName,
            contactPhone,
            contactEmail,
            realName,
            businessRegistrationNumber,
            ciHash,
            approvalStatus: 'pending',
            approvedAt: null,
          },
        });
        await tx.uploaderDocument.createMany({
          data: docs.map((d) => ({
            uploaderId: existing.uploaderId,
            filePath: d.key,
            originalFilename: d.originalFilename,
            mimeType: d.mimeType,
            fileSizeBytes: d.fileSizeBytes,
          })),
        });
      });
      // 트랜잭션 성공 후 오래된 S3 객체 정리 (실패해도 원래 응답에 영향 없음).
      await deleteObjects(env.S3_BUCKET_APPROVAL_DOCS, oldDocs.map((d) => d.filePath));
      saved = await prisma.uploaderProfile.findUniqueOrThrow({
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
      res.status(200).json({ uploader: shapeUploaderProfile(saved), resubmitted: true });
      return;
    }

    const created = await prisma.$transaction(async (tx) => {
      const prof = await tx.uploaderProfile.create({
        data: {
          userId: auth.userId,
          organizationName,
          contactPhone,
          contactEmail,
          realName,
          businessRegistrationNumber,
          ciHash,
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
      await tx.uploaderDocument.createMany({
        data: docs.map((d) => ({
          uploaderId: prof.uploaderId,
          filePath: d.key,
          originalFilename: d.originalFilename,
          mimeType: d.mimeType,
          fileSizeBytes: d.fileSizeBytes,
        })),
      });
      return prof;
    });
    res.status(201).json({ uploader: shapeUploaderProfile(created) });
  } catch (err) {
    await cleanupOrphans();
    // 유니크 제약 (biz_reg_number / ci_hash 중복) 은 별도 메시지.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(',') ?? '';
      if (target.includes('business_registration_number')) {
        res.status(409).json({ error: '이미 등록된 사업자등록번호입니다' });
        return;
      }
      if (target.includes('ci_hash')) {
        res.status(409).json({ error: '이미 등록된 본인인증 CI 입니다' });
        return;
      }
    }
    throw err;
  }
}
