-- ============================================================================
-- Migration: MateProfile.selected_event_id — GG-MATCH-003 (축제 선택)
-- Date:      2026-05-31
-- 사유:      Slice 2 감사 발견 — 요구사항 GG-MATCH-003("사용자는 메이트와 함께 갈 축제를
--            2주 이내 개최 예정인 축제 목록에서 선택", 우선순위 상) + ADR 0007 #3
--            ("후보 풀 = 같은 축제(2주 이내 개최) 선택 + 매칭 동의 한 사용자")가
--            구현되지 않음. mate.ts 는 후보풀을 regionId 로만 필터(슬라이스3 연기 주석).
--            → 사용자가 선택한 축제를 저장할 컬럼 추가. 추천 후보풀의 hard 경계가 됨
--            (지역은 mate-score 의 soft 점수로 잔존).
--
-- 적용:      HUMAN 이 `cd apps/bff && npx prisma migrate deploy` 로 수동 적용 (에이전트 실행 금지).
-- 무중단:    NULL 허용 컬럼 추가 — 기존 행 backfill 불요(미선택=NULL→추천 시 no_event 유도).
-- ============================================================================

-- 1. 선택 축제 컬럼 (NULL = 미선택)
ALTER TABLE "mate_profiles"
  ADD COLUMN "selected_event_id" BIGINT;

-- 2. FK → events (축제 삭제 시 선택 해제: ON DELETE SET NULL)
ALTER TABLE "mate_profiles"
  ADD CONSTRAINT "mate_profiles_selected_event_id_fkey"
    FOREIGN KEY ("selected_event_id") REFERENCES "events"("event_id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. 후보풀 조회 인덱스 (같은 축제 + consent)
CREATE INDEX "idx_mate_profiles_event_pool"
  ON "mate_profiles" ("selected_event_id", "consented_at");
