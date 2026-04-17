---
title: ADR 0001 — DDL v3 ↔ 용어집 v5 정합성 정리
type: topic
created: 2026-04-17
updated: 2026-04-17
sources: [2026-04-17_requirements-v5, 2026-04-16_event-curation-ddl, 2026-04-16_db-design-spec]
related:
  - ../sources/2026-04-17_requirements-v5.md
  - ../sources/2026-04-16_event-curation-ddl.md
  - terminology-glossary.md
  - event-state-machine.md
  - db-schema-overview.md
  - roles-and-active-role.md
  - filters-5-types.md
---

# ADR 0001 — DDL v3 ↔ 용어집 v5 정합성 정리

**상태**: Accepted (2026-04-17) · **원문**: [`docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md`](../../../docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md)

## Summary

요구사항정의서 v5.0 Ⅴ장 용어집이 "DB 컬럼명·enum의 유일한 근거"로 지정되었으나, 선행 작성된 DDL v3와 **7건의 불일치**가 존재했다. 본 ADR은 7건 모두 용어집/권장안 기준으로 확정하여 Phase 1 Prisma 마이그레이션(DDL v4)의 기준선을 제공한다. 테이블 수는 20 → **22개**로 증가(admin_profiles, review_photos, event_subscriptions 신설 – event_subscriptions는 #7, 나머지 2개는 #3/#6).

## 확정 결정 (7건)

| # | 항목 | 확정 |
|---|---|---|
| 1 | `approval_status` enum | `on_hold` → `revision_requested` rename. events + uploader_profiles + approval_logs.action 대칭 적용 |
| 2 | `active_role` 컬럼 | `users.active_role VARCHAR(20) NOT NULL DEFAULT 'user'` + `CHECK IN (user, uploader)` |
| 3 | admin 식별 수단 | **`admin_profiles` 전용 테이블 신설** (users 1:1, uploader_profiles와 대칭). `scope IN (full, content_only, uploader_review_only)` |
| 4 | companion 컬럼 rename | `companion_primary/secondary` → `expected_companion_primary/_secondary` |
| 5 | 라벨 테이블 rename | `event_tendency_labels` → `event_vibes`, `event_label_assignments` → `event_vibe_assignments` (인덱스명도 동시 변경) |
| 6 | 리뷰 사진 매핑 | **`review_photos` 전용 테이블 신설** (review_id FK, CASCADE). photos/photo_albums와 혼합 안 함 |
| 7 | 조건 기반 알림 | **`event_subscriptions` 테이블 신설** (region_ids 배열, period_months, is_active). 발송 트리거 = 이벤트 approved **직후 동기** fan-out → notifications |

## Key points

### DDL v4 마이그레이션 전략
- 본 ADR은 **결정만** 확정. 실제 실행은 Phase 1에서 Prisma 마이그레이션으로 `infra/db/migrations/` 에 기록.
- ADR §3-1에 참조용 SQL 프리뷰 수록 (ALTER TABLE · DROP/ADD CONSTRAINT · CREATE TABLE · UPDATE 데이터 치환).
- 현 Phase 0 시점엔 실제 DB 상태를 변경하지 않으며, 문서·wiki만 확정본 기준으로 재작성.

### 적용 대상 위키 페이지 (sweep 완료)
- [terminology-glossary.md](terminology-glossary.md) — §2/3/5 표에 "DDL v3 원본 / 확정" 2열 구조 도입.
- [event-state-machine.md](event-state-machine.md) — approval_status/approval_logs.action/라이프사이클 3곳.
- [db-schema-overview.md](db-schema-overview.md) — §1~§4 전반 rename + 신설 테이블 반영 + ER 다이어그램.
- [roles-and-active-role.md](roles-and-active-role.md) — §DB 표현.
- [filters-5-types.md](filters-5-types.md) — §3 인원구성 + §5 성향.
- [sources/2026-04-17_requirements-v5.md](../sources/2026-04-17_requirements-v5.md), [sources/2026-04-16_event-curation-ddl.md](../sources/2026-04-16_event-curation-ddl.md), [sources/2026-04-16_db-design-spec.md](../sources/2026-04-16_db-design-spec.md) — Open questions에 해소 링크.

### 후속 액션
- [ ] Phase 1: Prisma 스키마로 DDL v4 전환 (`apps/bff/prisma/schema.prisma`).
- [ ] Phase 1: `admin_profiles` 시드 데이터 + 관리자 계정 생성 플로우 (ADR 0001 §3 후속 — 별도 ADR 후보).
- [ ] `review_photos` 업로드 플로우: 프리사인드 URL → MinIO `ggdrugs-review-photos` 버킷.
- [ ] `event_subscriptions` fan-out 구현 위치 결정 (BFF 트랜잭션 내부 vs LLM 서비스 이벤트 수신). 현재 권장: BFF 동기.

## Open questions / contradictions

1. `admin_profiles.scope` 세 값의 실제 권한 범위 매트릭스 미정 — Phase 1 인증·인가 설계 시 확정.
2. 관리자 전용 계정 생성 플로우 미정 (시스템 시드 / 기존 관리자의 승격 / DB 수동 삽입). ADR 후속 산출 필요.
3. `event_subscriptions` 중복 알림 방지 전략 미정 — 같은 user+event 조합이 여러 subscription에 매치될 때 1회만 보낼지 각각 보낼지.
4. rejected된 업로더 승급 신청 재신청 쿨다운 (ADR 0001 범위 외, 별도 정책 필요).

## References

- [원문 ADR 0001](../../../docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md) — §2 불일치 항목별 상세, §3-1 DDL v4 마이그레이션 SQL 프리뷰, §4 후속 산출물 목록.
- [log.md 2026-04-17T11:00](../log.md) — Accepted 기록.
