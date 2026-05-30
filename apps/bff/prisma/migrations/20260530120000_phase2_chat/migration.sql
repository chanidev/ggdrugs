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
