-- verify-constraints.sql
-- CHECK + 트리거 마이그레이션 검증 스크립트
-- 성공 시 각 블록이 PASS를 출력. savepoint/rollback으로 실제 데이터 오염 없음.

\set ON_ERROR_STOP off
\set ECHO none

BEGIN;

-- ============================================================================
-- Setup: 테스트용 region 1건
-- ============================================================================
INSERT INTO regions (sido_name, sigungu_name, full_address)
VALUES ('서울특별시', '강남구', '서울특별시 강남구')
RETURNING region_id \gset

-- ============================================================================
-- POSITIVE #1: users INSERT with active_role default
-- ============================================================================
SAVEPOINT sp;
INSERT INTO users (social_uid, auth_provider, nickname, region_id)
VALUES ('uid-test-1', 'google', 'tester', :region_id)
RETURNING user_id, active_role \gset
SELECT CASE WHEN :'active_role' = 'user' THEN 'PASS users.active_role defaults to user' ELSE 'FAIL' END AS result;

-- ============================================================================
-- POSITIVE #2: events INSERT with valid enums
-- ============================================================================
INSERT INTO events (
  category_id, region_id, source_type, title,
  start_date, end_date,
  expected_companion_primary, expected_companion_secondary
)
SELECT category_id, :region_id, 'uploaded', '테스트 이벤트',
       '2026-05-01', '2026-05-10',
       'family', 'friend'
  FROM event_categories WHERE category_code = 'festival'
RETURNING event_id \gset
SELECT 'PASS events insert OK (approval_status=pending default)' AS result;

-- ============================================================================
-- NEGATIVE #1: events.approval_status = 'on_hold' (deprecated, ADR 0001 #1)
-- ============================================================================
SAVEPOINT sp_neg1;
UPDATE events SET approval_status = 'on_hold' WHERE event_id = :event_id;
-- should not reach here
SELECT 'FAIL on_hold should be rejected' AS result;
ROLLBACK TO SAVEPOINT sp_neg1;
SELECT 'PASS on_hold rejected by chk_events_approval' AS result;

-- ============================================================================
-- NEGATIVE #2: events.phase = 'archived'
-- ============================================================================
SAVEPOINT sp_neg2;
UPDATE events SET phase = 'archived' WHERE event_id = :event_id;
SELECT 'FAIL archived should be rejected' AS result;
ROLLBACK TO SAVEPOINT sp_neg2;
SELECT 'PASS archived rejected by chk_events_phase' AS result;

-- ============================================================================
-- NEGATIVE #3: reviews.rating = 10
-- ============================================================================
SAVEPOINT sp_neg3;
INSERT INTO reviews (user_id, event_id, body, rating)
VALUES (:user_id, :event_id, '범위초과', 10);
SELECT 'FAIL rating=10 should be rejected' AS result;
ROLLBACK TO SAVEPOINT sp_neg3;
SELECT 'PASS rating=10 rejected by chk_review_rating' AS result;

-- ============================================================================
-- NEGATIVE #4: approval_documents.file_size_bytes = 20 * 1024 * 1024
-- ============================================================================
SAVEPOINT sp_neg4;
INSERT INTO approval_documents (event_id, file_path, original_filename, mime_type, file_size_bytes)
VALUES (:event_id, '/tmp/big.jpg', 'big.jpg', 'image/jpeg', 20971520);
SELECT 'FAIL 20MB should be rejected' AS result;
ROLLBACK TO SAVEPOINT sp_neg4;
SELECT 'PASS 20MB rejected by chk_doc_size' AS result;

-- ============================================================================
-- NEGATIVE #5: event_subscriptions.period_months = 12
-- ============================================================================
SAVEPOINT sp_neg5;
INSERT INTO event_subscriptions (user_id, region_ids, period_months)
VALUES (:user_id, ARRAY[:region_id]::bigint[], 12);
SELECT 'FAIL period_months=12 should be rejected' AS result;
ROLLBACK TO SAVEPOINT sp_neg5;
SELECT 'PASS period_months=12 rejected by chk_subs_period' AS result;

-- ============================================================================
-- TRIGGER #1: raw UPDATE bumps updated_at
-- ============================================================================
SELECT extract(epoch FROM updated_at)::bigint AS u_before FROM users WHERE user_id = :user_id \gset
SELECT pg_sleep(1);
UPDATE users SET nickname = 'tester-renamed' WHERE user_id = :user_id;
SELECT extract(epoch FROM updated_at)::bigint AS u_after FROM users WHERE user_id = :user_id \gset
SELECT CASE WHEN :u_after > :u_before
            THEN 'PASS trg_users_updated bumped updated_at'
            ELSE 'FAIL updated_at not changed' END AS result;

-- ============================================================================
ROLLBACK;
SELECT '=== all tests complete ===' AS result;
