-- ============================================================================
-- Migration: Slice 8 — Report 모델 + User 제재 컬럼 (ADR 0007 결정14)
-- Date:      2026-05-30
-- Scope:     GG-REPORT-001~009, A_701
-- 적용:      HUMAN이 cd apps/bff && npx prisma migrate deploy 실행 (에이전트 실행 금지)
-- 참조:      fn_set_updated_at() — 20260417140000_check_constraints_and_triggers 에서 정의됨
-- ============================================================================

-- 1. users 테이블에 제재 컬럼 추가 (GG-REPORT-006/007)
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "sanction_status"     VARCHAR(20)  NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "sanction_expires_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "sanction_reason"     TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "chk_users_sanction_status"
    CHECK (sanction_status IN ('none', 'warned', 'suspended'));

-- 2. reports 테이블 생성 (GG-REPORT-001~005)
CREATE TABLE "reports" (
  "report_id"        BIGSERIAL    NOT NULL,
  "reporter_id"      BIGINT       NOT NULL,
  "target_user_id"   BIGINT       NOT NULL,
  "target_type"      VARCHAR(20)  NOT NULL,
  "target_entity_id" BIGINT       NOT NULL,
  "reason"           VARCHAR(50)  NOT NULL,
  "detail"           VARCHAR(500),
  "status"           VARCHAR(20)  NOT NULL DEFAULT 'pending',
  "admin_id"         BIGINT,
  "admin_action"     VARCHAR(20),
  "admin_note"       TEXT,
  "reviewed_at"      TIMESTAMPTZ,
  "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reports_pkey" PRIMARY KEY ("report_id")
);

-- 3. reports 외래키
ALTER TABLE "reports"
  ADD CONSTRAINT "reports_reporter_id_fkey"
    FOREIGN KEY ("reporter_id")    REFERENCES "users"("user_id"),
  ADD CONSTRAINT "reports_target_user_id_fkey"
    FOREIGN KEY ("target_user_id") REFERENCES "users"("user_id"),
  ADD CONSTRAINT "reports_admin_id_fkey"
    FOREIGN KEY ("admin_id")       REFERENCES "users"("user_id");

-- 4. reports CHECK 제약 (GG-REPORT-001~007 도메인 고정)
ALTER TABLE "reports"
  ADD CONSTRAINT "chk_reports_target_type"
    CHECK (target_type IN ('post', 'comment', 'chat_message', 'mate_eval')),
  ADD CONSTRAINT "chk_reports_reason"
    CHECK (reason IN ('spam', 'abuse', 'harassment', 'obscene', 'no_show', 'etc')),
  ADD CONSTRAINT "chk_reports_status"
    CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  ADD CONSTRAINT "chk_reports_admin_action"
    CHECK (admin_action IS NULL OR admin_action IN ('warned', 'suspended', 'false_report')),
  ADD CONSTRAINT "chk_reports_no_self_report"
    CHECK (reporter_id <> target_user_id);

-- 5. reports 인덱스
CREATE INDEX "idx_reports_status_created" ON "reports" ("status", "created_at" DESC);
CREATE INDEX "idx_reports_reporter"       ON "reports" ("reporter_id", "created_at" DESC);
CREATE INDEX "idx_reports_target"         ON "reports" ("target_user_id", "created_at" DESC);
CREATE INDEX "idx_reports_entity"         ON "reports" ("target_type", "target_entity_id");

-- 6. reports updated_at 트리거 (fn_set_updated_at 재사용 — 재정의 없음)
DROP TRIGGER IF EXISTS "trg_reports_updated_at" ON "reports";
CREATE TRIGGER "trg_reports_updated_at"
  BEFORE UPDATE ON "reports"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
