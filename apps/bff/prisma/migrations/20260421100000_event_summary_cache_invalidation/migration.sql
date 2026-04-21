-- events.description_hash: ai_summary 생성 시점의 description MD5. 캐시 감사용
-- (현재 summary 가 어떤 description 에 대해 만들어졌는지 추적).
ALTER TABLE "events"
  ADD COLUMN "description_hash" CHAR(32);

-- description 이 변경되면 ai_summary / ai_summary_at / description_hash 를 함께 null 로 되돌린다.
-- 재ingest 시점이든 관리자 수정이든 모든 UPDATE 경로에서 캐시가 자동 무효화된다.
-- 단, NULL → NULL 은 bypass (IS DISTINCT FROM 으로 처리).
CREATE OR REPLACE FUNCTION fn_invalidate_ai_summary_on_description_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    NEW.ai_summary := NULL;
    NEW.ai_summary_at := NULL;
    NEW.description_hash := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_events_invalidate_ai_summary
BEFORE UPDATE OF "description" ON "events"
FOR EACH ROW
EXECUTE FUNCTION fn_invalidate_ai_summary_on_description_change();
