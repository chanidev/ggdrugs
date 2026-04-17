---
title: 필터 5종 (지역/기간/인원구성/이벤트 종류/이벤트 성향)
type: topic
created: 2026-04-17
updated: 2026-04-17
sources: [2026-04-17_requirements-v5, 2026-04-16_event-curation-ddl]
related:
  - ../sources/2026-04-17_requirements-v5.md
  - ../sources/2026-04-16_event-curation-ddl.md
  - terminology-glossary.md
  - main-page-flow.md
---

# 필터 5종

## Summary

A_202(필터 검색)·A_201(채팅 검색)·A_203(예정 이벤트)에서 일관되게 사용되는 5개 필터 조건. v5.0에서 명시적으로 "지역 / 기간 / 인원구성 / 이벤트 종류 / 이벤트 성향"으로 통일되었으며, CLAUDE.md는 이 5종 외 필터 추가를 금지한다(요구사항정의서 개정 필요).

## Key points

### 1. 지역 (region)
- 다중 선택, 시/구 단위 (시 → 구 드릴다운).
- DB: `regions` 테이블 (sido_name / sigungu_name / dong_name) + `events.region_id` FK.
- 인덱스: `idx_regions_sido`, `idx_regions_sigungu`.

### 2. 기간 (period)
- 옵션: 3개월 이내 / 6개월 이내 / 전체 / 커스텀(년월).
- A_203 기본값은 3개월.
- DB: `events.start_date`, `end_date` DATE 컬럼으로 파생 쿼리 (`WHERE start_date BETWEEN ...`).
- v5.0에서 기존 '년월'·'절기' 표현을 '기간'으로 흡수.

### 3. 인원구성 (companion_type)
- 값: 혼자 / 연인 / 친구 / 가족 (`solo` / `couple` / `friend` / `family`).
- **방문자 측** 속성 (필터 조건). DB 컬럼 미생성 — API 파라미터 전용(ADR 0001 #4).
- 매칭 대상: 업로더 측 `events.expected_companion_primary` / `_secondary` (← DDL v3: `companion_primary`/`_secondary`, ADR 0001 #4 rename).
- ⚠ 매칭 규칙 확정 필요 (primary/secondary 중 하나라도 겹치면 매치? 아니면 primary 우선?).

### 4. 이벤트 종류 (event_type)
- 값: 축제 / 박람회 / 심포지움 / 컨퍼런스 (4종).
- DB: `event_categories.category_code` + `events.category_id` FK.
- 전체 카테고리 버튼 포함 시 UI는 5개 버튼(전체/4종).

### 5. 이벤트 성향 (event_vibe)
- 예시 값: 활동적 / 정적 / 체험형 / 관람형 / 교육형 / 네트워킹 중심.
- 관리자가 A_700 심사 시 부여 — LLM에 위임 금지(CLAUDE.md §6-4).
- DB: `event_vibes` 마스터 + `event_vibe_assignments` N:M 매핑 (ADR 0001 #5 rename. ← DDL v3: `event_tendency_labels` + `event_label_assignments`).
- `label_group` enum: {mood, activity, theme}.

## 필터 적용 규칙 (GG-FILTER-001 ~ 004)
- 5종 모두 선택 사항.
- 체크박스는 두 번 클릭으로 선택 해제 (GG-FILTER-004).
- '필터 전체 취소' 버튼 (GG-FILTER-003).
- '적용' 버튼 클릭 후 지도 핀 + 사이드바 리스트 동기화.

## Open questions / contradictions

> [2026-04-17] 네이밍 정합성은 ADR 0001로 확정됨 — companion 컬럼은 `expected_companion_primary`/`_secondary`, 라벨 테이블은 `event_vibes` / `event_vibe_assignments`.

1. 인원구성과 expected_companion_primary/secondary 매칭 알고리즘 명세 없음. primary만 매치? secondary까지 포함? 일치 점수 스코어링?
2. 이벤트 성향이 다중 라벨 보유 가능(N:M) — 필터에서 AND인지 OR인지 명세 없음 (UX상 보통 OR).
3. 커스텀 기간 '년월 지정'의 단위 — 시작월만? 시작-종료월 범위? UI 목업 필요.
4. 검색 로그 `search_logs.search_params` JSONB 스키마 미정의 — 5종 필터가 어떤 키로 직렬화되는지 표준화 필요 (`packages/shared-types/` 에서 DTO 정의 예정).

## References

- [2026-04-17_requirements-v5](../sources/2026-04-17_requirements-v5.md) — Ⅲ장 FILTER 섹션, A_202 유스케이스
- [2026-04-16_event-curation-ddl](../sources/2026-04-16_event-curation-ddl.md) — regions, event_categories, event_tendency_labels(→ `event_vibes` rename per ADR 0001 #5)
- [CLAUDE.md §5-3](../../../.claude/CLAUDE.md) — "5종 외 필터 추가 금지"
