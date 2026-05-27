-- apps/bff/prisma/migrations/20260527120500_regions_center_coords_nationwide/migration.sql
-- 광역 9 신규 + 자치구 있는 일반시 8개 본체 center 좌표.
-- 좌표 출처: 행정안전부 도로명주소 시군구 대표좌표 (2026 기준).
-- NULL 허용 — 미채움 행은 광역 좌표 fallback.

UPDATE regions SET center_lat = 36.4870, center_lng = 127.2823 WHERE sido_name = '세종' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 37.8228, center_lng = 128.1555 WHERE sido_name = '강원' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 36.8000, center_lng = 127.7000 WHERE sido_name = '충북' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 36.5184, center_lng = 126.8000 WHERE sido_name = '충남' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 35.7175, center_lng = 127.1530 WHERE sido_name = '전북' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 34.8161, center_lng = 126.4630 WHERE sido_name = '전남' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 36.5760, center_lng = 128.5050 WHERE sido_name = '경북' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 35.4606, center_lng = 128.2132 WHERE sido_name = '경남' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 33.4890, center_lng = 126.4983 WHERE sido_name = '제주' AND sigungu_name IS NULL;

-- 자치구 있는 일반시 본체 — 시 단위 row.
UPDATE regions SET center_lat = 37.2636, center_lng = 127.0286 WHERE sido_name = '경기' AND sigungu_name = '수원시';
UPDATE regions SET center_lat = 37.4202, center_lng = 127.1267 WHERE sido_name = '경기' AND sigungu_name = '성남시';
UPDATE regions SET center_lat = 37.6584, center_lng = 126.8320 WHERE sido_name = '경기' AND sigungu_name = '고양시';
UPDATE regions SET center_lat = 37.2410, center_lng = 127.1776 WHERE sido_name = '경기' AND sigungu_name = '용인시';
UPDATE regions SET center_lat = 36.6424, center_lng = 127.4890 WHERE sido_name = '충북' AND sigungu_name = '청주시';
UPDATE regions SET center_lat = 36.8151, center_lng = 127.1139 WHERE sido_name = '충남' AND sigungu_name = '천안시';
UPDATE regions SET center_lat = 35.8242, center_lng = 127.1480 WHERE sido_name = '전북' AND sigungu_name = '전주시';
UPDATE regions SET center_lat = 36.0190, center_lng = 129.3435 WHERE sido_name = '경북' AND sigungu_name = '포항시';
