---
title: Event Curation DDL v3 (event_curation_ddl_v3.sql)
type: source
created: 2026-04-17
updated: 2026-04-17
sources: [2026-04-16_event-curation-ddl]
related:
  - 2026-04-16_db-design-spec.md
  - ../topics/db-schema-overview.md
  - ../topics/event-state-machine.md
  - ../topics/terminology-glossary.md
---

# Event Curation DDL v3

## Summary

실행 가능한 PostgreSQL DDL 파일. 20개 테이블 `CREATE` + 인덱스 + `fn_set_updated_at` 트리거 함수 + 6개 테이블에 BEFORE UPDATE 트리거 장착. 501 lines. extensions(pg_trgm, postgis, pgvector)는 파일 말미에 `-- CREATE EXTENSION ...` 주석 처리되어 있고, 실제 활성화는 `infra/db/init/01-postgis.sql`에서 Docker 컨테이너 초기화 시 수행.

## Key points

### 제약 전략
- `BIGSERIAL` PK, `BIGINT` FK 일관 사용.
- ENUM 대신 `VARCHAR(n) + CHECK` — 예: `chk_events_approval CHECK (approval_status IN ('pending', 'approved', 'on_hold', 'rejected'))`.
- `uq_users_social UNIQUE (auth_provider, social_uid)` — OAuth 중복 가입 차단.
- `uq_events_external UNIQUE (crawl_origin, external_source_id)` — 크롤링 중복 방지.
- `uq_review_per_event UNIQUE (user_id, event_id)` — 1인 1리뷰.
- `chk_notif_sent` — is_sent/sent_at 쌍의 정합성 (둘 다 NULL이거나 둘 다 값).

### 주요 컬럼 제약 값
- `users.auth_provider IN ('google', 'kakao')`.
- `users.gender IN ('M', 'F')` — NULL 허용.
- `uploader_profiles.approval_status IN ('pending', 'approved', 'rejected')` — **revision_requested 없음**.
- `events.source_type IN ('crawled', 'uploaded')`.
- `events.approval_status IN ('pending', 'approved', 'on_hold', 'rejected')`.
- `events.phase IN ('upcoming', 'ongoing', 'ended')` — approval_status와 별개 라이프사이클.
- `events.companion_primary IN ('family', 'friend', 'couple', 'solo')` (+ `companion_secondary` 동일 도메인).
- `event_tendency_labels.label_group IN ('mood', 'activity', 'theme')`.
- `approval_documents.mime_type IN ('image/jpeg', 'image/png')`, file_size_bytes ≤ 10MB.
- `approval_logs.action IN ('approved', 'on_hold', 'rejected')`.
- `reviews.rating BETWEEN 1 AND 5`, `sentiment IN ('positive', 'negative', 'neutral')`.
- `search_logs.search_type IN ('filter', 'chat')`.
- `chat_messages.sender_type IN ('user', 'assistant')`.

### 트리거
- `fn_set_updated_at()` — 공통 함수.
- 장착 테이블(6): users, uploader_profiles, events, reviews, photo_albums, user_taste_profiles.

### 파티셔닝
- `search_logs`, `chat_messages` — PARTITION BY RANGE (created_at).
- 2026 Q2, Q3 파티션 사전 생성.

## Open questions / contradictions

> [2026-04-17] 아래 불일치는 **ADR 0001에서 일괄 해소**: [`docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md`](../../../docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md). 본 source는 **DDL v3 원본 상태 기록**으로 유지, Phase 1 Prisma 마이그레이션에서 v4로 전환.

- ~~`approval_status`에 `on_hold` 존재~~ → **해소**: ADR 0001 #1 — `revision_requested`로 rename (events + uploader_profiles + approval_logs.action 대칭 적용).
- 용어집의 `ended`는 `approval_status`가 아니라 DDL의 `events.phase`에 들어감. 즉 상태 머신이 두 컬럼에 분산 — **확정**: 관리자 판단(approval_status)과 시간 기반(phase)의 의도적 분리 (`event-state-machine.md` 정본).
- ~~`companion_primary`/`secondary` 네이밍~~ → **해소**: ADR 0001 #4 — `expected_companion_primary`/`_secondary`로 rename.
- ~~`active_role` 컬럼 없음~~ → **해소**: ADR 0001 #2 — `users.active_role VARCHAR(20) NOT NULL DEFAULT 'user'` 추가.
- ~~`admin` 역할 판별 컬럼 없음~~ → **해소**: ADR 0001 #3 — `admin_profiles` 전용 테이블 신설.
- ~~`reviews` 테이블에 사진 첨부 FK 없음~~ → **해소**: ADR 0001 #6 — `review_photos` 전용 테이블 신설 (GG-REVIEW-004 최대 5장 매핑).
- extensions는 DDL 말미 주석 처리됨 — 실제 활성화는 `infra/db/init/01-postgis.sql`에 의존. **미해결**(설계 의도적 분리로 추정).

## References

- [2026-04-16_event-curation-ddl](../../raw/event_curation_ddl_v3.sql) — 원본 DDL
- 설명 문서: [2026-04-16_db-design-spec](2026-04-16_db-design-spec.md)
