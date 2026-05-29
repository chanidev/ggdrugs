import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';
import { bidirectionalScore } from '../lib/mate-score.js';

// ============================================================
// 유틸
// ============================================================
const AGE_RANGE_VALID = new Set([10, 15, 20, 25, 30, 35, 40, 45, 50]);
const GENDER_VALID = new Set(['M', 'F']);

function parseBigId(raw: unknown): bigint | null {
  const s = typeof raw === 'string' ? raw : '';
  try {
    const n = BigInt(s);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

/** PII 마스킹 — audit 로그용. 실제 저장값 절대 노출 금지. */
export function maskPii(p: {
  gender: string;
  nationality: string;
  ageRangeLower: number;
}): Record<string, string> {
  return {
    gender: p.gender.replace(/./g, '*'),
    nationality: p.nationality.length > 2 ? p.nationality.slice(0, 2) + '***' : '***',
    ageRangeLower: String(p.ageRangeLower).replace(/\d/g, '*'),
  };
}

// ============================================================
// POST /community/mate/profile  — upsert (requireAuth)
// ============================================================
export async function saveMateProfile(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  // ── 필수 필드 검증 ──
  const gender = typeof body.gender === 'string' ? body.gender : '';
  if (!GENDER_VALID.has(gender)) {
    res.status(400).json({ error: 'gender must be M or F' });
    return;
  }

  const ageRangeLower =
    typeof body.ageRangeLower === 'number'
      ? body.ageRangeLower
      : typeof body.ageRangeLower === 'string'
        ? Number.parseInt(body.ageRangeLower, 10)
        : NaN;
  if (!AGE_RANGE_VALID.has(ageRangeLower)) {
    res.status(400).json({ error: 'ageRangeLower must be one of 10,15,20,25,30,35,40,45,50' });
    return;
  }

  const nationality = typeof body.nationality === 'string' ? body.nationality.trim() : '';
  if (nationality.length < 1 || nationality.length > 20) {
    res.status(400).json({ error: 'nationality must be 1~20 chars' });
    return;
  }

  if (typeof body.koreanOk !== 'boolean') {
    res.status(400).json({ error: 'koreanOk must be boolean' });
    return;
  }
  if (typeof body.hasCar !== 'boolean') {
    res.status(400).json({ error: 'hasCar must be boolean' });
    return;
  }

  const koreanOk = body.koreanOk as boolean;
  const hasCar = body.hasCar as boolean;

  // ── 약관 동의 게이트 (GG-MATCH-009/010) ──
  // consentedAt 은 반드시 non-empty string 이어야 함.
  // boolean true 같은 falsy-하지-않은 비문자열 값도 422 처리 (new Date(true) = epoch+1ms 우회 방지).
  const consentedAtRaw = body.consentedAt;
  if (typeof consentedAtRaw !== 'string' || !consentedAtRaw) {
    res.status(422).json({ error: 'consent_required' });
    return;
  }
  const consentedAt = new Date(consentedAtRaw);
  if (Number.isNaN(consentedAt.getTime())) {
    res.status(422).json({ error: 'consent_required' });
    return;
  }

  // ── 선호 조건 (null = 상관없음) ──
  const prefGender =
    typeof body.prefGender === 'string' && GENDER_VALID.has(body.prefGender)
      ? body.prefGender
      : null;
  const prefAgeLower =
    typeof body.prefAgeLower === 'number' && AGE_RANGE_VALID.has(body.prefAgeLower)
      ? body.prefAgeLower
      : typeof body.prefAgeLower === 'string' && AGE_RANGE_VALID.has(Number.parseInt(body.prefAgeLower, 10))
        ? Number.parseInt(body.prefAgeLower, 10)
        : null;
  const prefHasCar = typeof body.prefHasCar === 'boolean' ? body.prefHasCar : null;
  const prefNationality =
    typeof body.prefNationality === 'string' && body.prefNationality.trim().length >= 1
      ? body.prefNationality.trim()
      : null;
  const prefKoreanOk = typeof body.prefKoreanOk === 'boolean' ? body.prefKoreanOk : null;

  // regionId / prefRegionId (optional BigInt)
  const regionId =
    body.regionId !== undefined && body.regionId !== null
      ? parseBigId(String(body.regionId))
      : null;
  const prefRegionId =
    body.prefRegionId !== undefined && body.prefRegionId !== null
      ? parseBigId(String(body.prefRegionId))
      : null;

  const autoRecommend = typeof body.autoRecommend === 'boolean' ? body.autoRecommend : false;
  const groupApply = typeof body.groupApply === 'boolean' ? body.groupApply : false;

  // ── upsert — MateIndex 없으면 create{50}, 있으면 update:{} (불변) ──
  const saved = await prisma.$transaction(async (tx) => {
    const profile = await tx.mateProfile.upsert({
      where: { userId: auth.userId },
      create: {
        userId: auth.userId,
        gender,
        ageRangeLower,
        regionId,
        hasCar,
        nationality,
        koreanOk,
        prefGender,
        prefAgeLower,
        prefRegionId,
        prefHasCar,
        prefNationality,
        prefKoreanOk,
        autoRecommend,
        groupApply,
        consentedAt,
      },
      update: {
        gender,
        ageRangeLower,
        regionId,
        hasCar,
        nationality,
        koreanOk,
        prefGender,
        prefAgeLower,
        prefRegionId,
        prefHasCar,
        prefNationality,
        prefKoreanOk,
        autoRecommend,
        groupApply,
        consentedAt,
        isDeleted: false,
        deletedAt: null,
      },
      select: { mateProfileId: true, updatedAt: true },
    });

    // MateIndex: 없으면 create(50), 있으면 update:{} — indexValue 절대 덮어쓰지 않음.
    await tx.mateIndex.upsert({
      where: { userId: auth.userId },
      create: { userId: auth.userId, indexValue: 50 },
      update: {}, // 불변 — 슬라이스5에서 갱신
    });

    return profile;
  });

  // 저장 audit 로그 — PII 마스킹 필수
  logger.info(
    { action: 'mate_profile_save', userId: auth.userId.toString(), pii: maskPii({ gender, nationality, ageRangeLower }) },
    'mate profile saved',
  );

  res.status(200).json({
    mateProfileId: saved.mateProfileId.toString(),
    updatedAt: saved.updatedAt.toISOString(),
  });
}

// ============================================================
// GET /community/mate/profile  — 본인 프로필 (requireAuth)
// ============================================================
export async function getMyMateProfile(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const profile = await prisma.mateProfile.findUnique({
    where: { userId: auth.userId },
    select: {
      mateProfileId: true,
      gender: true,
      ageRangeLower: true,
      regionId: true,
      hasCar: true,
      nationality: true,
      koreanOk: true,
      prefGender: true,
      prefAgeLower: true,
      prefRegionId: true,
      prefHasCar: true,
      prefNationality: true,
      prefKoreanOk: true,
      autoRecommend: true,
      groupApply: true,
      consentedAt: true,
      isDeleted: true,
      updatedAt: true,
    },
  });

  if (!profile || profile.isDeleted) {
    res.status(204).end();
    return;
  }

  res.json({
    mateProfileId: profile.mateProfileId.toString(),
    gender: profile.gender,
    ageRangeLower: profile.ageRangeLower,
    regionId: profile.regionId ? profile.regionId.toString() : null,
    hasCar: profile.hasCar,
    nationality: profile.nationality,
    koreanOk: profile.koreanOk,
    prefGender: profile.prefGender,
    prefAgeLower: profile.prefAgeLower,
    prefRegionId: profile.prefRegionId ? profile.prefRegionId.toString() : null,
    prefHasCar: profile.prefHasCar,
    prefNationality: profile.prefNationality,
    prefKoreanOk: profile.prefKoreanOk,
    autoRecommend: profile.autoRecommend,
    groupApply: profile.groupApply,
    consentedAt: profile.consentedAt ? profile.consentedAt.toISOString() : null,
    updatedAt: profile.updatedAt.toISOString(),
  });
}

// ============================================================
// GET /community/mate/profile/me  — 프로필 + 메이트지수 (A_807)
// ============================================================
export async function getMyMateProfileWithIndex(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const [profile, mateIndex] = await Promise.all([
    prisma.mateProfile.findUnique({
      where: { userId: auth.userId },
      select: {
        mateProfileId: true,
        gender: true,
        ageRangeLower: true,
        regionId: true,
        hasCar: true,
        nationality: true,
        koreanOk: true,
        prefGender: true,
        prefAgeLower: true,
        prefRegionId: true,
        prefHasCar: true,
        prefNationality: true,
        prefKoreanOk: true,
        autoRecommend: true,
        groupApply: true,
        consentedAt: true,
        isDeleted: true,
        updatedAt: true,
      },
    }),
    prisma.mateIndex.findUnique({
      where: { userId: auth.userId },
      select: { indexValue: true },
    }),
  ]);

  if (!profile || profile.isDeleted) {
    res.status(204).end();
    return;
  }

  res.json({
    mateProfileId: profile.mateProfileId.toString(),
    gender: profile.gender,
    ageRangeLower: profile.ageRangeLower,
    regionId: profile.regionId ? profile.regionId.toString() : null,
    hasCar: profile.hasCar,
    nationality: profile.nationality,
    koreanOk: profile.koreanOk,
    prefGender: profile.prefGender,
    prefAgeLower: profile.prefAgeLower,
    prefRegionId: profile.prefRegionId ? profile.prefRegionId.toString() : null,
    prefHasCar: profile.prefHasCar,
    prefNationality: profile.prefNationality,
    prefKoreanOk: profile.prefKoreanOk,
    autoRecommend: profile.autoRecommend,
    groupApply: profile.groupApply,
    consentedAt: profile.consentedAt ? profile.consentedAt.toISOString() : null,
    updatedAt: profile.updatedAt.toISOString(),
    mateIndex: mateIndex ? mateIndex.indexValue : 50,
  });
}

// ============================================================
// GET /community/mate/recommendations  — 추천 목록 (requireAuth)
// ============================================================
/** 추천 상위 N 명 반환. 프로필 없거나 동의 없으면 `{ state:'blind' }` (GG-COMM-007/008). */
const RECO_LIMIT = 20;

export async function getRecommendations(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  // 본인 프로필 조회 — 없거나 동의 없으면 blind
  const myProfile = await prisma.mateProfile.findUnique({
    where: { userId: auth.userId },
    select: {
      gender: true,
      ageRangeLower: true,
      regionId: true,
      hasCar: true,
      nationality: true,
      koreanOk: true,
      prefGender: true,
      prefAgeLower: true,
      prefRegionId: true,
      prefHasCar: true,
      prefNationality: true,
      prefKoreanOk: true,
      consentedAt: true,
      isDeleted: true,
    },
  });

  if (!myProfile || myProfile.isDeleted || !myProfile.consentedAt) {
    res.json({ state: 'blind' });
    return;
  }

  const myAttrs = {
    gender: myProfile.gender,
    ageRangeLower: myProfile.ageRangeLower,
    regionId: myProfile.regionId,
    hasCar: myProfile.hasCar,
    nationality: myProfile.nationality,
    koreanOk: myProfile.koreanOk,
  };
  const myPrefs = {
    prefGender: myProfile.prefGender,
    prefAgeLower: myProfile.prefAgeLower,
    prefRegionId: myProfile.prefRegionId,
    prefHasCar: myProfile.prefHasCar,
    prefNationality: myProfile.prefNationality,
    prefKoreanOk: myProfile.prefKoreanOk,
  };

  // 후보풀: consent 있고 본인 제외 + 같은 지역(슬라이스2 경계)
  // NOTE: 슬라이스3 에서 이벤트 연결(같은 축제 2주내) 추가 예정.
  // NOTE: 차단 사용자 제외 훅 — 슬라이스8 GG-REPORT-009 에서 구현.
  const candidates = await prisma.mateProfile.findMany({
    where: {
      consentedAt: { not: null },
      isDeleted: false,
      userId: { not: auth.userId },
      // 슬라이스2 지역 경계: 본인 regionId 와 동일한 후보만 (null 이면 null 끼리)
      regionId: myProfile.regionId,
    },
    select: {
      userId: true,
      gender: true,
      ageRangeLower: true,
      regionId: true,
      hasCar: true,
      nationality: true,
      koreanOk: true,
      prefGender: true,
      prefAgeLower: true,
      prefRegionId: true,
      prefHasCar: true,
      prefNationality: true,
      prefKoreanOk: true,
      user: {
        select: {
          nickname: true,
          mateIndex: { select: { indexValue: true } },
        },
      },
    },
  });

  // 양방향 점수 계산 → null 제외 → 점수 desc, 동점 mateIndex desc 정렬
  const scored: Array<{ userId: bigint; nickname: string; score: number; mateIndex: number }> = [];
  for (const c of candidates) {
    const cAttrs = {
      gender: c.gender,
      ageRangeLower: c.ageRangeLower,
      regionId: c.regionId,
      hasCar: c.hasCar,
      nationality: c.nationality,
      koreanOk: c.koreanOk,
    };
    const cPrefs = {
      prefGender: c.prefGender,
      prefAgeLower: c.prefAgeLower,
      prefRegionId: c.prefRegionId,
      prefHasCar: c.prefHasCar,
      prefNationality: c.prefNationality,
      prefKoreanOk: c.prefKoreanOk,
    };
    const s = bidirectionalScore({ attrs: myAttrs, prefs: myPrefs }, { attrs: cAttrs, prefs: cPrefs });
    if (s === null) continue;
    scored.push({
      userId: c.userId,
      nickname: c.user.nickname,
      score: s,
      mateIndex: c.user.mateIndex ? c.user.mateIndex.indexValue : 50,
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.mateIndex - a.mateIndex;
  });

  const items = scored.slice(0, RECO_LIMIT).map((r) => ({
    userId: r.userId.toString(),
    nickname: r.nickname,
    score: r.score,
    mateIndex: r.mateIndex,
  }));

  res.json({ state: 'list', items });
}

// ============================================================
// GET /community/mate/index/:userId  — 타인 메이트지수 조회 (경량)
// ============================================================
export async function getMateIndex(req: Request, res: Response) {
  const userId = parseBigId(req.params.userId);
  if (!userId) {
    res.status(400).json({ error: 'invalid userId' });
    return;
  }

  const mateIndex = await prisma.mateIndex.findUnique({
    where: { userId },
    select: { indexValue: true },
  });

  res.json({ userId: userId.toString(), indexValue: mateIndex ? mateIndex.indexValue : null });
}
