/**
 * seed-mate-test.ts — 메이트 매칭 수동 테스트용 상대 계정 시드.
 *
 * 대상: suj4861@gmail.com (구글 로그인 = auth_provider 'google').
 * 목적: 해당 계정의 메이트 추천 목록(GET /community/mate/recommendations)에
 *       "조건에 맞는" 상대 5명이 점수 내림차순으로 뜨도록 더미 후보를 만든다.
 *
 * 매칭 규칙 요약 (mate.ts getRecommendations + lib/mate-score.ts):
 *   후보풀 hard 경계 = consentedAt!=null AND autoRecommend AND isDeleted=false
 *                      AND selectedEventId == 대상의 selectedEventId (같은 축제)
 *   양방향 점수 = scoreOneWay(대상.prefs, 후보.attrs) + scoreOneWay(후보.prefs, 대상.attrs)
 *   대상의 prefs 가 전부 NULL 이면 대상→후보는 항상 0점 통과 → 총점 = 후보→대상 점수.
 *   ⚠️ 후보 prefs 중 하나라도 (null 아님 AND 대상 실제 속성과 불일치)이면 scoreOneWay=null → 제외.
 *      따라서 후보 prefs 는 **대상의 실제 attrs 값**으로만 채워야 한다(아래는 런타임에 대상을 읽어 생성).
 *
 * 또한 대상의 selectedEvent 는 [오늘, 오늘+14일] 윈도우 + approved 여야 추천이 산출된다.
 * 대상이 골라둔 축제가 윈도우 밖이면(과거 시작) state:'no_event' 로 막히므로,
 * 이 스크립트가 윈도우 내 유효 축제로 재지정한다(원래 선택은 콘솔에 안내).
 *
 * 실행:  cd apps/bff && npx dotenv -e ../../.env -- tsx src/jobs/seed-mate-test.ts
 * 정리:  ... tsx src/jobs/seed-mate-test.ts clean
 */
import { prisma } from '../prisma.js';

const TARGET_PROVIDER = 'google';
// suj4861@gmail.com 구글 sub. 환경에 따라 다르면 첫 google 유저로 폴백.
const TARGET_SOCIAL_UID = '104250056155439846865';

// 선호 축제 후보 — 윈도우 안에 있으면 이걸 우선 사용 (세종시즌 '더 트라이브').
const PREFERRED_EVENT_ID = 1071n;

const MATE_EVENT_WINDOW_DAYS = 14;
function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// mate-score.ts 의 소프트 가중치와 동일 (점수 예상 계산용).
const WEIGHT = { gender: 20, age: 20, region: 20, nationality: 15, hasCar: 15, koreanOk: 10 } as const;

type TargetAttrs = {
  gender: string;
  ageRangeLower: number;
  regionId: bigint | null;
  hasCar: boolean;
  nationality: string;
  koreanOk: boolean;
};

type Prefs = {
  prefGender: string | null;
  prefAgeLower: number | null;
  prefRegionId: bigint | null;
  prefHasCar: boolean | null;
  prefNationality: string | null;
  prefKoreanOk: boolean | null;
};

// "대상의 어떤 항목을 선호로 요구할지" 플래그. 요구한 항목은 대상의 실제 값으로 채워져
// 하드필터를 통과하고 해당 가중치만큼 가점된다 → want 조합으로 점수를 분산시킨다.
type Want = Partial<Record<keyof typeof WEIGHT, boolean>>;

// 표시용 후보 속성(점수와 무관 — 대상 prefs 가 전부 null 이므로 후보 attrs 는 필터되지 않음).
const CANDIDATES: Array<{
  uid: string;
  nick: string;
  gender: string;
  ageRangeLower: number;
  nationality: string;
  koreanOk: boolean;
  hasCar: boolean;
  regionId: bigint | null;
  mateIndex: number;
  want: Want;
}> = [
  {
    uid: 'mate_test_1', nick: '메이트테스트A', gender: 'F', ageRangeLower: 30, nationality: '대한민국', koreanOk: true, hasCar: true, regionId: 248n,
    mateIndex: 92, want: { gender: true, age: true, region: true, nationality: true, hasCar: true, koreanOk: true },
  },
  {
    uid: 'mate_test_2', nick: '메이트테스트B', gender: 'F', ageRangeLower: 25, nationality: '미국', koreanOk: false, hasCar: true, regionId: 248n,
    mateIndex: 80, want: { gender: true, age: true, region: true, nationality: true, koreanOk: true },
  },
  {
    uid: 'mate_test_3', nick: '메이트테스트C', gender: 'M', ageRangeLower: 40, nationality: '베트남', koreanOk: true, hasCar: true, regionId: null,
    mateIndex: 65, want: { gender: true, region: true, nationality: true },
  },
  {
    uid: 'mate_test_4', nick: '메이트테스트D', gender: 'M', ageRangeLower: 20, nationality: '대한민국', koreanOk: true, hasCar: false, regionId: null,
    mateIndex: 50, want: { gender: true, hasCar: true },
  },
  {
    uid: 'mate_test_5', nick: '메이트테스트E', gender: 'F', ageRangeLower: 35, nationality: '일본', koreanOk: true, hasCar: false, regionId: null,
    mateIndex: 40, want: { gender: true },
  },
];

// want + 대상 실제 attrs → 후보 prefs (요구한 항목만 대상 값으로 채움).
function buildPrefs(want: Want, t: TargetAttrs): Prefs {
  return {
    prefGender: want.gender ? t.gender : null,
    prefAgeLower: want.age ? t.ageRangeLower : null,
    // 대상 region 이 null 이면 매칭 불가 → 선호도 null 로 둔다(하드필터 회피).
    prefRegionId: want.region && t.regionId !== null ? t.regionId : null,
    prefHasCar: want.hasCar ? t.hasCar : null,
    prefNationality: want.nationality ? t.nationality : null,
    prefKoreanOk: want.koreanOk ? t.koreanOk : null,
  };
}

// 예상 점수(후보→대상). 대상 prefs 가 전부 null 이라는 가정하에 총점과 동일.
function expectedScore(want: Want, t: TargetAttrs): number {
  let s = 0;
  if (want.gender) s += WEIGHT.gender;
  if (want.age) s += WEIGHT.age; // pref=대상 값 → ageDiff 0 → 만점
  if (want.region && t.regionId !== null) s += WEIGHT.region;
  if (want.nationality) s += WEIGHT.nationality;
  if (want.hasCar) s += WEIGHT.hasCar;
  if (want.koreanOk) s += WEIGHT.koreanOk;
  return s;
}

async function findTarget() {
  const byUid = await prisma.user.findUnique({
    where: { authProvider_socialUid: { authProvider: TARGET_PROVIDER, socialUid: TARGET_SOCIAL_UID } },
    select: { userId: true, nickname: true },
  });
  if (byUid) return byUid;
  return prisma.user.findFirst({ where: { authProvider: TARGET_PROVIDER, isDeleted: false }, select: { userId: true, nickname: true } });
}

async function clean(ids: bigint[]) {
  await prisma.mateIndex.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mateProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { userId: { in: ids } } });
}

async function main() {
  const mode = process.argv[2];

  const target = await findTarget();
  if (!target) {
    console.error(`대상 계정(${TARGET_PROVIDER}/${TARGET_SOCIAL_UID})을 찾지 못했습니다. 먼저 한 번 로그인하세요.`);
    await prisma.$disconnect();
    return;
  }

  // 후보 유저 id 확보 (clean 대상)
  const existing = await prisma.user.findMany({
    where: { authProvider: 'dev', socialUid: { in: CANDIDATES.map((c) => c.uid) } },
    select: { userId: true },
  });

  if (mode === 'clean') {
    await clean(existing.map((u) => u.userId));
    console.log(`CLEANED ${existing.length} mate test 후보 (대상 ${target.nickname} 의 selectedEvent 는 그대로 둠)`);
    await prisma.$disconnect();
    return;
  }

  // ── 윈도우 내 유효 축제 결정 ──
  const now = new Date();
  const from = startOfDay(now);
  const to = startOfDay(new Date(from.getTime() + MATE_EVENT_WINDOW_DAYS * 86400000));

  const preferred = await prisma.event.findFirst({
    where: { eventId: PREFERRED_EVENT_ID, isDeleted: false, approvalStatus: 'approved', startDate: { gte: from, lte: to } },
    select: { eventId: true, title: true },
  });
  const event =
    preferred ??
    (await prisma.event.findFirst({
      where: { isDeleted: false, approvalStatus: 'approved', startDate: { gte: from, lte: to } },
      orderBy: { startDate: 'asc' },
      select: { eventId: true, title: true },
    }));
  if (!event) {
    console.error('윈도우 내 approved 축제가 없습니다. 시드 중단.');
    await prisma.$disconnect();
    return;
  }

  // ── 대상 프로필 보정: 같은 축제로 재지정 + 동의/자동추천 보장 ──
  // 후보 prefs 를 대상 실제 attrs 에 맞춰 만들기 위해 attrs 도 함께 읽는다.
  const targetProfile = await prisma.mateProfile.findUnique({
    where: { userId: target.userId },
    select: {
      selectedEventId: true,
      gender: true, ageRangeLower: true, regionId: true, hasCar: true, nationality: true, koreanOk: true,
    },
  });
  if (!targetProfile) {
    console.error(`대상(${target.nickname})의 메이트 프로필이 없습니다. 앱에서 먼저 프로필을 저장하세요.`);
    await prisma.$disconnect();
    return;
  }
  if (
    targetProfile.gender === null || targetProfile.ageRangeLower === null ||
    targetProfile.hasCar === null || targetProfile.nationality === null || targetProfile.koreanOk === null
  ) {
    console.error(`대상(${target.nickname})의 필수 attrs(gender/age/hasCar/nationality/koreanOk)에 null 이 있습니다. 앱에서 프로필을 완성하세요.`);
    await prisma.$disconnect();
    return;
  }
  const tAttrs: TargetAttrs = {
    gender: targetProfile.gender,
    ageRangeLower: targetProfile.ageRangeLower,
    regionId: targetProfile.regionId,
    hasCar: targetProfile.hasCar,
    nationality: targetProfile.nationality,
    koreanOk: targetProfile.koreanOk,
  };

  const prevEventId = targetProfile.selectedEventId;
  await prisma.mateProfile.update({
    where: { userId: target.userId },
    data: { selectedEventId: event.eventId, autoRecommend: true, consentedAt: new Date(), isDeleted: false },
  });
  await prisma.mateIndex.upsert({ where: { userId: target.userId }, create: { userId: target.userId, indexValue: 50 }, update: {} });

  // ── 후보 시드 ──
  for (const c of CANDIDATES) {
    const prefs = buildPrefs(c.want, tAttrs);
    const u = await prisma.user.upsert({
      where: { authProvider_socialUid: { authProvider: 'dev', socialUid: c.uid } },
      create: { socialUid: c.uid, authProvider: 'dev', nickname: c.nick, activeRole: 'user', regionId: c.regionId },
      update: { nickname: c.nick, isDeleted: false, sanctionStatus: 'none', sanctionExpiresAt: null, regionId: c.regionId },
      select: { userId: true },
    });
    await prisma.mateProfile.upsert({
      where: { userId: u.userId },
      create: {
        userId: u.userId,
        gender: c.gender, ageRangeLower: c.ageRangeLower, regionId: c.regionId, hasCar: c.hasCar, nationality: c.nationality, koreanOk: c.koreanOk,
        ...prefs,
        autoRecommend: true, groupApply: true, selectedEventId: event.eventId, consentedAt: new Date(),
      },
      update: {
        gender: c.gender, ageRangeLower: c.ageRangeLower, regionId: c.regionId, hasCar: c.hasCar, nationality: c.nationality, koreanOk: c.koreanOk,
        ...prefs,
        autoRecommend: true, groupApply: true, selectedEventId: event.eventId, consentedAt: new Date(), isDeleted: false, deletedAt: null,
      },
    });
    await prisma.mateIndex.upsert({
      where: { userId: u.userId },
      create: { userId: u.userId, indexValue: c.mateIndex },
      update: { indexValue: c.mateIndex },
    });
  }

  console.log('───────────────────────────────────────────');
  console.log(`대상       : ${target.nickname} (userId=${target.userId})`);
  console.log(`대상 attrs  : ${tAttrs.gender}/${tAttrs.ageRangeLower}/region${tAttrs.regionId ?? '∅'}/car=${tAttrs.hasCar}/${tAttrs.nationality}/ko=${tAttrs.koreanOk}`);
  console.log(`선택 축제   : [${event.eventId}] ${event.title}`);
  if (prevEventId && prevEventId !== event.eventId) {
    console.log(`  ↳ 이전 선택(${prevEventId})은 윈도우 밖이라 위 축제로 재지정함. 앱에서 다른 축제로 바꾸면 후보가 안 보일 수 있음.`);
  }
  console.log(`후보 ${CANDIDATES.length}명 (추천 목록 예상 점수 내림차순):`);
  const withScore = CANDIDATES.map((c) => ({ c, score: expectedScore(c.want, tAttrs) })).sort((a, b) => b.score - a.score);
  for (const { c, score } of withScore) {
    console.log(`  - ${c.nick.padEnd(8)} score≈${String(score).padStart(3)}  mateIndex=${c.mateIndex}`);
  }
  console.log('확인: 앱에서 suj4861 로 로그인 → 메이트 추천 받기 → 위 5명이 떠야 함.');
  console.log('───────────────────────────────────────────');
  await prisma.$disconnect();
}
void main();
