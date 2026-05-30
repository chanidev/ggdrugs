# Slice 3 — 신청 + 실시간 채팅 (A_803 / A_804 / A_805) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development per Task. 체크박스(`- [ ]`) 단위로 진행.
> 이 플랜은 focused 형식 — 스키마/마이그레이션은 전체, BFF/UI는 스코프드 스펙 + 핵심 시그니처. 세부 구현은 **슬라이스2 플랜(mate.ts·mate-eval.ts·MateFormPage 패턴)을 템플릿**으로 따른다.

**Goal.** 사용자가 메이트 추천 목록 또는 게시글 프로필 모달에서 1:1 채팅 신청 → 수락 → 실시간 채팅방(텍스트/이미지/스티커)을 사용한다. 그룹 신청(최대 4인), 방장 권한(즉시강퇴1회/투표강퇴/충원/미접속48h), 약속 제안·역제안·동의 흐름, 나가기/차단을 포함한다. 백그라운드 스케줄러가 신청 24h·그룹초대 6h·강퇴투표 36h·미접속 48h·약속 36h 타임아웃을 처리한다.

**Architecture.** Socket.IO를 기존 Express HTTP 서버에 attach(`server.ts` 수정) + `@socket.io/redis-adapter` pub/sub fan-out + Postgres 메시지 영속. 스케줄러는 `server.ts`에서 `startScheduler()`와 **독립적으로** 직접 호출(`startChatScheduler()`) — ingest API 키 유무와 무관하게 가동. **BFF REST 가용성과 격리.** `ChatRoom*` ≠ `ChatSession/ChatMessage`(LLM 검색) — 완전 분리, 교차 JOIN 금지.

**Tech Stack.** BFF Express+Prisma+Postgres. Socket.IO 4.x + `@socket.io/redis-adapter` + `ioredis`. Web React19+Vite6+SEED(Option B). enum=String+@db.VarChar(Prisma enum 미사용). **패키지 미설치**: `socket.io`, `@socket.io/redis-adapter`, `ioredis`, `socket.io-client` — Task 0에서 설치.

## 핵심 결정 (ADR 0007 결정6·10·11·14 + 리뷰 38건 반영)

- **ChatRoom/ChatRoomMessage 명명**: 기존 `ChatSession/ChatMessage`(LLM)와 테이블·타입·import 모두 완전 분리. 신규 파일에서 `ChatSession|prisma.chatMessage` 0건 — 마감 grep 검증.
- **Socket.IO attach**: `server.ts`에서 `app.listen()` 반환값(`http.Server`)에 attach. `createApp()`은 변경 없음. shutdown에 `closeRedisClient()` 추가.
- **Redis 클라이언트**: `apps/bff/src/lib/redis-client.ts` 신규. ioredis singleton(pub용) + `.duplicate()`(sub용, adapter 전용). sub 클라이언트는 adapter에 위임, 재사용 금지. `env.REDIS_URL`은 `.env.example` + `packages/config/schema.ts`에 이미 존재 — 추가 불필요.
- **env.WEB_URL**: Socket.IO CORS origin은 `env.WEB_URL`(`app.ts`의 `ALLOWED_ORIGINS` 근거) — `WEB_ORIGIN` 아님.
- **스케줄러 독립성**: `startChatScheduler()`를 `server.ts`에서 `startScheduler()`와 **별개로** 직접 호출. ingest 키 early-return과 격리(BFF REST 격리 원칙 일치).
- **인증 미들웨어 재사용**: `io.use()` Socket.IO auth는 `require-auth.ts`의 parseSid/만료/isDeleted 로직을 공유 함수(`extractSession`)로 추출해 동일 검증. 쿠키명 `alle_sid`, `socket.handshake.headers.cookie`에서 추출, `withCredentials:true` 필수. 미인증 시 `next(new Error('unauthenticated'))`.
- **인스턴트킥 1회 소진**: `instantKickUsed` 컬럼을 **방장(role='owner') 자신의 `GroupMembership` 행에** 둔다. kick/instant 트랜잭션에서 `방장 멤버십.instantKickUsed=false` 검증 후 소진. 대상 멤버 행에 두지 않음(이슈 2).
- **1:1 GroupMembership role**: 1:1 ChatRoom의 `ownerUserId`는 NULL. 양쪽 참여자 모두 `role='member'`. `owner` 역할은 그룹 채팅방에서만 유효(이슈 19).
- **Notification.scheduledAt/title 채움**: 즉시 알림은 `scheduledAt: new Date(), isSent: true, title: '...'` 명시. 기존 scheduler 폴링 파이프라인과 충돌 없음(즉시발송 경로 분리).
- **Notification 기존 행 backfill**: migration에서 `UPDATE notifications SET notification_type='event_bookmark' WHERE event_id IS NOT NULL AND notification_type IS NULL` 포함.
- **Appointment 모델 신설**: 약속 제안/동의/역제안/캘린더 상태를 영속. 시스템 메시지만으론 GG-ROOM-016~020 상태머신 구현 불가 — 전용 테이블.
- **AppointmentVote 모델 신설**: 1인당 동의/거절/역제안 상태 영속. 역제안(counter-propose)은 `vote='counter'` + `counterAt/counterTime` 컬럼.
- **Block 모델 신설**: ADR 0007 결정14 명시. GG-REPORT-009 차단 연동용.
- **그룹 초대 게이트**: `receiverUserIds`는 `MateProfile.groupApply=true`(groupOptIn 동의) 사용자로 제한. `maxMembers=4` 기준 현재 멤버수 + 초대수 ≤ 4 검증.
- **MatchRequest.chatRoomId**: nullable(`BigInt?`) — pending/rejected/expired 상태에서 NULL. migration DDL도 `BIGINT` (nullable, NOT NULL 아님).
- **약속 확정 후 추천 비활성화**: `ChatRoom.status` 필드가 아닌 Appointment.status='confirmed' 시 `getSocketServer().to(room).emit('appointment:confirmed')` emit → 클라이언트에서 추천 영역 블라인드(GG-ROOM-021/GG-COMM-011).
- **GG-ROOM-004 선택 저장**: `PATCH /community/chat-rooms/:chatRoomId/event` 엔드포인트로 `eventId` 저장.
- **Socket.IO 키 네임스페이스**: Socket.IO adapter 자동 prefix `socket.io#` — 기존 Redis 키와 충돌 없음. 사용자별 룸 키: `user:{userId}`, 채팅방 키: `room:{chatRoomId}`.
- **스티커**: `ChatRoomMessage.messageType='sticker'`, `stickerId` 컬럼. 별도 테이블 불필요.
- **PII 마스킹**: audit 로그에서 `maskPii()` 실제 호출 — 슬라이스2 패턴 동일.
- **마이그레이션은 HUMAN 적용** — 에이전트는 `prisma migrate/diff/db push/reset` 절대 금지. 적용: `prisma migrate deploy`(신규 1건).

## File Structure

| 경로 | 책임 |
|---|---|
| `apps/bff/prisma/migrations/20260530120000_phase2_chat/migration.sql` | 6모델 + Notification 확장 DDL (HUMAN 적용) |
| `apps/bff/src/lib/redis-client.ts` | ioredis singleton(pub) + duplicate(sub) 패턴 |
| `apps/bff/src/lib/socket-server.ts` | Socket.IO 서버, Redis adapter, auth 미들웨어, 이벤트 핸들러 |
| `apps/bff/src/lib/extract-session.ts` | parseSid/만료/isDeleted 공유 함수 (requireAuth + io.use 공용) |
| `apps/bff/src/routes/match-request.ts` | 신청 REST (1:1/그룹 신청·수락·거절) |
| `apps/bff/src/routes/chat-room.ts` | 채팅방 REST (메시지이력·약속·나가기·차단·방장권한·이벤트선택) |
| `apps/bff/src/jobs/chat-scheduler.ts` | 타임아웃 백그라운드 워커 |
| `apps/bff/src/jobs/chat-eval.ts` | in-process 검증 하니스 |
| `apps/web/src/lib/api/match.ts` | 신청/채팅방 API 클라이언트 |
| `apps/web/src/lib/socket.ts` | Socket.IO 클라이언트 singleton + useChatRoom 훅 |
| `apps/web/src/pages/ChatRequestPage/` | 채팅 신청 UI (와이어 9-3) |
| `apps/web/src/pages/ChatRoomPage/` | 1:1/그룹 채팅방 UI (와이어 9-4/9-17) |
| `apps/web/src/pages/ChatRoomPage/parts/` | HamburgerMenu(9-5), OwnerMenu(9-19), AppointmentPopup, EventSelectBox |
| 수정: `server.ts`(Socket.IO attach + startChatScheduler), `app.ts`(라우트 등록), `schema.prisma`(6모델+Notification 확장), `main.tsx`(라우트), `AuthorProfileModal.tsx`(채팅 신청 버튼 활성화), `require-auth.ts`(extractSession 추출) |

---

## Task 0 — 패키지 설치 + Redis 클라이언트
**Files:** `apps/bff/package.json`, `apps/bff/src/lib/redis-client.ts`, `apps/web/package.json`

- [ ] BFF 패키지 설치:
  ```bash
  cd apps/bff && npm install socket.io @socket.io/redis-adapter ioredis
  ```
  타입 선언은 socket.io 4.x에 번들됨, `@types/ioredis` 불필요.
- [ ] Web 패키지 설치:
  ```bash
  cd apps/web && npm install socket.io-client
  ```
- [ ] `apps/bff/src/lib/redis-client.ts` 생성:
  ```ts
  // Redis singleton — Socket.IO adapter pub 클라이언트 + pub/sub 공유
  // sub 클라이언트는 .duplicate()로 adapter 전용으로만 사용 — 재사용 금지
  // ChatRoom 실시간 fan-out용. LLM ChatSession과 무관.
  import Redis from 'ioredis';
  import { env } from '../env.js';

  let _client: Redis | null = null;

  export function getRedisClient(): Redis {
    if (!_client) {
      _client = new Redis(env.REDIS_URL);
      _client.on('error', (err) => logger.warn({ err }, 'redis error'));
    }
    return _client;
  }

  export async function closeRedisClient(): Promise<void> {
    if (_client) { await _client.quit(); _client = null; }
  }
  ```
  `env.REDIS_URL`은 `.env.example`(line 20) + `packages/config/schema.ts`(line 22)에 이미 존재 — 추가 불필요.
- [ ] green: `bff typecheck`. commit: `chore(bff): socket.io+ioredis 패키지 설치 + redis-client singleton`.

---

## Task 1 — Prisma 모델 6종 + Notification 확장 + 마이그레이션 (HUMAN 적용)
**Files:** `apps/bff/prisma/schema.prisma`, `apps/bff/prisma/migrations/20260530120000_phase2_chat/migration.sql`

### 1-1. schema.prisma 수정

- [ ] `Notification` 모델에 컬럼 3개 추가(`readAt` 줄 뒤):
  ```prisma
    notificationType   String?  @map("notification_type") @db.VarChar(30)
    // 'match_request'|'group_invite'|'appointment'|'kick_vote'|'mate_eval'|'chat_message'
    relatedEntityId    BigInt?  @map("related_entity_id")
    relatedEntityType  String?  @map("related_entity_type") @db.VarChar(30)
    // 'match_request'|'chat_room'|'appointment'|'kick_vote' — 알림 클릭 라우팅 (GG-NOTI-007)
  ```

- [ ] `User` 모델 역관계 추가(`mateIndex MateIndex?` 다음 줄):
  ```prisma
    sentMatchRequests     MatchRequest[]    @relation("Requester")
    receivedMatchRequests MatchRequest[]    @relation("Receiver")
    chatRoomMemberships   GroupMembership[]
  ```

- [ ] schema.prisma 끝에 6개 모델 추가:

```prisma
// ============ MATCH_REQUEST (ADR 0007 결정6 — A_803/A_804) ============
// 1:1 신청 24h, 그룹 초대 6h 만료. ChatRoom 생성은 수락 시점.
// WARNING: ChatSession(LLM 검색)과 완전 별개 — JOIN 금지.
model MatchRequest {
  matchRequestId  BigInt    @id @default(autoincrement()) @map("match_request_id")
  requesterId     BigInt    @map("requester_id")
  receiverId      BigInt    @map("receiver_id")
  requestType     String    @map("request_type") @db.VarChar(10)  // '1:1' | 'group'
  status          String    @default("pending") @db.VarChar(20)
  // pending | accepted | rejected | expired | cancelled
  chatRoomId      BigInt?   @map("chat_room_id")  // nullable — 수락 후 생성된 채팅방
  expiresAt       DateTime  @map("expires_at") @db.Timestamptz  // 1:1=+24h, group=+6h
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  requester User      @relation("Requester", fields: [requesterId], references: [userId])
  receiver  User      @relation("Receiver",  fields: [receiverId],  references: [userId])
  chatRoom  ChatRoom? @relation(fields: [chatRoomId], references: [chatRoomId])

  @@index([receiverId, status], map: "idx_match_req_receiver_status")
  @@index([expiresAt, status],  map: "idx_match_req_expires")
  @@map("match_requests")
}

// ============ CHAT_ROOM (ADR 0007 결정6 — A_805) ============
// 1:1/그룹(최대4인) 실시간 채팅방. Postgres 영속, Socket.IO 실시간.
// WARNING: ChatSession(LLM 이벤트 검색)과 완전 별개 — JOIN 금지.
model ChatRoom {
  chatRoomId    BigInt    @id @default(autoincrement()) @map("chat_room_id")
  roomType      String    @map("room_type") @db.VarChar(10)   // '1:1' | 'group'
  status        String    @default("active") @db.VarChar(20)  // 'active' | 'ended'
  maxMembers    Int       @default(2) @map("max_members")     // 1:1=2, group=4
  eventId       BigInt?   @map("event_id")                    // 축제 선택 (GG-ROOM-004)
  ownerUserId   BigInt?   @map("owner_user_id")               // 그룹 방장만 (1:1=NULL, GG-MATE-014)
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz
  endedAt       DateTime? @map("ended_at") @db.Timestamptz

  matchRequests MatchRequest[]
  messages      ChatRoomMessage[]
  memberships   GroupMembership[]
  appointments  Appointment[]

  @@index([status, createdAt(sort: Desc)], map: "idx_chat_rooms_active")
  @@map("chat_rooms")
}

// ============ CHAT_ROOM_MESSAGE (ADR 0007 결정6) ============
// 텍스트(≤1000자) + 이미지(S3 URL) + 스티커 + 시스템.
// WARNING: ChatMessage(LLM 검색)과 완전 별개.
model ChatRoomMessage {
  messageId     BigInt   @id @default(autoincrement()) @map("message_id")
  chatRoomId    BigInt   @map("chat_room_id")
  senderUserId  BigInt?  @map("sender_user_id")  // null = 시스템 메시지
  messageType   String   @map("message_type") @db.VarChar(10)
  // 'text' | 'image' | 'sticker' | 'system'
  body          String?  @db.VarChar(1000)
  attachmentUrl String?  @map("attachment_url") @db.VarChar(500)
  stickerId     String?  @map("sticker_id") @db.VarChar(50)
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz

  chatRoom ChatRoom @relation(fields: [chatRoomId], references: [chatRoomId])

  @@index([chatRoomId, createdAt], map: "idx_chat_room_msg_room")
  @@map("chat_room_messages")
}

// ============ GROUP_MEMBERSHIP (ADR 0007 결정11) ============
// 그룹/1:1 채팅방 멤버십. 1:1=role:'member' 양쪽. 그룹=방장:'owner'/일반:'member'.
// instantKickUsed: 방장(role='owner') 행에만 의미있음 — 방 전체 1회 소진 카운터.
model GroupMembership {
  membershipId    BigInt    @id @default(autoincrement()) @map("membership_id")
  chatRoomId      BigInt    @map("chat_room_id")
  userId          BigInt    @map("user_id")
  role            String    @default("member") @db.VarChar(10)   // 'owner' | 'member'
  memberStatus    String    @default("active") @db.VarChar(20)   @map("member_status")
  // 'active' | 'left' | 'kicked' | 'blocked'
  instantKickUsed Boolean   @default(false) @map("instant_kick_used")  // 방장 행에서만 유효
  lastSeenAt      DateTime? @map("last_seen_at") @db.Timestamptz       // 48h 미접속 체크
  joinedAt        DateTime  @default(now()) @map("joined_at") @db.Timestamptz
  leftAt          DateTime? @map("left_at") @db.Timestamptz

  chatRoom ChatRoom @relation(fields: [chatRoomId], references: [chatRoomId])
  user     User     @relation(fields: [userId], references: [userId])

  @@unique([chatRoomId, userId], map: "uq_group_membership_room_user")
  @@index([chatRoomId, memberStatus], map: "idx_group_membership_room_active")
  @@index([lastSeenAt],              map: "idx_group_membership_last_seen")
  @@map("group_memberships")
}

// ============ APPOINTMENT (ADR 0007 결정14 — GG-ROOM-013~020) ============
// 약속 제안/동의/역제안/캘린더. 시스템메시지만으론 상태 영속 불가.
// 강퇴투표와 달리 AppointmentVote가 별도로 동의 현황 추적.
model Appointment {
  appointmentId   BigInt    @id @default(autoincrement()) @map("appointment_id")
  chatRoomId      BigInt    @map("chat_room_id")
  proposerUserId  BigInt    @map("proposer_user_id")
  eventName       String?   @map("event_name") @db.VarChar(200)
  eventId         BigInt?   @map("event_id")            // 연결된 이벤트 (선택)
  appointedAt     DateTime? @map("appointed_at") @db.Timestamptz  // 제안 일시
  status          String    @default("proposed") @db.VarChar(20)
  // 'proposed' | 'confirmed' | 'rejected' | 'cancelled' | 'counter_proposed'
  expiresAt       DateTime  @map("expires_at") @db.Timestamptz    // +36h
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  chatRoom ChatRoom           @relation(fields: [chatRoomId], references: [chatRoomId])
  votes    AppointmentVote[]

  @@index([chatRoomId, status], map: "idx_appointment_room_status")
  @@index([expiresAt, status],  map: "idx_appointment_expires")
  @@map("appointments")
}

// ============ APPOINTMENT_VOTE (GG-ROOM-016~018 동의/거절/역제안) ============
model AppointmentVote {
  voteId         BigInt    @id @default(autoincrement()) @map("vote_id")
  appointmentId  BigInt    @map("appointment_id")
  userId         BigInt    @map("user_id")
  vote           String    @db.VarChar(20)   // 'agree' | 'reject' | 'counter' | 'pending'
  counterAt      DateTime? @map("counter_at") @db.Timestamptz   // 역제안 일시
  counterTime    DateTime? @map("counter_time") @db.Timestamptz  // 역제안 제안 시각
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  appointment Appointment @relation(fields: [appointmentId], references: [appointmentId])

  @@unique([appointmentId, userId], map: "uq_appointment_vote_user")
  @@map("appointment_votes")
}

// ============ BLOCK (ADR 0007 결정14 — GG-REPORT-009) ============
// 차단 레코드. 차단된 사용자는 추천/신청/채팅에서 제외.
model Block {
  blockId       BigInt   @id @default(autoincrement()) @map("block_id")
  blockerId     BigInt   @map("blocker_id")
  blockedUserId BigInt   @map("blocked_user_id")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@unique([blockerId, blockedUserId], map: "uq_block_pair")
  @@index([blockerId],     map: "idx_block_blocker")
  @@index([blockedUserId], map: "idx_block_blocked_user")
  @@map("blocks")
}
```

### 1-2. migration.sql 초안

`apps/bff/prisma/migrations/20260530120000_phase2_chat/migration.sql`:

```sql
-- Phase 2 / ADR 0007 결정6·11·14 — 신청+실시간채팅 (A_803/A_804/A_805)
-- HUMAN이 prisma migrate deploy로 적용. 에이전트 실행 금지.
-- 적용 순서: (1) 코드 배포, (2) migrate deploy, (3) scheduler 기동.

-- 1. Notification 컬럼 확장
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "notification_type"   VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "related_entity_id"   BIGINT,
  ADD COLUMN IF NOT EXISTS "related_entity_type" VARCHAR(30);

-- 기존 행 backfill (nulls 방지, downstream 안전)
UPDATE "notifications"
  SET "notification_type" = 'event_bookmark'
  WHERE "event_id" IS NOT NULL AND "notification_type" IS NULL;

-- 2. chat_rooms (MatchRequest FK 전에 먼저)
CREATE TABLE "chat_rooms" (
  "chat_room_id"   BIGSERIAL NOT NULL,
  "room_type"      VARCHAR(10) NOT NULL,
  "status"         VARCHAR(20) NOT NULL DEFAULT 'active',
  "max_members"    INTEGER NOT NULL DEFAULT 2,
  "event_id"       BIGINT,
  "owner_user_id"  BIGINT,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at"       TIMESTAMPTZ,
  CONSTRAINT "chat_rooms_pkey"        PRIMARY KEY ("chat_room_id"),
  CONSTRAINT "chat_rooms_type_check"  CHECK ("room_type" IN ('1:1','group')),
  CONSTRAINT "chat_rooms_status_check" CHECK ("status" IN ('active','ended')),
  CONSTRAINT "chat_rooms_max_check"   CHECK ("max_members" BETWEEN 2 AND 4)
);
CREATE INDEX "idx_chat_rooms_active" ON "chat_rooms"("status","created_at" DESC);

-- 3. match_requests
CREATE TABLE "match_requests" (
  "match_request_id" BIGSERIAL NOT NULL,
  "requester_id"     BIGINT NOT NULL,
  "receiver_id"      BIGINT NOT NULL,
  "request_type"     VARCHAR(10) NOT NULL,
  "status"           VARCHAR(20) NOT NULL DEFAULT 'pending',
  "chat_room_id"     BIGINT,             -- nullable: pending/rejected/expired=NULL
  "expires_at"       TIMESTAMPTZ NOT NULL,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_requests_pkey"        PRIMARY KEY ("match_request_id"),
  CONSTRAINT "match_requests_type_check"  CHECK ("request_type" IN ('1:1','group')),
  CONSTRAINT "match_requests_status_check"
    CHECK ("status" IN ('pending','accepted','rejected','expired','cancelled'))
);
CREATE INDEX "idx_match_req_receiver_status" ON "match_requests"("receiver_id","status");
CREATE INDEX "idx_match_req_expires"         ON "match_requests"("expires_at","status");
ALTER TABLE "match_requests"
  ADD CONSTRAINT "match_requests_requester_id_fkey"
    FOREIGN KEY ("requester_id") REFERENCES "users"("user_id"),
  ADD CONSTRAINT "match_requests_receiver_id_fkey"
    FOREIGN KEY ("receiver_id")  REFERENCES "users"("user_id"),
  ADD CONSTRAINT "match_requests_chat_room_id_fkey"
    FOREIGN KEY ("chat_room_id") REFERENCES "chat_rooms"("chat_room_id");

-- 4. chat_room_messages
CREATE TABLE "chat_room_messages" (
  "message_id"      BIGSERIAL NOT NULL,
  "chat_room_id"    BIGINT NOT NULL,
  "sender_user_id"  BIGINT,
  "message_type"    VARCHAR(10) NOT NULL,
  "body"            VARCHAR(1000),
  "attachment_url"  VARCHAR(500),
  "sticker_id"      VARCHAR(50),
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_room_messages_pkey" PRIMARY KEY ("message_id"),
  CONSTRAINT "chat_room_messages_type_check"
    CHECK ("message_type" IN ('text','image','sticker','system')),
  CONSTRAINT "chat_room_messages_content_check"
    CHECK (
      ("message_type" = 'text'    AND "body" IS NOT NULL) OR
      ("message_type" = 'image'   AND "attachment_url" IS NOT NULL) OR
      ("message_type" = 'sticker' AND "sticker_id" IS NOT NULL) OR
      ("message_type" = 'system'  AND "body" IS NOT NULL)
    )
);
CREATE INDEX "idx_chat_room_msg_room" ON "chat_room_messages"("chat_room_id","created_at");
ALTER TABLE "chat_room_messages"
  ADD CONSTRAINT "chat_room_messages_room_fkey"
    FOREIGN KEY ("chat_room_id") REFERENCES "chat_rooms"("chat_room_id");

-- 5. group_memberships
CREATE TABLE "group_memberships" (
  "membership_id"     BIGSERIAL NOT NULL,
  "chat_room_id"      BIGINT NOT NULL,
  "user_id"           BIGINT NOT NULL,
  "role"              VARCHAR(10) NOT NULL DEFAULT 'member',
  "member_status"     VARCHAR(20) NOT NULL DEFAULT 'active',
  "instant_kick_used" BOOLEAN NOT NULL DEFAULT false,
  "last_seen_at"      TIMESTAMPTZ,
  "joined_at"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "left_at"           TIMESTAMPTZ,
  CONSTRAINT "group_memberships_pkey"        PRIMARY KEY ("membership_id"),
  CONSTRAINT "group_memberships_role_check"   CHECK ("role" IN ('owner','member')),
  CONSTRAINT "group_memberships_status_check" CHECK ("member_status" IN ('active','left','kicked','blocked'))
);
CREATE UNIQUE INDEX "uq_group_membership_room_user"
  ON "group_memberships"("chat_room_id","user_id");
CREATE INDEX "idx_group_membership_room_active"
  ON "group_memberships"("chat_room_id","member_status");
CREATE INDEX "idx_group_membership_last_seen"
  ON "group_memberships"("last_seen_at");
ALTER TABLE "group_memberships"
  ADD CONSTRAINT "group_memberships_room_fkey"
    FOREIGN KEY ("chat_room_id") REFERENCES "chat_rooms"("chat_room_id"),
  ADD CONSTRAINT "group_memberships_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("user_id");

-- 6. appointments
CREATE TABLE "appointments" (
  "appointment_id"   BIGSERIAL NOT NULL,
  "chat_room_id"     BIGINT NOT NULL,
  "proposer_user_id" BIGINT NOT NULL,
  "event_name"       VARCHAR(200),
  "event_id"         BIGINT,
  "appointed_at"     TIMESTAMPTZ,
  "status"           VARCHAR(20) NOT NULL DEFAULT 'proposed',
  "expires_at"       TIMESTAMPTZ NOT NULL,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointments_pkey"        PRIMARY KEY ("appointment_id"),
  CONSTRAINT "appointments_status_check"
    CHECK ("status" IN ('proposed','confirmed','rejected','cancelled','counter_proposed'))
);
CREATE INDEX "idx_appointment_room_status" ON "appointments"("chat_room_id","status");
CREATE INDEX "idx_appointment_expires"     ON "appointments"("expires_at","status");
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_room_fkey"
    FOREIGN KEY ("chat_room_id") REFERENCES "chat_rooms"("chat_room_id");

-- 7. appointment_votes
CREATE TABLE "appointment_votes" (
  "vote_id"         BIGSERIAL NOT NULL,
  "appointment_id"  BIGINT NOT NULL,
  "user_id"         BIGINT NOT NULL,
  "vote"            VARCHAR(20) NOT NULL DEFAULT 'pending',
  "counter_at"      TIMESTAMPTZ,
  "counter_time"    TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_votes_pkey"       PRIMARY KEY ("vote_id"),
  CONSTRAINT "appointment_votes_vote_check"
    CHECK ("vote" IN ('agree','reject','counter','pending'))
);
CREATE UNIQUE INDEX "uq_appointment_vote_user"
  ON "appointment_votes"("appointment_id","user_id");
ALTER TABLE "appointment_votes"
  ADD CONSTRAINT "appointment_votes_appt_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("appointment_id");

-- 8. blocks
CREATE TABLE "blocks" (
  "block_id"        BIGSERIAL NOT NULL,
  "blocker_id"      BIGINT NOT NULL,
  "blocked_user_id" BIGINT NOT NULL,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "blocks_pkey" PRIMARY KEY ("block_id")
);
CREATE UNIQUE INDEX "uq_block_pair"
  ON "blocks"("blocker_id","blocked_user_id");
CREATE INDEX "idx_block_blocker"      ON "blocks"("blocker_id");
CREATE INDEX "idx_block_blocked_user" ON "blocks"("blocked_user_id");
ALTER TABLE "blocks"
  ADD CONSTRAINT "blocks_blocker_fkey"
    FOREIGN KEY ("blocker_id")      REFERENCES "users"("user_id"),
  ADD CONSTRAINT "blocks_blocked_user_fkey"
    FOREIGN KEY ("blocked_user_id") REFERENCES "users"("user_id");
```

- [ ] **green (HUMAN)**: `prisma validate` → `prisma migrate deploy`(신규 1건 적용) → `prisma generate`. 에이전트 실행 금지.
- [ ] commit: `feat(bff): 6모델(MatchRequest/ChatRoom/ChatRoomMessage/GroupMembership/Appointment/Block) + 마이그레이션 (ADR 0007 A_803~A_805)`.

---

## Task 2 — Socket.IO 서버 + Redis Adapter (실시간 인프라)
**Files:** `apps/bff/src/lib/extract-session.ts`(생성), `apps/bff/src/lib/socket-server.ts`(생성), `apps/bff/src/server.ts`(수정)

### 2-1. extractSession 공유 함수

`apps/bff/src/lib/extract-session.ts`:
```ts
// requireAuth(HTTP)와 io.use(Socket.IO) 양쪽에서 동일 검증 공유
// 쿠키명: 'alle_sid' 고정. isDeleted + expiresAt 체크 포함.
export async function extractSession(
  cookieHeader: string | undefined,
  prisma: PrismaClient,
): Promise<{ userId: bigint; sessionId: bigint } | null>
// 반환 null = 미인증/만료/삭제계정
```
`require-auth.ts`에서 parseSid/만료/isDeleted 로직을 이 함수로 이동하고 재사용.

### 2-2. socket-server.ts 핵심 시그니처

```ts
// pub/sub: pubClient=getRedisClient(), subClient=pubClient.duplicate()
// subClient는 adapter에만 위임 — 다른 곳에서 재사용 금지
export function createSocketServer(httpServer: HttpServer): SocketServer
export function getSocketServer(): SocketServer  // 초기화 전 호출 시 throw

// CORS origin: env.WEB_URL (app.ts의 ALLOWED_ORIGINS 근거, WEB_ORIGIN 아님)
// io.use() 인증:
//   1. socket.handshake.headers.cookie 에서 alle_sid 추출
//   2. extractSession(cookie, prisma) → null이면 next(new Error('unauthenticated'))
//   3. socket.data.userId = session.userId

// 이벤트 계약 (클라이언트↔서버):
// Client→Server:
//   'room:join'    { chatRoomId: string }   → socket.join(`room:${chatRoomId}`)
//   'room:message' { chatRoomId, type, body?, attachmentUrl?, stickerId? }
//                  → DB insert ChatRoomMessage + io.to(`room:${chatRoomId}`).emit('message', out)
//                  → GroupMembership.update({ lastSeenAt: new Date() })
//   'room:leave'   { chatRoomId }           → socket.leave(`room:${chatRoomId}`)
// Server→Client:
//   'message'             ChatRoomMessageOut
//   'room:member_update'  GroupMemberOut[]
//   'appointment:proposed' AppointmentOut
//   'appointment:confirmed' AppointmentOut  // 추천 영역 비활성화 트리거
//   'notification'        NotificationOut
//   'error'               { code: string, message: string }

// 사용자 개인 룸: socket.join(`user:${userId}`) on connection
// 채팅방 룸: socket.join(`room:${chatRoomId}`) on room:join 이벤트
```

### 2-3. server.ts 수정

```ts
// 기존: const server = app.listen(PORT, ...)
// 추가(listen 직후):
import { createSocketServer } from './lib/socket-server.js';
import { startChatScheduler } from './jobs/chat-scheduler.js';

const httpServer = app.listen(PORT, () => { /* ... */ });
createSocketServer(httpServer);   // Socket.IO attach
startChatScheduler();             // startScheduler()와 독립 호출 (ingest 키 무관)

// shutdown 함수에 추가:
await closeRedisClient();
```

- [ ] green: bff typecheck. commit: `feat(bff): Socket.IO 서버 + Redis adapter + extractSession 공유 인증 (ADR 0007 결정6)`.

---

## Task 3 — BFF REST: 신청 라우트 (A_803/A_804)
**Files:** `apps/bff/src/routes/match-request.ts`(생성), `apps/bff/src/jobs/chat-room-eval.ts`(생성), `app.ts`(수정)

패턴: `routes/mate.ts`(requireAuth, 트랜잭션, 입력검증, maskPii audit). `jobs/mate-eval.ts`(in-process MockReq/MockRes 하니스).

### 엔드포인트 시그니처

```ts
// POST /community/match/request/1-to-1
// body: { receiverUserId: string }
// 가드: 본인→본인 불가, pending 중복 409, MateProfile 없음 422('profile_required'),
//        차단(blocks) 409('blocked')
// 트랜잭션: MatchRequest.create({ requestType:'1:1', expiresAt: now+24h })
//           + Notification.create({ notificationType:'match_request',
//               relatedEntityId: matchRequestId, relatedEntityType:'match_request',
//               scheduledAt: new Date(), isSent: true, title: '채팅 신청이 왔어요' })
// 반환: { matchRequestId: string, expiresAt: string }
// 실시간: getSocketServer().to(`user:${receiverId}`).emit('notification', out)

// POST /community/match/request/group
// body: { receiverUserIds: string[] }  (최대 3명)
// 가드: receiverUserIds.length ≤ 3, 각 대상 MateProfile.groupApply=true 검증,
//        기존 그룹방 현재멤버수+receiverUserIds.length ≤ 4
// 트랜잭션: MatchRequest N건 create({ requestType:'group', expiresAt: now+6h })
//           + Notification N건 create({ notificationType:'group_invite', scheduledAt: new Date(), isSent: true })
// 반환: { matchRequestIds: string[] }

// PATCH /community/match/request/:matchRequestId/accept
// 가드: 본인이 receiver인지, status='pending', expiresAt>now
// 트랜잭션(1:1):
//   ChatRoom.create({ roomType:'1:1', maxMembers:2, ownerUserId:null })
//   GroupMembership × 2 create({ role:'member' }) — 양쪽 모두 member
//   MatchRequest.update({ status:'accepted', chatRoomId })
//   ChatRoomMessage.create({ messageType:'system', body:'채팅방이 시작되었습니다' })
//   Notification.create({ notificationType:'match_request', scheduledAt:new Date(), isSent:true, title:'신청이 수락되었습니다' })
// 트랜잭션(그룹): 기존 방 없으면 ChatRoom.create + 최초 수락자 ownerUserId 설정
// 반환: { chatRoomId: string }

// PATCH /community/match/request/:matchRequestId/reject
// MatchRequest.update({ status:'rejected' })
// Notification.create({ notificationType:'match_request', scheduledAt:new Date(), isSent:true, title:'신청이 거절되었습니다' }) to requester

// GET /community/match/request/incoming
// status:'pending', expiresAt>now, receiverId=me
// 반환: MatchRequestOut[]
```

### chat-eval.ts 케이스

```ts
// 'match.1to1.send.ok'           — 신청 생성, expiresAt = now+24h 이내
// 'match.1to1.accept.creates_room'— 수락: ChatRoom + 2 GroupMembership(role=member) 생성
// 'match.1to1.accept.both_member' — 1:1 ChatRoom.ownerUserId=null, 양쪽 role='member'
// 'match.1to1.reject.ok'          — status=rejected
// 'match.group.invite.max3'       — 3명 초과 422
// 'match.group.invite.groupapply_gate' — groupApply=false 대상 422
// 'match.duplicate.blocked'       — pending 중복 409
// 'match.expired.not_accepted'    — expiresAt 과거 accept 시 410
// 'notif.new_types_populated_on_create' — Notification에 notificationType 채워짐
// 'notif.legacy_rows_backfilled'  — 기존 event_id IS NOT NULL 행의 notification_type='event_bookmark'
// 'match.incoming.list'           — GET incoming: receiverId=me, pending, expiresAt>now, items 배열 반환 (추가 커버리지)
// 'match.group.capacity_guard'    — 기존 그룹방 멤버수+초대수 > 4 시 422 (추가 커버리지)
```

- [ ] `package.json` scripts: `"chatroom:eval": "tsx src/jobs/chat-room-eval.ts"` 추가. (chat-eval.ts 는 LLM 검색 eval 전용 — 이름 충돌 방지)
- [ ] green: `npm run chatroom:eval` + bff typecheck. commit: `feat(bff): 1:1/그룹 신청 REST (A_803/A_804 GG-MATE-001~016)`.

---

## Task 4 — BFF REST: 채팅방 라우트 + 약속 + 이벤트 선택 (A_805)
**Files:** `apps/bff/src/routes/chat-room.ts`(생성), `app.ts`(수정)

패턴: `routes/mate.ts`. 실시간=Socket.IO, REST=이력/상태 변경에만.

### 엔드포인트 시그니처

```ts
// GET /community/chat-rooms/mine
// GroupMembership.findMany({ userId:me, memberStatus:'active' }) + ChatRoom(status:'active')
// 반환: ChatRoomSummaryOut[]

// GET /community/chat-rooms/:chatRoomId/messages?cursor=&limit=
// 멤버십 active 검증 + ChatRoomMessage.findMany(cursor 기반 페이지네이션)
// 반환: { messages: ChatRoomMessageOut[], nextCursor: string | null }

// PATCH /community/chat-rooms/:chatRoomId/event
// body: { eventId: string }           (GG-ROOM-004 선택 저장)
// ChatRoom.update({ eventId })

// POST /community/chat-rooms/:chatRoomId/appointment
// body: { eventName?: string, eventId?: string, appointedAt: string(ISO) }
// Appointment.create({ status:'proposed', expiresAt:now+36h })
// AppointmentVote.createMany(chatRoom.activeMembers, { vote:'pending' })
// ChatRoomMessage.create({ messageType:'system', body:'약속이 제안되었습니다' })
// Notification.createMany({ notificationType:'appointment', scheduledAt:new Date(), isSent:true })
// 실시간: io.to(`room:${chatRoomId}`).emit('appointment:proposed', AppointmentOut)

// PATCH /community/chat-rooms/:chatRoomId/appointment/:appointmentId/vote
// body: { vote: 'agree' | 'reject' | 'counter', counterAt?: string, counterTime?: string }
// AppointmentVote.update({ vote, counterAt, counterTime })
// 전원 agree → Appointment.update({ status:'confirmed' })
//              + io.to(room).emit('appointment:confirmed', out)  // 추천 비활성화 트리거
//              + Notification.createMany({ notificationType:'appointment', title:'약속이 확정되었습니다' })
// 역제안(counter) → Appointment.update({ status:'counter_proposed' })
//                   + io.to(room).emit('appointment:proposed', counterOut)
// 36h 미응답 → chat-scheduler 처리 (rejected 자동)
// GG-ROOM-021/GG-COMM-011: 약속 확정 emit이 클라이언트 추천 영역 비활성화 신호

// POST /community/chat-rooms/:chatRoomId/leave
// GroupMembership.update({ memberStatus:'left', leftAt:now })
// ChatRoomMessage.create({ messageType:'system' })
// 1:1: ChatRoom.update({ status:'ended', endedAt:now })
// 그룹(방장): ownerUserId를 다음 active member로 이전 → 결원 충원 알림
//             (ChatRoom.update({ ownerUserId: nextMemberId }) + Notification)
// MateRelation 갱신은 슬라이스5 — 여기서는 ChatRoom 종료만

// POST /community/chat-rooms/:chatRoomId/block/:targetUserId
// GroupMembership.update({ memberStatus:'blocked' })
// Block.create({ blockerId:me, blockedUserId:target })
// ChatRoomMessage.create({ messageType:'system', body:'멤버가 차단되었습니다' })
// GG-REPORT-009 연동 주석: 차단 사용자는 추천/신청 풀에서 제외 (슬라이스8에서 완성)
```

### chat-eval 케이스 추가

```ts
// 'room.messages.paginated'                    — cursor 기반 이력 반환 + nextCursor
// 'room.event.selected'                        — eventId ChatRoom에 저장
// 'room.leave.1to1_ends'                       — 1:1 나가기: status='ended'
// 'room.leave.group_owner_transfer'            — 방장 나가기: 다음 멤버로 ownerUserId 이전
// 'room.appointment.propose.ok'                — Appointment + AppointmentVote created
// 'room.appointment.all_agree'                 — 전원 동의: status='confirmed' + emit
// 'room.appointment.counter'                   — 역제안: status='counter_proposed'
// 'room.block.creates_block_record'            — Block 레코드 생성
// 'room.cleanup.socket_disconnect_on_unmount'  — (웹 검증: Task 7에서 추가)
// 'room.appointment.reject'                    — 명시적 거절: status='rejected' 즉시 (ADR 0009)
// 'room.leave.group_member_last_leaves_ends'   — 그룹 마지막 멤버 나가기: status='ended'
```

- [ ] green + commit: `feat(bff): 채팅방 REST + 약속 제안/동의/역제안 + 이벤트 선택 (A_805 GG-ROOM-001~025)`.

---

## Task 5 — 방장 권한 REST (GG-MATE-017~021, 와이어 9-19)
**Files:** `apps/bff/src/routes/chat-room.ts`(추가)

```ts
// POST /community/chat-rooms/:chatRoomId/kick/instant/:targetUserId
// GG-MATE-017: 방장이 방 전체에서 1회만 사용 가능
// 트랜잭션($transaction + FOR UPDATE 또는 SERIALIZABLE):
//   1. GroupMembership.findFirst({ chatRoomId, userId:me, role:'owner' }, { lock:'FOR UPDATE' })
//   2. 검증: ownerMembership.instantKickUsed=false → 아니면 422('instant_kick_used')
//   3. ownerMembership.update({ instantKickUsed:true })  // 방장 행에서 소진
//   4. targetMembership.update({ memberStatus:'kicked', leftAt:now })
//   5. ChatRoomMessage.create({ messageType:'system', body:'멤버가 강퇴되었습니다' })
//   6. 결원 충원 알림 Notification
// 실시간: io.to(room).emit('room:member_update', updatedMembers)

// POST /community/chat-rooms/:chatRoomId/kick/vote
// body: { targetUserId: string }
// 방장만 가능(role='owner' 검증)
// Notification.createMany(모든 active 멤버, 대상 제외, {
//   notificationType:'kick_vote', relatedEntityId:chatRoomId, relatedEntityType:'kick_vote',
//   scheduledAt:new Date(), isSent:true, title:'강퇴 투표가 시작되었습니다',
//   expiresAt: now+36h (message 필드에 JSON 또는 별도 컬럼)
// })
// GG-MATE-019~020: 미응답=동의로 간주(chat-scheduler 처리)

// PATCH /community/chat-rooms/:chatRoomId/kick/vote/:voteNotifId
// body: { vote: 'agree' | 'reject' }
// Notification 업데이트(응답 기록)
// 전원(대상 제외) agree 시 즉시 kicked 처리 + 결원 충원 알림
```

### chat-eval 케이스

```ts
// 'kick.instant.ok'           — instantKickUsed=true(방장 행), target=kicked
// 'kick.instant.second_fails' — 두 번째 시도 422('instant_kick_used')
// 'kick.vote.non_owner_fails' — 방장 아닌 사람 403
// 'kick.vote.all_agree_kicks' — 전원 동의 시 kicked 처리
// 'kick.concurrent.race_conditions_prevented' — 동시 즉시강퇴 1건만 성공
```

- [ ] green + commit: `feat(bff): 방장 즉시강퇴/투표강퇴 (ADR 0007 결정11 GG-MATE-017~021)`.

---

## Task 6 — 백그라운드 스케줄러 (ADR 0007 결정10)
**Files:** `apps/bff/src/jobs/chat-scheduler.ts`(생성)

패턴: 기존 `scheduler.ts` setInterval 추상. **server.ts에서 직접 호출** — `startScheduler()` 내부 아님.

```ts
const MATCH_EXPIRE_INTERVAL  = 10 * 60 * 1000;   // 10분
const VOTE_EXPIRE_INTERVAL   = 10 * 60 * 1000;   // 10분
const INACTIVITY_INTERVAL    = 30 * 60 * 1000;   // 30분
const APPT_EXPIRE_INTERVAL   = 10 * 60 * 1000;   // 10분

export function startChatScheduler(): void {
  if (env.NODE_ENV === 'test') return;
  // 각 핸들러를 개별 setInterval로 등록
  // 핸들러는 try-catch로 감싸 에러가 interval을 멈추지 않음
  setInterval(wrapHandler(expireMatchRequests),   MATCH_EXPIRE_INTERVAL);
  setInterval(wrapHandler(resolveExpiredKickVotes), VOTE_EXPIRE_INTERVAL);
  setInterval(wrapHandler(expireAppointments),    APPT_EXPIRE_INTERVAL);
  setInterval(wrapHandler(handleInactiveMembers), INACTIVITY_INTERVAL);
  logger.info('chat scheduler started');
}

function wrapHandler(fn: () => Promise<void>): () => void {
  return () => { fn().catch((err) => logger.error({ err }, 'chat scheduler error')); };
}
// wrapHandler: setInterval은 fn이 throw해도 다음 tick에 재실행 보장
// try-catch 없으면 uncaughtPromiseRejection 가능성

// expireMatchRequests(): UPDATE match_requests SET status='expired' WHERE status='pending' AND expires_at<now()
//   + requester에게 'match_request_expired' Notification

// resolveExpiredKickVotes(): kick_vote Notification expiresAt 지난 건 집계
//   미응답자=agree로 간주 → 전원 동의 충족 시 kicked 처리 + 충원 알림

// expireAppointments(): Appointment.status='proposed'|'counter_proposed' AND expiresAt<now()
//   → status='rejected' + 참여자 알림

// handleInactiveMembers(): GroupMembership.memberStatus='active' AND lastSeenAt<now()-48h
//   → memberStatus='kicked' + 충원 알림
```

### chat-eval 케이스 추가

```ts
// 'scheduler.expire_1to1.ok'        — pending 1:1 expiresAt 과거 → status='expired'
// 'scheduler.expire_group_invite.ok'— group 6h 초과 → expired
// 'scheduler.expire_appointment.ok' — 36h 초과 제안 → rejected
// 'scheduler.inactivity.48h_kick'   — lastSeenAt < now-48h → kicked
// 'scheduler.timeout.no_reschedule_corruption' — handler 에러가 다음 interval 안 막음
```

- [ ] green + commit: `feat(bff): 채팅 타임아웃 스케줄러 (ADR 0007 결정10: 24h/6h/36h/48h)`.

---

## Task 7 — SEED UI: 채팅 신청 + 채팅방 (와이어 9-3/9-4/9-5/9-17/9-19)
**Files:** `apps/web/src/lib/api/match.ts`, `apps/web/src/lib/socket.ts`, `apps/web/src/pages/ChatRequestPage/`, `apps/web/src/pages/ChatRoomPage/`, 수정 `AuthorProfileModal.tsx`, `main.tsx`

패턴: `CommunityPage` SEED 사용법. **SEED CSS는 all.css.**

### Step 0 — SEED 컴포넌트 가용성 확인 (필수)

- [ ] `@seed-design/react@1.2.10` 패키지에서 `ActionButton`, `Avatar`, `Tabs`, `Popup`, `BottomSheet` 가용 여부 확인:
  ```bash
  cd apps/web && npx @seed-design/cli@latest list
  ```
  누락된 컴포넌트는 `npx @seed-design/cli@latest add ui:<ComponentName> --on-diff overwrite`로 설치. 미존재 시 Tailwind 대체 + 주석으로 블로커 표시.

### 7-1. API 클라이언트 + Socket 훅

`apps/web/src/lib/api/match.ts` 시그니처:
```ts
export function sendMatchRequest1to1(receiverUserId: string): Promise<{ matchRequestId: string; expiresAt: string }>
export function sendGroupInvite(receiverUserIds: string[]): Promise<{ matchRequestIds: string[] }>
export function acceptMatchRequest(matchRequestId: string): Promise<{ chatRoomId: string }>
export function rejectMatchRequest(matchRequestId: string): Promise<void>
export function getIncomingRequests(): Promise<MatchRequestOut[]>
export function getMyChatRooms(): Promise<ChatRoomSummaryOut[]>
export function getChatRoomMessages(chatRoomId: string, cursor?: string): Promise<MessagePageOut>
export function selectRoomEvent(chatRoomId: string, eventId: string): Promise<void>
export function leaveRoom(chatRoomId: string): Promise<void>
export function blockUser(chatRoomId: string, targetUserId: string): Promise<void>
export function proposeAppointment(chatRoomId: string, body: AppointmentIn): Promise<AppointmentOut>
export function voteAppointment(chatRoomId: string, appointmentId: string, body: AppointmentVoteIn): Promise<void>
export function instantKick(chatRoomId: string, targetUserId: string): Promise<void>
export function startKickVote(chatRoomId: string, targetUserId: string): Promise<void>
```

`apps/web/src/lib/socket.ts`:
```ts
// getSocket(): io(BFF_URL, { withCredentials:true }) singleton
// disconnectSocket(): socket.disconnect(), 싱글톤 초기화
// leaveRoom(chatRoomId): socket.emit('room:leave', { chatRoomId }) — 명시적 훅

export function useChatRoom(chatRoomId: string): {
  messages: ChatRoomMessageOut[];
  members: GroupMemberOut[];
  appointment: AppointmentOut | null;
  send: (payload: SendMessagePayload) => void;
  leave: () => void;
}
// useEffect cleanup: return () => {
//   socket.emit('room:leave', { chatRoomId });
//   socket.off('message');
//   socket.off('room:member_update');
//   socket.off('appointment:proposed');
//   socket.off('appointment:confirmed');
// }
// 브라우저 unload: window.addEventListener('beforeunload', () => leaveRoom(chatRoomId))
```

### 7-2. ChatRequestPage (와이어 9-3)

- [ ] 진입: `AuthorProfileModal.tsx` 채팅 신청 버튼 → `useNavigate('/chat/request?to={userId}&nickname={nickname}')` (슬라이스2 placeholder 활성화)
- [ ] UI: 상대 닉네임 + 메이트지수 표시 + "신청 보내기" ActionButton
- [ ] 신청 후: 24h 만료 안내 + "알림에서 확인하기" 링크

### 7-3. ChatRoomPage (와이어 9-4/9-17)

- [ ] `useChatRoom(chatRoomId)` 훅 구독
- [ ] 좌측: 참여자 Avatar 목록 (GroupMembership active 멤버, GG-ROOM-002)
- [ ] 우측 상단: 축제 정하기 박스 (`EventSelectBox` — event 검색/선택 → `selectRoomEvent()`, GG-ROOM-004)
  - 주관처 연락처 표시(GG-ROOM-003): 선택된 event의 organizer 정보 노출
  - 축제 클릭 → 요약 Popup → 상세이동(GG-ROOM-005/006)
- [ ] "같이 가자" 버튼 → `AppointmentPopup`(날짜/시간 + 역제안 입력, GG-ROOM-013~018)
  - 약속 확정(`appointment:confirmed` emit 수신) 시 메이트 추천 영역 블라인드 + 안내문구(GG-ROOM-021)
- [ ] 하단: 메시지 입력창(텍스트/이미지 업로드/스티커 팔레트, GG-ROOM-007/008)
- [ ] 메시지 전송: `socket.emit('room:message', { chatRoomId, type, body/attachmentUrl/stickerId })`

### 7-4. HamburgerMenu (와이어 9-5) / OwnerMenu (와이어 9-19)

- [ ] HamburgerMenu(일반 멤버): 차단하기 + 나가기
- [ ] OwnerMenu(방장만): 즉시강퇴(instantKick, 1회 소진 후 disabled + '1회 권한 소진') + 강퇴투표 + 차단/신고(blockUser + 신고 placeholder) + 나가기

### 7-5. 라우트 + 알림 연결

```ts
// main.tsx 추가:
// '/chat/request'          → ChatRequestPage
// '/chat/rooms/:chatRoomId'→ ChatRoomPage
// '/notifications'         → NotificationPage (기존 A_806 연결)
```

### chat-eval 케이스 추가

```ts
// 'room.cleanup.socket_disconnect_on_unmount' — useChatRoom cleanup 호출 검증
// 'room.cleanup.lastSeenAt_updated_on_leave'  — leave emit 후 lastSeenAt 갱신
```

- [ ] green: web typecheck + `vite build` (all.css). commit: `feat(web): 채팅 신청+실시간 채팅방 UI (A_803/A_804/A_805 와이어 9-3/4/5/17/19)`.

---

## 마감

- [ ] 전체 회귀: `npm run chat:eval` + `npm run mate:eval` + `npm run community:eval` + bff typecheck + web typecheck + web build(all.css).
- [ ] **ChatSession/ChatMessage 분리 검증** (이슈 8):
  ```bash
  grep -r "ChatSession\|prisma\.chatMessage\b" apps/bff/src/routes/chat-room.ts apps/bff/src/routes/match-request.ts apps/bff/src/lib/socket-server.ts apps/bff/src/jobs/chat-scheduler.ts apps/bff/src/jobs/chat-eval.ts
  ```
  0건이어야 함.
- [ ] graphify 코드 그래프 갱신:
  ```bash
  python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
  ```
- [ ] 슬라이스 3 마감 커밋 + 완료 보고.

---

## 리뷰 반영 체크리스트

| # | 위험 | 대응 (이슈 번호) |
|---|---|---|
| R-01 | HTTP server ref | server.ts에서 app.listen() 반환값 직접 사용 |
| R-02 | Redis sub 클라이언트 재사용 | adapter 전용 subClient = pubClient.duplicate(), 재사용 금지 명시 (이슈 21) |
| R-03 | Socket.IO 인증 누락 | extractSession 공유 함수, alle_sid 쿠키, isDeleted/만료 체크 (이슈 5) |
| R-04 | ChatRoom/ChatSession 혼용 | grep 범위 전체 신규 파일 (이슈 8) |
| R-05 | env.WEB_ORIGIN 미존재 | env.WEB_URL 로 정정 (이슈 3) |
| R-06 | REDIS_URL 중복 추가 | 이미 존재 — 추가 불필요 확인만 (이슈 3) |
| R-07 | chat-scheduler ingest early-return 격리 | server.ts에서 독립 호출 (이슈 4) |
| R-08 | instantKickUsed 위치 오류 | 방장 멤버십 행에 두어 1회 전체 소진 (이슈 2) |
| R-09 | 1:1 role 오류 | ownerUserId=null, 양쪽 role='member' (이슈 19) |
| R-10 | MatchRequest.chatRoomId NOT NULL | nullable BigInt?, migration DDL도 BIGINT nullable (이슈 17) |
| R-11 | Appointment 모델 누락 | 전용 Appointment+AppointmentVote 모델 신설 (이슈 1/25/28) |
| R-12 | Block 모델 누락 | Block 모델 신설 (이슈 16) |
| R-13 | 역제안(counter-propose) 누락 | AppointmentVote.vote='counter' + counterAt/counterTime (이슈 9) |
| R-14 | GG-ROOM-004 선택 저장 누락 | PATCH /chat-rooms/:id/event 엔드포인트 추가 (이슈 15) |
| R-15 | 약속 확정 후 추천 비활성화 | appointment:confirmed emit → 클라이언트 비활성화 (이슈 12) |
| R-16 | 그룹 초대 게이트 | groupApply=true + 4인 상한 현재멤버+초대수 검증 (이슈 7) |
| R-17 | Notification scheduledAt/title | 즉시 알림: scheduledAt=new Date(), isSent=true, title 명시 (이슈 6) |
| R-18 | Notification backfill | migration UPDATE notification_type='event_bookmark' WHERE event_id IS NOT NULL (이슈 24) |
| R-19 | instantKick 원자성 | $transaction + 방장 멤버십 FOR UPDATE (이슈 22) |
| R-20 | scheduler setInterval 에러 격리 | wrapHandler try-catch — 에러가 interval 멈춤 방지 (이슈 26/32) |
| R-21 | SEED 컴포넌트 가용성 | Step 0 cli list + add 명시 (이슈 23/30) |
| R-22 | Socket lifecycle cleanup | disconnectSocket + leaveRoom + useEffect cleanup 명시 (이슈 27/33) |
| R-23 | UTC 불일치 | new Date(Date.now() + …) UTC + TIMESTAMPTZ |
| R-24 | 주관처 연락처/축제팝업 | EventSelectBox + organizer 표시 + 요약팝업 (이슈 11) |
| R-25 | 메이트 끊기(GG-ROOM-022) | 1:1 leave 시 ChatRoom ended (MateRelation은 슬라이스5) |
| R-26 | PII audit | maskPii() 실제 호출 (이슈 8 + 슬라이스2 패턴) |

---

*슬라이스3 플랜 작성: 2026-05-30. 리뷰 38건 반영 완료.*
