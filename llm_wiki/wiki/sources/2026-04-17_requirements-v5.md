---
title: 요구사항정의서 v5.0 (장원팀_요구사항정의서_5차.docx)
type: source
created: 2026-04-17
updated: 2026-04-17
sources: [2026-04-17_requirements-v5]
related:
  - ../topics/terminology-glossary.md
  - ../topics/use-cases-index.md
  - ../topics/filters-5-types.md
  - ../topics/event-state-machine.md
  - ../topics/roles-and-active-role.md
  - 2026-04-17_ui-flow-draft.md
---

# 요구사항정의서 v5.0 (5차 개정안)

## Summary

GGdrugs 프로젝트의 공식 요구사항정의서. 2026.04.17 발간된 v5.0(5차)이며 v4.0 대비 신규 유스케이스 2건(A_203 예정 이벤트 조회 / A_501 이벤트 리뷰 작성), 용어집 섹션(Ⅴ장) 신설, 필터 5종 표기 통일, "1계정 복수 역할 토글" 모델 확정, AI 비디오 생성 기능 제거가 반영되었다. 총 13개 유스케이스(A_100~A_700), 14개 기능 영역, Ⅴ장 용어집이 DB 컬럼·enum 명세의 **유일한 근거**로 지정된 최상위 기준 문서.

## Key points

### v5.0 주요 변경
- **[신규]** A_203 예정 이벤트 조회 — 메인 상단 탭으로 진입, 리스트 뷰가 기본.
- **[신규]** A_501 이벤트 리뷰 작성 — 와이어프레임 6-1 기반, 이벤트 종료일 이후 활성화.
- **[신규]** Ⅴ장 용어집 — 아래 "용어집 핵심" 참조.
- **[수정]** A_100, A_200, A_500, A_600 정합성 보정 (역할 전환·비회원 진입 흐름).
- **[수정]** 필터 조건 5종 통일: 지역/기간/인원구성/이벤트 종류/이벤트 성향.
- **[제거]** AI 비디오 자동 생성 관련 모든 언급.

### 유스케이스 13개 (A_100 ~ A_700)
- **AUTH**: A_100(회원가입), A_101(로그인)
- **MAIN**: A_200(메인), A_201(채팅검색), A_202(필터검색), A_203(예정이벤트)
- **LIST/DETAIL**: A_300(전체목록), A_400(상세)
- **MY**: A_500(마이페이지), A_501(리뷰작성)
- **UPLOADER**: A_600(역할승급), A_601(업로더메인), A_602(이벤트업로드)
- **ADMIN**: A_700(이벤트승인·라벨부여·업로더 승급 심사)

### 용어집 핵심 (Ⅴ장)
- **event / event_type / festival** — 상위-하위 계층. 원안 event_type은 {축제, 박람회, 심포지움, 컨퍼런스} 4종. **2026-04-18 확장: {전시, 공연, 교육, 영화} 4종 추가 → DB event_categories 8종** (마이그레이션 `20260418180000`). UI 카테고리 버튼도 5→9 로 증가. 상세 근거 [filters-5-types §4](../topics/filters-5-types.md).
- **event_vibe** — 이벤트 성향 라벨. 관리자가 A_700 심사 시 부여. 예: 활동적/정적/체험형/관람형/교육형/네트워킹 중심.
- **companion_type** (방문자 측, 필터용) vs **expected_companion** (업로더 측, 업로드 시 상위 2개 선택). 같은 도메인 {혼자/연인/친구/가족}이지만 의미 분리 → **컬럼명 분리 관리 지시**.
- **role**: {user, uploader, admin}. 모든 회원이 user 기본 보유. uploader는 A_600 신청 + A_700 승인 후 동일 계정에 추가. admin은 별도 전용 계정.
- **active_role**: 세션 + DB `active_role` 컬럼으로 관리. 'GG-ROLE-001' 토글 버튼.
- **period**: {3m, 6m, all, custom(년월)}.
- **이벤트 상태**: pending → revision_requested → pending (재제출) / approved → ended / rejected (종결).

### 기술 스택
- **BFF**: Node.js + Express + Prisma.
- **LLM 마이크로서비스**: Python FastAPI + LangChain.
- **벡터 검색**: Qdrant.

### 비회원 접근 정책 (v5.0 정합성 보정)
- 비회원: 탐색(조회) 기능만 가능 — 지도, 필터검색, 채팅검색, 전체목록조회.
- 개인화 액션(북마크·마이페이지·상세페이지) 시점에 회원가입 유도(A_100).

## Open questions / contradictions

- ~~**DDL v3와 용어집 enum 값 불일치**~~ → **해소**: [ADR 0001](../../../docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md) Accepted (2026-04-17). 7건 전부 권장안 확정, Phase 1 Prisma 마이그레이션에서 DDL v4로 전환.
- ~~Phase 1 진입 전 "팀원 간 합의 확정" 지시~~ → **해소**: ADR 0001 + ADR 0002 확정으로 블로커 해소.
- 유스케이스 다이어그램은 "별도 다이어그램 파일" 참조로만 언급 — 실물이 raw/에 없음. **미해결**.
- 관리자 전용 계정 생성 플로우(어떻게 admin 계정이 만들어지는지)는 명시되지 않음 — ADR 0001 §3 후속 작업 대상.

## References

- [2026-04-17_requirements-v5](../../raw/장원팀_요구사항정의서_5차.docx) — 원본 docx
- 개정 이력: 본문 표 0 (v1.0~v4.0 → v5.0)
- 용어집: Ⅴ장 (이벤트 계층 / 분류·라벨 / 역할 / 기간 / 상태 / 기술 용어 6개 섹션)
