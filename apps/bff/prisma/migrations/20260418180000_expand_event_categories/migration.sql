-- event_categories 확장 — 이벤트 종류 필터 세분화
--
-- 배경: Seoul 문화행사 CODENAME 분포 (1,000 샘플 기준)
--   교육/체험 363 · 전시/미술 159 · 클래식 159 · 콘서트 58 · 연극 42 · 국악 36
--   독주/독창회 33 · 뮤지컬/오페라 27 · 무용 22 · 영화 22 · 축제 ~72 · 기타
-- 기존 4종(festival/expo/symposium/conference) 로는 95% 가 festival fallback →
-- 전체목록 chip 숫자가 festival 에만 쏠리는 문제. classify 세분화 후 재ingest.
--
-- 본 마이그레이션은 row 만 추가 (schema 변화 없음). category_id 는 FK 라 CHECK
-- 제약이 없으므로 enum 변경 없이 단순 seed 확장으로 충분.

INSERT INTO event_categories (category_code, display_name, sort_order, is_active) VALUES
  ('exhibition',  '전시',   50, true),
  ('performance', '공연',   60, true),
  ('education',   '교육/체험', 70, true),
  ('movie',       '영화',   80, true)
ON CONFLICT (category_code) DO NOTHING;
