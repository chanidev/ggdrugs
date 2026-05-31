-- ============================================================================
-- Migration: Slice 5 후속 — mate_evaluations appointment FK + comment byte CHECK + FK 인덱스
-- Date:      2026-05-31
-- 사유:      /review (병합 전) 발견 — schema.prisma ↔ DB 드리프트 해소.
--
--   1) mate_evaluations.appointment_id : schema.prisma 는 `appointment Appointment @relation`
--      을 선언했으나 20260530140000 migration 이 FK 를 만들지 않아 drift (다음 migrate 시 Prisma
--      가 FK 추가를 요구). → 여기서 FK 추가. constraint 명은 Prisma 기본 매핑과 동일.
--      (festival_surveys / festival_reviews 는 DB 에 이미 FK 존재 → schema 측에만 관계를 추가했고
--       DDL 변경은 불필요. 제약 명도 *_appointment_id_fkey 로 Prisma 기본과 일치 확인됨.)
--
--   2) mate_evaluations.comment : GG-REVIEW-005 는 ≤30 UTF-8 byte. VARCHAR(30) 은 30"문자"라
--      한글에서 byte 제약을 보장하지 못함 → octet_length CHECK 추가 (schema 주석과 정합).
--
--   3) FK 컬럼 supporting 인덱스 — Postgres 는 FK 에 자동 인덱스를 만들지 않음. 커버링 인덱스가
--      없는 FK 컬럼만 추가 (cascade/join seq-scan 방지).
--
-- 적용:      HUMAN 이 `cd apps/bff && npx prisma migrate deploy` 로 수동 적용 (에이전트 실행 금지).
-- 사전검증:  2026-05-31 기준 mate_evaluations 고아 appointment_id 0건, comment >30 byte 0건 확인.
-- ============================================================================

-- 1. mate_evaluations.appointment_id FK (drift 해소)
ALTER TABLE "mate_evaluations"
  ADD CONSTRAINT "mate_evaluations_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("appointment_id");

-- 2. comment 바이트 제약 (GG-REVIEW-005 ≤30 UTF-8 byte)
ALTER TABLE "mate_evaluations"
  ADD CONSTRAINT "chk_mate_eval_comment_bytes"
    CHECK (comment IS NULL OR octet_length(comment) <= 30);

-- 3. FK supporting 인덱스 (커버링 인덱스 없는 FK 컬럼)
--    - mate_evaluations.appointment_id     : 신규 FK, 인덱스 없음
--    - mate_evaluations.evaluator_user_id  : FK 있으나 인덱스 없음 (evaluated_user_id 만 idx 존재)
--    - festival_surveys.user_id            : uq_festival_survey_pair 가 appointment_id 선행이라 미커버
CREATE INDEX IF NOT EXISTS "idx_mate_eval_appointment" ON "mate_evaluations" ("appointment_id");
CREATE INDEX IF NOT EXISTS "idx_mate_eval_evaluator"   ON "mate_evaluations" ("evaluator_user_id");
CREATE INDEX IF NOT EXISTS "idx_festival_survey_user"  ON "festival_surveys" ("user_id");
