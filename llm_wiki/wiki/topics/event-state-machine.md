---
title: 이벤트 상태 머신
type: topic
created: 2026-04-17
updated: 2026-04-17
sources: [2026-04-17_requirements-v5, 2026-04-16_event-curation-ddl]
related:
  - ../sources/2026-04-17_requirements-v5.md
  - ../sources/2026-04-16_event-curation-ddl.md
  - terminology-glossary.md
  - admin-flow.md
  - uploader-flow.md
---

# 이벤트 상태 머신

## Summary

이벤트(`events`) 레코드는 **두 개의 직교 상태**를 가진다: 관리자 심사 기반 `approval_status`와 시간 기반 `phase`. CLAUDE.md와 용어집은 이 둘을 암묵적으로 하나의 머신으로 다루지만, DDL은 명시적으로 컬럼 분리했다.

## Key points

### approval_status (관리자 심사)
- 확정 값: `pending` → `revision_requested` → `pending` (재제출) / `pending` → `approved` / `pending` → `rejected`
- DDL v3는 `on_hold`로 표기되었으나 ADR 0001 #1로 `revision_requested` rename 확정 (Phase 1 마이그레이션에서 적용).
- 크롤링 데이터(`source_type = 'crawled'`)는 관리자 심사 없이 `approved`로 직행 (DB 설계 명세서에 명시).

### phase (시간 기반 자동 전이)
- 값: `upcoming` → `ongoing` → `ended`
- 배치 또는 스케줄러로 `start_date`/`end_date` 기준 자동 갱신 (DDL COMMENT).
- approved + ended 조합은 과거 이벤트로 검색 노출에서 제외되지만 마이페이지 기록에서는 유지.

### 라이프사이클 예시 (uploaded 이벤트)
```
[업로더 업로드]
   └ approval_status: pending, phase: upcoming
       ├ [관리자 승인] → approval_status: approved, phase: upcoming
       │    └ [start_date 도래] → phase: ongoing
       │         └ [end_date 경과] → phase: ended
       ├ [관리자 보완 요청] → approval_status: revision_requested
       │    └ [업로더 재제출] → approval_status: pending (다시)
       └ [관리자 반려] → approval_status: rejected (종결)
```

### approval_logs로의 기록
- 모든 관리자 액션은 `approval_logs`에 append-only.
- action enum (ADR 0001 #1 rename 반영): `{approved, revision_requested, rejected}` — pending은 기록하지 않음(초기 상태이므로). DDL v3 원본은 `on_hold`.
- reason TEXT 필드로 보류·거절 사유 기록. 감사 추적(audit trail) 목적.

## Open questions / contradictions

> [2026-04-17] ADR 0001로 일부 해소. [`docs/decisions/0001-*.md`](../../../docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md)

1. ~~네이밍 충돌: `revision_requested` vs `on_hold`~~ → **해소**: `revision_requested`로 통일 (ADR 0001 #1).
2. `phase`가 `approval_status`와 어떻게 상호작용하는지 명문화 필요 — 예: `approval_status=rejected` 이벤트의 phase는 의미 있는가? DDL은 막지 않음.
3. `ended` 이벤트의 검색 제외는 WHERE 절로 강제되는가? `idx_events_filter`는 `WHERE is_deleted = false AND approval_status = 'approved'`만 명시 — phase 필터는 쿼리 계층에서 수동 처리.
4. 업로더가 rejected 이벤트를 다시 편집하여 재제출할 수 있는가? 명세 없음.
5. ~~`uploader_profiles.approval_status`에 `revision_requested` 부재~~ → **해소**: ADR 0001 #1에 uploader_profiles 대칭 적용 포함.

## References

- [2026-04-17_requirements-v5](../sources/2026-04-17_requirements-v5.md) — Ⅴ장 5절 이벤트 상태, A_700 관리자 심사
- [2026-04-16_event-curation-ddl](../sources/2026-04-16_event-curation-ddl.md) — events, approval_logs CHECK 제약
- [CLAUDE.md §5-2](../../../.claude/CLAUDE.md) — 상태 머신 규약
