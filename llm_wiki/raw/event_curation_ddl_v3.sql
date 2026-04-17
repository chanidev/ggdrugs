-- =============================================================
-- Event Curation Platform - Database Schema (PostgreSQL)
-- Version: 3.0
-- Date: 2026-04-16
-- Naming: snake_case, singular table names avoided where ambiguous
-- =============================================================

-- ----- ENUM-LIKE TYPES -----
-- Using VARCHAR + CHECK instead of ENUM for easier migration

-- =============================================================
-- 1. REGIONS (지역 코드 마스터)
-- =============================================================
CREATE TABLE regions (
    region_id    BIGSERIAL    PRIMARY KEY,
    sido_name    VARCHAR(30)  NOT NULL,               -- 시/도 (서울특별시, 경기도 등)
    sigungu_name VARCHAR(30),                         -- 시/군/구
    dong_name    VARCHAR(30),                         -- 읍/면/동
    full_address VARCHAR(100) NOT NULL,               -- 조합 주소
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  regions IS '행정구역 마스터 테이블 - 지도 검색 필터에 활용';
COMMENT ON COLUMN regions.sido_name IS '시/도 단위 (서울특별시, 경기도 등)';

CREATE INDEX idx_regions_sido ON regions (sido_name);
CREATE INDEX idx_regions_sigungu ON regions (sido_name, sigungu_name);

-- =============================================================
-- 2. USERS (사용자)
-- =============================================================
CREATE TABLE users (
    user_id          BIGSERIAL    PRIMARY KEY,
    social_uid       VARCHAR(255) NOT NULL,            -- OAuth provider unique ID
    auth_provider    VARCHAR(20)  NOT NULL,            -- google | kakao
    nickname         VARCHAR(50)  NOT NULL,
    gender           CHAR(1),                          -- M | F | NULL
    date_of_birth    DATE,
    region_id        BIGINT       REFERENCES regions(region_id),
    is_notification_on BOOLEAN    NOT NULL DEFAULT false,
    is_deleted       BOOLEAN      NOT NULL DEFAULT false,
    last_logged_in_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ,

    CONSTRAINT uq_users_social UNIQUE (auth_provider, social_uid),
    CONSTRAINT chk_users_gender CHECK (gender IN ('M', 'F')),
    CONSTRAINT chk_users_provider CHECK (auth_provider IN ('google', 'kakao'))
);

COMMENT ON TABLE  users IS '일반 사용자 계정 (OAuth 소셜 로그인)';
COMMENT ON COLUMN users.social_uid IS 'OAuth 제공자에서 발급한 고유 식별자';
COMMENT ON COLUMN users.is_deleted IS '소프트 삭제 플래그';

CREATE INDEX idx_users_provider_uid ON users (auth_provider, social_uid);
CREATE INDEX idx_users_region ON users (region_id) WHERE is_deleted = false;
CREATE INDEX idx_users_created ON users (created_at);

-- =============================================================
-- 3. UPLOADER_PROFILES (업로더 확장 프로필)
-- =============================================================
CREATE TABLE uploader_profiles (
    uploader_id      BIGSERIAL    PRIMARY KEY,
    user_id          BIGINT       NOT NULL UNIQUE REFERENCES users(user_id),
    organization_name VARCHAR(100) NOT NULL,           -- 소속 기관/단체명
    contact_phone    VARCHAR(20)  NOT NULL,
    contact_email    VARCHAR(255) NOT NULL,
    approval_status  VARCHAR(20)  NOT NULL DEFAULT 'pending',
    approved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_uploader_status CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT chk_uploader_email CHECK (contact_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

COMMENT ON TABLE  uploader_profiles IS '업로더(축제 기획자/단체) 추가 프로필 - users 1:1 확장';
COMMENT ON COLUMN uploader_profiles.organization_name IS '소속 기관 또는 단체명';

CREATE INDEX idx_uploader_status ON uploader_profiles (approval_status);

-- =============================================================
-- 4. EVENT_CATEGORIES (이벤트 카테고리 마스터)
-- =============================================================
CREATE TABLE event_categories (
    category_id   BIGSERIAL    PRIMARY KEY,
    category_code VARCHAR(30)  NOT NULL UNIQUE,        -- festival, expo, symposium, conference
    display_name  VARCHAR(50)  NOT NULL,               -- 축제, 박람회, 심포지움, 컨퍼런스
    sort_order    SMALLINT     NOT NULL DEFAULT 0,
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE event_categories IS '이벤트 유형 마스터 - 전체목록조회 필터 버튼에 대응';

-- =============================================================
-- 5. EVENTS (이벤트/축제)
-- =============================================================
CREATE TABLE events (
    event_id            BIGSERIAL    PRIMARY KEY,
    uploader_id         BIGINT       REFERENCES uploader_profiles(uploader_id),  -- NULL if crawled
    category_id         BIGINT       NOT NULL REFERENCES event_categories(category_id),
    region_id           BIGINT       NOT NULL REFERENCES regions(region_id),
    source_type         VARCHAR(20)  NOT NULL,           -- crawled | uploaded
    crawl_origin        VARCHAR(50),                     -- public_data_portal, seoul_open_data 등
    external_source_id  VARCHAR(100),                    -- 크롤링 원본 ID (중복 방지)
    title               VARCHAR(200) NOT NULL,
    description         TEXT,
    address_detail      VARCHAR(255),                    -- 상세 주소
    latitude            DECIMAL(10,7),
    longitude           DECIMAL(10,7),
    start_date          DATE         NOT NULL,
    end_date            DATE         NOT NULL,
    operating_hours     VARCHAR(100),                    -- 운영 시간 텍스트
    target_audience     VARCHAR(100),                    -- 대상 (전 연령, 성인 등)
    admission_fee       VARCHAR(100),                    -- 가격 정보 텍스트
    companion_primary   VARCHAR(20),                     -- 기대 동행 유형 1순위
    companion_secondary VARCHAR(20),                     -- 기대 동행 유형 2순위
    poster_image_url    VARCHAR(500),
    approval_status     VARCHAR(20)  NOT NULL DEFAULT 'pending',
    phase               VARCHAR(20)  NOT NULL DEFAULT 'upcoming',
    bookmark_count      INT          NOT NULL DEFAULT 0, -- 비정규화 캐시
    avg_rating          DECIMAL(3,2) NOT NULL DEFAULT 0, -- 비정규화 캐시
    review_count        INT          NOT NULL DEFAULT 0, -- 비정규화 캐시
    is_deleted          BOOLEAN      NOT NULL DEFAULT false,
    approved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT chk_events_source CHECK (source_type IN ('crawled', 'uploaded')),
    CONSTRAINT chk_events_approval CHECK (approval_status IN ('pending', 'approved', 'on_hold', 'rejected')),
    CONSTRAINT chk_events_phase CHECK (phase IN ('upcoming', 'ongoing', 'ended')),
    CONSTRAINT chk_events_companion CHECK (companion_primary IN ('family', 'friend', 'couple', 'solo')),
    CONSTRAINT chk_events_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_events_rating CHECK (avg_rating >= 0 AND avg_rating <= 5),
    CONSTRAINT uq_events_external UNIQUE (crawl_origin, external_source_id)
);

COMMENT ON TABLE  events IS '이벤트/축제 통합 테이블 - 크롤링 + 업로더 등록 데이터 공존';
COMMENT ON COLUMN events.source_type IS 'crawled: 크롤링 수집, uploaded: 업로더 직접 등록';
COMMENT ON COLUMN events.bookmark_count IS '비정규화 집계 캐시 - 북마크 CUD 시 트리거/앱단 갱신';
COMMENT ON COLUMN events.avg_rating IS '비정규화 집계 캐시 - 리뷰 CUD 시 갱신';
COMMENT ON COLUMN events.phase IS 'upcoming/ongoing/ended - 배치 또는 스케줄러로 자동 갱신';

-- 필터 검색 핵심 인덱스
CREATE INDEX idx_events_filter ON events (region_id, category_id, start_date, phase)
    WHERE is_deleted = false AND approval_status = 'approved';
CREATE INDEX idx_events_phase ON events (phase, start_date)
    WHERE is_deleted = false AND approval_status = 'approved';
CREATE INDEX idx_events_approval ON events (approval_status, created_at)
    WHERE is_deleted = false;
CREATE INDEX idx_events_uploader ON events (uploader_id)
    WHERE uploader_id IS NOT NULL;
CREATE INDEX idx_events_geo ON events (latitude, longitude)
    WHERE is_deleted = false AND approval_status = 'approved';
CREATE INDEX idx_events_dates ON events (start_date, end_date)
    WHERE is_deleted = false AND approval_status = 'approved';
-- 전문 검색용 (제목 + 설명)
CREATE INDEX idx_events_title_trgm ON events USING gin (title gin_trgm_ops)
    WHERE is_deleted = false;

-- =============================================================
-- 6. EVENT_TENDENCY_LABELS (축제 성향 라벨 마스터)
-- =============================================================
CREATE TABLE event_tendency_labels (
    label_id    BIGSERIAL    PRIMARY KEY,
    label_name  VARCHAR(50)  NOT NULL UNIQUE,          -- 활동적, 정적, 문화체험 등
    label_group VARCHAR(30)  NOT NULL,                 -- mood | activity | theme
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_label_group CHECK (label_group IN ('mood', 'activity', 'theme'))
);

COMMENT ON TABLE event_tendency_labels IS '축제 성향 라벨 마스터 - 관리자가 이벤트에 부여';

-- =============================================================
-- 7. EVENT_LABEL_ASSIGNMENTS (이벤트-라벨 매핑)
-- =============================================================
CREATE TABLE event_label_assignments (
    assignment_id BIGSERIAL   PRIMARY KEY,
    event_id      BIGINT      NOT NULL REFERENCES events(event_id),
    label_id      BIGINT      NOT NULL REFERENCES event_tendency_labels(label_id),
    assigned_by   BIGINT      NOT NULL REFERENCES users(user_id),  -- 부여한 관리자
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_event_label UNIQUE (event_id, label_id)
);

COMMENT ON TABLE event_label_assignments IS '이벤트별 성향 라벨 매핑 - 관리자 승인 시 부여';

CREATE INDEX idx_label_assign_event ON event_label_assignments (event_id);
CREATE INDEX idx_label_assign_label ON event_label_assignments (label_id);

-- =============================================================
-- 8. APPROVAL_DOCUMENTS (승인 서류 첨부)
-- =============================================================
CREATE TABLE approval_documents (
    document_id       BIGSERIAL    PRIMARY KEY,
    event_id          BIGINT       NOT NULL REFERENCES events(event_id),
    file_path         VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type         VARCHAR(30)  NOT NULL,
    file_size_bytes   INT          NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_doc_mime CHECK (mime_type IN ('image/jpeg', 'image/png')),
    CONSTRAINT chk_doc_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760)  -- 10MB
);

COMMENT ON TABLE approval_documents IS '업로더 이벤트 등록 시 첨부하는 상위기관 승인 서류';

CREATE INDEX idx_approval_docs_event ON approval_documents (event_id);

-- =============================================================
-- 9. APPROVAL_LOGS (승인 이력)
-- =============================================================
CREATE TABLE approval_logs (
    log_id     BIGSERIAL    PRIMARY KEY,
    event_id   BIGINT       NOT NULL REFERENCES events(event_id),
    admin_id   BIGINT       NOT NULL REFERENCES users(user_id),
    action     VARCHAR(20)  NOT NULL,
    reason     TEXT,                                    -- 보류/거절 시 사유
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_approval_action CHECK (action IN ('approved', 'on_hold', 'rejected'))
);

COMMENT ON TABLE approval_logs IS '관리자 승인/보류/거절 처리 이력 - 감사 추적용';

CREATE INDEX idx_approval_logs_event ON approval_logs (event_id, created_at DESC);
CREATE INDEX idx_approval_logs_admin ON approval_logs (admin_id, created_at DESC);

-- =============================================================
-- 10. BOOKMARKS (북마크/찜)
-- =============================================================
CREATE TABLE bookmarks (
    bookmark_id BIGSERIAL   PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(user_id),
    event_id    BIGINT      NOT NULL REFERENCES events(event_id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_bookmark UNIQUE (user_id, event_id)
);

COMMENT ON TABLE bookmarks IS '사용자 이벤트 북마크 - 마이페이지 캘린더 연동';

CREATE INDEX idx_bookmarks_user ON bookmarks (user_id, created_at DESC);
CREATE INDEX idx_bookmarks_event ON bookmarks (event_id);

-- =============================================================
-- 11. REVIEWS (리뷰)
-- =============================================================
CREATE TABLE reviews (
    review_id   BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(user_id),
    event_id    BIGINT       NOT NULL REFERENCES events(event_id),
    body        TEXT         NOT NULL,
    rating      SMALLINT     NOT NULL,
    sentiment   VARCHAR(10),                            -- AI 감성분석 결과
    is_deleted  BOOLEAN      NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,

    CONSTRAINT chk_review_rating CHECK (rating >= 1 AND rating <= 5),
    CONSTRAINT chk_review_sentiment CHECK (sentiment IN ('positive', 'negative', 'neutral')),
    CONSTRAINT uq_review_per_event UNIQUE (user_id, event_id)
);

COMMENT ON TABLE  reviews IS '이벤트 리뷰 - 1인 1이벤트 1리뷰, 감성분석 결과 포함';
COMMENT ON COLUMN reviews.sentiment IS 'AI 기반 감성분석 결과 - 긍정/부정 대표 케이스 노출에 활용';

CREATE INDEX idx_reviews_event ON reviews (event_id, created_at DESC) WHERE is_deleted = false;
CREATE INDEX idx_reviews_user ON reviews (user_id, created_at DESC) WHERE is_deleted = false;
CREATE INDEX idx_reviews_sentiment ON reviews (event_id, sentiment) WHERE is_deleted = false;

-- =============================================================
-- 12. NOTIFICATIONS (알림)
-- =============================================================
CREATE TABLE notifications (
    notification_id BIGSERIAL   PRIMARY KEY,
    user_id         BIGINT      NOT NULL REFERENCES users(user_id),
    event_id        BIGINT      REFERENCES events(event_id),  -- nullable for system notifications
    title           VARCHAR(100) NOT NULL,
    message         TEXT         NOT NULL,
    scheduled_at    TIMESTAMPTZ  NOT NULL,
    is_sent         BOOLEAN      NOT NULL DEFAULT false,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_notif_sent CHECK (
        (is_sent = false AND sent_at IS NULL) OR
        (is_sent = true AND sent_at IS NOT NULL)
    )
);

COMMENT ON TABLE notifications IS '사용자 알림 - 이벤트 일정 기반 예약 발송';

CREATE INDEX idx_notif_pending ON notifications (scheduled_at)
    WHERE is_sent = false;
CREATE INDEX idx_notif_user ON notifications (user_id, created_at DESC);

-- =============================================================
-- 13. SEARCH_LOGS (검색 이력)
-- =============================================================
CREATE TABLE search_logs (
    log_id        BIGSERIAL    PRIMARY KEY,
    user_id       BIGINT       NOT NULL REFERENCES users(user_id),
    search_type   VARCHAR(10)  NOT NULL,
    search_params JSONB        NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_search_type CHECK (search_type IN ('filter', 'chat'))
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE search_logs IS '검색 이력 로그 - 날짜 기반 파티셔닝, 90일 보관';

-- 분기별 파티션 예시
CREATE TABLE search_logs_2026_q2 PARTITION OF search_logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE search_logs_2026_q3 PARTITION OF search_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');

CREATE INDEX idx_search_logs_user ON search_logs (user_id, created_at DESC);

-- =============================================================
-- 14. CHAT_SESSIONS (채팅 세션)
-- =============================================================
CREATE TABLE chat_sessions (
    session_id  BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(user_id),
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ended_at    TIMESTAMPTZ
);

COMMENT ON TABLE chat_sessions IS 'LLM 대화 검색 세션';

CREATE INDEX idx_chat_sessions_user ON chat_sessions (user_id, created_at DESC);

-- =============================================================
-- 15. CHAT_MESSAGES (채팅 메시지)
-- =============================================================
CREATE TABLE chat_messages (
    message_id  BIGSERIAL    PRIMARY KEY,
    session_id  BIGINT       NOT NULL REFERENCES chat_sessions(session_id),
    sender_type VARCHAR(10)  NOT NULL,
    body        TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_msg_sender CHECK (sender_type IN ('user', 'assistant'))
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE chat_messages IS 'LLM 채팅 메시지 로그 - 날짜 기반 파티셔닝';

CREATE TABLE chat_messages_2026_q2 PARTITION OF chat_messages
    FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE chat_messages_2026_q3 PARTITION OF chat_messages
    FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');

CREATE INDEX idx_chat_msg_session ON chat_messages (session_id, created_at);

-- =============================================================
-- 16. NEWS_ARTICLES (뉴스 기사 원본)
-- =============================================================
CREATE TABLE news_articles (
    article_id       BIGSERIAL    PRIMARY KEY,
    source_name      VARCHAR(30)  NOT NULL DEFAULT 'donga',
    author_name      VARCHAR(50),
    article_category VARCHAR(50),                      -- 기사 분류 (문화, 사회, 지역 등)
    title            VARCHAR(300) NOT NULL,
    original_url     VARCHAR(500) NOT NULL UNIQUE,     -- 중복 크롤링 방지
    content_body     TEXT,                             -- 기사 본문 전체
    summary          TEXT,                             -- AI 요약본
    metadata         JSONB        NOT NULL DEFAULT '{}',
    published_at     TIMESTAMPTZ,
    crawled_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  news_articles IS '동아일보 등 뉴스 기사 원본 - 크롤링 수집 데이터';
COMMENT ON COLUMN news_articles.content_body IS '기사 본문 전체 - 이벤트 매칭 및 AI 요약에 활용';
COMMENT ON COLUMN news_articles.summary IS 'AI 자동 생성 요약문';
COMMENT ON COLUMN news_articles.metadata IS '추가 메타데이터 (태그, 섹션, 조회수 등)';

CREATE INDEX idx_articles_published ON news_articles (published_at DESC);
CREATE INDEX idx_articles_source ON news_articles (source_name, published_at DESC);
CREATE INDEX idx_articles_title_trgm ON news_articles USING gin (title gin_trgm_ops);

-- =============================================================
-- 17. EVENT_ARTICLE_MAPPINGS (이벤트-기사 매핑)
-- =============================================================
CREATE TABLE event_article_mappings (
    mapping_id      BIGSERIAL    PRIMARY KEY,
    event_id        BIGINT       NOT NULL REFERENCES events(event_id),
    article_id      BIGINT       NOT NULL REFERENCES news_articles(article_id),
    relevance_score DECIMAL(5,4) NOT NULL DEFAULT 0,   -- 0.0000 ~ 1.0000
    matched_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_event_article UNIQUE (event_id, article_id),
    CONSTRAINT chk_relevance CHECK (relevance_score >= 0 AND relevance_score <= 1)
);

COMMENT ON TABLE event_article_mappings IS '이벤트-기사 N:M 매핑 - 관련도 점수 포함';

CREATE INDEX idx_event_article_event ON event_article_mappings (event_id, relevance_score DESC);
CREATE INDEX idx_event_article_article ON event_article_mappings (article_id);

-- =============================================================
-- 18. PHOTO_ALBUMS (사진 앨범)
-- =============================================================
CREATE TABLE photo_albums (
    album_id    BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(user_id),
    event_id    BIGINT       REFERENCES events(event_id),  -- nullable: 이벤트 미연결 앨범 가능
    album_name  VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE photo_albums IS '사용자 사진 앨범 - 이벤트별 자동/수동 그룹핑';

CREATE INDEX idx_albums_user ON photo_albums (user_id, created_at DESC);
CREATE INDEX idx_albums_event ON photo_albums (event_id) WHERE event_id IS NOT NULL;

-- =============================================================
-- 19. PHOTOS (사진)
-- =============================================================
CREATE TABLE photos (
    photo_id          BIGSERIAL    PRIMARY KEY,
    album_id          BIGINT       NOT NULL REFERENCES photo_albums(album_id),
    file_path         VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    ai_tags           JSONB        NOT NULL DEFAULT '{}',   -- AI 이미지 인식 태그
    taken_at          TIMESTAMPTZ,                          -- EXIF 촬영일시
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  photos IS '사진 개별 파일 메타데이터 - 실제 파일은 오브젝트 스토리지';
COMMENT ON COLUMN photos.ai_tags IS 'AI 이미지 인식 태그 (장소, 인물수, 분위기 등)';

CREATE INDEX idx_photos_album ON photos (album_id, created_at DESC);
CREATE INDEX idx_photos_ai_tags ON photos USING gin (ai_tags);

-- =============================================================
-- 20. USER_TASTE_PROFILES (사용자 취향 프로필)
-- =============================================================
CREATE TABLE user_taste_profiles (
    profile_id      BIGSERIAL    PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users(user_id),
    taste_dimension VARCHAR(30)  NOT NULL,              -- activity_level, preferred_scale, social_style
    taste_value     VARCHAR(30)  NOT NULL,              -- active, calm, large_scale, intimate, solo, group
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_user_taste UNIQUE (user_id, taste_dimension)
);

COMMENT ON TABLE user_taste_profiles IS '사용자 축제 취향 프로필 - 추천 알고리즘 및 라벨링에 활용';

CREATE INDEX idx_taste_user ON user_taste_profiles (user_id);

-- =============================================================
-- TRIGGERS: updated_at 자동 갱신
-- =============================================================
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_uploader_profiles_updated
    BEFORE UPDATE ON uploader_profiles FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_events_updated
    BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_reviews_updated
    BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_photo_albums_updated
    BEFORE UPDATE ON photo_albums FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_user_taste_updated
    BEFORE UPDATE ON user_taste_profiles FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =============================================================
-- EXTENSIONS (필요 시 활성화)
-- =============================================================
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- trigram 기반 유사 검색
-- CREATE EXTENSION IF NOT EXISTS postgis;     -- 위치 기반 반경 검색
-- CREATE EXTENSION IF NOT EXISTS pgvector;    -- 벡터 유사도 검색 (기사 매칭)
