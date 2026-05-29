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
} from '../routes/mate.js';

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
