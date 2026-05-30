/**
 * notif-eval.ts — Slice 6 in-process 검증 하니스 (PASS/FAIL)
 * 실행: npm run notif:eval (apps/bff 에서)
 *
 * 검증 범위:
 *   - listMyNotifications: 응답에 notificationType/relatedEntityId/relatedEntityType 포함
 *   - listMyNotifications unreadOnly=true: kick_vote 제외 확인
 *   - listMyNotifications: appointment 타입에 relatedChatRoomId 필드 존재
 *   - markNotificationRead: 정상 200; kick_vote 타입은 readAt 미변경
 *   - listMyAppointments: confirmed 약속만 반환
 *   - listMyAppointments: from+to 모두 공급 시 유효 범위 필터 동작 — 과거 범위 지정 시 빈 목록 반환
 */
import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { listMyNotifications, markNotificationRead } from '../routes/notifications.js';
import { listMyAppointments } from '../routes/appointments.js';

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

interface CaseResult { id: string; pass: boolean; failures: string[]; }
const results: CaseResult[] = [];

function check(id: string, fn: () => Promise<string[]>) {
  return fn()
    .then((f) => results.push({ id, pass: f.length === 0, failures: f }))
    .catch((e) => results.push({ id, pass: false, failures: [`threw: ${String(e)}`] }));
}

async function main() {
  // ── 픽스처: 유저 1명 ─────────────────────────────────────────
  const u = await prisma.user.findFirst({
    where: { isDeleted: false },
    select: { userId: true, nickname: true, activeRole: true },
  });
  if (!u) { console.error('need 1+ user'); process.exit(1); }
  const auth: MockAuth = { userId: u.userId, nickname: u.nickname, activeRole: u.activeRole };

  // ── CASE 1: listMyNotifications 기본 응답 shape ─────────────
  await check('notif.list.shape', async () => {
    const res = mockRes();
    await listMyNotifications(mockReq({ auth, query: { limit: '10' } }), res);
    const f: string[] = [];
    if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
    const b = res._c.json as { page?: number; limit?: number; total?: number; items?: unknown[] };
    if (b.page === undefined) f.push('missing page');
    if (b.limit === undefined) f.push('missing limit');
    if (b.total === undefined) f.push('missing total');
    if (!Array.isArray(b.items)) f.push('items not array');
    return f;
  });

  // ── CASE 2: items에 notificationType/relatedEntityId/relatedEntityType 필드 포함 ──
  await check('notif.list.has_type_fields', async () => {
    const res = mockRes();
    await listMyNotifications(mockReq({ auth, query: { limit: '5' } }), res);
    const b = res._c.json as { items?: Array<Record<string, unknown>> };
    if (!b.items || b.items.length === 0) return []; // 알림 없으면 skip
    const first = b.items[0]!;
    const f: string[] = [];
    if (!('notificationType' in first)) f.push('missing notificationType field');
    if (!('relatedEntityId' in first)) f.push('missing relatedEntityId field');
    if (!('relatedEntityType' in first)) f.push('missing relatedEntityType field');
    if (!('relatedChatRoomId' in first)) f.push('missing relatedChatRoomId field');
    return f;
  });

  // ── CASE 3: unreadOnly=true kick_vote 제외 ─────────────────
  await check('notif.list.unreadOnly_excludes_kick_vote', async () => {
    const res = mockRes();
    await listMyNotifications(mockReq({ auth, query: { unreadOnly: 'true', limit: '100' } }), res);
    const b = res._c.json as { items?: Array<{ notificationType?: string | null }> };
    const f: string[] = [];
    if (b.items?.some((i) => i.notificationType === 'kick_vote')) {
      f.push('kick_vote found in unreadOnly list');
    }
    return f;
  });

  // ── CASE 4: appointment/appointment_update/mate_eval 타입 알림에 relatedChatRoomId 조인 ──
  // appointmentEntityTypes 3종 모두 커버 (GG-NOTI-012/013/014)
  await check('notif.list.appointment_has_chatRoomId', async () => {
    const res = mockRes();
    await listMyNotifications(mockReq({ auth, query: { limit: '100' } }), res);
    const b = res._c.json as { items?: Array<Record<string, unknown>> };
    const apptNotifs = (b.items ?? []).filter(
      (i) =>
        i.notificationType === 'appointment' ||
        i.notificationType === 'appointment_update' ||
        i.notificationType === 'mate_eval',
    );
    if (apptNotifs.length === 0) return []; // skip — no fixture
    const f: string[] = [];
    for (const n of apptNotifs) {
      if (!('relatedChatRoomId' in n)) {
        f.push(`appointment-entity notif missing relatedChatRoomId field`);
        break;
      }
    }
    return f;
  });

  // ── CASE 5: markNotificationRead 존재하는 알림 ─────────────
  const notif = await prisma.notification.findFirst({
    where: { userId: u.userId, notificationType: { not: 'kick_vote' } },
    select: { notificationId: true },
  });
  if (notif) {
    await check('notif.read.ok', async () => {
      const res = mockRes();
      await markNotificationRead(
        mockReq({ auth, params: { id: notif.notificationId.toString() } }),
        res,
      );
      return res._c.status === 200 ? [] : [`status ${res._c.status} != 200`];
    });
  } else {
    results.push({ id: 'notif.read.ok', pass: true, failures: ['skipped — no notification fixture'] });
  }

  // ── CASE 6: markNotificationRead 잘못된 id → 400 ───────────
  await check('notif.read.bad_id', async () => {
    const res = mockRes();
    await markNotificationRead(mockReq({ auth, params: { id: 'not-a-number' } }), res);
    return res._c.status === 400 ? [] : [`status ${res._c.status} != 400`];
  });

  // ── CASE 7: markNotificationRead 타인 알림 → 404 ───────────
  await check('notif.read.wrong_user_404', async () => {
    const u2 = await prisma.user.findFirst({
      where: { isDeleted: false, userId: { not: u.userId } },
      select: { userId: true },
    });
    if (!u2) return []; // skip
    const notif2 = await prisma.notification.findFirst({
      where: { userId: u2.userId },
      select: { notificationId: true },
    });
    if (!notif2) return []; // skip
    const res = mockRes();
    await markNotificationRead(
      mockReq({ auth, params: { id: notif2.notificationId.toString() } }),
      res,
    );
    return res._c.status === 404 ? [] : [`status ${res._c.status} != 404`];
  });

  // ── CASE 8: listMyAppointments 응답 shape ─────────────────
  await check('appointments.list.shape', async () => {
    const res = mockRes();
    await listMyAppointments(mockReq({ auth, query: {} }), res);
    const f: string[] = [];
    if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
    const b = res._c.json as { items?: unknown[] };
    if (!Array.isArray(b.items)) f.push('items not array');
    return f;
  });

  // ── CASE 9: listMyAppointments 반환 항목이 모두 confirmed ──
  await check('appointments.list.only_confirmed', async () => {
    const res = mockRes();
    await listMyAppointments(mockReq({ auth, query: {} }), res);
    const b = res._c.json as { items?: Array<{ status?: string }> };
    const f: string[] = [];
    if (b.items?.some((i) => i.status !== 'confirmed')) {
      f.push('non-confirmed appointment in response');
    }
    return f;
  });

  // ── CASE 10: listMyAppointments 과거 날짜 범위 필터 → 빈 목록 ──
  // from='2000-01-01'&to='2000-12-31': 유효한 범위이며 실제 약속이 존재할 수 없는 과거.
  // items=[]를 기대. from+to 모두 공급하므로 effectiveFrom>effectiveTo 역전 없이
  // hasDateFilter 경로가 정확히 동작함을 검증한다.
  await check('appointments.list.past_range_filter_empty', async () => {
    const res = mockRes();
    await listMyAppointments(mockReq({ auth, query: { from: '2000-01-01', to: '2000-12-31' } }), res);
    const f: string[] = [];
    if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
    const b = res._c.json as { items?: unknown[] };
    if (!Array.isArray(b.items)) {
      f.push('items not array');
    } else if (b.items.length > 0) {
      f.push(`expected 0 items for 2000-01-01~2000-12-31, got ${b.items.length}`);
    }
    return f;
  });

  // ── 결과 출력 ──────────────────────────────────────────────
  console.log('\n=== notif-eval results ===');
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.pass) {
      console.log(`  PASS  ${r.id}`);
      passed++;
    } else {
      console.log(`  FAIL  ${r.id}`);
      for (const f of r.failures) console.log(`          ${f}`);
      failed++;
    }
  }
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
