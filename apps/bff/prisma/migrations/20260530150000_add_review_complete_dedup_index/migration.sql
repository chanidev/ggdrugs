-- 크레딧 적립 dedup DB-level 보장 (appointment_complete + review_complete).
-- 두 partial unique index 를 신규 마이그레이션 파일로 통합 — 이미 적용 완료된
-- 20260530140000_phase2_eval_credit 은 as-applied 상태로 원복(인덱스 미포함).
-- TOCTOU(동시 rapid-retry / client double-tap) 경합 시 app-layer pre-check + P2002 최종 방어선.
-- HUMAN 이 prisma migrate deploy 로 적용.

CREATE UNIQUE INDEX uq_credit_appt_complete_user
  ON credit_ledgers (appointment_id, user_id)
  WHERE action = 'appointment_complete';

CREATE UNIQUE INDEX uq_credit_review_complete_user
  ON credit_ledgers (appointment_id, user_id)
  WHERE action = 'review_complete';
