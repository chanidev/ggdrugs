-- v4.10 (2026-04-26) — PostGIS stage 4b: events.latitude / longitude 컬럼 DROP.
--
-- 현 상태 (stage 4a 까지):
--   - location_geom geometry(Point, 4326) + GiST 인덱스 idx_events_location_geom (v4.3)
--   - tr_events_sync_location_geom 트리거 (v4.7) — INSERT/UPDATE 시 lat/lng → location_geom 동기화
--   - dual-write 보장 — 모든 row 의 location_geom 일관 (4186/4191 with geom; NULL 5건은 좌표 미보유)
--
-- 본 마이그레이션:
--   1. dual-write trigger 제거 — lat/lng 가 사라지므로 무용.
--   2. lat/lng 컬럼 DROP. btree idx_events_geo (lat/lng) 도 같이 사라짐.
--   3. location_geom 이 단일 source of truth.
--
-- 응답 형식 (Web 영향):
--   - BFF /events, /events/:id, /me/bookmarks 의 lat/lng 응답 필드는 유지.
--     READ 코드가 ST_X/ST_Y(location_geom) 로 derive 해서 채움.
--   - SeoulMap.tsx, EventList.tsx 등 Web 측 변경 0.
--
-- 회복 가능성:
--   - lat/lng 정보 손실 없음 (location_geom 에 100% 보존).
--   - 롤백 시 lat/lng 재생성 가능: ALTER TABLE events ADD COLUMN latitude / longitude;
--     UPDATE events SET latitude = ST_Y(location_geom), longitude = ST_X(location_geom);

DROP TRIGGER IF EXISTS tr_events_sync_location_geom ON events;
DROP FUNCTION IF EXISTS fn_events_sync_location_geom();

ALTER TABLE events DROP COLUMN latitude;
ALTER TABLE events DROP COLUMN longitude;
