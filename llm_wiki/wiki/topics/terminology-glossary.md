---
title: 용어집 (Terminology Glossary)
type: topic
created: 2026-04-17
updated: 2026-04-17
sources: [2026-04-17_requirements-v5, 2026-04-16_db-design-spec, 2026-04-16_event-curation-ddl]
related:
  - ../sources/2026-04-17_requirements-v5.md
  - event-state-machine.md
  - filters-5-types.md
  - roles-and-active-role.md
  - db-schema-overview.md
  - adr-0001-terminology-reconciliation.md
---

# 용어집 (Terminology Glossary)

## Summary

요구사항정의서 v5.0 Ⅴ장을 정본으로 하는 용어 통일 레퍼런스. CLAUDE.md는 "DB 컬럼명·enum 도메인의 유일한 근거"로 이 용어집을 지정한다. 본 페이지는 용어집 내용을 정리하면서 DDL v3의 실제 컬럼명과의 **불일치**(ADR 0001로 해소됨)를 함께 기록한다. 표의 "DDL v3" 열은 원본 상태이며, **"확정"(ADR 0001 적용 후)** 열이 Phase 1에서 적용되는 최종값이다.

## Key points

### 1. 이벤트 계층
| 용어집 | DDL v3 실제 컬럼 | 비고 |
|---|---|---|
| event (상위 개념) | `events` 테이블 | 일치 |
| event_type {축제, 박람회, 심포지움, 컨퍼런스} | `event_categories.category_code` (FK via `events.category_id`) | ⚠ 네이밍 차이 — event_type 개념이 별도 마스터 테이블로 정규화됨 |
| festival | `event_categories.category_code = 'festival'` | 일치 |

### 2. 분류·라벨
| 용어집 | DDL v3 원본 | 확정 (ADR 0001 적용 후) | 비고 |
|---|---|---|---|
| event_vibe | `event_tendency_labels` + `event_label_assignments` | `event_vibes` + `event_vibe_assignments` | ADR 0001 #5 rename |
| companion_type (방문자, 필터) | 명시 컬럼 없음 | DB 컬럼 미생성 — API 파라미터 전용 | ADR 0001 #4로 확정 (search_params JSONB 키) |
| expected_companion (업로더, 상위 2개) | `events.companion_primary` + `events.companion_secondary` | `events.expected_companion_primary` + `_secondary` | ADR 0001 #4 rename |

### 3. 역할 (role)
| 용어집 | DDL v3 원본 | 확정 (ADR 0001 적용 후) | 비고 |
|---|---|---|---|
| role {user, uploader, admin} | `users` + `uploader_profiles`(1:1), admin 마커 없음 | `users` + `uploader_profiles` + `admin_profiles`(신설) | ADR 0001 #3 — admin_profiles에 scope 컬럼 |
| active_role | 없음 | `users.active_role VARCHAR(20) NOT NULL DEFAULT 'user'` | ADR 0001 #2 |

### 4. 기간 (period)
| 용어집 | DDL v3 실제 | 비고 |
|---|---|---|
| period {3m, 6m, all, custom} | `events.start_date`, `end_date` DATE 컬럼으로 파생 | 쿼리 시점 필터 — 테이블 컬럼으로는 불필요 |
| 과거 이벤트 | `events.phase = 'ended'` | 일치 |
| 예정 이벤트 | `events.phase = 'upcoming'` | 일치 |

### 5. 이벤트 상태 (state)
| 용어집 | DDL v3 원본 | 확정 (ADR 0001 적용 후) | 비고 |
|---|---|---|---|
| pending | `events.approval_status = 'pending'` | 동일 | 일치 |
| revision_requested | `events.approval_status = 'on_hold'` | `events.approval_status = 'revision_requested'` | ADR 0001 #1 rename |
| rejected | `events.approval_status = 'rejected'` | 동일 | 일치 |
| approved | `events.approval_status = 'approved'` | 동일 | 일치 |
| ended | `events.phase = 'ended'` | 동일 | 상태 머신이 `approval_status` + `phase` 두 컬럼에 분산 (의도된 설계) |

### 6. 기술 용어
- **BFF**: Node.js + Express + Prisma. 프론트 전용 중계.
- **LLM 마이크로서비스**: Python FastAPI + LangChain.
- **벡터 검색**: Qdrant.

## Open questions / contradictions

> **[2026-04-17 업데이트] 아래 7건 중 6건은 ADR 0001에서 해소됨.**
> 자세한 결정 내역: [`docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md`](../../../docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md)

1. ~~`approval_status` 용어집 `revision_requested` ↔ DDL `on_hold` 값 불일치.~~ → **해소**: ADR 0001 #1 — `revision_requested`로 rename 확정.
2. ~~`users.active_role` 컬럼 부재.~~ → **해소**: ADR 0001 #2 — 컬럼 추가 확정 (VARCHAR(20) NOT NULL DEFAULT 'user').
3. ~~`role` / admin 구분 수단 부재.~~ → **해소**: ADR 0001 #3 — `admin_profiles` 전용 테이블 신설 확정.
4. ~~`companion_type` DB 컬럼 부재~~ → **확정**: DB에 두지 않음. 필터링 시점 파라미터로만 존재 (API 계약에만 등장). `user_taste_profiles`와는 별개.
5. ~~`expected_companion` 컬럼명 불일치~~ → **해소**: ADR 0001 #4 — `events.expected_companion_primary`/`_secondary`로 rename 확정.
6. ~~`event_vibe` ↔ `event_tendency_labels`~~ → **해소**: ADR 0001 #5 — `event_vibes` / `event_vibe_assignments`로 rename 확정.
7. ~~`uploader_profiles.approval_status`에 `revision_requested` 부재~~ → **해소**: ADR 0001 #1에 uploader_profiles 대칭 적용 포함.

## References

- [2026-04-17_requirements-v5](../sources/2026-04-17_requirements-v5.md) — Ⅴ장 용어집 원본
- [2026-04-16_event-curation-ddl](../sources/2026-04-16_event-curation-ddl.md) — DDL CHECK 제약 값
- CLAUDE.md §5-1 — "용어집은 유일한 근거"
