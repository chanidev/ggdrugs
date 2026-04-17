# Wiki Lint Report

**Generated**: 2026-04-17 (sweep 후 재실행)
**Scope**: `wiki/` 전체 (4 sources + 11 topics + 0 entities, index/log 제외)
**Schema ref**: [schema.md §3 Lint](../schema.md)
**Graphify cross-check**: **skipped** — `graphify-out/` 없음.

---

## 요약

| 카테고리 | 1차 린트 | sweep 후 | 심각도 |
|---|---|---|---|
| Contradictions | 4 | **0** | ✅ |
| Stale refs | 2 | **0** | ✅ |
| Orphans | 0 | 0 | — |
| Gaps | 2 | **1** | 🟡 Phase 1 이후 (G-2만 잔여) |
| Over-large pages | 0 | 0 | — |
| Low-confidence inferences | n/a | n/a | graph 미생성 |

**상태**: 우선순위 1~4 전부 정정 완료. 잔여 2건(Gaps)은 Phase 1 이후 재평가 대상.

---

## 1. Contradictions — ✅ 해소

### C-1. `on_hold` → `revision_requested` (ADR 0001 #1)
- [topics/event-state-machine.md](topics/event-state-machine.md): Key points §approval_status + 라이프사이클 + approval_logs.action enum 3곳 갱신.
- [topics/terminology-glossary.md](topics/terminology-glossary.md) §5 표: "DDL v3 원본" / "확정" 2열 구조로 재작성.
- [topics/db-schema-overview.md](topics/db-schema-overview.md) §2 events, §3 approval_logs 본문 갱신.
- [sources/2026-04-16_event-curation-ddl.md](sources/2026-04-16_event-curation-ddl.md), [sources/2026-04-16_db-design-spec.md](sources/2026-04-16_db-design-spec.md): 본문은 원문 보존, Open questions에 ADR 0001 링크 + 취소선 정리.

### C-2. UI Flow source의 "예약·결제" 서술
- [sources/2026-04-17_ui-flow-draft.md](sources/2026-04-17_ui-flow-draft.md): Summary에 해석 정정 경고 블록 추가 + §3 제목 "상세 페이지 + 마이페이지 캘린더/리뷰"로 개편, 북마크·리뷰 중심으로 항목 재작성.

### C-3. `companion_primary/secondary` → `expected_companion_primary/_secondary` (ADR 0001 #4)
- [topics/filters-5-types.md](topics/filters-5-types.md) §3, [topics/terminology-glossary.md](topics/terminology-glossary.md) §2, [topics/db-schema-overview.md](topics/db-schema-overview.md) §2 갱신.

### C-4. `event_tendency_labels` → `event_vibes` (ADR 0001 #5)
- [topics/filters-5-types.md](topics/filters-5-types.md) §5 + References, [topics/terminology-glossary.md](topics/terminology-glossary.md) §2, [topics/db-schema-overview.md](topics/db-schema-overview.md) §2 + ER 다이어그램 갱신.

### 부수: uploader_profiles.approval_status에 `revision_requested` 추가
- [topics/db-schema-overview.md](topics/db-schema-overview.md) §1 및 [topics/roles-and-active-role.md](topics/roles-and-active-role.md) §DB 표현 반영.
- [topics/db-schema-overview.md](topics/db-schema-overview.md) §1 admin_profiles 신설, §4 review_photos / event_subscriptions 신설도 반영 (20 → 22 테이블).
- [topics/uploader-flow.md](topics/uploader-flow.md) 상태 필터 서술에서 "추정" 삭제 + active_role open question 해소 표시.

---

## 2. Stale refs — ✅ 해소

### S-1. 파일명 rename: `event-detail-reservation-flow.md` → `event-detail-review-flow.md`
참조 5곳 갱신: `index.md`, `main-page-flow.md`, `use-cases-index.md`, `sources/2026-04-17_ui-flow-draft.md`, `lint-report.md`(본 파일). `log.md`는 append-only이므로 역사적 기록 보존.

### S-2. 중복 References 블록
`event-detail-review-flow.md` 파일 하단 두 번째 `## References` 블록 제거.

---

## 3. Orphans

**해당 없음.** 모든 topics/sources가 index.md에 등재됨. `entities/` 비어있으나 index.md에 `_(none yet)_`으로 명시되어 의도된 상태.

---

## 4. Gaps — 🟡 잔여

### ~~G-1. ADR 미러 페이지 부재~~ — ✅ 해소 (2026-04-17T13:15)
`wiki/topics/adr-0001-terminology-reconciliation.md` + `wiki/topics/adr-0002-stack-decisions.md` 생성. index.md "아키텍처 결정" 섹션 추가. sources/ invariant 유지(raw/와 1:1)를 위해 topic 카테고리로 분류.

### G-2. entities 레이어 미착수
`wiki/entities/` 비어있음. 후보:
- Kakao (Maps + OAuth), OpenAI (ADR 0002 LLM), Qdrant.
- **권장**: Phase 1 외부 연동 구현 시 필요에 따라 생성.

---

## 5. Over-large pages
**해당 없음.** 최장 페이지 `db-schema-overview.md` 약 110 lines (sweep 후 증가했지만 여전히 400 라인 임계 이하).

---

## 6. Low-confidence inferences
**평가 불가.** `graphify-out/` 미생성. `/graphify ./llm_wiki` 실행 후 재린트 시 채워질 항목.

---

## 변경 파일 요약 (sweep)

| 파일 | 변경 유형 |
|---|---|
| `wiki/topics/event-detail-review-flow.md` | rename (from `-reservation-`) + 중복 References 제거 |
| `wiki/topics/event-state-machine.md` | approval_status 서술 + 라이프사이클 + approval_logs.action |
| `wiki/topics/terminology-glossary.md` | §2/3/5 표에 "DDL v3 원본" + "확정" 2열 구조 |
| `wiki/topics/db-schema-overview.md` | §1~§4 전반 rename 반영 + 신설 테이블 2건 + ER 다이어그램 |
| `wiki/topics/roles-and-active-role.md` | §DB 표현 ADR 0001 적용 후 기준 |
| `wiki/topics/filters-5-types.md` | §3 인원구성 + §5 성향 + References |
| `wiki/topics/uploader-flow.md` | 상태 필터 + active_role 해소 표시 |
| `wiki/sources/2026-04-17_ui-flow-draft.md` | 해석 정정 경고 + §3 재해석 |
| `wiki/sources/2026-04-16_db-design-spec.md` | Open questions 해소 링크 |
| `wiki/sources/2026-04-16_event-curation-ddl.md` | Open questions 해소 링크 |
| `wiki/sources/2026-04-17_requirements-v5.md` | Open questions 해소 링크 |
| `wiki/index.md` | 파일 rename 반영 |
| `wiki/log.md` | 2026-04-17T12:30 lint 엔트리 append |

---

*이 리포트는 `/lint` 실행 시마다 덮어쓰기됩니다. — schema.md §3*
