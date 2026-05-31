# 슬라이스8 — 신고(Report) + 관리자 모더레이션(A_701) 구현 플랜

**근거**: GG-REPORT-001~009 · A_701 · ADR 0007(결정13 관리자 영역, 금지#4 LLM 자동조치 금지, 결정14 Report 모델)

**컷 금지 원칙**: GG-REPORT-001~009 전부 실구현. placeholder/deferral/미구현 금지. 009 Block 양방향 제외는 추천(mate.ts)에도 소급 적용.

---

## 사전 확인된 실제 구조 (2026-05-30 기준)

- **Prisma migrations 경로**: `apps/bff/prisma/migrations/` — 타임스탬프_이름 컨벤션, 최신: `20260530150000_add_review_complete_dedup_index`
- **fn_set_updated_at()**: `20260417140000_check_constraints_and_triggers/migration.sql` line 87에 정의됨 — 재정의 없이 재사용 가능
- **AdminTab 실제 타입**: `'events' | 'upload-review' | 'uploaders' | 'members' | 'audit-logs'` (index.tsx line 19)
- **AdminEventsPage/tabs/**: `EventsTab.tsx`, `UploadersTab.tsx`, `UploadReviewsTab.tsx` 존재 (MembersTab/AuditLogsTab은 인라인 렌더)
- **admin.scope 값**: `'full' | 'content_only' | 'uploader_review_only' | 'security'` — requireAdmin이 req.admin.scope로 주입
- **blockMember 라우트**: `/community/chat-rooms/:chatRoomId/block/:targetUserId` — GroupMembership+Block 복합. 채팅방 컨텍스트 전용
- **mate.ts getRecommendations** (line 382~413): Block 제외 없음(TODO 주석만), sanctionStatus 필터 없음 — 본 슬라이스에서 모두 추가
- **match-request.ts Block 패턴**: `prisma.block.findFirst({ where: { OR: [{blockerId:me, blockedUserId:x}, {blockerId:x, blockedUserId:me}] } })`
- **MateEvaluation.reportedFor**: 기존 컬럼 유지, mate_eval surface 신고는 Report 모델로 일원화 (reportedFor 폐기 없음, 상세 조회 시 표시용으로 유지)
- **PostDetailPage/parts/**: `AuthorProfileModal.tsx`, `CommentComposer.tsx`, `CommentTree.tsx` 등 — PostCard.tsx 미존재
- **EvaluationPage/parts/**: `FestivalStep.tsx`, `MateEvalStep.tsx`, `StarRating.tsx`
- **CommunityPage/parts/**: `PostList.tsx`, `ComposeModal.tsx` 등
- **session-sweep.ts**: `runSessionSweep()` 패턴 — sanctionExpiry sweep 잡 추가 대상
- **byAction 초기화** (admin-audit.ts line 186~193): 고정 키 6종 하드코딩 — 4종 추가 필요
- **Notification.notificationType**: VARCHAR(30), 도메인 주석만 6종 — enum 아님. `'report_action'` 추가 가능

---

## T1 — DB 모델: Report + User 제재 컬럼 + migration.sql [HUMAN 적용]

### 1-1 Prisma 스키마 편집

파일: `apps/bff/prisma/schema.prisma`

**User 모델 필드 추가** (line 66 `deletedAt` 다음 빈 줄 이후, relations 블록 앞):

```prisma
  // 슬라이스8 제재 상태 (GG-REPORT-006/007). 'none'|'warned'|'suspended'
  sanctionStatus    String    @default("none") @map("sanction_status") @db.VarChar(20)
  sanctionExpiresAt DateTime? @map("sanction_expires_at") @db.Timestamptz
  sanctionReason    String?   @map("sanction_reason") @db.Text
```

**User relations 블록 추가** (line 97 `creditLedgers` 다음):

```prisma
  reportsGiven      Report[]  @relation("ReportSender")
  reportsReceived   Report[]  @relation("ReportTarget")
  reportsMade       Report[]  @relation("ReportAdmin")
```

**Report 모델 신규** (schema 말미 추가):

```prisma
// =============================================================
// REPORT (ADR 0007 결정14 — GG-REPORT-001~009)
// targetType: 'post'|'comment'|'chat_message'|'mate_eval'
// reason:     'spam'|'abuse'|'harassment'|'obscene'|'no_show'|'etc'
// status:     'pending'|'reviewed'|'dismissed'
// adminAction: null|'warned'|'suspended'|'false_report'
// =============================================================
model Report {
  reportId        BigInt    @id @default(autoincrement()) @map("report_id")
  reporterId      BigInt    @map("reporter_id")
  targetUserId    BigInt    @map("target_user_id")
  targetType      String    @map("target_type") @db.VarChar(20)
  targetEntityId  BigInt    @map("target_entity_id")
  reason          String    @db.VarChar(50)
  detail          String?   @db.VarChar(500)
  status          String    @default("pending") @db.VarChar(20)
  adminId         BigInt?   @map("admin_id")
  adminAction     String?   @map("admin_action") @db.VarChar(20)
  adminNote       String?   @map("admin_note") @db.Text
  reviewedAt      DateTime? @map("reviewed_at") @db.Timestamptz
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  reporter   User  @relation("ReportSender", fields: [reporterId],   references: [userId])
  targetUser User  @relation("ReportTarget", fields: [targetUserId], references: [userId])
  admin      User? @relation("ReportAdmin",  fields: [adminId],      references: [userId])

  @@index([status, createdAt(sort: Desc)], map: "idx_reports_status_created")
  @@index([reporterId, createdAt(sort: Desc)], map: "idx_reports_reporter")
  @@index([targetUserId, createdAt(sort: Desc)], map: "idx_reports_target")
  @@index([targetType, targetEntityId], map: "idx_reports_entity")
  @@map("reports")
}
```

### 1-2 migration.sql 초안 (HUMAN이 prisma migrate deploy로 적용)

**파일 경로 (Prisma 스캔 경로 준수)**:
`apps/bff/prisma/migrations/20260530160000_slice8_report_sanction/migration.sql`

```sql
-- 슬라이스8: Report 모델 + User 제재 컬럼 (ADR 0007 결정14)
-- 적용: HUMAN이 prisma migrate deploy 실행 (에이전트 실행 금지)
-- fn_set_updated_at(): 20260417140000_check_constraints_and_triggers 에서 이미 정의됨

-- 1. users 테이블에 제재 컬럼 추가
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sanction_status      VARCHAR(20)  NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS sanction_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sanction_reason      TEXT;

ALTER TABLE users
  ADD CONSTRAINT chk_users_sanction_status
    CHECK (sanction_status IN ('none', 'warned', 'suspended'));

-- 2. reports 테이블 생성
CREATE TABLE reports (
  report_id         BIGSERIAL    PRIMARY KEY,
  reporter_id       BIGINT       NOT NULL REFERENCES users(user_id),
  target_user_id    BIGINT       NOT NULL REFERENCES users(user_id),
  target_type       VARCHAR(20)  NOT NULL,
  target_entity_id  BIGINT       NOT NULL,
  reason            VARCHAR(50)  NOT NULL,
  detail            VARCHAR(500),
  status            VARCHAR(20)  NOT NULL DEFAULT 'pending',
  admin_id          BIGINT       REFERENCES users(user_id),
  admin_action      VARCHAR(20),
  admin_note        TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 3. CHECK 제약
ALTER TABLE reports
  ADD CONSTRAINT chk_reports_target_type
    CHECK (target_type IN ('post', 'comment', 'chat_message', 'mate_eval')),
  ADD CONSTRAINT chk_reports_status
    CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  ADD CONSTRAINT chk_reports_admin_action
    CHECK (admin_action IS NULL OR admin_action IN ('warned', 'suspended', 'false_report')),
  ADD CONSTRAINT chk_reports_no_self_report
    CHECK (reporter_id <> target_user_id);

-- 4. 인덱스
CREATE INDEX idx_reports_status_created ON reports (status, created_at DESC);
CREATE INDEX idx_reports_reporter       ON reports (reporter_id, created_at DESC);
CREATE INDEX idx_reports_target         ON reports (target_user_id, created_at DESC);
CREATE INDEX idx_reports_entity         ON reports (target_type, target_entity_id);

-- 5. updated_at 트리거 (fn_set_updated_at 재사용 — 재정의 없음)
CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
```

### 1-3 에이전트 검증 (여기까지만)

```bash
npx prisma validate --schema=apps/bff/prisma/schema.prisma
```

에러 없음 확인 후 HUMAN에게 마이그레이션 적용 요청.

**HUMAN 적용 명령**:
```bash
cd apps/bff && npx prisma migrate deploy
```

---

## T2 — BFF 신고 라우트 (GG-REPORT-001~003)

### 파일: `apps/bff/src/routes/reports.ts` (신규)

**엔드포인트**:

| Method | Path | 핸들러 | 설명 |
|--------|------|--------|------|
| `POST` | `/community/reports` | `createReport` | 신고 접수 저장 (GG-001~003) |
| `GET` | `/community/users/:targetUserId/block` | `blockUser` | 일반 차단 API (GG-008, 채팅방 없는 surface) |
| `GET` | `/me/reports` | `listMyReports` | 내가 제출한 신고 목록 |

> **GG-REPORT-008 일반 차단**: 기존 `blockMember`는 `/community/chat-rooms/:chatRoomId/block/:targetUserId`로 채팅방+멤버십 컨텍스트 전용. post/comment surface에서 신고+차단 조합을 위해 chatRoomId 없이 Block.create만 수행하는 일반 차단 엔드포인트를 `reports.ts`에 동봉.

**createReport 입력 검증**:
- `body.targetUserId`: string → BigInt parse, 자기 자신 불가 → 400
- `body.targetType`: `'post'|'comment'|'chat_message'|'mate_eval'` — 외 400
- `body.targetEntityId`: string → BigInt parse
- `body.reason`: `'spam'|'abuse'|'harassment'|'obscene'|'no_show'|'etc'` — 외 400
- `body.detail?`: 최대 500자

**createReport 로직**:
1. requireAuth 통과
2. targetUser 존재 + isDeleted=false 확인 (없으면 404)
3. targetEntityId 존재 확인 — targetType별 테이블 findFirst:
   - `post` → `prisma.post.findFirst({ where: { postId, isDeleted: false } })`
   - `comment` → `prisma.comment.findFirst({ where: { commentId, isDeleted: false } })`
   - `chat_message` → `prisma.chatRoomMessage.findFirst({ where: { messageId: targetEntityId } })`
   - `mate_eval` → `prisma.mateEvaluation.findFirst({ where: { evalId: targetEntityId } })`
   - 없으면 404
4. 중복 신고 방지: 동일 `(reporterId, targetType, targetEntityId)` + status IN `('pending','reviewed')` → 409 `already_reported`
   - `dismissed` 상태는 재신고 허용
5. `prisma.report.create(...)` → `201 { reportId: string }`

**blockUser 로직** (일반 차단, GG-REPORT-008):
- 경로: `POST /community/users/:targetUserId/block`
- requireAuth
- 자기 자신 차단 방지 → 400
- `Block.findUnique` 중복 확인 → 409 `already_blocked`
- `Block.create({ blockerId: auth.userId, blockedUserId: targetUserId })` 만 — GroupMembership 변경 없음
- `200 { blockId: string }`

**listMyReports**:
- page/limit 페이지네이션, status 쿼리 필터
- 응답: `{ items, total, page, limit }`

### 파일: `apps/bff/src/jobs/report-eval.ts` (신규)

시나리오 6건:
1. `POST /community/reports` 정상 접수 → 201
2. 자기 자신 신고 → 400
3. 존재하지 않는 targetEntityId → 404
4. 중복 신고 (pending 상태) → 409 `already_reported`
5. dismissed 후 재신고 → 201 허용
6. 미인증 → 401

---

## T3 — BFF 관리자 모더레이션 라우트 + GG-REPORT-009 소급 (GG-REPORT-004~009)

### 파일: `apps/bff/src/routes/admin-reports.ts` (신규)

**엔드포인트**:

| Method | Path | 핸들러 | 권한 | 설명 |
|--------|------|--------|------|------|
| `GET` | `/admin/reports` | `listAdminReports` | requireAdmin | 신고 목록 (GG-004) |
| `GET` | `/admin/reports/:reportId` | `getAdminReport` | requireAdmin | 신고 상세 + 콘텐츠 본문 (GG-005) |
| `POST` | `/admin/reports/:reportId/action` | `actionAdminReport` | requireAdmin + scope 검증 | 조치 결정 (GG-006/007) |

**listAdminReports 쿼리**:
- `status`: pending|reviewed|dismissed|any (기본 pending)
- `targetType`: post|comment|chat_message|mate_eval|any
- `page`, `limit` (기본 20, 최대 100)

응답에 `byStatus: { pending: N, reviewed: N, dismissed: N }` 포함.

**getAdminReport**:
- 신고 상세 + `targetContent` 인라인:
  - `post`: `{ title, body }`
  - `comment`: `{ body }`
  - `chat_message`: `{ body, messageType }`
  - `mate_eval`: `{ ratingStars, comment, reportedFor }` — reportedFor 표시용 유지

**actionAdminReport 권한 검증** (req.admin.scope 기준):

```typescript
// requireAdmin이 req.admin.scope를 이미 주입
const { scope } = (req as AdminRequest).admin;
// 경고/허위신고/기각: full 또는 content_only 가능
if (scope !== 'full' && scope !== 'content_only') {
  res.status(403).json({ error: 'admin_scope_content_required' });
  return;
}
// 이용정지: full만 가능
if (body.action === 'suspended' && scope !== 'full') {
  res.status(403).json({ error: 'admin_scope_full_required' });
  return;
}
```

**actionAdminReport 입력**:

```typescript
body: {
  action: 'warned' | 'suspended' | 'false_report' | 'dismissed',
  note?: string,
  suspendDays?: number,   // action='suspended'일 때 필수, 1~365
}
```

**actionAdminReport 로직** (Prisma 트랜잭션):
1. report 조회, status='pending' 아니면 → 409 `already_reviewed`
2. `action='warned'`:
   - `users.update({ sanctionStatus:'warned', sanctionReason:note })` (targetUserId)
   - `reports.update({ status:'reviewed', adminId, adminAction:'warned', adminNote:note, reviewedAt:now })`
   - `adminAuditLog.create({ action:'report_action_warned', adminId, targetId:targetUserId, payload:{ reportId, note } })`
   - Notification 생성 → targetUser: `{ notificationType:'report_action', relatedEntityType:'report', relatedEntityId:reportId }`
3. `action='suspended'`:
   - `suspendDays` 필수 (없으면 400), 1~365 범위 검증
   - `sanctionExpiresAt = new Date(Date.now() + suspendDays * 86400_000)`
   - `users.update({ sanctionStatus:'suspended', sanctionExpiresAt, sanctionReason:note })`
   - `reports.update(...)` + `adminAuditLog.create({ action:'report_action_suspended', ... })`
   - Notification 생성 → targetUser: `{ title:'이용정지 조치', message:${suspendDays}일간 이용정지 }`
4. `action='false_report'`:
   - `reports.update({ status:'reviewed', adminAction:'false_report', ... })`
   - `adminAuditLog.create({ action:'report_action_false_report', ... })`
   - Notification 생성 → **reporter**에게: `{ title:'허위신고 처리', ... }`
5. `action='dismissed'`:
   - `reports.update({ status:'dismissed', ... })`
   - `adminAuditLog.create({ action:'report_dismissed', targetId:null, payload:{ reportId } })`

응답: `{ reportId, status, adminAction, auditId }`

### GG-REPORT-009 소급: mate.ts getRecommendations 수정

파일: `apps/bff/src/routes/mate.ts`

**현재 상황**: line 382 TODO 주석만 있고 Block 제외 및 sanctionStatus 필터 없음 — 모두 미구현.

**추가 내용** (candidates 조회 직전, line 382 TODO 제거 후):

```typescript
// GG-REPORT-009: 차단 및 이용정지 사용자 추천 제외 (Slice 8)
// 1) 양방향 Block 제외
const blockedUserIds = await prisma.block.findMany({
  where: {
    OR: [
      { blockerId: auth.userId },
      { blockedUserId: auth.userId },
    ],
  },
  select: { blockerId: true, blockedUserId: true },
});
const blockedSet = new Set<bigint>();
for (const b of blockedUserIds) {
  blockedSet.add(b.blockerId);
  blockedSet.add(b.blockedUserId);
}
blockedSet.delete(auth.userId); // 본인 제거

// 2) 이용정지 만료 확인 후 candidates where에 추가
const now = new Date();
```

candidates `where` 블록에 추가:

```typescript
where: {
  consentedAt: { not: null },
  isDeleted: false,
  autoRecommend: true,
  userId: { not: auth.userId },
  regionId: myProfile.regionId,
  // GG-REPORT-009 추가: Block 양방향 제외
  ...(blockedSet.size > 0 ? { userId: { notIn: [...blockedSet], not: auth.userId } } : {}),
  // GG-REPORT-009 추가: 유효한 이용정지 사용자 제외 (만료된 정지는 포함)
  NOT: {
    user: {
      sanctionStatus: 'suspended',
      sanctionExpiresAt: { gt: now },
    },
  },
},
```

> **주의**: `userId: { notIn, not }` 복합은 Prisma에서 `AND` 배열로 분리해야 함. blockedSet이 비어있으면 notIn 생략.

### GG-REPORT-009 소급: match-request.ts 수정

파일: `apps/bff/src/routes/match-request.ts`

**sendOneToOneRequest** (line ~80): receiver 조회 후 아래 검증 추가:

```typescript
// GG-REPORT-009: 이용정지 대상자에게 신청 불가
const receiverUser = await prisma.user.findUnique({
  where: { userId: receiverUserId },
  select: { sanctionStatus: true, sanctionExpiresAt: true, isDeleted: true },
});
if (!receiverUser || receiverUser.isDeleted) {
  res.status(404).json({ error: 'user_not_found' }); return;
}
const now = new Date();
if (receiverUser.sanctionStatus === 'suspended' &&
    (!receiverUser.sanctionExpiresAt || receiverUser.sanctionExpiresAt > now)) {
  res.status(409).json({ error: 'target_suspended' }); return;
}
```

동일 검증을 **sendGroupRequest** (line ~210)에도 추가. 단, `suspended` 상태인 사용자가 **받은** 신청에 대해 수락/거절하는 것은 허용 (읽기-쓰기 차단 없음 — suspended는 외부 노출만 차단, 본인 조작은 제한하지 않음).

### admin-audit.ts ADMIN_AUDIT_ACTIONS + byAction 확장

파일: `apps/bff/src/routes/admin-audit.ts`

**ADMIN_AUDIT_ACTIONS Set** (line 115~122)에 4종 추가:

```typescript
const ADMIN_AUDIT_ACTIONS = new Set([
  'revoke_sessions',
  'admin_promote',
  'admin_demote',
  'admin_scope_change',
  'user_soft_delete',
  'uploader_decision',
  // 슬라이스8 신고 관련 액션
  'report_action_warned',
  'report_action_suspended',
  'report_action_false_report',
  'report_dismissed',
]);
```

**byAction 초기화 객체** (line 186~193)에 4종 추가:

```typescript
const byAction: Record<string, number> = {
  revoke_sessions: 0,
  admin_promote: 0,
  admin_demote: 0,
  admin_scope_change: 0,
  user_soft_delete: 0,
  uploader_decision: 0,
  // 슬라이스8 추가
  report_action_warned: 0,
  report_action_suspended: 0,
  report_action_false_report: 0,
  report_dismissed: 0,
};
```

line 289 근방의 두 번째 byAction 초기화 객체가 있다면 동일하게 추가.

### session-sweep.ts — sanctionExpiry sweep 잡 추가

파일: `apps/bff/src/jobs/session-sweep.ts`

`runSessionSweep()` 함수 아래에 추가 (30줄 이내):

```typescript
// GG-REPORT-006/007: 이용정지 만료 사용자 제재 해제 배치
export async function runSanctionExpirySweep(): Promise<{ reset: number }> {
  const now = new Date();
  const result = await prisma.user.updateMany({
    where: {
      sanctionStatus: 'suspended',
      sanctionExpiresAt: { lte: now },
    },
    data: {
      sanctionStatus: 'none',
      sanctionExpiresAt: null,
      sanctionReason: null,
    },
  });
  return { reset: result.count };
}
```

`scheduler.ts`의 `runAll()` 에 `runSanctionExpirySweep()` 호출 추가.

---

## T4 — Web API 클라이언트

### 파일: `apps/web/src/lib/api/reports.ts` (신규)

```typescript
import { client } from './client.js';

export type ReportTargetType = 'post' | 'comment' | 'chat_message' | 'mate_eval';
export type ReportReason = 'spam' | 'abuse' | 'harassment' | 'obscene' | 'no_show' | 'etc';
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';
export type ReportAdminAction = 'warned' | 'suspended' | 'false_report' | 'dismissed';

export interface CreateReportBody {
  targetUserId: string;
  targetType: ReportTargetType;
  targetEntityId: string;
  reason: ReportReason;
  detail?: string;
}

export interface ReportItem {
  reportId: string;
  reporterId: string;
  reporterNickname: string;
  targetUserId: string;
  targetUserNickname: string;
  targetType: ReportTargetType;
  targetEntityId: string;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  adminAction: ReportAdminAction | null;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ReportDetail extends ReportItem {
  targetContent: Record<string, unknown> | null;
}

export interface AdminReportsListResponse {
  page: number;
  limit: number;
  total: number;
  byStatus: Record<ReportStatus, number>;
  items: ReportItem[];
}

export interface AdminReportActionBody {
  action: ReportAdminAction;
  note?: string;
  suspendDays?: number;
}

// 사용자: 신고 접수 (GG-REPORT-001~003)
export async function createReport(body: CreateReportBody): Promise<{ reportId: string }>

// 사용자: 일반 차단 (GG-REPORT-008, 채팅방 없는 surface)
export async function blockUser(targetUserId: string): Promise<{ blockId: string }>

// 사용자: 내 신고 목록
export async function fetchMyReports(
  query: { status?: string; page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<{ items: ReportItem[]; total: number; page: number; limit: number }>

// 관리자: 신고 목록 (GG-REPORT-004)
export async function fetchAdminReports(
  query: { status?: string; targetType?: string; page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<AdminReportsListResponse>

// 관리자: 신고 상세 (GG-REPORT-005)
export async function fetchAdminReport(reportId: string, signal?: AbortSignal): Promise<ReportDetail>

// 관리자: 조치 결정 (GG-REPORT-006/007)
export async function actionReport(
  reportId: string,
  body: AdminReportActionBody,
): Promise<{ reportId: string; status: string; adminAction: string; auditId: string }>
```

### `apps/web/src/lib/api/index.ts` 수정

기존 export 라인들 아래에 추가:

```typescript
export * from './reports.js';
```

---

## T5 — SEED 신고 UI (사용자 side)

### 5-1 공통 신고 모달

파일: `apps/web/src/components/ReportModal.tsx` (신규)

```typescript
interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetUserId: string;
  targetEntityId: string;
  onSuccess?: () => void;
}

export function ReportModal(props: ReportModalProps): JSX.Element
```

**UI 구조** (SEED all.css, 금지 패턴 준수 — 보라 그라디언트, 뚱뚱한 pill 버튼 금지):

- 오버레이: `position:fixed inset-0 z-50 bg-black/40 flex items-center justify-center`
- 패널: `rounded-(--radius-lg) bg-(--color-surface) p-6 w-full max-w-[400px] shadow-lg`
- 헤더: "신고하기" + X 버튼 (접근성 `aria-label="닫기"`)
- 신고 사유 라디오 6종:
  - `spam` — 스팸/광고
  - `abuse` — 욕설/혐오
  - `harassment` — 괴롭힘
  - `obscene` — 음란물
  - `no_show` — 노쇼 (mate_eval surface에서만 노출)
  - `etc` — 기타
- 상세 사유 textarea (선택, 500자 제한) — 항상 표시, `no_show`/`etc` 선택 시 강조
- 제출 버튼: `btn-primary` 패턴
- 로딩 상태: 버튼 disabled + 스피너
- 성공: 토스트 → `onSuccess()` → `onClose()`
- 에러: `already_reported` → "이미 신고한 내용입니다" 인라인 표시

### 5-2 신고 버튼 surface별 적용

**[PostDetailPage] 게시글 신고**

파일: `apps/web/src/pages/PostDetailPage/index.tsx`

- 상세 페이지 헤더 영역에 작성자 닉네임 옆 3-dot 메뉴 또는 "신고" 텍스트 버튼 추가
- `currentUser.userId === post.userId`이면 신고 버튼 미노출
- `<ReportModal targetType="post" targetEntityId={post.postId} targetUserId={post.userId} />`

**[CommunityPage/parts/PostList.tsx] 게시글 목록 신고**

- 각 PostItem row 우측 3-dot 메뉴에 "신고" 옵션 추가 (본인 글 제외)

**[PostDetailPage/parts/CommentTree.tsx] 댓글 신고**

- 댓글 row hover 시 "신고" 버튼 노출 (본인 댓글 제외)
- `<ReportModal targetType="comment" targetEntityId={comment.commentId} targetUserId={comment.userId} />`

**[ChatRoomPage/index.tsx] 채팅 메시지 신고**

- 메시지 말풍선 롱프레스 또는 hover 컨텍스트 메뉴에 "신고" 옵션 추가 (본인 메시지 제외)
- `<ReportModal targetType="chat_message" targetEntityId={message.messageId} targetUserId={message.senderUserId} />`

**[EvaluationPage/parts/MateEvalStep.tsx] 메이트 평가 신고**

- 와이어 9-15 기반 "신고" 버튼 노출
- 평가 제출 시 `EvalSubmitBody.reportedFor` 값이 있으면 평가 제출 성공 후 자동으로 `createReport` 호출:
  - `reportedFor` → `reason` 매핑: `inappropriate→abuse`, `harassing→harassment`, `no_show→no_show`, `etc→etc`
  - `targetType='mate_eval'`, `targetEntityId=evalId`, `targetUserId=evaluatedUserId`
- 이 경우 ReportModal 팝업 없이 자동 처리 (이미 reportedFor 선택으로 사유 수집됨)

**[PostDetailPage/parts/AuthorProfileModal.tsx] 차단 진입점**

- "차단하기" 버튼 → `blockUser(targetUserId)` 호출 (일반 차단 API)
- 성공 시 "차단되었습니다" 토스트
- 이미 차단된 경우(`already_blocked`) → "이미 차단된 사용자입니다" 표시

---

## T6 — SEED 관리자 신고 처리 탭 (A_701)

### 6-1 AdminEventsPage 탭 확장

파일: `apps/web/src/pages/AdminEventsPage/index.tsx`

실제 타입 (확인됨, line 19): `'events' | 'upload-review' | 'uploaders' | 'members' | 'audit-logs'`

**변경 내용**:

```typescript
// line 19 타입 확장
type AdminTab = 'events' | 'upload-review' | 'uploaders' | 'members' | 'audit-logs' | 'reports';

// TABS 배열에 추가 (line 71 audit-logs 다음)
{ key: 'reports', label: 'Reports', subtitle: '신고 모더레이션' }

// AdminBody 렌더 블록에 추가 (tab==='audit-logs' 다음)
{tab === 'reports' && <ReportsTab />}
```

import 추가: `import { ReportsTab } from './tabs/ReportsTab.js';`

### 6-2 신고 목록/상세/조치 탭

파일: `apps/web/src/pages/AdminEventsPage/tabs/ReportsTab.tsx` (신규)

**레이아웃**: 좌우 패널 분할 — 기존 EventsTab 패턴과 동일 구조.

**ReportsListPanel**:
- 상태 필터 탭: pending / reviewed / dismissed
- targetType 필터 드롭다운
- byStatus 카운터 뱃지 (`pending: N` 주황 뱃지)
- 신고 목록 테이블: 신고일시 / 신고자 / 피신고자 / 유형 / 사유 / 상태 뱃지
- 행 클릭 → 상세 패널 노출
- 20건/페이지 페이지네이션

**targetType 한글 매핑**:
- `post` → 게시글
- `comment` → 댓글
- `chat_message` → 채팅 메시지
- `mate_eval` → 메이트 평가

**ReportDetailPanel**:
- 신고 정보: 신고자/피신고자 닉네임, 유형, 사유, 상세, 신고 일시
- 신고된 콘텐츠 (`targetContent`):
  - `post`: 제목 + 본문 excerpt (200자 + "...")
  - `comment`: 본문
  - `chat_message`: 메시지 본문
  - `mate_eval`: 별점 + 코멘트 + reportedFor 레이블
- 조치 결정 폼 (`status === 'pending'`일 때만 노출):
  - `<select>`: 경고 / 이용정지 / 허위신고 / 기각
  - 이용정지 선택 시 `suspendDays` 숫자 입력 (1~365)
  - 관리자 메모 textarea
  - "조치 적용" 버튼 → `actionReport` 호출 → 성공 시 목록 리로드 + 상세 초기화
- `status !== 'pending'`: 조치 결과 읽기 전용 (adminAction, adminNote, reviewedAt)

**StatusBadge 컴포넌트** (인라인):

| 조건 | 뱃지 스타일 | 레이블 |
|------|-----------|--------|
| `pending` | 주황 | 대기 |
| `reviewed` + `warned` | 노란 | 경고 |
| `reviewed` + `suspended` | 빨간 | 정지 |
| `reviewed` + `false_report` | 회색 | 허위신고 |
| `dismissed` | 회색 | 기각 |

---

## T7 — app.ts 라우트 등록

파일: `apps/bff/src/app.ts`

```typescript
import { createReport, listMyReports, blockUser } from './routes/reports.js';
import { listAdminReports, getAdminReport, actionAdminReport } from './routes/admin-reports.js';
```

라우트 등록 (admin-users 블록 이후):

```typescript
// GG-REPORT-001~003: 사용자 신고
app.post('/community/reports',
  (req, res, next) => requireAuth(req, res, next).catch(next),
  (req, res, next) => createReport(req, res).catch(next),
);
app.get('/me/reports',
  (req, res, next) => requireAuth(req, res, next).catch(next),
  (req, res, next) => listMyReports(req, res).catch(next),
);

// GG-REPORT-008: 일반 사용자 차단 (chatRoom 없는 surface용)
app.post('/community/users/:targetUserId/block',
  (req, res, next) => requireAuth(req, res, next).catch(next),
  (req, res, next) => blockUser(req, res).catch(next),
);

// GG-REPORT-004~007: 관리자 신고 모더레이션 (A_701)
app.get('/admin/reports',
  (req, res, next) => requireAuth(req, res, next).catch(next),
  (req, res, next) => requireAdmin(req, res, next).catch(next),
  (req, res, next) => listAdminReports(req, res).catch(next),
);
app.get('/admin/reports/:reportId',
  (req, res, next) => requireAuth(req, res, next).catch(next),
  (req, res, next) => requireAdmin(req, res, next).catch(next),
  (req, res, next) => getAdminReport(req, res).catch(next),
);
app.post('/admin/reports/:reportId/action',
  (req, res, next) => requireAuth(req, res, next).catch(next),
  (req, res, next) => requireAdmin(req, res, next).catch(next),
  (req, res, next) => actionAdminReport(req, res).catch(next),
);
```

---

## 파일 목록 요약

| Task | 파일 | 작업 |
|------|------|------|
| T1 | `apps/bff/prisma/schema.prisma` | Report 모델 + User sanctionStatus 필드 + relations 추가 |
| T1 | `apps/bff/prisma/migrations/20260530160000_slice8_report_sanction/migration.sql` | 신규 (HUMAN 적용) |
| T2 | `apps/bff/src/routes/reports.ts` | 신규 (createReport, blockUser, listMyReports) |
| T2 | `apps/bff/src/jobs/report-eval.ts` | 신규 (eval 하니스 6건) |
| T3 | `apps/bff/src/routes/admin-reports.ts` | 신규 (listAdminReports, getAdminReport, actionAdminReport) |
| T3 | `apps/bff/src/routes/mate.ts` | getRecommendations: Block 양방향 + sanctionStatus 필터 추가 |
| T3 | `apps/bff/src/routes/match-request.ts` | sendOneToOneRequest/sendGroupRequest: target_suspended 검증 추가 |
| T3 | `apps/bff/src/routes/admin-audit.ts` | ADMIN_AUDIT_ACTIONS + byAction 초기화 4종 추가 |
| T3 | `apps/bff/src/jobs/session-sweep.ts` | runSanctionExpirySweep() 추가 |
| T4 | `apps/web/src/lib/api/reports.ts` | 신규 |
| T4 | `apps/web/src/lib/api/index.ts` | `export * from './reports.js'` 추가 |
| T5 | `apps/web/src/components/ReportModal.tsx` | 신규 |
| T5 | `apps/web/src/pages/PostDetailPage/index.tsx` | 게시글 신고 버튼 추가 |
| T5 | `apps/web/src/pages/CommunityPage/parts/PostList.tsx` | 목록 신고 버튼 추가 |
| T5 | `apps/web/src/pages/PostDetailPage/parts/CommentTree.tsx` | 댓글 신고 버튼 추가 |
| T5 | `apps/web/src/pages/ChatRoomPage/index.tsx` | 채팅 메시지 신고 버튼 추가 |
| T5 | `apps/web/src/pages/EvaluationPage/parts/MateEvalStep.tsx` | 평가 신고 자동 연동 추가 |
| T5 | `apps/web/src/pages/PostDetailPage/parts/AuthorProfileModal.tsx` | 일반 차단 버튼 추가 |
| T6 | `apps/web/src/pages/AdminEventsPage/tabs/ReportsTab.tsx` | 신규 |
| T6 | `apps/web/src/pages/AdminEventsPage/index.tsx` | 'reports' 탭 추가 |
| T7 | `apps/bff/src/app.ts` | 신고 + 관리자 신고 라우트 등록 |

---

## Green 기준

| 단계 | 명령 | 합격 조건 |
|------|------|----------|
| T1 | `npx prisma validate --schema=apps/bff/prisma/schema.prisma` | 에러 없음 |
| T2/T3/T7 | `npx tsc --noEmit -p apps/bff/tsconfig.json` | 타입 에러 없음 |
| T4/T5/T6 | `npx tsc --noEmit -p apps/web/tsconfig.json` | 타입 에러 없음 |
| T2 | `npx tsx apps/bff/src/jobs/report-eval.ts` | 6건 PASS |
| 전체 | `npm run build -w apps/bff && npm run build -w apps/web` | 빌드 성공 |

---

## 주의사항 & 금지 재확인

1. **마이그레이션 경로**: `apps/bff/prisma/migrations/20260530160000_slice8_report_sanction/migration.sql` — `infra/db/migrations/` 금지. `-- +migrate Up/Down` 마커 금지 (Prisma는 순수 SQL). 에이전트는 `prisma validate` 까지만.

2. **마이그레이션 적용**: HUMAN이 `cd apps/bff && npx prisma migrate deploy` 실행. 에이전트는 `prisma migrate dev/deploy/db push/reset` 실행 절대 금지.

3. **LLM 조치 금지**: `adminAction` 결정은 관리자 UI 입력으로만. LLM 체인 호출 없음 (금지#4).

4. **ChatSession/ChatMessage(LLM) 수정 금지**: `chat.ts`, `chat-eval.ts`, LLM ChatSession/ChatMessage 모델 무수정. 신고 대상 `chat_message`는 `ChatRoomMessage`(메이트 채팅방)만.

5. **enum 금지**: 모든 status/action/type 값은 `String @db.VarChar` — Prisma enum 타입 사용 안 함.

6. **GG-REPORT-008 차단**: 일반 차단 API(`POST /community/users/:targetUserId/block`)는 `Block.create`만 — `GroupMembership.memberStatus` 변경 없음. 기존 `blockMember`(채팅방 전용)와 병존.

7. **GG-REPORT-009 추천 제외**: mate.ts getRecommendations에 Block 양방향 제외 **미구현 상태** (line 382 TODO만). 본 슬라이스에서 Block + sanctionStatus 필터 모두 추가. '이미 구현됨'으로 오판 금지.

8. **MateEvaluation.reportedFor**: 기존 컬럼 유지 (폐기 없음). mate_eval surface 신고는 Report 모델로 일원화하되, getAdminReport 상세에서 `targetContent.reportedFor` 표시 경로 유지.

9. **Notification.notificationType 'report_action'**: VARCHAR(30) — 도메인 추가 가능. schema 주석 갱신 포함.

10. **Admin scope**: 경고/허위신고/기각 = `full | content_only`. 이용정지 = `full`만. requireAdmin 미들웨어가 `req.admin.scope`를 주입하므로 admin-reports.ts에서 직접 읽어 검증.

11. **suspended 사용자 수락/거절**: suspended 상태인 사용자가 **받은** 신청에 대해 수락/거절 허용 (외부 노출 차단, 본인 조작 비제한).

12. **중복 신고**: `pending` + `reviewed` 상태만 중복 방지 → 409. `dismissed` 후 재신고 허용 → 201.

---

*작성: 2026-05-30 | 리뷰 이슈 1~21 반영 완료*
