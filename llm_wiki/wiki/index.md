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

### 아키텍처 결정 (ADR 색인)
- [ADR 0001 — 용어집 정합성](topics/adr-0001-terminology-reconciliation.md) — 7건 확정 (rename 3 + 신설 3 + 컬럼 추가 1) (wiki 미러 보유)
- [ADR 0002 — 기술 스택 결정](topics/adr-0002-stack-decisions.md) — MinIO / OpenAI / Qdrant 단일 (wiki 미러 보유)
- [ADR 0003 — 업로더 PII 정책](../../docs/decisions/0003-uploader-pii-policy.md) — 주민번호 제거 + 사업자번호/CI 분기 (canonical only)
- [ADR 0004 — 세션 무효화 정책](../../docs/decisions/0004-session-invalidation-policy.md) — soft-delete cascade + sliding-cap + logout-all + admin revoke (canonical only, [auth-flow](topics/auth-flow.md) 에 결정 표 미러)
- [ADR 0005 — 관리자 계정 관리 + 작업 감사](../../docs/decisions/0005-admin-account-management.md) — admin promote/demote/scope-change + user soft-delete + uploader 승급 audit (canonical + [admin-account-management](topics/admin-account-management.md) topic 미러)

### 디자인
- [DESIGN.md](../../DESIGN.md) — 디자인 시스템 정본 (Pretendard / 버밀리언 accent / map-first hybrid layout). UI 결정 시 최우선 참조.

### 유스케이스·스키마
- [유스케이스 인덱스](topics/use-cases-index.md) — A_100 ~ A_700 14개
- [DB 스키마 개요](topics/db-schema-overview.md) — 43 테이블 + ER 요약

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
- [관리자 계정 관리 + 작업 감사](topics/admin-account-management.md) — promote/demote/scope/soft-delete + uploader_decision audit (ADR 0005)
- [추천 시스템](topics/recommendations.md) — taste profile 기반 일일 집계 + /me/recommendations + 마이페이지 추천 탭 (G-5)

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
- [2026-04-17_design-system-zip](sources/2026-04-17_design-system-zip.md) — DESIGN.md ingredient (raw/GGdrugs Design System.zip + raw/design_handoff_alle_brand/)
- [2026-04-26_error1](sources/2026-04-26_error1.md) — Sprint A 디버깅 스크린샷 placeholder (raw/error1.png)

## Meta
- [schema.md](../schema.md) — wiki structure and workflow definitions
- [log.md](log.md) — chronological ingest/update log
- [lint-report.md](lint-report.md) — latest health check (generated)
- [audit/](audit/) — 시간 박제 audit 리포트 (chat-rank-bench / chat:eval 트렌드 등 generated, 1 sweep = 1 file)
