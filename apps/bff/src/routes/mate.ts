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

// GG-MATCH-003: 메이트와 함께 갈 축제는 "2주 이내 개최 예정" 목록에서 선택.
export const MATE_EVENT_WINDOW_DAYS = 14;

/** 날짜 D를 자정(00:00:00)으로 절삭한 UTC Date — startDate(@db.Date) 비교용. */
function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** [오늘, 오늘+14일] 개최 예정 축제 윈도우. selector / 저장검증 / 추천 stale 체크에서 공유. */
export function upcomingMateEventWindow(now: Date): { from: Date; to: Date } {
  const from = startOfDay(now);
  const to = startOfDay(new Date(from.getTime() + MATE_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  return { from, to };
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

  // ── 선택 축제 (GG-MATCH-003) — null=미선택 허용. 제공 시 "approved + 2주내 개최" 검증 ──
  let selectedEventId: bigint | null = null;
  if (body.selectedEventId !== undefined && body.selectedEventId !== null && body.selectedEventId !== '') {
    selectedEventId = parseBigId(String(body.selectedEventId));
    if (selectedEventId === null) {
      res.status(400).json({ error: 'selectedEventId must be a positive id' });
      return;
    }
    const { from, to } = upcomingMateEventWindow(new Date());
    const ev = await prisma.event.findFirst({
      where: {
        eventId: selectedEventId,
        isDeleted: false,
        approvalStatus: 'approved',
        startDate: { gte: from, lte: to },
      },
      select: { eventId: true },
    });
    if (!ev) {
      // 미승인·삭제·2주 윈도우 밖(과거/먼미래) 축제는 선택 불가 (selector 가 보여주는 집합과 동일).
      res.status(400).json({ error: 'selected_event_not_selectable' });
      return;
    }
  }

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
        selectedEventId,
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
        selectedEventId,
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
      selectedEventId: true,
      selectedEvent: { select: { eventId: true, title: true, startDate: true } },
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
    selectedEvent: serializeSelectedEvent(profile.selectedEvent),
    consentedAt: profile.consentedAt ? profile.consentedAt.toISOString() : null,
    updatedAt: profile.updatedAt.toISOString(),
  });
}

/** 선택 축제 직렬화 — 프로필 응답 공통. null 이면 null. */
function serializeSelectedEvent(
  ev: { eventId: bigint; title: string; startDate: Date } | null | undefined,
): { eventId: string; title: string; startDate: string } | null {
  if (!ev) return null;
  return {
    eventId: ev.eventId.toString(),
    title: ev.title,
    startDate: ev.startDate.toISOString().slice(0, 10),
  };
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
        selectedEventId: true,
        selectedEvent: { select: { eventId: true, title: true, startDate: true } },
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
    selectedEvent: serializeSelectedEvent(profile.selectedEvent),
    consentedAt: profile.consentedAt ? profile.consentedAt.toISOString() : null,
    updatedAt: profile.updatedAt.toISOString(),
    mateIndex: mateIndex ? mateIndex.indexValue : 50,
  });
}

// ============================================================
// GET /community/mate/events  — 선택 가능 축제 목록 (GG-MATCH-003, requireAuth)
// ============================================================
/** 2주 이내 개최 예정 + approved 축제. 메이트 추천 받기 페이지 "축제 선택" 드롭다운 소스. */
export async function listUpcomingMateEvents(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const { from, to } = upcomingMateEventWindow(new Date());
  const events = await prisma.event.findMany({
    where: {
      isDeleted: false,
      approvalStatus: 'approved',
      startDate: { gte: from, lte: to },
    },
    select: {
      eventId: true,
      title: true,
      startDate: true,
      endDate: true,
      posterImageUrl: true,
      region: { select: { sidoName: true, sigunguName: true } },
    },
    orderBy: { startDate: 'asc' },
    take: 200,
  });

  res.json({
    events: events.map((e) => ({
      eventId: e.eventId.toString(),
      title: e.title,
      startDate: e.startDate.toISOString().slice(0, 10),
      endDate: e.endDate.toISOString().slice(0, 10),
      posterImageUrl: e.posterImageUrl,
      regionName: [e.region?.sidoName, e.region?.sigunguName].filter(Boolean).join(' ') || null,
    })),
  });
}

// ============================================================
// GET /community/mate/recommendations  — 추천 목록 (requireAuth)
// ============================================================
/** 추천 상위 N 명 반환. 프로필 없거나 동의 없으면 `{ state:'blind' }` (GG-COMM-007/008). */
const RECO_LIMIT = 20;
// 후보 fetch 상한 — 지역 내 opt-in 인원이 많아도 전체를 메모리로 끌어오지 않도록 캡.
// mateIndex desc 정렬로 상위 후보를 우선 확보한 뒤 JS 양방향 스코어링 → 상위 RECO_LIMIT.
// (지역 단위 풀에서 500은 충분히 넉넉; 초과분은 의도적으로 드롭.)
const RECO_CANDIDATE_CAP = 500;

export async function getRecommendations(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  // 본인 프로필 조회 — 없거나 동의 없거나 opt-out 이면 blind
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
      autoRecommend: true, // 요청자 opt-out 게이트 (GG-COMM-007/008)
      selectedEventId: true,
      selectedEvent: { select: { startDate: true, approvalStatus: true, isDeleted: true } },
      consentedAt: true,
      isDeleted: true,
    },
  });

  // 요청자 opt-out(autoRecommend=false) 도 blind — 매칭 기능 사용 의사 없음
  if (!myProfile || myProfile.isDeleted || !myProfile.consentedAt || !myProfile.autoRecommend) {
    res.json({ state: 'blind' });
    return;
  }

  // GG-MATCH-003 / ADR 0007 #3: 후보풀의 hard 경계 = "같은 축제(2주내 개최)".
  // 축제 미선택, 또는 선택 축제가 삭제·미승인·이미 개최 시작됨(stale) → 축제 (재)선택 유도.
  const recoNow = new Date();
  const { from: evFrom } = upcomingMateEventWindow(recoNow);
  const myEvent = myProfile.selectedEvent;
  const eventUsable =
    myProfile.selectedEventId !== null &&
    myEvent != null &&
    !myEvent.isDeleted &&
    myEvent.approvalStatus === 'approved' &&
    myEvent.startDate >= evFrom;
  if (!eventUsable) {
    res.json({ state: 'no_event' });
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

  // GG-REPORT-009: 차단 및 이용정지 사용자 추천 제외 (Slice 8)
  // 1) 양방향 Block 제외
  const blockedRows = await prisma.block.findMany({
    where: {
      OR: [
        { blockerId: auth.userId },
        { blockedUserId: auth.userId },
      ],
    },
    select: { blockerId: true, blockedUserId: true },
  });
  const blockedSet = new Set<bigint>();
  for (const b of blockedRows) {
    blockedSet.add(b.blockerId);
    blockedSet.add(b.blockedUserId);
  }
  blockedSet.delete(auth.userId); // 본인 제거

  // 2) 이용정지 만료 기준 타임스탬프 (recoNow 는 위 no_event 게이트에서 선언됨)

  // 후보풀: consent 있고 본인 제외 + 같은 축제(GG-MATCH-003) + 자동추천 동의
  // ADR 0007 #3: hard 경계 = 같은 selectedEventId. 지역은 mate-score 의 soft 점수로 잔존.
  // GG-REPORT-009: Block 양방향 제외 + 유효한 이용정지 사용자 제외
  const blockedSetArray = [...blockedSet];
  const candidates = await prisma.mateProfile.findMany({
    where: {
      consentedAt: { not: null },
      isDeleted: false,
      autoRecommend: true, // opt-out 사용자 제외 (GG-COMM-007/008)
      // GG-REPORT-009: Block 양방향 제외 (본인 제외는 아래 AND 조건에서 처리)
      AND: [
        { userId: { not: auth.userId } },
        ...(blockedSetArray.length > 0 ? [{ userId: { notIn: blockedSetArray } }] : []),
        // 유효한 이용정지 사용자 제외 (만료된 정지는 포함).
        // [review fix: high] sanctionExpiresAt=null 방어: NOT { A AND B }는 NOT A OR NOT B.
        // null expiresAt suspended 사용자도 제외되도록 user 레벨 OR 조건으로 변경.
        {
          user: {
            OR: [
              { sanctionStatus: { not: 'suspended' } },
              { sanctionExpiresAt: { lte: recoNow } },
            ],
          },
        },
      ],
      // GG-MATCH-003: 같은 축제를 선택한 후보만 (후보풀 hard 경계).
      selectedEventId: myProfile.selectedEventId,
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
    // 무한 fetch 방지: mateIndex 높은 순으로 상한까지만 로드 (nulls last).
    orderBy: { user: { mateIndex: { indexValue: 'desc' } } },
    take: RECO_CANDIDATE_CAP,
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
