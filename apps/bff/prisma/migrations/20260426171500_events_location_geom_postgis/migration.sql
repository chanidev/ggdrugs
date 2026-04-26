-- v4.3 (2026-04-26) — events.latitude/longitude → location_geom (PostGIS).
--
-- ADD COLUMN location_geom geometry(Point, 4326) — WGS84 EPSG.
-- backfill from existing latitude/longitude (Decimal(10,7)).
-- GiST index for ST_Within / ST_DWithin (지도 viewport bbox / 반경 검색).
--
-- Stage 1 of 3-step migration:
--   stage 1 (this): ADD column + backfill + index — no code changes, dual-write 가능 상태.
--   stage 2 (next): BFF /events 가 ?bbox=minLng,minLat,maxLng,maxLat 쿼리 추가 (ST_Within).
--   stage 3 (UX trigger): Web SeoulMap bounds_changed → bbox refetch.
--
-- 기존 lat/lng column 은 dual-write 유지 — Web/BFF code 가 쓰는 동안 DROP 불가.
-- stage 4 (먼훗날): geom 만 사용으로 swap 후 lat/lng DROP.
--
-- pg_trgm extension 처럼 postgis 도 이미 .env / docker compose 시점에 활성됨
-- (apps/bff/prisma/schema.prisma extensions = [postgis, ...]).

ALTER TABLE events ADD COLUMN location_geom geometry(Point, 4326);

UPDATE events
SET location_geom = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX idx_events_location_geom ON events USING GIST (location_geom);
