# Wiki Index

Top-level navigation for this LLM Wiki. Organized by category.
See [schema.md](../schema.md) for structure and workflows.
See [log.md](log.md) for chronological activity.

## Topics
<!-- Concepts, methods, ideas. One file per topic in wiki/topics/. -->

### 기준·용어 (Phase 1 전 필독)
- [용어집](topics/terminology-glossary.md) — Ⅴ장 용어집 정본 + DDL 불일치 flag
- [이벤트 상태 머신](topics/event-state-machine.md) — approval_status + phase 2축 상태
- [필터 5종](topics/filters-5-types.md) — 지역/기간/인원구성/종류/성향
- [역할과 active_role](topics/roles-and-active-role.md) — 1계정 복수 역할 토글
- [기술 스택](topics/tech-stack.md) — 확정 스택 + ADR 링크

### 아키텍처 결정 (ADR 위키 미러)
- [ADR 0001 — 용어집 정합성](topics/adr-0001-terminology-reconciliation.md) — 7건 확정 (rename 3 + 신설 3 + 컬럼 추가 1)
- [ADR 0002 — 기술 스택 결정](topics/adr-0002-stack-decisions.md) — MinIO / OpenAI / Qdrant 단일

### 디자인
- [DESIGN.md](../../DESIGN.md) — 디자인 시스템 정본 (Pretendard / 버밀리언 accent / map-first hybrid layout). UI 결정 시 최우선 참조.

### 유스케이스·스키마
- [유스케이스 인덱스](topics/use-cases-index.md) — A_100 ~ A_700 13개
- [DB 스키마 개요](topics/db-schema-overview.md) — 20 테이블 + ER 요약

### UI 플로우
- [메인 페이지 플로우](topics/main-page-flow.md) — 지도 기반 이벤트 탐색 진입점
- [상세·리뷰 플로우](topics/event-detail-review-flow.md) — 상세 → 북마크 → 캘린더 → 리뷰
- [업로더 플로우](topics/uploader-flow.md) — 이벤트 등록·관리 화면
- [관리자 플로우](topics/admin-flow.md) — 승인·반려·라벨 부여
- [UI 아키텍처 (구현본)](topics/ui-architecture.md) — rail + overlay panel, Tailwind v4 토큰 매핑

### 시스템 흐름 (Phase 1 구현본)
- [인증 흐름](topics/auth-flow.md) — Google/Kakao OAuth + dev stub + 쿠키 세션
- [이벤트 Ingest 파이프라인](topics/ingest-pipeline.md) — TourAPI + Seoul + KCISA 다중 소스
- [AI Enrichment](topics/ai-enrichment.md) — 이벤트 요약 + 리뷰 감성 분류 (gpt-4o-mini)
- [Qdrant 의미 검색 레이어](topics/semantic-search.md) — 이벤트 embedding + /chat kNN suggestions
- [뉴스 기사 파이프라인 (A_400)](topics/news-article-pipeline.md) — Naver + Google News + embedding rerank
- [구독·알림 센터 (A_203 / A_500)](topics/subscriptions-notifications.md) — 5축 매칭 + 2단계 dedup + 알림 fan-out

## Entities
<!-- 외부 의존성: API, 서비스, 조직. 각 페이지에 endpoint·키·장애시 동작. -->
- [Google](entities/google.md) — OAuth (A_100/A_101)
- [Kakao](entities/kakao.md) — OAuth + Maps SDK
- [TourAPI](entities/tourapi.md) — 한국관광공사, 전국 축제 ingest
- [Seoul Open Data](entities/seoul-open-data.md) — 서울열린데이터광장, 주 이벤트 소스
- [KCISA](entities/kcisa.md) — 한국문화정보원, 공연·전시 공급

## Sources
<!-- 1:1 summary pages for files in raw/. -->
- [2026-04-17_requirements-v5](sources/2026-04-17_requirements-v5.md) — 요구사항정의서 v5.0 (raw/장원팀_요구사항정의서_5차.docx)
- [2026-04-17_ui-flow-draft](sources/2026-04-17_ui-flow-draft.md) — 전체 UI 플로우 와이어프레임 초안 (raw/초안.png)
- [2026-04-16_db-design-spec](sources/2026-04-16_db-design-spec.md) — DB 설계 명세서 v3 (raw/DB_설계_명세서_v3.docx)
- [2026-04-16_event-curation-ddl](sources/2026-04-16_event-curation-ddl.md) — 실행 가능 DDL (raw/event_curation_ddl_v3.sql)

## Meta
- [schema.md](../schema.md) — wiki structure and workflow definitions
- [log.md](log.md) — chronological ingest/update log
- [lint-report.md](lint-report.md) — latest health check (generated)
