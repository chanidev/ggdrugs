/**
 * report-eval.ts — 신고 접수 + 차단 API 인-프로세스 검증 하니스 (GG-REPORT-001~003, GG-REPORT-008)
 *
 * 실행: npx tsx apps/bff/src/jobs/report-eval.ts
 *
 * 시나리오 10건:
 *  1. POST /community/reports 정상 접수 → 201
 *  2. 자기 자신 신고 → 400 cannot_report_self
 *  3. 존재하지 않는 targetEntityId → 404 target_entity_not_found
 *  4. 중복 신고 (pending 상태) → 409 already_reported
 *  5. dismissed 후 재신고 → 201 허용
 *  6. 미인증 → 401 unauthenticated
 *  7. POST /community/users/:targetUserId/block 정상 차단 → 201
 *  8. 자기 자신 차단 → 400 cannot_block_self
 *  9. 중복 차단 → 409 already_blocked
 * 10. 미인증 차단 → 401 unauthenticated
 */

import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { createReport, blockUser } from '../routes/reports.js';

// ─── 목 헬퍼 ─────────────────────────────────────────────────────────────────

interface MockAuth { userId: bigint; nickname: string; activeRole: string; }
interface MockReq {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  auth?: MockAuth;
}
interface Captured { status: number; json: unknown; }

function mockRes(): Response & { _c: Captured } {
  const c: Captured = { status: 200, json: undefined };
  return {
    _c: c,
    status(s: number) { c.status = s; return this; },
    json(b: unknown) { c.json = b; return this; },
    end() { return this; },
  } as unknown as Response & { _c: Captured };
}

function mockReq(r: MockReq): Request {
  return {
    params: r.params ?? {},
    query: r.query ?? {},
    body: r.body ?? {},
    auth: r.auth,
  } as unknown as Request;
}

// ─── 결과 수집 ────────────────────────────────────────────────────────────────

interface CaseResult { id: string; pass: boolean; failures: string[]; }
const results: CaseResult[] = [];

function check(id: string, fn: () => Promise<string[]>) {
  return fn()
    .then((f) => results.push({ id, pass: f.length === 0, failures: f }))
    .catch((e) => results.push({ id, pass: false, failures: [`threw: ${String(e)}`] }));
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── 픽스처 준비 ────────────────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: { isDeleted: false },
    select: { userId: true, nickname: true, activeRole: true },
    take: 2,
  });
  if (users.length < 2) {
    console.error('need 2+ users');
    process.exit(1);
  }
  const u1 = users[0]!;
  const u2 = users[1]!;
  const auth1: MockAuth = { userId: u1.userId, nickname: u1.nickname, activeRole: u1.activeRole };
  const auth2: MockAuth = { userId: u2.userId, nickname: u2.nickname, activeRole: u2.activeRole };

  // 게시글 픽스처 (최소 1건 필요)
  let testPostId: bigint | null = null;
  const existingPost = await prisma.post.findFirst({
    where: { isDeleted: false },
    select: { postId: true, userId: true },
  });
  if (existingPost && existingPost.userId !== u1.userId) {
    // u1이 u2의 게시글을 신고하도록 pixture 확인
    testPostId = existingPost.postId;
  }

  if (!testPostId) {
    // u2가 쓴 게시글 생성
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const post = await prisma.post.create({
      data: {
        userId: u2.userId,
        category: 'free',
        title: 'report-eval 테스트 게시글',
        body: '신고 테스트용 게시글입니다.',
        expiresAt,
      },
      select: { postId: true },
    });
    testPostId = post.postId;
  }

  const testPostIdStr = testPostId.toString();

  // ── 케이스 1: 정상 신고 접수 → 201 ────────────────────────────────────────
  await check('report.create.ok', async () => {
    // 기존 신고 정리 (멱등성)
    await prisma.report.deleteMany({
      where: {
        reporterId: auth1.userId,
        targetType: 'post',
        targetEntityId: testPostId!,
        status: { not: 'dismissed' },
      },
    });
    const res = mockRes();
    await createReport(
      mockReq({
        auth: auth1,
        body: {
          targetUserId: u2.userId.toString(),
          targetType: 'post',
          targetEntityId: testPostIdStr,
          reason: 'spam',
          detail: '광고성 글입니다.',
        },
      }),
      res,
    );
    const f: string[] = [];
    if (res._c.status !== 201) f.push(`status ${res._c.status} != 201`);
    const b = res._c.json as { reportId?: string };
    if (!b?.reportId) f.push('no reportId in response');
    return f;
  });

  // ── 케이스 2: 자기 자신 신고 → 400 ──────────────────────────────────────
  await check('report.create.self_report', async () => {
    const res = mockRes();
    await createReport(
      mockReq({
        auth: auth1,
        body: {
          targetUserId: u1.userId.toString(), // 자기 자신
          targetType: 'post',
          targetEntityId: testPostIdStr,
          reason: 'spam',
        },
      }),
      res,
    );
    const f: string[] = [];
    if (res._c.status !== 400) f.push(`status ${res._c.status} != 400`);
    const b = res._c.json as { error?: string };
    if (b?.error !== 'cannot_report_self') f.push(`error "${b?.error}" != "cannot_report_self"`);
    return f;
  });

  // ── 케이스 3: 존재하지 않는 targetEntityId → 404 ─────────────────────────
  await check('report.create.entity_not_found', async () => {
    const res = mockRes();
    await createReport(
      mockReq({
        auth: auth1,
        body: {
          targetUserId: u2.userId.toString(),
          targetType: 'post',
          targetEntityId: '999999999999', // 존재하지 않는 postId
          reason: 'abuse',
        },
      }),
      res,
    );
    const f: string[] = [];
    if (res._c.status !== 404) f.push(`status ${res._c.status} != 404`);
    const b = res._c.json as { error?: string };
    if (b?.error !== 'target_entity_not_found') f.push(`error "${b?.error}" != "target_entity_not_found"`);
    return f;
  });

  // ── 케이스 4: 중복 신고 (pending 상태) → 409 ─────────────────────────────
  await check('report.create.duplicate_pending', async () => {
    // 케이스1에서 이미 pending 신고가 생성됨 — 동일 조건 재시도
    const res = mockRes();
    await createReport(
      mockReq({
        auth: auth1,
        body: {
          targetUserId: u2.userId.toString(),
          targetType: 'post',
          targetEntityId: testPostIdStr,
          reason: 'harassment',
        },
      }),
      res,
    );
    const f: string[] = [];
    if (res._c.status !== 409) f.push(`status ${res._c.status} != 409`);
    const b = res._c.json as { error?: string };
    if (b?.error !== 'already_reported') f.push(`error "${b?.error}" != "already_reported"`);
    return f;
  });

  // ── 케이스 5: dismissed 후 재신고 → 201 ──────────────────────────────────
  await check('report.create.after_dismissed', async () => {
    // 1) auth1의 모든 기존 신고 삭제 (케이스1에서 생성된 pending 포함)
    await prisma.report.deleteMany({
      where: {
        reporterId: auth1.userId,
        targetType: 'post',
        targetEntityId: testPostId!,
      },
    });
    // 2) dismissed 상태 신고 직접 삽입 (재신고 허용 대상)
    await prisma.report.create({
      data: {
        reporterId: auth1.userId,
        targetUserId: u2.userId,
        targetType: 'post',
        targetEntityId: testPostId!,
        reason: 'spam',
        status: 'dismissed',
      },
    });

    // 3) dismissed 후 재신고 시도 → 201 허용
    const res = mockRes();
    await createReport(
      mockReq({
        auth: auth1,
        body: {
          targetUserId: u2.userId.toString(),
          targetType: 'post',
          targetEntityId: testPostIdStr,
          reason: 'abuse',
          detail: '재신고: dismissed 후 새 위반 내용.',
        },
      }),
      res,
    );
    const f: string[] = [];
    if (res._c.status !== 201) f.push(`status ${res._c.status} != 201`);
    const b = res._c.json as { reportId?: string };
    if (!b?.reportId) f.push('no reportId — dismissed 후 재신고가 허용되지 않음');
    return f;
  });

  // ── 케이스 6: 미인증 → 401 ───────────────────────────────────────────────
  await check('report.create.unauthenticated', async () => {
    const res = mockRes();
    await createReport(
      mockReq({
        // auth 없음
        body: {
          targetUserId: u2.userId.toString(),
          targetType: 'post',
          targetEntityId: testPostIdStr,
          reason: 'spam',
        },
      }),
      res,
    );
    const f: string[] = [];
    if (res._c.status !== 401) f.push(`status ${res._c.status} != 401`);
    return f;
  });

  // ── blockUser 케이스 7: 정상 차단 → 201 ─────────────────────────────────
  await check('block.ok', async () => {
    // 기존 차단 정리 (멱등성)
    await prisma.block.deleteMany({
      where: { blockerId: auth1.userId, blockedUserId: u2.userId },
    });
    const res = mockRes();
    await blockUser(
      mockReq({
        auth: auth1,
        params: { targetUserId: u2.userId.toString() },
      }),
      res,
    );
    const f: string[] = [];
    if (res._c.status !== 201) f.push(`status ${res._c.status} != 201`);
    const b = res._c.json as { blockId?: string };
    if (!b?.blockId) f.push('no blockId in response');
    return f;
  });

  // ── blockUser 케이스 8: 자기 자신 차단 → 400 ─────────────────────────────
  await check('block.self_block', async () => {
    const res = mockRes();
    await blockUser(
      mockReq({
        auth: auth1,
        params: { targetUserId: u1.userId.toString() }, // 자기 자신
      }),
      res,
    );
    const f: string[] = [];
    if (res._c.status !== 400) f.push(`status ${res._c.status} != 400`);
    const b = res._c.json as { error?: string };
    if (b?.error !== 'cannot_block_self') f.push(`error "${b?.error}" != "cannot_block_self"`);
    return f;
  });

  // ── blockUser 케이스 9: 중복 차단 → 409 ──────────────────────────────────
  await check('block.duplicate', async () => {
    // 케이스 7에서 이미 차단 레코드가 생성됨 — 동일 조건 재시도
    const res = mockRes();
    await blockUser(
      mockReq({
        auth: auth1,
        params: { targetUserId: u2.userId.toString() },
      }),
      res,
    );
    const f: string[] = [];
    if (res._c.status !== 409) f.push(`status ${res._c.status} != 409`);
    const b = res._c.json as { error?: string };
    if (b?.error !== 'already_blocked') f.push(`error "${b?.error}" != "already_blocked"`);
    return f;
  });

  // ── blockUser 케이스 10: 미인증 → 401 ────────────────────────────────────
  await check('block.unauthenticated', async () => {
    const res = mockRes();
    await blockUser(
      mockReq({
        // auth 없음
        params: { targetUserId: u2.userId.toString() },
      }),
      res,
    );
    const f: string[] = [];
    if (res._c.status !== 401) f.push(`status ${res._c.status} != 401`);
    return f;
  });

  // ── 결과 출력 ──────────────────────────────────────────────────────────────
  const pass = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`\nreport-eval: ${pass}/${total} PASS`);
  for (const r of results) {
    const icon = r.pass ? '✓' : '✗';
    console.log(`  ${icon} ${r.id}`);
    if (!r.pass) {
      for (const f of r.failures) console.log(`      ↳ ${f}`);
    }
  }
  if (pass < total) process.exitCode = 1;
}

void main().finally(() => prisma.$disconnect());
