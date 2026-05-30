-- [리뷰 important 수정] review_complete dedup DB-level 보장 — 신규 마이그레이션 파일
-- 이전에 20260530140000_phase2_eval_credit/migration.sql 에 직접 추가했던 CREATE UNIQUE INDEX를
-- 기존 마이그레이션 파일(이미 적용 완료)에서 제거하고 이 파일로 분리.
-- 사유: prisma migrate deploy는 파일명 기반 체크섬으로 이미 적용된 마이그레이션을 재실행하지 않음.
-- 기존 파일 변형 → 신규 CREATE UNIQUE INDEX SQL이 이미 마이그레이션된 DB에서 실행되지 않는 버그.
--
-- HUMAN GATE: 에이전트는 이 파일을 실행하지 않는다.
--             사람이 `prisma migrate deploy` 로 수동 적용할 것.

-- review_complete dedup DB-level 보장:
-- TOCTOU(동시 rapid-retry / client double-tap) 경합 방지를 위한 partial unique index.
-- evaluation.ts에서 review_complete 크레딧 insert가 트랜잭션 밖(bare prisma.*)으로 이동(리뷰 critical 수정).
-- try/catch P2002(최종 방어) 패턴이 이 인덱스를 최종 방어선으로 사용.
CREATE UNIQUE INDEX uq_credit_review_complete_user
  ON credit_ledgers (appointment_id, user_id)
  WHERE action = 'review_complete';
