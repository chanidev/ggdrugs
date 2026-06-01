-- ============================================================================
-- Migration: MatchRequest.group_batch_id — ADR 0010 (그룹 초대 배치 식별자)
-- Date:      2026-06-01
-- 사유:      한 번의 그룹 초대(sendGroupRequest)가 수신자별 MatchRequest N개를 만들지만 배치를
--            묶는 식별자가 없어, 수락 시 existingAccepted 가 신청자의 *아무* accepted 그룹 요청이나
--            찾는다. 같은 신청자가 6h 내 2개 배치를 보내면 나중 수락자가 이전 배치 방에 합류(오염).
--            → 배치당 UUID 를 부여하고 수락 시 같은 배치로 합류 경계를 한정한다.
--
-- 적용:      HUMAN 이 `cd apps/bff && npx prisma migrate deploy` 로 수동 적용 (에이전트 실행 금지).
-- 무중단:    NULL 허용 컬럼 추가 — 기존 행 backfill 불요(레거시 NULL 은 수락 시 신청자 단위 폴백).
-- ============================================================================

-- 1. 배치 식별자 컬럼 (NULL = 1:1 또는 레거시 그룹 요청)
ALTER TABLE "match_requests"
  ADD COLUMN "group_batch_id" UUID;

-- 2. 배치 내 수락 방 조회 인덱스 (existingAccepted: WHERE group_batch_id=? AND status='accepted')
CREATE INDEX "idx_match_req_batch_status"
  ON "match_requests" ("group_batch_id", "status");
