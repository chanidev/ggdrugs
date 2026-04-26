-- v4.6 (2026-04-26) — regions.center_lat / center_lng 추가 + 서울 25 자치구 backfill.
--
-- 용도: distance sort 시 사용자가 단일 region 필터를 적용하면 그 자치구 청사 좌표가
-- anchor 로 자동 적용됨. anchor priority = explicit > region centroid (sort=distance &&
-- regionIds 단일) > bbox center > 400.
--
-- 좌표 출처: 서울 각 자치구 청사 위치 (대표적·안정적 reference point).
-- 기타 sido/dong row 는 NULL — 향후 확장 시 별 마이그레이션.

ALTER TABLE regions ADD COLUMN center_lat DECIMAL(10, 7);
ALTER TABLE regions ADD COLUMN center_lng DECIMAL(10, 7);

-- 서울 25 자치구 청사 좌표 backfill. sido='서울' AND sigungu_name=<gu>.
UPDATE regions SET center_lat = 37.5735, center_lng = 126.9788 WHERE sido_name = '서울' AND sigungu_name = '종로구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5641, center_lng = 126.9979 WHERE sido_name = '서울' AND sigungu_name = '중구'   AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5320, center_lng = 126.9904 WHERE sido_name = '서울' AND sigungu_name = '용산구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5635, center_lng = 127.0367 WHERE sido_name = '서울' AND sigungu_name = '성동구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5384, center_lng = 127.0822 WHERE sido_name = '서울' AND sigungu_name = '광진구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5744, center_lng = 127.0398 WHERE sido_name = '서울' AND sigungu_name = '동대문구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.6066, center_lng = 127.0925 WHERE sido_name = '서울' AND sigungu_name = '중랑구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5894, center_lng = 127.0167 WHERE sido_name = '서울' AND sigungu_name = '성북구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.6396, center_lng = 127.0257 WHERE sido_name = '서울' AND sigungu_name = '강북구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.6688, center_lng = 127.0471 WHERE sido_name = '서울' AND sigungu_name = '도봉구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.6542, center_lng = 127.0568 WHERE sido_name = '서울' AND sigungu_name = '노원구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.6027, center_lng = 126.9290 WHERE sido_name = '서울' AND sigungu_name = '은평구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5791, center_lng = 126.9367 WHERE sido_name = '서울' AND sigungu_name = '서대문구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5663, center_lng = 126.9019 WHERE sido_name = '서울' AND sigungu_name = '마포구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5169, center_lng = 126.8665 WHERE sido_name = '서울' AND sigungu_name = '양천구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5509, center_lng = 126.8497 WHERE sido_name = '서울' AND sigungu_name = '강서구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.4955, center_lng = 126.8874 WHERE sido_name = '서울' AND sigungu_name = '구로구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.4565, center_lng = 126.8950 WHERE sido_name = '서울' AND sigungu_name = '금천구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5263, center_lng = 126.8962 WHERE sido_name = '서울' AND sigungu_name = '영등포구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5124, center_lng = 126.9395 WHERE sido_name = '서울' AND sigungu_name = '동작구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.4781, center_lng = 126.9514 WHERE sido_name = '서울' AND sigungu_name = '관악구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.4836, center_lng = 127.0327 WHERE sido_name = '서울' AND sigungu_name = '서초구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5172, center_lng = 127.0473 WHERE sido_name = '서울' AND sigungu_name = '강남구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5145, center_lng = 127.1062 WHERE sido_name = '서울' AND sigungu_name = '송파구' AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.5301, center_lng = 127.1238 WHERE sido_name = '서울' AND sigungu_name = '강동구' AND dong_name IS NULL;
