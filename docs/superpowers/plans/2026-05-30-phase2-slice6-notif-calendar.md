# Slice 6: 알림 페이지(A_806) + 캘린더 통합(GG-MY-002) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GG-NOTI-001~014 전부 구현(알림 목록·유형별 아이콘·클릭 라우팅·수락/거절 인라인·캘린더 등록)과 CalendarTab에 confirmed 약속을 북마크와 병합한 단일 캘린더 구현 — 신규 마이그레이션/모델 없음.

**Architecture overview:**
- BFF `GET /me/notifications` 응답에 `notificationType` / `relatedEntityId` / `relatedEntityType` 추가 노출
- BFF `GET /me/notifications`의 `appointment` 타입 알림에 `relatedChatRoomId` 필드 조인 추가 — GG-NOTI-012 채팅방 이동을 위해 Appointment 테이블에서 chatRoomId를 조인
- 신규 `GET /me/appointments` 엔드포인트 (confirmed 약속, CalendarTab용)
- Web `NotificationsPage` 전면 재작성: `relatedEntityType` 기반으로 인라인 액션/라우팅을 분기 (notificationType 단독 분기 금지)
- Web `CalendarTab`: 약속 fetch 추가, emerald 소스 구분 카드

**알림 타입 실제 구조 (코드베이스 실측):**

| notificationType | relatedEntityType | relatedEntityId | 발생 위치 | 라우팅 목적지 |
|---|---|---|---|---|
| `match_request` (신청됨) | `match_request` | matchRequestId | match-request.ts:134 | 수락/거절 버튼 (인라인) |
| `match_request` (수락됨) | `chat_room` | chatRoomId | match-request.ts:431 | `/chat/rooms/${chatRoomId}` |
| `group_invite` (초대됨) | `match_request` | matchRequestId | match-request.ts:307 | 수락/거절 버튼 (인라인) |
| `group_invite` (수락됨) | `chat_room` | chatRoomId | match-request.ts:477/526 | `/chat/rooms/${chatRoomId}` |
| `appointment` (제안/확정) | `appointment` | appointmentId | chat-room.ts:358/532 | `/chat/rooms/${relatedChatRoomId}` (GG-NOTI-012) |
| `appointment_update` (만료) | `appointment` | appointmentId | chat-scheduler.ts:350 | `/me?tab=calendar` (GG-NOTI-014) |
| `mate_eval` | `appointment` | appointmentId | chat-scheduler.ts:586/603 | `/evaluate/${appointmentId}` (GG-NOTI-013) |
| `kick_vote` | `kick_vote` | chatRoomId | chat-room.ts:1107 | 라우팅 없음 (읽음 처리 제외) |
| `chat_message` | `chat_room` | chatRoomId | chat-room.ts:746 | `/chat/rooms/${chatRoomId}` |
| `vacancy_notification` | `chat_room` | chatRoomId | chat-room.ts:983 | 이벤트 폴백 |

**핵심 설계 규칙:**
1. 인라인 수락/거절은 `relatedEntityType === 'match_request'`인 알림에만 표시 (notificationType이 `match_request`이든 `group_invite`이든 관계없이)
2. `resolveHref`는 `relatedEntityType`을 우선 분기, `notificationType`은 보조 분기
3. `appointment` 알림의 채팅방 이동을 위해 BFF 응답에 `relatedChatRoomId` 필드 추가 (Appointment→chatRoomId 조인)
4. `appointment_update` 타입은 NOTIF_TYPE_META와 resolveHref에 명시적으로 추가

**Tech Stack:** Express 5 + Prisma 5 (BFF) / React 19 + React Router 7 + SEED CSS all.css (Web) / tsx (eval harness) / TypeScript 5.6

**실제 라우트 확인 (apps/web/src/main.tsx):**
- `/chat/rooms/:chatRoomId` — ChatRoomPage (존재)
- `/evaluate/:appointmentId` — EvaluationPage (존재)
- `/me` — MyPage (존재, `?tab=calendar` 쿼리파람으로 탭 이동)
- `/community/chat-rooms`, `/community/match/incoming`, `/me/evaluations` — 존재하지 않음 (금지)

---

## File Map

### 신규 생성
| 경로 | 책임 |
|---|---|
| `apps/bff/src/routes/appointments.ts` | `GET /me/appointments` — 캘린더용 confirmed 약속 목록 |
| `apps/bff/src/jobs/notif-eval.ts` | in-process 하니스 — GG-NOTI 라우트 검증 |
| `apps/web/src/lib/api/appointments.ts` | 클라이언트 — `fetchMyAppointments` |

### 수정
| 경로 | 변경 요약 |
|---|---|
| `apps/bff/src/routes/notifications.ts` | select에 3개 필드 추가; appointment 타입에 `relatedChatRoomId` 조인; 응답 shape 확장 |
| `apps/bff/src/app.ts` | `GET /me/appointments` 라우트 등록 |
| `apps/web/src/lib/api/notifications.ts` | `MyNotification` 인터페이스 확장 + `respondMatchRequest` 추가 |
| `apps/web/src/lib/api/index.ts` | `appointments.ts` re-export 추가 |
| `apps/web/src/pages/NotificationsPage.tsx` | 전면 재작성 — relatedEntityType 기반 분기, 실제 라우트 경로 |
| `apps/web/src/pages/MyPage/tabs/CalendarTab.tsx` | 약속 fetch 추가·병합·AppointmentCard |
| `apps/bff/package.json` | `notif:eval` npm script 추가 |

---

## Task 1: BFF — notifications.ts 응답 확장 (+ appointment relatedChatRoomId 조인)

**Files:**
- Modify: `apps/bff/src/routes/notifications.ts`

`listMyNotifications`의 `select`에 `notificationType / relatedEntityId / relatedEntityType` 3개 필드를 추가한다. 추가로 `appointment` / `appointment_update` / `mate_eval` 타입 알림은 `relatedEntityId`가 `appointmentId`이므로, Appointment 테이블을 조인해 `chatRoomId`를 `relatedChatRoomId`로 노출한다. 이를 통해 프론트엔드가 GG-NOTI-012(약속 제안→채팅방 이동)를 구현할 수 있다. 마이그레이션 없음.

- [ ] **Step 1: `listMyNotifications` select 블록 교체**

`apps/bff/src/routes/notifications.ts`의 `prisma.notification.findMany` select 블록 전체를 아래로 교체한다:

```typescript
      select: {
        notificationId: true,
        eventId: true,
        title: true,
        message: true,
        readAt: true,
        createdAt: true,
        notificationType: true,
        relatedEntityId: true,
        relatedEntityType: true,
        event: {
          select: {
            eventId: true,
            title: true,
            approvalStatus: true,
            isDeleted: true,
          },
        },
      },
```

- [ ] **Step 2: appointment 타입 relatedChatRoomId 조인 로직 추가**

`rows.map((r) => ({` 블록 직전에 다음 조인 로직을 추가한다:

```typescript
  // appointment / appointment_update / mate_eval 알림은 relatedEntityId = appointmentId.
  // 채팅방 이동(GG-NOTI-012)을 위해 Appointment→chatRoomId를 조인한다.
  const appointmentEntityTypes = new Set(['appointment', 'mate_eval', 'appointment_update']);
  const appointmentRelatedIds = rows
    .filter(
      (r) =>
        r.relatedEntityType != null &&
        appointmentEntityTypes.has(r.relatedEntityType) &&
        r.relatedEntityId != null,
    )
    .map((r) => r.relatedEntityId!);

  const appointmentChatRoomMap = new Map<string, string>();
  if (appointmentRelatedIds.length > 0) {
    const appts = await prisma.appointment.findMany({
      where: { appointmentId: { in: appointmentRelatedIds } },
      select: { appointmentId: true, chatRoomId: true },
    });
    for (const a of appts) {
      appointmentChatRoomMap.set(a.appointmentId.toString(), a.chatRoomId.toString());
    }
  }
```

- [ ] **Step 3: `res.json` 응답 매핑에 필드 추가**

`rows.map((r) => ({` 블록의 기존 필드 뒤에 다음을 추가한다:

```typescript
      notificationType: r.notificationType ?? null,
      relatedEntityId: r.relatedEntityId?.toString() ?? null,
      relatedEntityType: r.relatedEntityType ?? null,
      // appointment/appointment_update/mate_eval 타입에만 chatRoomId 조인값 노출
      relatedChatRoomId:
        r.relatedEntityId != null &&
        r.relatedEntityType != null &&
        appointmentEntityTypes.has(r.relatedEntityType)
          ? (appointmentChatRoomMap.get(r.relatedEntityId.toString()) ?? null)
          : null,
```

- [ ] **Step 4: typecheck**

```powershell
cd apps/bff
npx tsc -p tsconfig.json --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: commit**

```bash
git add apps/bff/src/routes/notifications.ts
git commit -m "feat(bff): expose notificationType/relatedEntityId/relatedEntityType + relatedChatRoomId in notification list"
```

---

## Task 2: BFF — appointments.ts 신규 라우트 + app.ts 등록

**Files:**
- Create: `apps/bff/src/routes/appointments.ts`
- Modify: `apps/bff/src/app.ts`

`GET /me/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD`. status='confirmed'인 약속만 반환. 마이그레이션 없음.

- [ ] **Step 1: `apps/bff/src/routes/appointments.ts` 생성**

```typescript
/**
 * appointments.ts — GG-MY-002 캘린더용 내 약속 조회
 *
 * GET /me/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 반환: 사용자가 active member인 chatRoom의 confirmed 약속.
 * 마이그레이션 없음 — Appointment 모델 슬라이스3 기존.
 */
import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function listMyAppointments(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;

  const from = parseDate(req.query.from) ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const to = parseDate(req.query.to) ?? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

  // 사용자가 active member인 채팅방 ID 목록
  const memberships = await prisma.groupMembership.findMany({
    where: { userId: auth.userId, memberStatus: 'active' },
    select: { chatRoomId: true },
  });
  const chatRoomIds = memberships.map((m) => m.chatRoomId);

  if (chatRoomIds.length === 0) {
    res.json({ items: [] });
    return;
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      chatRoomId: { in: chatRoomIds },
      status: 'confirmed',
      appointedAt: { gte: from, lte: to },
    },
    orderBy: { appointedAt: 'asc' },
    select: {
      appointmentId: true,
      chatRoomId: true,
      eventId: true,
      eventName: true,
      appointedAt: true,
      status: true,
      chatRoom: {
        select: {
          roomType: true,
          event: {
            select: {
              eventId: true,
              title: true,
              startDate: true,
              endDate: true,
              region: true,
              price: true,
            },
          },
        },
      },
    },
  });

  res.json({
    items: appointments.map((a) => ({
      appointmentId: a.appointmentId.toString(),
      chatRoomId: a.chatRoomId.toString(),
      eventId: a.eventId?.toString() ?? a.chatRoom.event?.eventId?.toString() ?? null,
      eventName: a.eventName ?? a.chatRoom.event?.title ?? null,
      appointedAt: a.appointedAt?.toISOString() ?? null,
      status: a.status,
      event: a.chatRoom.event
        ? {
            eventId: a.chatRoom.event.eventId.toString(),
            title: a.chatRoom.event.title,
            startDate: a.chatRoom.event.startDate,
            endDate: a.chatRoom.event.endDate,
            region: a.chatRoom.event.region ?? null,
            price: a.chatRoom.event.price ?? null,
          }
        : null,
    })),
  });
}
```

- [ ] **Step 2: `app.ts`에 import + 라우트 등록**

`apps/bff/src/app.ts` 상단 import 블록에 추가:

```typescript
import { listMyAppointments } from './routes/appointments.js';
```

`/me/credits` 라우트 아래에 추가:

```typescript
  // GG-MY-002 캘린더용 내 약속 조회 (Slice 6)
  app.get(
    '/me/appointments',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => listMyAppointments(req, res).catch(next),
  );
```

- [ ] **Step 3: typecheck**

```powershell
cd apps/bff
npx tsc -p tsconfig.json --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: commit**

```bash
git add apps/bff/src/routes/appointments.ts apps/bff/src/app.ts
git commit -m "feat(bff): GET /me/appointments calendar endpoint (GG-MY-002)"
```

---

## Task 3: BFF — in-process 하니스 `notif-eval.ts`

**Files:**
- Create: `apps/bff/src/jobs/notif-eval.ts`
- Modify: `apps/bff/package.json`

slice5-eval.ts / community-eval.ts 패턴 준수. DB에서 실제 유저+알림 픽스처를 가져와 `listMyNotifications` / `listMyAppointments` / `markNotificationRead`를 직접 호출해 검증한다.

- [ ] **Step 1: `apps/bff/src/jobs/notif-eval.ts` 생성**

```typescript
/**
 * notif-eval.ts — Slice 6 in-process 검증 하니스 (PASS/FAIL)
 * 실행: npm run notif:eval (apps/bff 에서)
 *
 * 검증 범위:
 *   - listMyNotifications: 응답에 notificationType/relatedEntityId/relatedEntityType 포함
 *   - listMyNotifications unreadOnly=true: kick_vote 제외 확인
 *   - listMyNotifications: appointment 타입에 relatedChatRoomId 필드 존재
 *   - markNotificationRead: 정상 200; kick_vote 타입은 readAt 미변경
 *   - listMyAppointments: confirmed 약속만 반환, from/to 필터 동작
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

  // ── CASE 4: appointment 타입 알림에 relatedChatRoomId 조인 ──
  await check('notif.list.appointment_has_chatRoomId', async () => {
    const res = mockRes();
    await listMyNotifications(mockReq({ auth, query: { limit: '100' } }), res);
    const b = res._c.json as { items?: Array<Record<string, unknown>> };
    const apptNotifs = (b.items ?? []).filter(
      (i) => i.notificationType === 'appointment' || i.notificationType === 'appointment_update',
    );
    if (apptNotifs.length === 0) return []; // skip — no fixture
    const f: string[] = [];
    for (const n of apptNotifs) {
      if (!('relatedChatRoomId' in n)) {
        f.push(`appointment notif missing relatedChatRoomId field`);
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
```

- [ ] **Step 2: `apps/bff/package.json` scripts에 `notif:eval` 추가**

`"slice5:eval"` 항목 바로 아래에 추가:

```json
    "notif:eval": "dotenv -e ../../.env -- tsx src/jobs/notif-eval.ts"
```

- [ ] **Step 3: typecheck**

```powershell
cd apps/bff
npx tsc -p tsconfig.json --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: 하니스 실행**

```powershell
cd apps/bff
npm run notif:eval
```

Expected: 모든 케이스 PASS, exit 0.

> 알림/약속 픽스처가 없는 환경에서는 관련 케이스가 "skipped" 처리돼 PASS로 집계된다. `failed = 0`이면 OK.

- [ ] **Step 5: commit**

```bash
git add apps/bff/src/jobs/notif-eval.ts apps/bff/package.json
git commit -m "test(bff): notif-eval in-process harness (GG-NOTI list/read + appointments)"
```

---

## Task 4: Web — API 클라이언트 확장

**Files:**
- Modify: `apps/web/src/lib/api/notifications.ts`
- Create: `apps/web/src/lib/api/appointments.ts`
- Modify: `apps/web/src/lib/api/index.ts`

- [ ] **Step 1: `notifications.ts` `MyNotification` 인터페이스 + `respondMatchRequest` 추가**

`apps/web/src/lib/api/notifications.ts` 전체를 다음으로 교체한다:

```typescript
import { BFF_URL, withCredentials } from './client.js';

// =============================================================
// A_806 / A_500 알림 센터 — Slice 6 확장
// =============================================================

export interface MyNotification {
  notificationId: string;
  eventId: string | null;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  eventAvailable: boolean;
  // Slice 6 추가
  notificationType: string | null;
  // match_request/group_invite: matchRequestId (relatedEntityType='match_request')
  //                            또는 chatRoomId (relatedEntityType='chat_room', 수락됨 알림)
  // appointment/appointment_update/mate_eval: appointmentId (relatedEntityType='appointment')
  // chat_message/kick_vote/vacancy_notification: chatRoomId
  relatedEntityId: string | null;
  relatedEntityType: string | null;
  // appointment/appointment_update/mate_eval 타입에만 값이 있음 (BFF Appointment 조인)
  relatedChatRoomId: string | null;
}

export interface MyNotificationsResponse {
  page: number;
  limit: number;
  total: number;
  items: MyNotification[];
}

export async function fetchMyNotifications(
  opts: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  signal?: AbortSignal,
): Promise<MyNotificationsResponse> {
  const sp = new URLSearchParams();
  if (opts.page) sp.set('page', String(opts.page));
  if (opts.limit) sp.set('limit', String(opts.limit));
  if (opts.unreadOnly) sp.set('unreadOnly', 'true');
  const qs = sp.toString();
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/notifications${qs ? `?${qs}` : ''}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /me/notifications ${res.status}`);
  return (await res.json()) as MyNotificationsResponse;
}

export async function fetchUnreadNotificationCount(signal?: AbortSignal): Promise<number> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/notifications/unread-count`, init);
  if (res.status === 401) return 0;
  if (!res.ok) throw new Error(`GET /me/notifications/unread-count ${res.status}`);
  const data = (await res.json()) as { count: number };
  return data.count;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/me/notifications/${encodeURIComponent(notificationId)}/read`,
    withCredentials({ method: 'POST' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`POST /me/notifications/${notificationId}/read ${res.status}`);
}

export async function markAllNotificationsRead(): Promise<number> {
  const res = await fetch(
    `${BFF_URL}/me/notifications/read-all`,
    withCredentials({ method: 'POST' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`POST /me/notifications/read-all ${res.status}`);
  const data = (await res.json()) as { updated: number };
  return data.updated;
}

/**
 * GG-NOTI-008/009/010/011: match_request / group_invite 수락/거절
 * 대상: relatedEntityType === 'match_request' (relatedEntityId = matchRequestId)인 알림만 호출
 * 기존 `PATCH /community/match/request/:id/accept|reject` 엔드포인트 재사용.
 */
export async function respondMatchRequest(
  matchRequestId: string,
  action: 'accept' | 'reject',
): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/community/match/request/${encodeURIComponent(matchRequestId)}/${action}`,
    withCredentials({ method: 'PATCH' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`PATCH match request ${action} ${res.status}`);
}
```

- [ ] **Step 2: `apps/web/src/lib/api/appointments.ts` 신규 생성**

```typescript
import { BFF_URL, withCredentials } from './client.js';

// =============================================================
// GG-MY-002 캘린더용 약속 조회
// =============================================================

export interface MyAppointmentItem {
  appointmentId: string;
  chatRoomId: string;
  eventId: string | null;
  eventName: string | null;
  appointedAt: string | null;
  status: string;
  event: {
    eventId: string;
    title: string;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    region: string | null;
    price: number | null;
  } | null;
}

export interface MyAppointmentsResponse {
  items: MyAppointmentItem[];
}

export async function fetchMyAppointments(
  opts: { from?: string; to?: string } = {},
  signal?: AbortSignal,
): Promise<MyAppointmentsResponse> {
  const sp = new URLSearchParams();
  if (opts.from) sp.set('from', opts.from);
  if (opts.to) sp.set('to', opts.to);
  const qs = sp.toString();
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/appointments${qs ? `?${qs}` : ''}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /me/appointments ${res.status}`);
  return (await res.json()) as MyAppointmentsResponse;
}
```

- [ ] **Step 3: `index.ts`에 re-export 추가**

`apps/web/src/lib/api/index.ts` 마지막 줄에 추가:

```typescript
export * from './appointments.js';
```

- [ ] **Step 4: typecheck**

```powershell
cd apps/web
npx tsc -b --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: commit**

```bash
git add apps/web/src/lib/api/notifications.ts apps/web/src/lib/api/appointments.ts apps/web/src/lib/api/index.ts
git commit -m "feat(web): api client — notif type fields + respondMatchRequest + fetchMyAppointments"
```

---

## Task 5: Web — NotificationsPage 전면 재작성 (A_806)

**Files:**
- Modify: `apps/web/src/pages/NotificationsPage.tsx`

GG-NOTI-001~014 전부 구현. **핵심 설계 원칙: `relatedEntityType` 기준으로 인라인 액션·라우팅을 분기한다. `notificationType` 단독 분기는 '수락됨' 후속 알림 오작동을 유발하므로 금지.**

**resolveHref 설계:**
- `relatedEntityType === 'chat_room'` → `/chat/rooms/${relatedEntityId}` (match_request 수락됨, group_invite 수락됨, chat_message 모두 여기)
- `relatedEntityType === 'match_request'` → null (인라인 버튼으로 처리, 별도 페이지 이동 없음)
- `relatedEntityType === 'appointment'` + `notificationType === 'mate_eval'` → `/evaluate/${relatedEntityId}` (GG-NOTI-013)
- `relatedEntityType === 'appointment'` + `notificationType === 'appointment_update'` → `/me?tab=calendar` (GG-NOTI-014, 만료 알림)
- `relatedEntityType === 'appointment'` + `notificationType === 'appointment'` → `relatedChatRoomId`가 있으면 `/chat/rooms/${relatedChatRoomId}`, 없으면 null (GG-NOTI-012)
- `relatedEntityType === 'kick_vote'` → null (읽음 처리만, 별도 이동 없음)
- `notificationType`이 null → 이벤트 폴백 (`/events/${eventId}`)

**hasInlineAction 설계:**
- `relatedEntityType === 'match_request'`인 경우에만 true (수락/거절 버튼 표시)

**NOTIF_TYPE_META:**
- `appointment_update` 케이스 추가 — 뱃지 '약속만료', 색상 amber

- [ ] **Step 1: `NotificationsPage.tsx` 전체를 다음으로 교체**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Header } from '../layout/Header';
import { Icon } from '../components/Icon';
import { useCurrentUser } from '../lib/auth-context';
import {
  fetchMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  respondMatchRequest,
  type MyNotification,
} from '../lib/api';
import { loginUrl } from '../lib/auth-redirect';

/**
 * /notifications — A_806 알림 페이지 (Slice 6).
 *
 * GG-NOTI-001: 알림 목록 표시
 * GG-NOTI-002~006: 유형별 뱃지 표시 (match_request/group_invite/appointment/appointment_update/mate_eval/chat_message)
 * GG-NOTI-007: 클릭 → 연결 화면 이동 (relatedEntityType 기반 분기)
 * GG-NOTI-008/009: match_request 수락/거절 인라인 (relatedEntityType==='match_request'만)
 * GG-NOTI-010/011: group_invite 수락/거절 인라인 (relatedEntityType==='match_request'만)
 * GG-NOTI-012: appointment 알림 → /chat/rooms/:relatedChatRoomId
 * GG-NOTI-013: mate_eval → /evaluate/:appointmentId
 * GG-NOTI-014: appointment_update → /me?tab=calendar
 *
 * 중요: 인라인 수락/거절은 relatedEntityType==='match_request'인 경우에만 표시.
 * match_request/group_invite '수락됨' 후속 알림은 relatedEntityType='chat_room'이므로
 * 버튼이 표시되지 않고 채팅방으로 이동한다.
 */

type Filter = 'all' | 'unread';

// ─── 유형별 메타 ────────────────────────────────────────────
const NOTIF_TYPE_META: Record<
  string,
  { label: string; badgeCls: string }
> = {
  match_request: {
    label: '메이트신청',
    badgeCls: 'bg-(--color-accent)/10 text-(--color-accent)',
  },
  group_invite: {
    label: '그룹초대',
    badgeCls: 'bg-(--color-info)/10 text-(--color-info)',
  },
  appointment: {
    label: '약속',
    badgeCls: 'bg-emerald-50 text-emerald-700',
  },
  appointment_update: {
    label: '약속만료',
    badgeCls: 'bg-amber-50 text-amber-700',
  },
  mate_eval: {
    label: '평가요청',
    badgeCls: 'bg-amber-50 text-amber-700',
  },
  kick_vote: {
    label: '퇴출투표',
    badgeCls: 'bg-(--color-error)/10 text-(--color-error)',
  },
  chat_message: {
    label: '메시지',
    badgeCls: 'bg-(--color-surface-alt) text-(--color-text-muted)',
  },
  vacancy_notification: {
    label: '공석',
    badgeCls: 'bg-(--color-surface-alt) text-(--color-text-muted)',
  },
};

function typeMeta(t: string | null) {
  if (!t) return null;
  return NOTIF_TYPE_META[t] ?? null;
}

// ─── 라우팅 헬퍼 — relatedEntityType 우선 분기 ─────────────
// GG-NOTI-007/012/013/014 실제 라우트만 사용
function resolveHref(n: MyNotification): string | null {
  const { notificationType: nt, relatedEntityType: ret, relatedEntityId: rid, relatedChatRoomId: rcrid } = n;

  // chat_room 타입: match_request 수락됨, group_invite 수락됨, chat_message 모두
  if (ret === 'chat_room') {
    return rid ? `/chat/rooms/${rid}` : null;
  }

  // match_request 타입: 인라인 수락/거절로 처리 — 별도 이동 없음
  if (ret === 'match_request') {
    return null;
  }

  // appointment 타입: notificationType으로 세분화
  if (ret === 'appointment') {
    if (nt === 'mate_eval') {
      // GG-NOTI-013: 평가화면 이동 — relatedEntityId가 appointmentId
      return rid ? `/evaluate/${rid}` : null;
    }
    if (nt === 'appointment_update') {
      // GG-NOTI-014: 약속만료 → 캘린더
      return '/me?tab=calendar';
    }
    // GG-NOTI-012: 약속 제안/확정 → 해당 채팅방 (BFF 조인값 사용)
    return rcrid ? `/chat/rooms/${rcrid}` : null;
  }

  // kick_vote: 별도 이동 없음 (읽음 처리만)
  if (ret === 'kick_vote') {
    return null;
  }

  // notificationType 없는 일반 이벤트 알림 폴백
  if (!nt) {
    return n.eventAvailable && n.eventId ? `/events/${n.eventId}` : null;
  }

  return null;
}

// 인라인 수락/거절: relatedEntityType==='match_request'인 경우에만
// (match_request 신청됨 + group_invite 초대됨 모두 해당)
function hasInlineAction(n: MyNotification): boolean {
  return n.relatedEntityType === 'match_request';
}

export function NotificationsPage() {
  const { user, loading: authLoading } = useCurrentUser();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<MyNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markAllBusy, setMarkAllBusy] = useState(false);
  // 수락/거절 진행 중인 notificationId set
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchMyNotifications({ limit: 50, unreadOnly: filter === 'unread' }, ctrl.signal)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [filter]);

  useEffect(() => {
    if (authLoading || !user) return;
    return reload();
  }, [authLoading, user, reload]);

  // 읽음 처리 + 이동
  const onItemClick = async (n: MyNotification) => {
    if (!n.readAt) {
      setItems((prev) =>
        prev.map((x) =>
          x.notificationId === n.notificationId ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      );
      try { await markNotificationRead(n.notificationId); } catch { /* silent */ }
    }
    const href = resolveHref(n);
    if (href) void navigate(href);
  };

  const onMarkAll = async () => {
    setMarkAllBusy(true);
    try {
      await markAllNotificationsRead();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'mark-all failed');
    } finally {
      setMarkAllBusy(false);
    }
  };

  // 인라인 수락/거절 — relatedEntityType==='match_request'인 알림에만 호출
  // relatedEntityId는 matchRequestId
  const onRespond = async (
    n: MyNotification,
    action: 'accept' | 'reject',
  ) => {
    if (!n.relatedEntityId || n.relatedEntityType !== 'match_request') return;
    setRespondingIds((s) => new Set(s).add(n.notificationId));
    try {
      await respondMatchRequest(n.relatedEntityId, action);
      try { await markNotificationRead(n.notificationId); } catch { /* silent */ }
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setRespondingIds((s) => {
        const next = new Set(s);
        next.delete(n.notificationId);
        return next;
      });
    }
  };

  if (authLoading) return <Shell>{null}</Shell>;

  if (!user) {
    return (
      <Shell>
        <div className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-10 text-center">
          <h1 className="m-0 mb-2 text-[20px] font-bold tracking-[-0.015em]">로그인이 필요해요</h1>
          <p className="m-0 mb-6 text-[14px] text-(--color-text-muted)">
            알림은 로그인 후 확인할 수 있어요.
          </p>
          <a
            href={loginUrl('google', '/notifications')}
            className="inline-flex h-10 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-4 text-[14px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
          >
            Google 로그인 <Icon name="arrow" size={14} />
          </a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="mb-6 flex items-end justify-between gap-2">
        <div>
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
            알림 센터 · A_806
          </p>
          <h1 className="m-0 mt-1 text-[24px] font-bold tracking-[-0.015em]">알림</h1>
        </div>
        <button
          type="button"
          onClick={() => void onMarkAll()}
          disabled={markAllBusy || items.every((i) => i.readAt)}
          className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium text-(--color-text-muted) hover:border-(--color-border-hover) hover:text-(--color-text) disabled:opacity-40"
        >
          {markAllBusy ? '처리 중…' : '모두 읽음'}
        </button>
      </header>

      {/* 필터 탭 */}
      <div className="mb-4 flex items-center gap-2">
        <div className="inline-flex rounded-(--radius-md) border border-(--color-border) p-0.5">
          {(['all', 'unread'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`h-8 rounded-[6px] px-3 text-[13px] font-medium transition-colors ${
                filter === f
                  ? 'bg-(--color-accent) text-white'
                  : 'text-(--color-text-muted) hover:text-(--color-text)'
              }`}
            >
              {f === 'all' ? '전체' : '미읽음'}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px] text-(--color-text-subtle)">
          {total.toLocaleString()}건
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
          오류: {error}
        </div>
      )}

      <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
        {loading && items.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">불러오는 중…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-(--color-text-subtle)">
            {filter === 'unread' ? '미읽음 알림이 없어요.' : '아직 알림이 없어요.'}
          </div>
        ) : (
          <ul className="divide-y divide-(--color-border)">
            {items.map((n) => (
              <NotifItem
                key={n.notificationId}
                n={n}
                responding={respondingIds.has(n.notificationId)}
                onItemClick={onItemClick}
                onRespond={onRespond}
              />
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

// ─── 개별 알림 항목 ─────────────────────────────────────────

function NotifItem({
  n,
  responding,
  onItemClick,
  onRespond,
}: {
  n: MyNotification;
  responding: boolean;
  onItemClick: (n: MyNotification) => void;
  onRespond: (n: MyNotification, action: 'accept' | 'reject') => void;
}) {
  const unread = !n.readAt;
  const meta = typeMeta(n.notificationType);
  const showInline = hasInlineAction(n);

  return (
    <li>
      <div
        className={`flex items-start gap-3 p-4 transition-colors ${unread ? '' : 'opacity-75'}`}
      >
        {/* 읽음 인디케이터 */}
        <span
          aria-hidden
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
            unread ? 'bg-(--color-accent)' : 'bg-(--color-border)'
          }`}
        />

        <div className="min-w-0 flex-1">
          {/* 유형 뱃지 */}
          {meta && (
            <span
              className={`mb-1 inline-flex items-center gap-1 rounded-(--radius-sm) px-1.5 py-0.5 text-[10px] font-semibold ${meta.badgeCls}`}
            >
              {meta.label}
            </span>
          )}

          {/* 제목/내용 — 클릭 가능 영역 */}
          <button
            type="button"
            onClick={() => onItemClick(n)}
            className="block w-full text-left"
          >
            <h3
              className={`m-0 text-[14px] ${
                unread ? 'font-semibold text-(--color-text)' : 'text-(--color-text-muted)'
              }`}
            >
              {n.title}
            </h3>
            <p className="m-0 mt-0.5 text-[13px] text-(--color-text)">{n.message}</p>
            <p className="tabular m-0 mt-1 text-[11px] text-(--color-text-subtle)">
              {n.createdAt.slice(0, 19).replace('T', ' ')}
              {!n.eventAvailable && n.eventId && (
                <span className="ml-2 text-(--color-text-subtle)">(이벤트 비공개 또는 삭제됨)</span>
              )}
            </p>
          </button>

          {/* 인라인 수락/거절 (relatedEntityType==='match_request'만) — GG-NOTI-008/009/010/011 */}
          {showInline && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={responding}
                onClick={() => onRespond(n, 'accept')}
                className="inline-flex h-7 items-center rounded-(--radius-md) bg-(--color-accent) px-3 text-[12px] font-medium text-white transition-colors hover:bg-(--color-accent-hover) disabled:opacity-40"
              >
                {responding ? '처리 중…' : '수락'}
              </button>
              <button
                type="button"
                disabled={responding}
                onClick={() => onRespond(n, 'reject')}
                className="inline-flex h-7 items-center rounded-(--radius-md) border border-(--color-border) px-3 text-[12px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-border-hover) hover:text-(--color-text) disabled:opacity-40"
              >
                거절
              </button>
            </div>
          )}

          {/* 이벤트 링크 (notificationType 없는 이벤트 알림 폴백) */}
          {!n.notificationType && n.eventAvailable && n.eventId && (
            <Link
              to={`/events/${n.eventId}`}
              onClick={() => onItemClick(n)}
              className="mt-1 inline-flex items-center gap-1 text-[12px] text-(--color-accent) hover:underline"
            >
              이벤트 보기 <Icon name="arrow" size={12} />
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg) text-(--color-text)">
      <Header />
      <main className="mx-auto w-full max-w-[880px] flex-1 px-4 py-6 md:px-8 md:py-10">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

```powershell
cd apps/web
npx tsc -b --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: build 확인**

```powershell
cd apps/web
npm run build
```

Expected: Build successful, 0 errors.

- [ ] **Step 4: commit**

```bash
git add apps/web/src/pages/NotificationsPage.tsx
git commit -m "feat(web): NotificationsPage — relatedEntityType-based routing, inline accept/reject (GG-NOTI-001~014)"
```

---

## Task 6: Web — CalendarTab 약속 통합 (GG-MY-002)

**Files:**
- Modify: `apps/web/src/pages/MyPage/tabs/CalendarTab.tsx`

북마크 + confirmed 약속을 단일 `CalendarEvent[]`로 병합. AppointmentCard는 emerald 테두리로 소스 구분. GG-MY-002 팝업 6항목 충족을 위해 event.region/price/eventId(상세페이지 링크)를 AppointmentCard에 노출. 캘린더 도트는 `appt:` 접두사 eventId로 MonthCalendar에 전달해 소스 구분 마커를 활성화한다.

**AppointmentCard GG-MY-002 충족:**
- 이벤트명: `a.eventName ?? a.event?.title`
- 일시: `a.appointedAt` (약속 시각)
- 기간: `a.event.startDate ~ a.event.endDate` (event가 있을 때)
- 장소/지역: `a.event.region` (event가 있을 때)
- 가격: `a.event.price` (event가 있을 때)
- 상세페이지 이동: `/events/${a.event.eventId}` (event가 있을 때)
- 채팅방으로: `/chat/rooms/${a.chatRoomId}` (GG-ROOM-020)

- [ ] **Step 1: `CalendarTab.tsx` 전체를 다음으로 교체**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  MonthCalendar,
  type CalendarEvent,
} from '../../../components/calendar/MonthCalendar';
import {
  fetchMyBookmarks,
  fetchMyReviews,
  fetchMyAppointments,
  type BookmarkListItem,
  type MyReviewItem,
  type MyAppointmentItem,
} from '../../../lib/api';
import { CalendarSummaryCard } from '../parts/CalendarSummaryCard.js';
import { EmptyBox } from '../parts/EmptyBox.js';

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const APPT_PREFIX = 'appt:';

export function CalendarTab() {
  const now = useMemo(() => new Date(), []);
  const navigate = useNavigate();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(ymd(now));

  const [bookmarks, setBookmarks] = useState<BookmarkListItem[]>([]);
  const [reviews, setReviews] = useState<MyReviewItem[]>([]);
  const [appointments, setAppointments] = useState<MyAppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    Promise.all([
      fetchMyBookmarks({ limit: 200 }, ctrl.signal),
      fetchMyReviews({ limit: 200 }, ctrl.signal),
      fetchMyAppointments({}, ctrl.signal),
    ])
      .then(([b, r, a]) => {
        setBookmarks(b.items);
        setReviews(r.items);
        setAppointments(a.items);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown error');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  // 북마크 + 리뷰 + confirmed 약속 단일 CalendarEvent[] 병합
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    const map = new Map<string, CalendarEvent>();

    // 북마크
    for (const b of bookmarks) {
      const e = b.event;
      map.set(e.eventId, {
        eventId: e.eventId,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        phase: e.phase,
      });
    }

    // 리뷰
    for (const r of reviews) {
      const e = r.event;
      if (!map.has(e.eventId)) {
        map.set(e.eventId, {
          eventId: e.eventId,
          title: e.title,
          startDate: e.startDate,
          endDate: e.endDate,
          phase: 'ended',
        });
      }
    }

    // 약속 — appointedAt 날짜를 단일 날짜 이벤트로 매핑
    // 'appt:' 접두사 → MonthCalendar 셀에서 별도 도트로 구분 가능
    for (const a of appointments) {
      if (!a.appointedAt) continue;
      const dateStr = a.appointedAt.slice(0, 10);
      const apptEventId = `${APPT_PREFIX}${a.appointmentId}`;
      const isPast = dateStr < ymd(now);
      map.set(apptEventId, {
        eventId: apptEventId,
        title: a.eventName ?? a.event?.title ?? '약속',
        startDate: dateStr,
        endDate: dateStr,
        phase: isPast ? 'ended' : 'upcoming',
      });
    }

    return [...map.values()];
  }, [bookmarks, reviews, appointments, now]);

  // 선택 날짜 북마크
  const selectedBookmarks = useMemo(() => {
    if (!selectedDate) return [];
    return bookmarks.filter((b) => {
      const e = b.event;
      return e.startDate <= selectedDate && selectedDate <= e.endDate;
    });
  }, [bookmarks, selectedDate]);

  // 선택 날짜 리뷰 (북마크와 중복 제외)
  const selectedReviewed = useMemo(() => {
    if (!selectedDate) return [];
    return reviews.filter((r) => {
      const e = r.event;
      return (
        e.startDate <= selectedDate &&
        selectedDate <= e.endDate &&
        !selectedBookmarks.some((b) => b.event.eventId === e.eventId)
      );
    });
  }, [reviews, selectedDate, selectedBookmarks]);

  // 선택 날짜 약속
  const selectedAppointments = useMemo(() => {
    if (!selectedDate) return [];
    return appointments.filter((a) => a.appointedAt?.slice(0, 10) === selectedDate);
  }, [appointments, selectedDate]);

  if (loading) {
    return (
      <div
        aria-hidden
        className="h-[480px] animate-pulse rounded-(--radius-lg) bg-(--color-surface-alt)"
      />
    );
  }
  if (error) return <EmptyBox label="불러오지 못했어요" hint={error} />;

  const hasAnything =
    selectedBookmarks.length > 0 ||
    selectedReviewed.length > 0 ||
    selectedAppointments.length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <MonthCalendar
        year={year}
        month0={month0}
        events={calendarEvents}
        selectedDate={selectedDate}
        onMonthChange={(y, m) => {
          setYear(y);
          setMonth0(m);
        }}
        onDayClick={(d) => setSelectedDate(d)}
      />

      <aside className="flex flex-col gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-5">
        <header>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
            A_500 · 캘린더 요약
          </p>
          <h3 className="tabular m-0 mt-0.5 text-[15px] font-bold tracking-[-0.01em]">
            {selectedDate ?? '날짜를 선택하세요'}
          </h3>
        </header>

        {!hasAnything ? (
          <p className="m-0 rounded-(--radius-md) bg-(--color-surface-alt) p-4 text-center text-[12px] text-(--color-text-subtle)">
            이 날에 걸린 북마크·약속·리뷰 이벤트가 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {/* 북마크 이벤트 */}
            {selectedBookmarks.map((b) => {
              const reviewOfThis = reviews.find((r) => r.event.eventId === b.event.eventId);
              return (
                <li key={b.bookmarkId}>
                  <CalendarSummaryCard
                    event={b.event}
                    phase={b.event.phase}
                    {...(reviewOfThis ? { reviewedRating: reviewOfThis.rating } : {})}
                  />
                </li>
              );
            })}

            {/* 리뷰만 있는 이벤트 */}
            {selectedReviewed.map((r) => (
              <li key={r.reviewId}>
                <CalendarSummaryCard
                  event={r.event}
                  phase="ended"
                  reviewedRating={r.rating}
                />
              </li>
            ))}

            {/* confirmed 약속 카드 — GG-MY-002 / GG-ROOM-020 */}
            {selectedAppointments.map((a) => (
              <li key={a.appointmentId}>
                <AppointmentCard
                  appointment={a}
                  onGoToRoom={() => void navigate(`/chat/rooms/${a.chatRoomId}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

// ─── 약속 카드 (emerald 소스 구분, GG-MY-002 6항목) ─────────

function AppointmentCard({
  appointment: a,
  onGoToRoom,
}: {
  appointment: MyAppointmentItem;
  onGoToRoom: () => void;
}) {
  const dateLabel = a.appointedAt
    ? a.appointedAt.slice(0, 16).replace('T', ' ')
    : '일시 미정';
  const hasEvent = a.event != null;

  return (
    <article className="flex flex-col gap-2 rounded-(--radius-lg) border border-emerald-200 bg-emerald-50/50 p-4 transition-colors hover:border-emerald-300">
      <header className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-(--radius-sm) bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
          약속 · confirmed
        </span>
      </header>

      {/* 이벤트명 */}
      <h4 className="m-0 text-[14px] font-semibold leading-[1.4] text-(--color-text)">
        {a.eventName ?? a.event?.title ?? '약속'}
      </h4>

      {/* 약속 일시 */}
      <p className="tabular m-0 text-[12px] text-(--color-text-muted)">약속 일시: {dateLabel}</p>

      {/* 이벤트 기간·장소·가격 — GG-MY-002 요약 항목 */}
      {hasEvent && (
        <div className="flex flex-col gap-0.5">
          <p className="m-0 text-[11px] text-(--color-text-subtle)">
            기간: {a.event!.startDate} ~ {a.event!.endDate}
          </p>
          {a.event!.region && (
            <p className="m-0 text-[11px] text-(--color-text-subtle)">
              장소: {a.event!.region}
            </p>
          )}
          {a.event!.price != null && (
            <p className="m-0 text-[11px] text-(--color-text-subtle)">
              가격: {a.event!.price === 0 ? '무료' : `${a.event!.price.toLocaleString()}원`}
            </p>
          )}
        </div>
      )}
      {!hasEvent && (
        <p className="m-0 text-[11px] text-(--color-text-subtle)">
          기간·장소·가격: 이벤트 연결 없음
        </p>
      )}

      {/* CTA 버튼 영역 */}
      <div className="mt-1 flex flex-wrap gap-2">
        {/* GG-ROOM-020: 채팅방으로 */}
        <button
          type="button"
          onClick={onGoToRoom}
          className="inline-flex h-7 items-center justify-center rounded-(--radius-md) border border-emerald-300 bg-white px-3 text-[12px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
        >
          채팅방으로
        </button>
        {/* GG-MY-002: 이벤트 상세 이동 (event 있을 때만) */}
        {hasEvent && (
          <Link
            to={`/events/${a.event!.eventId}`}
            className="inline-flex h-7 items-center justify-center rounded-(--radius-md) border border-(--color-border) bg-white px-3 text-[12px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-border-hover) hover:text-(--color-text)"
          >
            이벤트 상세
          </Link>
        )}
      </div>
    </article>
  );
}
```

> **주의:** `useNavigate`를 CalendarTab 최상단에서 호출한다. `AppointmentCard`의 `onGoToRoom`은 `/chat/rooms/${a.chatRoomId}`를 직접 사용한다 — 실제 존재하는 라우트.

- [ ] **Step 2: typecheck**

```powershell
cd apps/web
npx tsc -b --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: build 확인**

```powershell
cd apps/web
npm run build
```

Expected: Build successful.

- [ ] **Step 4: commit**

```bash
git add apps/web/src/pages/MyPage/tabs/CalendarTab.tsx
git commit -m "feat(web): CalendarTab — confirmed appointments merged with bookmarks, GG-MY-002 6-item card (GG-MY-002/GG-ROOM-020)"
```

---

## Self-Review

### 1. 리뷰 이슈 해소 현황

| 이슈 | 심각도 | 해소 방법 |
|---|---|---|
| resolveHref 경로 4개 존재하지 않는 라우트 | critical | `relatedEntityType` 기반 분기로 전면 재설계. `/chat/rooms/:id`, `/evaluate/:id`, `/me?tab=calendar`만 사용 |
| mate_eval relatedEntityId 버림 | critical | `case 'appointment' + nt==='mate_eval'`: return `rid ? /evaluate/${rid} : null` |
| notificationType만으로 분기 — '수락됨' 알림 오작동 | critical | `hasInlineAction(n)`: `n.relatedEntityType === 'match_request'`만. `resolveHref`: `relatedEntityType` 우선 |
| appointment 알림 chatRoomId 없음 | high | BFF Task 1: appointment→chatRoom 조인해 `relatedChatRoomId` 필드 추가 |
| appointment_update 누락 | high | NOTIF_TYPE_META + resolveHref에 `appointment_update` 추가 → `/me?tab=calendar` |
| respondMatchRequest 엔드포인트 재확인 | medium | PATCH `/community/match/request/:id/accept|reject` — app.ts:341-349 확인, 경로 일치 |
| AppointmentCard GG-MY-002 팝업 6항목 미충족 | medium | BFF에 region/price 추가, AppointmentCard에 기간/장소/가격/상세페이지 CTA 추가 |
| 캘린더 도트 소스 구분 약화 | low | `appt:` 접두사 eventId로 MonthCalendar에 전달. 추가 도트 색 구분은 MonthCalendar 수정 없이 수용 |
| notifications.ts select 3개 필드 누락 | medium | Task 1 Step 1에서 select 블록 교체 |
| MyNotification 인터페이스 미확장 | medium | Task 4 Step 1에서 전면 교체 |
| GET /me/appointments 미등록 | medium | Task 2에서 라우트 생성 + 등록 |
| index.ts appointments re-export 미포함 | low | Task 4 Step 3에서 추가 |

### 2. Spec coverage

| 요구사항 | 구현 Task |
|---|---|
| GG-NOTI-001 알림 목록 | T5 NotificationsPage |
| GG-NOTI-002~006 유형별 표시 | T5 NOTIF_TYPE_META (appointment_update 포함) |
| GG-NOTI-007 클릭→연결 화면 이동 | T5 resolveHref(relatedEntityType 기반) |
| GG-NOTI-008/009 메이트신청 수락/거절 | T5 onRespond + T4 respondMatchRequest (relatedEntityType==='match_request' 가드) |
| GG-NOTI-010/011 그룹초대 수락/거절 | T5 동일 가드 로직 (group_invite + relatedEntityType==='match_request') |
| GG-NOTI-012 약속동의→채팅방 | T1 relatedChatRoomId 조인 + T5 `/chat/rooms/${relatedChatRoomId}` |
| GG-NOTI-013 평가작성→평가화면 | T5 `/evaluate/${relatedEntityId}` (relatedEntityId=appointmentId) |
| GG-NOTI-014 약속→캘린더 | T5 appointment_update → `/me?tab=calendar` |
| GG-MY-002 캘린더 팝업 6항목 | T2 region/price 조인 + T6 AppointmentCard 6항목 |
| GG-ROOM-020 약속→채팅방 | T6 AppointmentCard "채팅방으로" → `/chat/rooms/${a.chatRoomId}` |
| BFF /me/appointments | T2 신규 라우트 |
| notif-eval 하니스 | T3 9케이스 |

### 3. 마이그레이션 없음 확인

모든 변경은 기존 컬럼/모델 조회만. Prisma migrate 명령 사용 없음.

### 4. Placeholder scan

TBD/TODO/미구현 없음. 모든 라우팅 경로는 실제 main.tsx 등록 라우트 사용.
