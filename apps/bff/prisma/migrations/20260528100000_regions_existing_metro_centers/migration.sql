-- ADR 0006 follow-up — 기존 광역시·도 8개 row 의 center_lat/lng 채움.
--
-- 20260426185500 가 서울 25 자치구만 채웠고, 20260527120500 가 광역 9 신규만 채워서
-- 8개 기존 광역 (서울/부산/대구/인천/광주/대전/울산/경기) row 의 center 가 NULL.
-- GET /regions 의 COALESCE fallback (자치구→광역) 이 작동 안 함 → 부산 해운대구·경기
-- 수원시 영통구 등 새 chip 의 지도 panTo / 폴리곤 anchor 가 NULL.
--
-- 좌표 출처: 각 시·도청 부근 대표좌표 (서울은 시청, 부산·대구 등은 시청 부근).

UPDATE regions SET center_lat = 37.5666, center_lng = 126.9784 WHERE sido_name = '서울' AND sigungu_name IS NULL AND dong_name IS NULL;
UPDATE regions SET center_lat = 35.1796, center_lng = 129.0756 WHERE sido_name = '부산' AND sigungu_name IS NULL AND dong_name IS NULL;
UPDATE regions SET center_lat = 35.8714, center_lng = 128.6014 WHERE sido_name = '대구' AND sigungu_name IS NULL AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.4563, center_lng = 126.7052 WHERE sido_name = '인천' AND sigungu_name IS NULL AND dong_name IS NULL;
UPDATE regions SET center_lat = 35.1595, center_lng = 126.8526 WHERE sido_name = '광주' AND sigungu_name IS NULL AND dong_name IS NULL;
UPDATE regions SET center_lat = 36.3504, center_lng = 127.3845 WHERE sido_name = '대전' AND sigungu_name IS NULL AND dong_name IS NULL;
UPDATE regions SET center_lat = 35.5384, center_lng = 129.3114 WHERE sido_name = '울산' AND sigungu_name IS NULL AND dong_name IS NULL;
UPDATE regions SET center_lat = 37.4138, center_lng = 127.5183 WHERE sido_name = '경기' AND sigungu_name IS NULL AND dong_name IS NULL;
