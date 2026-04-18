-- 마스터/레퍼런스 데이터 시드 (Phase 1 진입 조건)
--
-- 1. event_categories: DDL v4 상수 4종
-- 2. event_vibes: 요구사항 v5.0 + ADR 0001 #5 기준 초기 6종 도메인
--
-- 모두 ON CONFLICT DO NOTHING 으로 idempotent 처리.
-- 관리자가 추후 event_vibes 에 행을 추가하는 것을 막지 않음 (is_active 토글로 비활성화 가능).

-- ---------------- event_categories (4종) ----------------
INSERT INTO event_categories (category_code, display_name, sort_order, is_active)
VALUES
  ('festival',   '축제',    10, true),
  ('expo',       '박람회',  20, true),
  ('symposium',  '심포지움', 30, true),
  ('conference', '컨퍼런스', 40, true)
ON CONFLICT (category_code) DO NOTHING;

-- ---------------- event_vibes (6종, mood/activity/theme) ----------------
-- 그룹 분류는 wiki/topics/filters-5-types.md 의 예시값을 의미별로 매핑.
INSERT INTO event_vibes (vibe_name, vibe_group, is_active)
VALUES
  ('활동적',        'mood',     true),
  ('정적',          'mood',     true),
  ('체험형',        'activity', true),
  ('관람형',        'activity', true),
  ('교육형',        'theme',    true),
  ('네트워킹 중심',  'theme',    true)
ON CONFLICT (vibe_name) DO NOTHING;
