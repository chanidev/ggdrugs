-- ============================================================================
-- Migration: mate_eval 알림 dedup DB-level 보장 (notifications partial unique index)
-- Date:      2026-05-31
-- 사유:      Slice 9 감사 발견 — chat-scheduler.ts(notifyMateEval) 가 mate_eval 알림
--            중복 생성 방지를 위해 partial unique index `uq_notif_mate_eval_per_user_appt`
--            의 존재를 가정(P2002 catch 를 "정상 dedup" 으로 처리)하나, 어떤 마이그레이션도
--            해당 인덱스를 생성하지 않아 코드↔DB 드리프트. 1차 방어(findFirst pre-check)만
--            남아 다중 인스턴스·스케줄러 재시작 시 TOCTOU 경합으로 중복 알림이 새어나갈 수 있음.
--            → credit_ledgers dedup(20260530150000)과 동일 패턴의 최종 방어선을 notifications 에 추가.
--
-- 패턴 정합:  partial/filtered unique index 는 Prisma 스키마(@@unique)로 표현 불가 →
--            credit_ledgers 의 uq_credit_*_user 와 동일하게 **마이그레이션 전용**(schema.prisma 미선언).
--
-- 적용:      HUMAN 이 `cd apps/bff && npx prisma migrate deploy` 로 수동 적용 (에이전트 실행 금지).
-- 사전정리:  인덱스 생성 전, 이미 존재할 수 있는 중복 mate_eval 알림을 (user_id, related_entity_id)
--            그룹당 가장 이른 notification_id 1건만 남기고 제거 — 인덱스가 깨끗이 적용되도록 보장.
--            (mate_eval 알림은 "평가를 남겨주세요" 리마인더라 중복 제거가 무해.)
-- ============================================================================

-- 1. 기존 중복 mate_eval 알림 정리 (그룹당 최소 notification_id 1건 유지)
DELETE FROM "notifications" n
USING (
  SELECT user_id, related_entity_id, MIN(notification_id) AS keep_id
  FROM "notifications"
  WHERE notification_type = 'mate_eval'
    AND related_entity_type = 'appointment'
    AND related_entity_id IS NOT NULL
  GROUP BY user_id, related_entity_id
  HAVING COUNT(*) > 1
) dup
WHERE n.user_id = dup.user_id
  AND n.related_entity_id = dup.related_entity_id
  AND n.notification_type = 'mate_eval'
  AND n.related_entity_type = 'appointment'
  AND n.notification_id <> dup.keep_id;

-- 2. partial unique index — mate_eval/appointment 알림은 (user_id, appointment) 당 1건
CREATE UNIQUE INDEX "uq_notif_mate_eval_per_user_appt"
  ON "notifications" ("user_id", "related_entity_id")
  WHERE notification_type = 'mate_eval' AND related_entity_type = 'appointment';
