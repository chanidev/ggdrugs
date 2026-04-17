-- GGdrugs Postgres 초기화
-- 컨테이너 최초 기동 시 1회 실행 (docker-entrypoint-initdb.d)
-- 볼륨 초기화(docker compose down -v) 후에만 재실행됨.

-- PostGIS: 지역 필터, 이벤트 위치 bbox/거리 쿼리용
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- pg_trgm: 이벤트명/지역명 유사 검색 (LIKE '%...%' 가속)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent: 한글에는 영향 없지만 영문/외래어 이벤트명 정규화에 사용
CREATE EXTENSION IF NOT EXISTS unaccent;

-- citext: 이메일 컬럼 등 대소문자 무시 비교
CREATE EXTENSION IF NOT EXISTS citext;
