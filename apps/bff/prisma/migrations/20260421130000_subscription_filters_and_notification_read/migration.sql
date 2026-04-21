-- A_203 조건 기반 구독 필터 확장.
-- 기존 regionIds[] / periodMonths 는 유지, 5종 필터 중 나머지 3개(인원구성·종류·성향) 추가.
-- 빈 배열 = '모든 값' (OR 없음 = match-all).
ALTER TABLE "event_subscriptions"
  ADD COLUMN "companions"  VARCHAR(20)[] NOT NULL DEFAULT ARRAY[]::VARCHAR[],
  ADD COLUMN "event_types" VARCHAR(30)[] NOT NULL DEFAULT ARRAY[]::VARCHAR[],
  ADD COLUMN "vibe_ids"    BIGINT[]      NOT NULL DEFAULT ARRAY[]::BIGINT[];

-- notifications: A_500 알림센터에서 읽음 상태 추적.
ALTER TABLE "notifications"
  ADD COLUMN "read_at" TIMESTAMPTZ;

-- 미읽음 조회 가속화 (userId + readAt IS NULL + createdAt DESC).
CREATE INDEX "idx_notif_user_unread"
  ON "notifications"(user_id, created_at DESC)
  WHERE read_at IS NULL;
