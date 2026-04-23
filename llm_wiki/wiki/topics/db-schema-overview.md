---
title: DB 스키마 개요 (20 테이블)
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

PostgreSQL **23 테이블** 구성. 크게 5개 도메인 그룹으로 나뉜다: 사용자·역할 / 이벤트 코어 / 승인 흐름 / 콘텐츠 상호작용 / LLM·크롤링 인프라. extensions는 postgis, postgis_topology, pg_trgm, unaccent, citext (`infra/db/init/01-postgis.sql` 참조). pgvector는 ADR 0002로 **미도입** 확정 (벡터 검색은 Qdrant 단일 사용).

> 📌 아래 테이블명/컬럼명은 **ADR 0001 적용 후 확정본** 기준. DDL v3 원본과의 차이는 각 항목의 "← DDL v3:" 주석으로 표기. 22 → **23 테이블** 증가는 ADR 0004 D-6 의 `admin_audit_logs` 신설 (마이그레이션 `20260423092543_admin_audit_logs`).

## Key points

### 1. 사용자·역할 (3개 → ADR 0001 후 4개)
- **regions** — 행정구역 마스터 (시/도·시/군/구·읍/면/동).
- **users** — OAuth 소셜 로그인 계정. `auth_provider IN (google, kakao, dev)` **dev 추가 (마이그레이션 20260419201000, 로컬 stub 용, prod 에서는 POST /auth/dev-login 이 404)**. soft delete. **+ `active_role VARCHAR(20) NOT NULL DEFAULT 'user'`** (ADR 0001 #2).
- **auth_sessions** *(신설, 마이그레이션 20260419200000)* — HTTP 세션. `session_id VARCHAR(128) PK` (crypto random), `expires_at` (TTL 7d), `last_seen_at` (sliding). ChatSession(LLM 대화) 과 컨셉 분리.
- **uploader_profiles** — users 1:1 확장. 업로더 승급 후 생성. `approval_status IN (pending, approved, revision_requested, rejected)` (ADR 0001 #1 대칭 적용. ← DDL v3: `revision_requested` 부재).
- **admin_profiles** *(신설, ADR 0001 #3)* — users 1:1 확장. `scope IN ('full', 'content_only', 'uploader_review_only', 'security')` (← ADR 0005 E-3 에서 `security` 추가, 마이그레이션 `20260423100428_admin_scope_security`).

### 2. 이벤트 코어 (4개)
- **event_categories** — 종류 마스터 **8종** (festival/expo/symposium/conference/exhibition/performance/education/movie). v5.0 원안 4종에서 확장(마이그레이션 `20260418180000`). 배경은 [filters-5-types §4](filters-5-types.md) 참조.
- **events** — 통합 테이블. crawled + uploaded 공존. `approval_status IN (pending, approved, revision_requested, rejected)` (← DDL v3: `on_hold`) + `phase IN (upcoming, ongoing, ended)` 2축. `expected_companion_primary` + `_secondary` (← DDL v3: `companion_primary`/`_secondary`). 비정규화 집계(bookmark_count, avg_rating, review_count).
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
- **notifications** — 예약 발송. is_sent/sent_at 정합성 CHECK.
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
- `idx_events_geo (latitude, longitude)` — 현재는 B-tree. PostGIS 쿼리 본격 사용 시 GiST로 교체 필요.

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
8. 지리 쿼리를 PostGIS GEOGRAPHY/GEOMETRY로 전환 시 events.latitude/longitude → `geom geometry(Point, 4326)` + `idx_events_geom GIST` 마이그레이션 계획 필요. **미해결** — Phase 1 이후 성능 프로파일링 후 재평가.

## References

- [2026-04-16_db-design-spec](../sources/2026-04-16_db-design-spec.md) — 컬럼/인덱스 표
- [2026-04-16_event-curation-ddl](../sources/2026-04-16_event-curation-ddl.md) — 실행 가능 DDL
- `infra/db/init/01-postgis.sql` — extensions 활성화
