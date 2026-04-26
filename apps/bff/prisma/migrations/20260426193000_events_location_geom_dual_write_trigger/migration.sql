-- v4.7 stage 4a (2026-04-26) — events.location_geom dual-write trigger.
--
-- v4.3 stage 1 의 일회성 backfill 후, 새 INSERT 가 lat/lng 만 채우는 코드 경로
-- (apps/bff/src/routes/uploader/events.ts, ingest jobs) 가 location_geom 을 비워둠.
-- 결과: 4188 → 4191 row 증가 동안 location_geom 미반영 5건 발생 (sort=distance 후보 누락).
--
-- 본 마이그레이션: BEFORE INSERT/UPDATE OF latitude, longitude 트리거로 자동 동기화 +
-- 누락된 5건 catch-up backfill. 향후 어느 코드 경로에서 lat/lng 쓰든 location_geom 자동 일치.
--
-- stage 4b (별 sprint, 검증 기간 후): lat/lng 컬럼 DROP — 그 시점에 본 트리거도 제거하고
-- location_geom 을 source of truth 로 전환.

CREATE OR REPLACE FUNCTION fn_events_sync_location_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location_geom := ST_SetSRID(ST_MakePoint(NEW.longitude::float, NEW.latitude::float), 4326);
  ELSE
    NEW.location_geom := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_events_sync_location_geom ON events;
CREATE TRIGGER tr_events_sync_location_geom
BEFORE INSERT OR UPDATE OF latitude, longitude ON events
FOR EACH ROW
EXECUTE FUNCTION fn_events_sync_location_geom();

-- Catch-up backfill — stage 1 이후 신규 INSERT 된 row 의 location_geom NULL 보정.
UPDATE events
SET location_geom = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)
WHERE location_geom IS NULL
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL;
