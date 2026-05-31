/**
 * mate-eval.ts — in-process 검증 하니스 (PASS/FAIL)
 * 패턴: community-eval.ts 그대로 모방.
 * 실행: npm run mate:eval (apps/bff 에서)
 */
import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import {
  saveMateProfile,
  getMyMateProfile,
  getMyMateProfileWithIndex,
  getMateIndex,
  getRecommendations,
} from '../routes/mate.js';
import { scoreOneWay } from '../lib/mate-score.js';

interface MockReq {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  auth?: { userId: bigint; nickname: string; activeRole: string };
}
interface Captured { status: number; json: unknown; }

function mockRes(): Response & { _c: Captured } {
  const c: Captured = { status: 200, json: undefined };
  const res = {
    _c: c,
    status(s: number) { c.status = s; return this; },
    json(b: unknown) { c.json = b; return this; },
    end() { return this; },
  } as unknown as Response & { _c: Captured };
  return res;
}

function mockReq(r: MockReq): Request {
  return {
    params: r.params ?? {},
    query: r.query ?? {},
    body: r.body ?? {},
    auth: r.auth,
  } as unknown as Request;
}

interface CaseResult { id: string; pass: boolean; failures: string[]; }
const results: CaseResult[] = [];

function check(id: string, fn: () => Promise<string[]>) {
  return fn()
    .then((failures) => results.push({ id, pass: failures.length === 0, failures }))
    .catch((e) => results.push({ id, pass: false, failures: [`threw: ${String(e)}`] }));
}

/** 테스트용 기본 프로필 body */
const BASE_PROFILE = {
  gender: 'M',
  ageRangeLower: 25,
  nationality: 'KR',
  koreanOk: true,
  hasCar: false,
  consentedAt: new Date().toISOString(),
  autoRecommend: true,
  groupApply: false,
};

async function main() {
  // 시드: 테스트 유저 (실 세션 불요 — auth 직접 주입)
  const u = await prisma.user.findFirst({
    where: { isDeleted: false },
    select: { userId: true, nickname: true, activeRole: true },
  });
  if (!u) {
    console.error('no user to test with');
    process.exit(1);
  }
  const auth = { userId: u.userId, nickname: u.nickname, activeRole: u.activeRole };

  // 테스트 전 클린업 — 이전 실행 잔재 제거
  await prisma.mateIndex.deleteMany({ where: { userId: auth.userId } });
  await prisma.mateProfile.deleteMany({ where: { userId: auth.userId } });

  try {
    // ── CASE 1: 프로필 저장 성공 (consent 포함) ──────────────────────────────
    await check('profile.save.ok', async () => {
      const res = mockRes();
      await saveMateProfile(mockReq({ auth, body: BASE_PROFILE }), res);
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
      const b = res._c.json as { mateProfileId?: string };
      if (!b?.mateProfileId) f.push('no mateProfileId');
      return f;
    });

    // ── CASE 2: consent 없으면 422 (GG-MATCH-009/010) ─────────────────────────
    await check('profile.save.no_consent', async () => {
      const res = mockRes();
      const bodyNoConsent = { ...BASE_PROFILE };
      // @ts-expect-error intentional: omit consentedAt
      delete bodyNoConsent.consentedAt;
      await saveMateProfile(mockReq({ auth, body: bodyNoConsent }), res);
      const f: string[] = [];
      if (res._c.status !== 422) f.push(`status ${res._c.status} != 422`);
      const b = res._c.json as { error?: string };
      if (b?.error !== 'consent_required') f.push(`error "${b?.error}" != "consent_required"`);
      return f;
    });

    // ── CASE 3: upsert 멱등성 — 동일 body 재저장해도 200 ──────────────────────
    await check('profile.upsert.idempotent', async () => {
      const res1 = mockRes();
      await saveMateProfile(mockReq({ auth, body: BASE_PROFILE }), res1);
      const res2 = mockRes();
      await saveMateProfile(mockReq({ auth, body: { ...BASE_PROFILE, nationality: 'JP' } }), res2);
      const f: string[] = [];
      if (res1._c.status !== 200) f.push(`first save status ${res1._c.status}`);
      if (res2._c.status !== 200) f.push(`second save status ${res2._c.status}`);
      // DB에서 실제 nationality 갱신 확인
      const profile = await prisma.mateProfile.findUnique({ where: { userId: auth.userId }, select: { nationality: true } });
      if (profile?.nationality !== 'JP') f.push(`nationality not updated: ${profile?.nationality}`);
      return f;
    });

    // ── CASE 4: MateIndex 기본값 50 ───────────────────────────────────────────
    await check('mateIndex.default50', async () => {
      const idx = await prisma.mateIndex.findUnique({
        where: { userId: auth.userId },
        select: { indexValue: true },
      });
      const f: string[] = [];
      if (!idx) f.push('MateIndex not created');
      if (idx && idx.indexValue !== 50) f.push(`indexValue ${idx.indexValue} != 50`);
      return f;
    });

    // ── CASE 5: MateIndex 불변 — 재저장 후에도 50 유지 ───────────────────────
    // 수동으로 indexValue 를 99로 올린 뒤, upsert 해도 덮어쓰지 않는지 검증.
    await check('mateIndex.immutable', async () => {
      // 수동 변경 (슬라이스5 갱신 시뮬레이션)
      await prisma.mateIndex.update({
        where: { userId: auth.userId },
        data: { indexValue: 99 },
      });
      // 프로필 재저장
      const res = mockRes();
      await saveMateProfile(mockReq({ auth, body: BASE_PROFILE }), res);
      // indexValue 재확인 — 99 그대로여야 함
      const idx = await prisma.mateIndex.findUnique({
        where: { userId: auth.userId },
        select: { indexValue: true },
      });
      const f: string[] = [];
      if (idx?.indexValue !== 99) f.push(`indexValue was overwritten: ${idx?.indexValue} (expected 99)`);
      return f;
    });

    // ── CASE 6: GET /community/mate/profile — 본인 프로필 조회 ───────────────
    await check('profile.get.ok', async () => {
      const res = mockRes();
      await getMyMateProfile(mockReq({ auth }), res);
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
      const b = res._c.json as { mateProfileId?: string; gender?: string };
      if (!b?.mateProfileId) f.push('no mateProfileId');
      if (!b?.gender) f.push('no gender');
      return f;
    });

    // ── CASE 7: GET /community/mate/profile/me — 프로필+지수 (A_807) ─────────
    await check('profile.getWithIndex.ok', async () => {
      const res = mockRes();
      await getMyMateProfileWithIndex(mockReq({ auth }), res);
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
      const b = res._c.json as { mateIndex?: number };
      if (typeof b?.mateIndex !== 'number') f.push('no mateIndex field');
      // 이전 케이스에서 99로 변경했으므로
      if (b?.mateIndex !== 99) f.push(`mateIndex ${b?.mateIndex} != 99`);
      return f;
    });

    // ── CASE 8: GET /community/mate/index/:userId — 경량 조회 ────────────────
    await check('mateIndex.getByUserId', async () => {
      const res = mockRes();
      await getMateIndex(mockReq({ params: { userId: auth.userId.toString() } }), res);
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
      const b = res._c.json as { userId?: string; indexValue?: number };
      if (b?.userId !== auth.userId.toString()) f.push(`userId mismatch: ${b?.userId}`);
      if (typeof b?.indexValue !== 'number') f.push('no indexValue');
      return f;
    });

    // ── CASE 9: 인증 없이 저장 → 401 ────────────────────────────────────────
    await check('profile.save.unauthenticated', async () => {
      const res = mockRes();
      await saveMateProfile(mockReq({ body: BASE_PROFILE }), res); // no auth
      return res._c.status === 401 ? [] : [`status ${res._c.status} != 401`];
    });

    // ── CASE 10: consentedAt=true (boolean) bypass → 422 (GG-MATCH-009/010) ──
    // !true === false 이므로 기존 !consentedAtRaw 검사를 통과하고,
    // new Date(true) = epoch+1ms (유효한 Date) 라 저장될 수 있었던 버그.
    await check('profile.save.consent_boolean_bypass', async () => {
      const res = mockRes();
      await saveMateProfile(mockReq({ auth, body: { ...BASE_PROFILE, consentedAt: true } }), res);
      const f: string[] = [];
      if (res._c.status !== 422) f.push(`status ${res._c.status} != 422 (boolean true should be rejected)`);
      const b = res._c.json as { error?: string };
      if (b?.error !== 'consent_required') f.push(`error "${b?.error}" != "consent_required"`);
      return f;
    });

    // ================================================================
    // Task 3 — 매칭 엔진 + 추천 목록
    // ================================================================

    // ── CASE 11: score.dontcare_skips — 선호 null 이면 하드필터 제외 안 함 ──
    await check('score.dontcare_skips', async () => {
      const attrs = { gender: 'F', ageRangeLower: 30, regionId: 1n, hasCar: false, nationality: 'KR', koreanOk: true };
      const prefsAllNull = { prefGender: null, prefAgeLower: null, prefRegionId: null, prefHasCar: null, prefNationality: null, prefKoreanOk: null };
      const score = scoreOneWay(prefsAllNull, attrs);
      const f: string[] = [];
      // null 선호는 아무것도 거르지 않으므로 null 반환 금지
      if (score === null) f.push('scoreOneWay with all-null prefs should not return null (dont-care = pass)');
      return f;
    });

    // ── CASE 12: reco.hardfilter_excludes — 하드필터 불일치 시 null ─────────
    await check('reco.hardfilter_excludes', async () => {
      const attrs = { gender: 'M', ageRangeLower: 25, regionId: 1n, hasCar: false, nationality: 'KR', koreanOk: true };
      // pref gender F 이지만 상대는 M → 제외
      const prefsGenderMismatch = { prefGender: 'F', prefAgeLower: null, prefRegionId: null, prefHasCar: null, prefNationality: null, prefKoreanOk: null };
      const f: string[] = [];
      const s1 = scoreOneWay(prefsGenderMismatch, attrs);
      if (s1 !== null) f.push(`gender mismatch should return null, got ${s1}`);
      // pref hasCar true 이지만 상대 hasCar false → 제외
      const prefsCarMismatch = { prefGender: null, prefAgeLower: null, prefRegionId: null, prefHasCar: true, prefNationality: null, prefKoreanOk: null };
      const s2 = scoreOneWay(prefsCarMismatch, attrs);
      if (s2 !== null) f.push(`hasCar mismatch should return null, got ${s2}`);
      return f;
    });

    // ── CASE 13: reco.sorted_by_score_then_index — 점수↓ 동점→ mateIndex↓ ──
    // 두 번째 유저 생성 + 프로필 저장 후 추천 목록 정렬 검증.
    await check('reco.sorted_by_score_then_index', async () => {
      const f: string[] = [];
      // 두 번째 유저 (기존 DB 에서 다른 유저 pick)
      const u2 = await prisma.user.findFirst({
        where: { isDeleted: false, userId: { not: auth.userId } },
        select: { userId: true, nickname: true, activeRole: true },
      });
      if (!u2) { f.push('need 2+ users in DB for sort test — skipped'); return f; }
      const auth2 = { userId: u2.userId, nickname: u2.nickname, activeRole: u2.activeRole };

      // 클린업
      await prisma.mateIndex.deleteMany({ where: { userId: auth2.userId } });
      await prisma.mateProfile.deleteMany({ where: { userId: auth2.userId } });
      // GG-REPORT-009 회귀: report-eval 이 남긴 block 레코드가 추천 제외를 유발할 수 있으므로
      // 테스트 전에 u1↔u2 양방향 block 을 정리하고 finally 에서 복원한다.
      const preExistingBlocks = await prisma.block.findMany({
        where: {
          OR: [
            { blockerId: auth.userId, blockedUserId: auth2.userId },
            { blockerId: auth2.userId, blockedUserId: auth.userId },
          ],
        },
        select: { blockId: true, blockerId: true, blockedUserId: true, createdAt: true },
      });
      await prisma.block.deleteMany({
        where: {
          OR: [
            { blockerId: auth.userId, blockedUserId: auth2.userId },
            { blockerId: auth2.userId, blockedUserId: auth.userId },
          ],
        },
      });

      try {
        // 테스트 환경: 둘 다 같은 지역(regionId 없음 = null → 지역 필터 통과 조건 확인).
        // u1 → 선호 없음, u2 → 선호 없음. 양방향 모두 pass.
        const profile2Body = {
          gender: 'F',
          ageRangeLower: 25,
          nationality: 'KR',
          koreanOk: true,
          hasCar: false,
          consentedAt: new Date().toISOString(),
          autoRecommend: true,
          groupApply: false,
        };
        const saveRes = mockRes();
        await saveMateProfile(mockReq({ auth: auth2, body: profile2Body }), saveRes);
        if (saveRes._c.status !== 200) { f.push(`u2 profile save failed: ${saveRes._c.status}`); return f; }

        // u1 프로필도 autoRecommend 확인용 재저장
        await saveMateProfile(mockReq({ auth, body: { ...BASE_PROFILE, autoRecommend: true } }), mockRes());

        // u1 기준 추천 목록 조회
        const recoRes = mockRes();
        await getRecommendations(mockReq({ auth }), recoRes);
        if (recoRes._c.status !== 200) {
          f.push(`reco status ${recoRes._c.status} != 200`);
          return f;
        }
        const rb = recoRes._c.json as { items?: Array<{ userId: string; score: number; mateIndex: number }> };
        if (!Array.isArray(rb?.items)) { f.push('items not array'); return f; }
        // u2 가 목록에 있어야 함 (동의+매칭 가능)
        const hasU2 = rb.items.some((i) => i.userId === auth2.userId.toString());
        if (!hasU2) f.push('u2 not in reco list');
        // 정렬: score desc, 동점 시 mateIndex desc
        for (let i = 0; i < rb.items.length - 1; i++) {
          const cur = rb.items[i];
          const nxt = rb.items[i + 1];
          if (cur && nxt) {
            if (cur.score < nxt.score) f.push(`items[${i}].score ${cur.score} < items[${i + 1}].score ${nxt.score} (not desc)`);
            if (cur.score === nxt.score && cur.mateIndex < nxt.mateIndex)
              f.push(`same score but mateIndex not desc at [${i}]`);
          }
        }
      } finally {
        await prisma.mateIndex.deleteMany({ where: { userId: auth2.userId } });
        await prisma.mateProfile.deleteMany({ where: { userId: auth2.userId } });
        // 정리했던 block 레코드 복원 (다른 테스트 영향 없도록)
        if (preExistingBlocks.length > 0) {
          await prisma.block.createMany({
            data: preExistingBlocks.map((b) => ({
              blockId: b.blockId,
              blockerId: b.blockerId,
              blockedUserId: b.blockedUserId,
              createdAt: b.createdAt,
            })),
            skipDuplicates: true,
          });
        }
      }
      return f;
    });

    // ── CASE 14: reco.blind_when_no_profile — 프로필 없으면 blind 상태 ───────
    await check('reco.blind_when_no_profile', async () => {
      // 프로필 없는 새 유저처럼 — 존재하지 않는 userId
      const ghostAuth = { userId: 999999999999n, nickname: 'ghost', activeRole: 'user' };
      const res = mockRes();
      await getRecommendations(mockReq({ auth: ghostAuth }), res);
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
      const b = res._c.json as { state?: string };
      if (b?.state !== 'blind') f.push(`state "${b?.state}" != "blind"`);
      return f;
    });

    // ── CASE 15: reco.autoRecommend_false_excluded — autoRecommend=false 후보 미포함 ──
    // GG-COMM-007/008 프라이버시 의미: autoRecommend=false 설정 사용자는
    // 매칭 동의(consentedAt)가 있어도 타인 추천 목록에 노출되면 안 됨.
    // (후보풀 쪽 타인 보호)
    await check('reco.autoRecommend_false_excluded', async () => {
      const f: string[] = [];
      const u3 = await prisma.user.findFirst({
        where: { isDeleted: false, userId: { not: auth.userId } },
        select: { userId: true, nickname: true, activeRole: true },
      });
      if (!u3) { f.push('need 2+ users in DB — skipped'); return f; }
      const auth3 = { userId: u3.userId, nickname: u3.nickname, activeRole: u3.activeRole };

      // 클린업
      await prisma.mateIndex.deleteMany({ where: { userId: auth3.userId } });
      await prisma.mateProfile.deleteMany({ where: { userId: auth3.userId } });

      try {
        // u3: consent 있지만 autoRecommend=false (opt-out)
        const optOutBody = {
          gender: 'F',
          ageRangeLower: 25,
          nationality: 'KR',
          koreanOk: true,
          hasCar: false,
          consentedAt: new Date().toISOString(),
          autoRecommend: false, // ← opt-out
          groupApply: false,
        };
        const saveRes3 = mockRes();
        await saveMateProfile(mockReq({ auth: auth3, body: optOutBody }), saveRes3);
        if (saveRes3._c.status !== 200) { f.push(`u3 save failed: ${saveRes3._c.status}`); return f; }

        // u1 자신도 최신 프로필(autoRecommend=true)로 재저장
        await saveMateProfile(mockReq({ auth, body: { ...BASE_PROFILE, autoRecommend: true } }), mockRes());

        // u1 기준 추천 목록 — u3 는 opt-out 이므로 미포함이어야 함
        const recoRes = mockRes();
        await getRecommendations(mockReq({ auth }), recoRes);
        if (recoRes._c.status !== 200) {
          f.push(`reco status ${recoRes._c.status} != 200`);
          return f;
        }
        const rb = recoRes._c.json as { items?: Array<{ userId: string }> };
        if (!Array.isArray(rb?.items)) { f.push('items not array'); return f; }
        const hasU3 = rb.items.some((i) => i.userId === auth3.userId.toString());
        if (hasU3) f.push('u3 (autoRecommend=false) must NOT appear in recommendations');
      } finally {
        await prisma.mateIndex.deleteMany({ where: { userId: auth3.userId } });
        await prisma.mateProfile.deleteMany({ where: { userId: auth3.userId } });
      }
      return f;
    });

    // ── CASE 16: requester.autoRecommend_false_returns_blind ─────────────────
    // [critical] 리뷰 지적: 요청자 본인의 autoRecommend=false(opt-out)를
    // 확인하지 않아 opt-out 사용자도 추천 목록을 받을 수 있었음.
    // GG-COMM-007/008 프라이버시 의미: 요청자가 autoRecommend=false 이면
    // 매칭 기능을 사용하지 않겠다는 의사 표시 → blind 반환해야 함.
    await check('requester.autoRecommend_false_returns_blind', async () => {
      const f: string[] = [];

      // u1 프로필을 autoRecommend=false 로 저장 (요청자 opt-out 시나리오)
      const optOutBody = { ...BASE_PROFILE, autoRecommend: false };
      const saveRes = mockRes();
      await saveMateProfile(mockReq({ auth, body: optOutBody }), saveRes);
      if (saveRes._c.status !== 200) { f.push(`save failed: ${saveRes._c.status}`); return f; }

      // u1 기준 추천 목록 조회 — opt-out 이므로 blind 상태여야 함
      const recoRes = mockRes();
      await getRecommendations(mockReq({ auth }), recoRes);
      if (recoRes._c.status !== 200) {
        f.push(`reco status ${recoRes._c.status} != 200`);
        return f;
      }
      const rb = recoRes._c.json as { state?: string };
      if (rb?.state !== 'blind') {
        f.push(`requester with autoRecommend=false must get state:"blind", got "${rb?.state}"`);
      }

      // 복원 — 이후 케이스에 영향 없도록 autoRecommend=true 로 되돌림
      await saveMateProfile(mockReq({ auth, body: { ...BASE_PROFILE, autoRecommend: true } }), mockRes());
      return f;
    });

  } finally {
    // 픽스처 정리 — 반복 실행 시 DB 오염 방지
    await prisma.mateIndex.deleteMany({ where: { userId: auth.userId } });
    await prisma.mateProfile.deleteMany({ where: { userId: auth.userId } });
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(
      `${r.pass ? 'PASS' : 'FAIL'} ${r.id}${r.failures.length ? ' :: ' + r.failures.join('; ') : ''}`,
    );
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();
