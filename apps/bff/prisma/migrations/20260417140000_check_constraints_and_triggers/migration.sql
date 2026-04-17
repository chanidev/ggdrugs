-- ============================================================================
-- Migration: CHECK constraints + updated_at triggers (DDL v4)
-- Date:      2026-04-17
-- Scope:     DDL v3에서 이식한 CHECK 제약 + ADR 0001 rename 반영 + fn_set_updated_at 트리거
-- Rationale: apps/bff/prisma/schema.prisma 는 CHECK/트리거를 표현하지 못함.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CHECK constraints
-- ----------------------------------------------------------------------------

-- users
ALTER TABLE "users"
    ADD CONSTRAINT "chk_users_gender"      CHECK (gender IN ('M','F')),
    ADD CONSTRAINT "chk_users_provider"    CHECK (auth_provider IN ('google','kakao')),
    ADD CONSTRAINT "chk_users_active_role" CHECK (active_role IN ('user','uploader'));

-- uploader_profiles  (ADR 0001 #1 대칭 적용 — revision_requested 포함)
ALTER TABLE "uploader_profiles"
    ADD CONSTRAINT "chk_uploader_status" CHECK (approval_status IN ('pending','approved','revision_requested','rejected')),
    ADD CONSTRAINT "chk_uploader_email"  CHECK (contact_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- admin_profiles  (ADR 0001 #3)
ALTER TABLE "admin_profiles"
    ADD CONSTRAINT "chk_admin_scope" CHECK (scope IN ('full','content_only','uploader_review_only'));

-- events  (ADR 0001 #1 approval_status + #4 expected_companion rename 반영)
ALTER TABLE "events"
    ADD CONSTRAINT "chk_events_source"   CHECK (source_type IN ('crawled','uploaded')),
    ADD CONSTRAINT "chk_events_approval" CHECK (approval_status IN ('pending','approved','revision_requested','rejected')),
    ADD CONSTRAINT "chk_events_phase"    CHECK (phase IN ('upcoming','ongoing','ended')),
    ADD CONSTRAINT "chk_events_expected_companion_primary"   CHECK (expected_companion_primary   IS NULL OR expected_companion_primary   IN ('family','friend','couple','solo')),
    ADD CONSTRAINT "chk_events_expected_companion_secondary" CHECK (expected_companion_secondary IS NULL OR expected_companion_secondary IN ('family','friend','couple','solo')),
    ADD CONSTRAINT "chk_events_dates"    CHECK (end_date >= start_date),
    ADD CONSTRAINT "chk_events_rating"   CHECK (avg_rating >= 0 AND avg_rating <= 5);

-- event_vibes  (ADR 0001 #5 rename)
ALTER TABLE "event_vibes"
    ADD CONSTRAINT "chk_vibe_group" CHECK (vibe_group IN ('mood','activity','theme'));

-- approval_documents
ALTER TABLE "approval_documents"
    ADD CONSTRAINT "chk_doc_mime" CHECK (mime_type IN ('image/jpeg','image/png')),
    ADD CONSTRAINT "chk_doc_size" CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760); -- 10MB

-- approval_logs  (ADR 0001 #1)
ALTER TABLE "approval_logs"
    ADD CONSTRAINT "chk_approval_action" CHECK (action IN ('approved','revision_requested','rejected'));

-- reviews
ALTER TABLE "reviews"
    ADD CONSTRAINT "chk_review_rating"    CHECK (rating >= 1 AND rating <= 5),
    ADD CONSTRAINT "chk_review_sentiment" CHECK (sentiment IS NULL OR sentiment IN ('positive','negative','neutral'));

-- review_photos  (ADR 0001 #6, approval_documents 패턴 재사용)
ALTER TABLE "review_photos"
    ADD CONSTRAINT "chk_review_photo_mime" CHECK (mime_type IN ('image/jpeg','image/png')),
    ADD CONSTRAINT "chk_review_photo_size" CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760);

-- notifications
ALTER TABLE "notifications"
    ADD CONSTRAINT "chk_notif_sent" CHECK (
        (is_sent = false AND sent_at IS NULL) OR
        (is_sent = true  AND sent_at IS NOT NULL)
    );

-- event_subscriptions  (ADR 0001 #7 — period_months 3 | 6 | NULL(전체))
ALTER TABLE "event_subscriptions"
    ADD CONSTRAINT "chk_subs_period" CHECK (period_months IS NULL OR period_months IN (3, 6));

-- search_logs
ALTER TABLE "search_logs"
    ADD CONSTRAINT "chk_search_type" CHECK (search_type IN ('filter','chat'));

-- chat_messages
ALTER TABLE "chat_messages"
    ADD CONSTRAINT "chk_msg_sender" CHECK (sender_type IN ('user','assistant'));

-- event_article_mappings
ALTER TABLE "event_article_mappings"
    ADD CONSTRAINT "chk_relevance" CHECK (relevance_score >= 0 AND relevance_score <= 1);

-- ----------------------------------------------------------------------------
-- 2. updated_at 자동 갱신 함수 + 트리거
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_set_updated_at IS 'BEFORE UPDATE 트리거로 updated_at을 자동 갱신 — raw SQL UPDATE 경로의 안전망. Prisma @updatedAt와 병행해도 의미 동일.';

-- users
DROP TRIGGER IF EXISTS trg_users_updated ON "users";
CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON "users"
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- uploader_profiles
DROP TRIGGER IF EXISTS trg_uploader_profiles_updated ON "uploader_profiles";
CREATE TRIGGER trg_uploader_profiles_updated
    BEFORE UPDATE ON "uploader_profiles"
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- admin_profiles  (ADR 0001 #3 신설 테이블)
DROP TRIGGER IF EXISTS trg_admin_profiles_updated ON "admin_profiles";
CREATE TRIGGER trg_admin_profiles_updated
    BEFORE UPDATE ON "admin_profiles"
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- events
DROP TRIGGER IF EXISTS trg_events_updated ON "events";
CREATE TRIGGER trg_events_updated
    BEFORE UPDATE ON "events"
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- reviews
DROP TRIGGER IF EXISTS trg_reviews_updated ON "reviews";
CREATE TRIGGER trg_reviews_updated
    BEFORE UPDATE ON "reviews"
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- event_subscriptions  (ADR 0001 #7 신설 테이블)
DROP TRIGGER IF EXISTS trg_event_subscriptions_updated ON "event_subscriptions";
CREATE TRIGGER trg_event_subscriptions_updated
    BEFORE UPDATE ON "event_subscriptions"
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- photo_albums
DROP TRIGGER IF EXISTS trg_photo_albums_updated ON "photo_albums";
CREATE TRIGGER trg_photo_albums_updated
    BEFORE UPDATE ON "photo_albums"
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- user_taste_profiles
DROP TRIGGER IF EXISTS trg_user_taste_updated ON "user_taste_profiles";
CREATE TRIGGER trg_user_taste_updated
    BEFORE UPDATE ON "user_taste_profiles"
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
