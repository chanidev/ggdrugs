---
title: DB 설계 명세서 v3 (DB_설계_명세서_v3.docx)
type: source
created: 2026-04-17
updated: 2026-04-17
sources: [2026-04-16_db-design-spec]
related:
  - 2026-04-16_event-curation-ddl.md
  - ../topics/db-schema-overview.md
  - ../topics/event-state-machine.md
---

# DB 설계 명세서 v3

## Summary

2026.04 기준 GGdrugs PostgreSQL 스키마 3차 설계 명세서. 20개 테이블에 대한 컬럼 스펙과 인덱스 스펙을 표 형태로 정리한 docx 문서. 동일 일자 발행된 `event_curation_ddl_v3.sql`과 쌍을 이루며, DDL이 실행 가능한 SQL이고 이 docx는 사람이 읽기 위한 컬럼/인덱스 설명이다. 단, 요구사항정의서 v5.0 용어집과 **일부 컬럼명·enum 값 불일치**가 존재한다.

## Key points

### 테이블 20개 전체 목록
1. regions, 2. users, 3. uploader_profiles, 4. event_categories, 5. events, 6. event_tendency_labels, 7. event_label_assignments, 8. approval_documents, 9. approval_logs, 10. bookmarks, 11. reviews, 12. notifications, 13. search_logs, 14. chat_sessions, 15. chat_messages, 16. news_articles, 17. event_article_mappings, 18. photo_albums, 19. photos, 20. user_taste_profiles.

### 주요 설계 결정
- **VARCHAR + CHECK** 제약으로 enum 대체 — 마이그레이션 용이성 우선.
- **events 테이블 통합**: crawled + uploaded 공존. 크롤링 데이터는 승인 없이 approved, 업로더 데이터만 관리자 심사.
- **비정규화 집계 캐시**: events.bookmark_count, avg_rating, review_count — CUD 시 앱/트리거로 갱신.
- **RANGE 파티셔닝**: search_logs, chat_messages — created_at 기준 분기별 (90일 보관 정책).
- **GIN(trigram) 인덱스**: events.title, news_articles.title — 유사 검색.
- **photos.ai_tags**, **news_articles.metadata** 등 JSONB 다수 — GIN 인덱스.

### 인덱스 전략
- 필터 검색 핵심: `idx_events_filter(region_id, category_id, start_date, phase) WHERE approved`.
- 승인 대기열: `idx_events_approval(approval_status, created_at) WHERE NOT deleted`.
- 지리 쿼리: `idx_events_geo(latitude, longitude)` — PostGIS 본격 적용 시 GiST로 교체 필요.

## Open questions / contradictions

> [2026-04-17] 용어집 불일치 3건 전부 **ADR 0001에서 해소**: [`docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md`](../../../docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md). 본 source는 **DDL v3 발행 시점의 상태 기록**으로 유지.

- 본 docx와 요구사항정의서 v5.0 용어집 간 이름 불일치는 [`event-state-machine.md`](../topics/event-state-machine.md), [`terminology-glossary.md`](../topics/terminology-glossary.md), [`db-schema-overview.md`](../topics/db-schema-overview.md)에서 flag.
- 주요 불일치 3건 (전부 ADR 0001로 해소됨):
  1. ~~`events.approval_status`: DDL은 `on_hold` 포함 / 용어집은 `revision_requested`.~~ → ADR 0001 #1 rename 확정.
  2. ~~`events.companion_primary` + `companion_secondary` 네이밍.~~ → ADR 0001 #4 `expected_companion_primary`/`_secondary` rename 확정.
  3. ~~`users.active_role` 컬럼 부재 + admin 무표기.~~ → ADR 0001 #2(active_role 추가) + #3(admin_profiles 신설) 확정.
- 크롤링 데이터를 승인 없이 approved 처리하는 정책이 요구사항정의서에 명시되지 않음 (본 docx에만 기술). **미해결**.

## References

- [2026-04-16_db-design-spec](../../raw/DB_설계_명세서_v3.docx) — 원본 docx
- 실제 DDL: [2026-04-16_event-curation-ddl](2026-04-16_event-curation-ddl.md)
