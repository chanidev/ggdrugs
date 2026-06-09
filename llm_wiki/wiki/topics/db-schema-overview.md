---
title: DB 스키마 개요 (43 테이블)
type: topic
created: 2026-04-17
updated: 2026-04-17
sources: [2026-04-16_db-design-spec, 2026-04-16_event-curation-ddl]
related:
  - ../sources/2026-04-16_db-design-spec.md
  - ../sources/2026-04-16_event-curation-ddl.md
  - terminology-glossary.md
  - event-state-machine.md
  - adr-0001-terminology-reconciliation.md
  - adr-0002-stack-decisions.md
---

# DB 스키마 개요

## Summary

PostgreSQL **43 테이블** 구성 (`apps/bff/prisma/schema.prisma` 의 `model` 블록 수 기준). 크게 6개 도메인 그룹으로 나뉜다: 사용자·역할 / 이벤트 코어 / 승인 흐름 / 콘텐츠 상호작용 / LLM·크롤링 인프라 / Phase 2 (ADR 0007) 메이트·커뮤니티. extensions는 schema.prisma datasource 기준 postgis, pg_trgm, unaccent, citext 4종 (`postgis_topology` 는 init SQL `infra/db/init/01-postgis.sql` 에서만 활성화 — Prisma 관리 밖). pgvector는 ADR 0002로 **미도입** 확정 (벡터 검색은 Qdrant 단일 사용).

> 📌 아래 테이블명/컬럼명은 **ADR 0001 적용 후 확정본** 기준. DDL v3 원본과의 차이는 각 항목의 "← DDL v3:" 주석으로 표기. Phase 1 핵심 도메인(사용자~LLM·크롤링) 외에 Phase 2 (ADR 0007) 메이트·커뮤니티 도메인 18개 모델이 추가되어 총 **43 테이블** 이다 (아래 §6 참조).

## Key points

### 1. 사용자·역할 (3개 → ADR 0001 후 4개)
- **regions** — 행정구역 마스터 (시/도·시/군/구·읍/면/동).
- **users** — OAuth 소셜 로그인 계정. `auth_provider IN (google, kakao, dev)` **dev 추가 (마이그레이션 20260419201000, 로컬 stub 용, prod 에서는 POST /auth/dev-login 이 404)**. soft delete. **+ `active_role VARCHAR(20) NOT NULL DEFAULT 'user'`** (ADR 0001 #2). **+ Phase 2 제재 컬럼 (슬라이스8, GG-REPORT-006/007): `sanction_status` IN (none, warned, suspended) DEFAULT 'none', `sanction_expires_at` TIMESTAMPTZ, `sanction_reason` TEXT.**
- **auth_sessions** *(신설, 마이그레이션 20260419200000)* — HTTP 세션. `session_id VARCHAR(128) PK` (crypto random), `expires_at` (TTL 7d), `last_seen_at` (sliding). ChatSession(LLM 대화) 과 컨셉 분리.
- **uploader_profiles** — users 1:1 확장. 업로더 승급 후 생성. `approval_status IN (pending, approved, revision_requested, rejected)` (ADR 0001 #1 대칭 적용. ← DDL v3: `revision_requested` 부재).
- **admin_profiles** *(신설, ADR 0001 #3)* — users 1:1 확장. `scope IN ('full', 'content_only', 'uploader_review_only', 'security')` (← ADR 0005 E-3 에서 `security` 추가, 마이그레이션 `20260423100428_admin_scope_security`).

### 2. 이벤트 코어 (4개)
- **event_categories** — 종류 마스터 **8종** (festival/expo/symposium/conference/exhibition/performance/education/movie). v5.0 원안 4종에서 확장(마이그레이션 `20260418180000`). 배경은 [filters-5-types §4](filters-5-types.md) 참조.
- **events** — 통합 테이블. crawled + uploaded 공존. `approval_status IN (pending, approved, revision_requested, rejected)` (← DDL v3: `on_hold`) + `phase IN (upcoming, ongoing, ended)` 2축. `expected_companion_primary` + `_secondary` (← DDL v3: `companion_primary`/`_secondary`). 위치는 `location_geom Unsupported("geometry(Point, 4326)")` (WGS84 Point) 단일 컬럼 — lat/lng 컬럼은 DROP됨 (마이그레이션 `20260426203000_events_drop_lat_lng_columns`), 응답의 lat/lng는 ST_X/ST_Y로 derive. 비정규화 집계(bookmark_count, avg_rating, review_count).
- **event_vibes** *(← DDL v3: `event_tendency_labels`)* — 성향 라벨 마스터. `label_group IN (mood, activity, theme)`.
- **event_vibe_assignments** *(← DDL v3: `event_label_assignments`)* — 이벤트-라벨 N:M (assigned_by = 관리자 user_id).

### 3. 승인 흐름 (3개)
- **approval_documents** — 업로더 서류 첨부 (JPG/PNG 10MB 이하).
- **approval_logs** — 이벤트 심사 감사 로그 (event-scoped, `event_id` NOT NULL FK). `action IN (approved, revision_requested, rejected)` (← DDL v3: `on_hold`), reason 포함.
- **admin_audit_logs** *(신설, ADR 0004 D-6 / ADR 0005)* — admin 측 보안·운영 액션 범용 감사 로그 (event 무관). `action VARCHAR(50)` 자유 enum (CHECK 없음 — 확장 자유), `target_id BIGINT` nullable, `payload JSONB`. 사용 action 6종: `revoke_sessions / admin_promote / admin_demote / admin_scope_change / user_soft_delete / uploader_decision`. payload 표준은 [admin-account-management §audit_logs 표준 payload](admin-account-management.md) 참조.

### 4. 콘텐츠 상호작용 (6개 → ADR 0001 후 8개)
- **bookmarks** — 1:1 제약 (UNIQUE user_id, event_id).
- **reviews** — 1인 1이벤트 1리뷰. rating 1-5, sentiment(AI) positive/negative/neutral.
- **review_photos** *(신설, ADR 0001 #6)* — review_id FK + 순번, GG-REVIEW-004 최대 5장 첨부 매핑.
- **notifications** — 예약 발송. is_sent/sent_at 정합성 CHECK. **+ Phase 2 (ADR 0007) 컬럼: `read_at` (NULL=미읽음, A_500 unread 뱃지), `notification_type` IN (match_request, group_invite, appointment, kick_vote, mate_eval, chat_message), `related_entity_id` + `related_entity_type` (알림 클릭 라우팅, GG-NOTI-007).**
- **event_subscriptions** *(신설, ADR 0001 #7)* — A_203 조건 기반 신규 이벤트 알림 구독 (user_id + 필터 5종 JSONB).
- **photo_albums** — 사용자 앨범. event_id NULL 허용.
- **photos** — ai_tags JSONB + GIN 인덱스.
- **user_taste_profiles** — taste_dimension/taste_value KV 형태. 사용처: G-5 추천 시스템 일일 집계 ([recommendations.md](recommendations.md)) — 3 dimensions (`preferred_category` / `preferred_region` / `preferred_vibe`).

### 5. LLM·크롤링 (5개)
- **chat_sessions** — 채팅 검색 세션.
- **chat_messages** — user/assistant. PARTITION BY RANGE(created_at).
- **search_logs** — filter/chat 로그. search_params JSONB. 90일 보관, 분기별 파티션.
- **news_articles** — 크롤링 뉴스. title GIN(trigram).
- **event_article_mappings** — 이벤트-기사 N:M. relevance_score 0~1.

### 6. Phase 2 (ADR 0007) 메이트·커뮤니티 (18개)

ADR 0007 (Phase 2 커뮤니티·메이트 매칭)로 신설된 도메인. 표준 모델명/테이블명은 schema.prisma `@@map` 기준.

**커뮤니티(게시판, A_802)**
- **posts** *(`Post`)* — 게시판 글. category IN (festival_story, mate_finder, free), 작성 후 7일 `expires_at` 비노출(GG-POST-010/012). 비정규화 like_count/comment_count.
- **comments** *(`Comment`)* — 자기참조 1단계 대댓글(GG-POST-003). parent_comment_id NULL=최상위.
- **post_likes** *(`PostLike`)* — 좋아요 토글. UNIQUE(post_id, user_id).

**메이트 프로필·매칭(A_801/A_803/A_804)**
- **mate_profiles** *(`MateProfile`)* — users 1:1, PII. 본인/선호 조건 + selected_event_id(GG-MATCH-003) + consented_at(미동의→매칭불가).
- **mate_indexes** *(`MateIndex`)* — 메이트 지수 0~100 (기본 50).
- **match_requests** *(`MatchRequest`)* — 1:1(24h)/그룹(6h) 신청. status pending|accepted|rejected|expired|cancelled. group_batch_id(ADR 0010). **ChatSession(LLM)과 별개.**

**채팅방·그룹(A_805)**
- **chat_rooms** *(`ChatRoom`)* — 1:1/그룹(최대4인) 영속 방. Socket.IO 실시간. **ChatMessage(LLM)과 별개.**
- **chat_room_messages** *(`ChatRoomMessage`)* — text|image|sticker|system.
- **group_memberships** *(`GroupMembership`)* — 방 멤버십. role owner|member, member_status active|left|kicked|blocked, instant_kick_used(방장 1회).

**약속·평가·후기(GG-ROOM-013~020, A_900/A_901)**
- **appointments** *(`Appointment`)* — 약속 제안/동의/역제안. status proposed|confirmed|rejected|cancelled|counter_proposed (+36h).
- **appointment_votes** *(`AppointmentVote`)* — agree|reject|counter|pending. UNIQUE(appointment_id, user_id).
- **mate_evaluations** *(`MateEvaluation`)* — 메이트 평가 5문항(q1~q4 + rating_stars). reported_for nullable. UNIQUE(appointment_id, evaluator, evaluated).
- **festival_surveys** *(`FestivalSurvey`)* — 비공개 5범주 Likert(atmosphere/program/food/safety/transport). UNIQUE(appointment_id, user_id).
- **festival_reviews** *(`FestivalReview`)* — 공개 후기(GG-FEST-REVIEW-008). rating_stars + body + photo_urls(TEXT[] max10). UNIQUE(appointment_id, user_id).

**크레딧·신고·차단·업로더 서류**
- **credit_ledgers** *(`CreditLedger`)* — append-only 거래 로그. 잔액=SUM(points_amount). action: mate_eval_complete|review_complete|appointment_complete.
- **reports** *(`Report`)* — 신고(GG-REPORT-001~009). target_type post|comment|chat_message|mate_eval. status pending|reviewed|dismissed, admin_action warned|suspended|false_report.
- **blocks** *(`Block`)* — 차단. UNIQUE(blocker_id, blocked_user_id). 추천/신청/채팅에서 제외.
- **uploader_documents** *(`UploaderDocument`, ADR 0003)* — 업로더 승급 서류. event 심사용 approval_documents 와 분리.

### ER 요약 (주요 FK만)
```
regions ─┬─< users
         └─< events ──┬─< event_vibe_assignments >─ event_vibes
users ─┬─< uploader_profiles ─< events                       │
       │                                                     │
       ├─< bookmarks >─ events                 event_categories ─┘
       ├─< reviews >─ events
       ├─< notifications
       ├─< photo_albums ─< photos
       ├─< user_taste_profiles
       ├─< chat_sessions ─< chat_messages
       └─< search_logs

events ─< approval_documents
       ─< approval_logs >─ users (admin)
       ─< event_article_mappings >─ news_articles
```

### 핵심 인덱스
- `idx_events_filter (region_id, category_id, start_date, phase) WHERE approved` — 필터 검색 1차.
- `idx_events_approval (approval_status, created_at) WHERE NOT deleted` — 관리자 대기열.
- `idx_events_title_trgm GIN(title gin_trgm_ops)` — 유사 검색.
- `location_geom` 에 대한 GiST 인덱스 — PostGIS bbox/거리 쿼리용. (이전 `latitude`/`longitude` B-tree `idx_events_geo` 는 마이그레이션 `20260426203000_events_drop_lat_lng_columns` 로 제거되고 `location_geom Unsupported("geometry(Point, 4326)")` 단일 source of truth 로 전환됨.)

### 파티셔닝
- `search_logs`, `chat_messages` — RANGE(created_at), 분기별, 2026 Q2/Q3 사전 생성.

### 트리거
- `fn_set_updated_at()` BEFORE UPDATE — users, uploader_profiles, events, reviews, photo_albums, user_taste_profiles.

## Open questions / contradictions

> [2026-04-17] ADR 0001로 #1~#7 모두 해소. DDL v4 프리뷰는 [`docs/decisions/0001-*.md`](../../../docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md#3-1-ddl-v4-마이그레이션-프리뷰) §3-1 참조.

1. ~~`users.active_role` 컬럼 부재.~~ → 해소 (ADR 0001 #2).
2. ~~`role` enum / admin 식별 수단 부재.~~ → 해소 (ADR 0001 #3 — `admin_profiles` 신설).
3. ~~`approval_status` enum 값 `on_hold` vs `revision_requested`.~~ → 해소 (ADR 0001 #1).
4. ~~`companion_type` 전용 컬럼 부재~~ → 확정: DB 컬럼으로 두지 않음. API 계약 파라미터로만 존재.
5. ~~`event_vibe` 네이밍~~ → 해소 (ADR 0001 #5 — `event_vibes` rename).
6. ~~GG-REVIEW-004 리뷰 사진 첨부~~ → 해소 (ADR 0001 #6 — `review_photos` 전용 테이블).
7. ~~A_203 조건 기반 알림~~ → 해소 (ADR 0001 #7 — `event_subscriptions` 신설).
8. ~~지리 쿼리를 PostGIS GEOGRAPHY/GEOMETRY로 전환 시 events.latitude/longitude → `geom geometry(Point, 4326)` + GiST 마이그레이션 계획 필요.~~ → **해소**: lat/lng 컬럼 DROP (마이그레이션 `20260426203000_events_drop_lat_lng_columns`), `location_geom Unsupported("geometry(Point, 4326)")` + GiST 인덱스로 전환 완료.

## References

- [2026-04-16_db-design-spec](../sources/2026-04-16_db-design-spec.md) — 컬럼/인덱스 표
- [2026-04-16_event-curation-ddl](../sources/2026-04-16_event-curation-ddl.md) — 실행 가능 DDL
- `infra/db/init/01-postgis.sql` — extensions 활성화
