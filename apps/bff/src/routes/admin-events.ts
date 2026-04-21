import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

/**
 * 관리자 전용 — 이벤트 성향(vibe) 라벨 부여.
 *
 * 정책 (CLAUDE.md §6-4): vibe 부여는 관리자(사람)의 결정. LLM 위임 금지.
 * 이 라우트들은 requireAuth → requireAdmin 체인 뒤에서만 진입 가능.
 *
 * 엔드포인트:
 *   GET  /admin/events                — vibe 부여 작업용 이벤트 리스트
 *   PUT  /admin/events/:id/vibes      — vibe 전체 교체 (replace semantics)
 */

function parseIntClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function parseBigIntCsv(raw: unknown): bigint[] | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const out: bigint[] = [];
  for (const p of parts) {
    try {
      const n = BigInt(p);
      if (n > 0n) out.push(n);
    } catch {
      return null;
    }
  }
  return out.length > 0 ? out : null;
}

/**
 * GET /admin/events
 *
 * 쿼리:
 *   hasVibes    true | false | any  (기본 any) — vibe 부여 상태 필터
 *   approvalStatus  approved | pending | ... (기본 approved)
 *   phase       upcoming | ongoing | ended (콤마 구분 허용)
 *   regionIds   csv
 *   q           title ILIKE (간단 prefix/substring)
 *   page, limit
 *
 * 응답:
 *   { page, limit, total, items: [{ eventId, title, phase, approvalStatus,
 *     category, region, vibes[], startDate, endDate, posterImageUrl }] }
 */
export async function listAdminEvents(req: Request, res: Response) {
  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  const limit = parseIntClamp(req.query.limit, 20, 1, 100);

  const hasVibesRaw = typeof req.query.hasVibes === 'string' ? req.query.hasVibes : 'any';
  const approval = typeof req.query.approvalStatus === 'string'
    ? req.query.approvalStatus
    : 'approved';

  const where: Prisma.EventWhereInput = {
    isDeleted: false,
    approvalStatus: approval,
  };

  const sourceRaw = typeof req.query.sourceType === 'string' ? req.query.sourceType : '';
  if (sourceRaw === 'uploaded' || sourceRaw === 'crawled') {
    where.sourceType = sourceRaw;
  }

  const phasesRaw = typeof req.query.phase === 'string' ? req.query.phase : '';
  if (phasesRaw) {
    const allowed = new Set(['upcoming', 'ongoing', 'ended']);
    const phases = phasesRaw.split(',').map((p) => p.trim()).filter((p) => allowed.has(p));
    if (phases.length > 0) where.phase = { in: phases };
  }

  const regionIds = parseBigIntCsv(req.query.regionIds);
  if (regionIds) where.regionId = { in: regionIds };

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length > 0 && q.length <= 100) {
    where.title = { contains: q, mode: 'insensitive' };
  }

  // hasVibes 필터: vibeAssignments 존재 여부. Prisma 에서 "none" / "some" 사용.
  if (hasVibesRaw === 'false') where.vibeAssignments = { none: {} };
  else if (hasVibesRaw === 'true') where.vibeAssignments = { some: {} };

  const [total, rows] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy: [{ startDate: 'desc' }, { eventId: 'desc' }],
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
        aiSummary: true,
        category: { select: { categoryCode: true, displayName: true } },
        region: { select: { regionId: true, sidoName: true, sigunguName: true } },
        vibeAssignments: {
          select: { vibe: { select: { vibeId: true, vibeName: true, vibeGroup: true } } },
        },
      },
    }),
  ]);

  const items = rows.map((r) => ({
    eventId: r.eventId.toString(),
    title: r.title,
    phase: r.phase,
    approvalStatus: r.approvalStatus,
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    posterImageUrl: r.posterImageUrl,
    aiSummary: r.aiSummary,
    category: { code: r.category.categoryCode, name: r.category.displayName },
    region: {
      regionId: r.region.regionId.toString(),
      sido: r.region.sidoName,
      sigungu: r.region.sigunguName,
    },
    vibes: r.vibeAssignments.map((va) => ({
      vibeId: va.vibe.vibeId.toString(),
      name: va.vibe.vibeName,
      group: va.vibe.vibeGroup,
    })),
  }));

  res.json({ page, limit, total, items });
}

/**
 * PUT /admin/events/:id/vibes
 *
 * body: { vibeIds: string[] | number[] }  (id 는 숫자/숫자문자열 허용)
 *
 * replace semantics — 트랜잭션으로 기존 assignment 삭제 + 신규 삽입.
 * 존재하지 않는 vibeId 가 섞이면 400.
 *
 * 감사: event.vibe-assign 은 approval_logs 범위가 아니라 별도 로그 남기지
 * 않음 (event_vibe_assignments.assigned_by + assigned_at 이 히스토리).
 */
export async function putAdminEventVibes(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const idStr = typeof req.params.id === 'string' ? req.params.id : '';
  let eventId: bigint;
  try {
    eventId = BigInt(idStr);
    if (eventId <= 0n) throw new Error('bad');
  } catch {
    res.status(400).json({ error: 'invalid event id' });
    return;
  }

  const raw = (req.body ?? {}).vibeIds;
  if (!Array.isArray(raw)) {
    res.status(400).json({ error: 'vibeIds array 필요' });
    return;
  }
  const vibeIds: bigint[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    try {
      const n = typeof v === 'bigint' ? v : BigInt(typeof v === 'number' ? Math.trunc(v) : String(v));
      if (n <= 0n) continue;
      const k = n.toString();
      if (seen.has(k)) continue; // 중복 제거
      seen.add(k);
      vibeIds.push(n);
    } catch {
      res.status(400).json({ error: `invalid vibeId: ${String(v)}` });
      return;
    }
  }
  if (vibeIds.length > 10) {
    res.status(400).json({ error: 'vibe 는 최대 10개' });
    return;
  }

  // event 존재 + soft-delete 아님 검증.
  const event = await prisma.event.findFirst({
    where: { eventId, isDeleted: false },
    select: { eventId: true },
  });
  if (!event) {
    res.status(404).json({ error: 'event not found' });
    return;
  }

  if (vibeIds.length > 0) {
    const validVibes = await prisma.eventVibe.findMany({
      where: { vibeId: { in: vibeIds }, isActive: true },
      select: { vibeId: true },
    });
    const validSet = new Set(validVibes.map((v) => v.vibeId.toString()));
    for (const v of vibeIds) {
      if (!validSet.has(v.toString())) {
        res.status(400).json({ error: `unknown vibeId: ${v.toString()}` });
        return;
      }
    }
  }

  await prisma.$transaction([
    prisma.eventVibeAssignment.deleteMany({ where: { eventId } }),
    ...(vibeIds.length > 0
      ? [
          prisma.eventVibeAssignment.createMany({
            data: vibeIds.map((vibeId) => ({
              eventId,
              vibeId,
              assignedBy: auth.userId, // EventVibeAssignment.assignedBy → User.userId
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  // 반환: 새 vibe set
  const assignments = await prisma.eventVibeAssignment.findMany({
    where: { eventId },
    select: { vibe: { select: { vibeId: true, vibeName: true, vibeGroup: true } } },
  });
  res.json({
    eventId: eventId.toString(),
    vibes: assignments.map((a) => ({
      vibeId: a.vibe.vibeId.toString(),
      name: a.vibe.vibeName,
      group: a.vibe.vibeGroup,
    })),
  });
}
