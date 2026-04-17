-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateTable
CREATE TABLE "regions" (
    "region_id" BIGSERIAL NOT NULL,
    "sido_name" VARCHAR(30) NOT NULL,
    "sigungu_name" VARCHAR(30),
    "dong_name" VARCHAR(30),
    "full_address" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("region_id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" BIGSERIAL NOT NULL,
    "social_uid" VARCHAR(255) NOT NULL,
    "auth_provider" VARCHAR(20) NOT NULL,
    "nickname" VARCHAR(50) NOT NULL,
    "gender" CHAR(1),
    "date_of_birth" DATE,
    "region_id" BIGINT,
    "active_role" VARCHAR(20) NOT NULL DEFAULT 'user',
    "is_notification_on" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "last_logged_in_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "uploader_profiles" (
    "uploader_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "organization_name" VARCHAR(100) NOT NULL,
    "contact_phone" VARCHAR(20) NOT NULL,
    "contact_email" VARCHAR(255) NOT NULL,
    "approval_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "approved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploader_profiles_pkey" PRIMARY KEY ("uploader_id")
);

-- CreateTable
CREATE TABLE "admin_profiles" (
    "admin_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "department" VARCHAR(100),
    "scope" VARCHAR(30) NOT NULL DEFAULT 'full',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("admin_id")
);

-- CreateTable
CREATE TABLE "event_categories" (
    "category_id" BIGSERIAL NOT NULL,
    "category_code" VARCHAR(30) NOT NULL,
    "display_name" VARCHAR(50) NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "events" (
    "event_id" BIGSERIAL NOT NULL,
    "uploader_id" BIGINT,
    "category_id" BIGINT NOT NULL,
    "region_id" BIGINT NOT NULL,
    "source_type" VARCHAR(20) NOT NULL,
    "crawl_origin" VARCHAR(50),
    "external_source_id" VARCHAR(100),
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "address_detail" VARCHAR(255),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "operating_hours" VARCHAR(100),
    "target_audience" VARCHAR(100),
    "admission_fee" VARCHAR(100),
    "expected_companion_primary" VARCHAR(20),
    "expected_companion_secondary" VARCHAR(20),
    "poster_image_url" VARCHAR(500),
    "approval_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "phase" VARCHAR(20) NOT NULL DEFAULT 'upcoming',
    "bookmark_count" INTEGER NOT NULL DEFAULT 0,
    "avg_rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "event_vibes" (
    "vibe_id" BIGSERIAL NOT NULL,
    "vibe_name" VARCHAR(50) NOT NULL,
    "vibe_group" VARCHAR(30) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_vibes_pkey" PRIMARY KEY ("vibe_id")
);

-- CreateTable
CREATE TABLE "event_vibe_assignments" (
    "assignment_id" BIGSERIAL NOT NULL,
    "event_id" BIGINT NOT NULL,
    "vibe_id" BIGINT NOT NULL,
    "assigned_by" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_vibe_assignments_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "approval_documents" (
    "document_id" BIGSERIAL NOT NULL,
    "event_id" BIGINT NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(30) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_documents_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "approval_logs" (
    "log_id" BIGSERIAL NOT NULL,
    "event_id" BIGINT NOT NULL,
    "admin_id" BIGINT NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "bookmark_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "event_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("bookmark_id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "review_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "event_id" BIGINT NOT NULL,
    "body" TEXT NOT NULL,
    "rating" SMALLINT NOT NULL,
    "sentiment" VARCHAR(10),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("review_id")
);

-- CreateTable
CREATE TABLE "review_photos" (
    "review_photo_id" BIGSERIAL NOT NULL,
    "review_id" BIGINT NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(30) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_photos_pkey" PRIMARY KEY ("review_photo_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "event_id" BIGINT,
    "title" VARCHAR(100) NOT NULL,
    "message" TEXT NOT NULL,
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "is_sent" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "event_subscriptions" (
    "subscription_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "region_ids" BIGINT[],
    "period_months" SMALLINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_subscriptions_pkey" PRIMARY KEY ("subscription_id")
);

-- CreateTable
CREATE TABLE "search_logs" (
    "log_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "search_type" VARCHAR(10) NOT NULL,
    "search_params" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "session_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "message_id" BIGSERIAL NOT NULL,
    "session_id" BIGINT NOT NULL,
    "sender_type" VARCHAR(10) NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "news_articles" (
    "article_id" BIGSERIAL NOT NULL,
    "source_name" VARCHAR(30) NOT NULL DEFAULT 'donga',
    "author_name" VARCHAR(50),
    "article_category" VARCHAR(50),
    "title" VARCHAR(300) NOT NULL,
    "original_url" VARCHAR(500) NOT NULL,
    "content_body" TEXT,
    "summary" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "published_at" TIMESTAMPTZ,
    "crawled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_articles_pkey" PRIMARY KEY ("article_id")
);

-- CreateTable
CREATE TABLE "event_article_mappings" (
    "mapping_id" BIGSERIAL NOT NULL,
    "event_id" BIGINT NOT NULL,
    "article_id" BIGINT NOT NULL,
    "relevance_score" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "matched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_article_mappings_pkey" PRIMARY KEY ("mapping_id")
);

-- CreateTable
CREATE TABLE "photo_albums" (
    "album_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "event_id" BIGINT,
    "album_name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_albums_pkey" PRIMARY KEY ("album_id")
);

-- CreateTable
CREATE TABLE "photos" (
    "photo_id" BIGSERIAL NOT NULL,
    "album_id" BIGINT NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "ai_tags" JSONB NOT NULL DEFAULT '{}',
    "taken_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("photo_id")
);

-- CreateTable
CREATE TABLE "user_taste_profiles" (
    "profile_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "taste_dimension" VARCHAR(30) NOT NULL,
    "taste_value" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_taste_profiles_pkey" PRIMARY KEY ("profile_id")
);

-- CreateIndex
CREATE INDEX "idx_regions_sido" ON "regions"("sido_name");

-- CreateIndex
CREATE INDEX "idx_regions_sigungu" ON "regions"("sido_name", "sigungu_name");

-- CreateIndex
CREATE INDEX "idx_users_provider_uid" ON "users"("auth_provider", "social_uid");

-- CreateIndex
CREATE INDEX "idx_users_region" ON "users"("region_id");

-- CreateIndex
CREATE INDEX "idx_users_created" ON "users"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_social" ON "users"("auth_provider", "social_uid");

-- CreateIndex
CREATE UNIQUE INDEX "uploader_profiles_user_id_key" ON "uploader_profiles"("user_id");

-- CreateIndex
CREATE INDEX "idx_uploader_status" ON "uploader_profiles"("approval_status");

-- CreateIndex
CREATE UNIQUE INDEX "admin_profiles_user_id_key" ON "admin_profiles"("user_id");

-- CreateIndex
CREATE INDEX "idx_admin_active" ON "admin_profiles"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_category_code_key" ON "event_categories"("category_code");

-- CreateIndex
CREATE INDEX "idx_events_filter" ON "events"("region_id", "category_id", "start_date", "phase");

-- CreateIndex
CREATE INDEX "idx_events_phase" ON "events"("phase", "start_date");

-- CreateIndex
CREATE INDEX "idx_events_approval" ON "events"("approval_status", "created_at");

-- CreateIndex
CREATE INDEX "idx_events_uploader" ON "events"("uploader_id");

-- CreateIndex
CREATE INDEX "idx_events_geo" ON "events"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "idx_events_dates" ON "events"("start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "uq_events_external" ON "events"("crawl_origin", "external_source_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_vibes_vibe_name_key" ON "event_vibes"("vibe_name");

-- CreateIndex
CREATE INDEX "idx_vibe_assign_event" ON "event_vibe_assignments"("event_id");

-- CreateIndex
CREATE INDEX "idx_vibe_assign_vibe" ON "event_vibe_assignments"("vibe_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_event_vibe" ON "event_vibe_assignments"("event_id", "vibe_id");

-- CreateIndex
CREATE INDEX "idx_approval_docs_event" ON "approval_documents"("event_id");

-- CreateIndex
CREATE INDEX "idx_approval_logs_event" ON "approval_logs"("event_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_approval_logs_admin" ON "approval_logs"("admin_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_bookmarks_user" ON "bookmarks"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_bookmarks_event" ON "bookmarks"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_bookmark" ON "bookmarks"("user_id", "event_id");

-- CreateIndex
CREATE INDEX "idx_reviews_event" ON "reviews"("event_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_reviews_user" ON "reviews"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_reviews_sentiment" ON "reviews"("event_id", "sentiment");

-- CreateIndex
CREATE UNIQUE INDEX "uq_review_per_event" ON "reviews"("user_id", "event_id");

-- CreateIndex
CREATE INDEX "idx_review_photos_review" ON "review_photos"("review_id", "sort_order");

-- CreateIndex
CREATE INDEX "idx_notif_pending" ON "notifications"("scheduled_at");

-- CreateIndex
CREATE INDEX "idx_notif_user" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_subs_user_active" ON "event_subscriptions"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "idx_search_logs_user" ON "search_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_chat_sessions_user" ON "chat_sessions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_chat_msg_session" ON "chat_messages"("session_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "news_articles_original_url_key" ON "news_articles"("original_url");

-- CreateIndex
CREATE INDEX "idx_articles_published" ON "news_articles"("published_at" DESC);

-- CreateIndex
CREATE INDEX "idx_articles_source" ON "news_articles"("source_name", "published_at" DESC);

-- CreateIndex
CREATE INDEX "idx_event_article_event" ON "event_article_mappings"("event_id", "relevance_score" DESC);

-- CreateIndex
CREATE INDEX "idx_event_article_article" ON "event_article_mappings"("article_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_event_article" ON "event_article_mappings"("event_id", "article_id");

-- CreateIndex
CREATE INDEX "idx_albums_user" ON "photo_albums"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_albums_event" ON "photo_albums"("event_id");

-- CreateIndex
CREATE INDEX "idx_photos_album" ON "photos"("album_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_taste_user" ON "user_taste_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_taste" ON "user_taste_profiles"("user_id", "taste_dimension");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("region_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploader_profiles" ADD CONSTRAINT "uploader_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "uploader_profiles"("uploader_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "event_categories"("category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("region_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_vibe_assignments" ADD CONSTRAINT "event_vibe_assignments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_vibe_assignments" ADD CONSTRAINT "event_vibe_assignments_vibe_id_fkey" FOREIGN KEY ("vibe_id") REFERENCES "event_vibes"("vibe_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_vibe_assignments" ADD CONSTRAINT "event_vibe_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_documents" ADD CONSTRAINT "approval_documents_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_photos" ADD CONSTRAINT "review_photos_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("review_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_subscriptions" ADD CONSTRAINT "event_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_logs" ADD CONSTRAINT "search_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_article_mappings" ADD CONSTRAINT "event_article_mappings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_article_mappings" ADD CONSTRAINT "event_article_mappings_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "news_articles"("article_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_albums" ADD CONSTRAINT "photo_albums_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_albums" ADD CONSTRAINT "photo_albums_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "photo_albums"("album_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_taste_profiles" ADD CONSTRAINT "user_taste_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

