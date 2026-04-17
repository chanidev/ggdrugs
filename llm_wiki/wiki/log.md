# Wiki Log

Chronological, append-only record of ingests and major updates.
Format: `## YYYY-MM-DDTHH:MM  <action>  <source-id-or-page>`

---

## 2026-04-14T00:00  init  schema
Initialized LLM Wiki per Karpathy's pattern. Created `schema.md`, `wiki/index.md`, `wiki/log.md`, empty `raw/`, `wiki/topics/`, `wiki/entities/`, `wiki/sources/`.

## 2026-04-17T09:30  ingest  2026-04-17_ui-flow-draft (raw/초안.png)
첫 ingest. GGdrugs 전체 UI 플로우 와이어프레임 이미지(세로 긴 스크린샷) 수용.
- 생성: `wiki/sources/2026-04-17_ui-flow-draft.md`
- 생성: `wiki/topics/main-page-flow.md`, `wiki/topics/event-detail-reservation-flow.md`, `wiki/topics/uploader-flow.md`, `wiki/topics/admin-flow.md`
- 업데이트: `wiki/index.md` (Topics / Sources 섹션 채움)
- 남은 작업: `raw/장원팀_요구사항정의서_5차.docx`, `raw/DB_설계_명세서_v3.docx`, `raw/event_curation_ddl_v3.sql` 미ingest.
- 미해결: 이미지 해상도 한계로 개별 화면 세부 레이블 판독 불가. 각 topic 페이지의 "Open questions" 참고.

## 2026-04-17T10:15  ingest  2026-04-17_requirements-v5 + 2026-04-16_db-design-spec + 2026-04-16_event-curation-ddl
일괄 ingest. 요구사항정의서 v5.0 + DB 설계 명세서 v3 + 실행 가능 DDL 3건.
- 생성 소스: `wiki/sources/2026-04-17_requirements-v5.md`, `wiki/sources/2026-04-16_db-design-spec.md`, `wiki/sources/2026-04-16_event-curation-ddl.md`
- 생성 토픽: `wiki/topics/terminology-glossary.md`, `wiki/topics/event-state-machine.md`, `wiki/topics/filters-5-types.md`, `wiki/topics/roles-and-active-role.md`, `wiki/topics/use-cases-index.md`, `wiki/topics/db-schema-overview.md`
- 업데이트: 기존 UI 플로우 토픽 4개 — 새 소스 반영, cross-ref 추가, 해소된 questions에 취소선.
- 업데이트: `wiki/index.md`.
- ⚠ **중요 발견 (Phase 1 전 해소 필요)**:
  1. `events.approval_status`: DDL `on_hold` vs 용어집 `revision_requested` 값 불일치.
  2. `users.active_role` 컬럼 DDL에 없음 (용어집은 필수 지시).
  3. `role` enum / admin 식별 컬럼 DDL에 없음.
  4. `companion_type` 전용 컬럼 부재 (필터 파라미터로만 존재).
  5. `event_vibe` ↔ `event_tendency_labels` 네이밍 차이.
  6. GG-REVIEW-004 리뷰 사진 첨부 매핑 방식 미정.
  7. A_203 조건 기반 알림을 현 `notifications` 스키마로 표현 불가.
  → 상세는 `wiki/topics/terminology-glossary.md` "Open questions" 참조.
- 정정: 초기 ingest의 `event-detail-reservation-flow.md`는 "예약 페이지" 오해석이 있었음. 실제로는 마이페이지 캘린더 + 리뷰 작성 플로우. 파일명은 유지하되 문서 내용을 정정, 리뷰 중심으로 재작성. (예약/결제 유스케이스는 존재하지 않음.)

## 2026-04-17T11:00  update  ADR 0001 Accepted
DDL v3 ↔ 용어집 v5 정합성 이슈 7건 모두 확정 — 전부 권장안으로 결정.
- `docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md` 상태 Proposed → Accepted.
- 결정: #1 approval_status `revision_requested` rename, #2 users.active_role 추가, #3 admin_profiles 신설, #4 expected_companion_primary/secondary rename, #5 event_vibes rename, #6 review_photos 신설, #7 event_subscriptions 신설.
- DDL v4 마이그레이션 SQL 프리뷰 ADR §3-1에 수록. Phase 1에서 Prisma 마이그레이션으로 전환.
- 5개 토픽 페이지(`terminology-glossary`, `event-state-machine`, `roles-and-active-role`, `filters-5-types`, `db-schema-overview`) contradictions 섹션 정리 — 해소 항목 취소선 + ADR 링크.
- 남은 공개 질문: phase×approval_status 상호작용, 리뷰어 수정·재제출 규칙, 승급 재신청 쿨다운, PostGIS GEOMETRY 전환 (모두 Phase 1 이후 재평가).

## 2026-04-17T11:45  decision  ADR 0002 Accepted — 기술 스택 확정
스택 점검에서 발견된 공백 3건 결정.
- D-1 오브젝트 스토리지 = **MinIO** (Docker Compose 추가). 프로덕션 전환 시 AWS S3 또는 Naver Cloud Object Storage로 endpoint만 교체.
- D-2 LLM 공급자 = **OpenAI 단일**. gpt-4o(채팅), gpt-4o-mini(경량), text-embedding-3-small(임베딩).
- D-3 벡터 저장소 = **Qdrant 단일**. pgvector 미도입. Qdrant 이미지 v1.9.0 → v1.13.0 업그레이드.
- 파일: `docs/decisions/0002-stack-decisions.md` 신규. `docker-compose.yml` minio 서비스 추가. `.env.example` MinIO/OpenAI 환경변수 정리, ANTHROPIC 제거. `wiki/topics/tech-stack.md` 신규. `db-schema-overview.md` extensions 섹션에서 pgvector 제거 반영.

## 2026-04-17T12:30  lint  wiki/lint-report.md 생성 + 정정 sweep
첫 위키 린트 실행. 10건 이슈 발견 → 우선순위 1~4 일괄 정정.
- 생성: `wiki/lint-report.md` (schema.md §3 포맷).
- 정정 S-2: `event-detail-reservation-flow.md` 중복 References 블록 제거.
- 정정 S-1: `event-detail-reservation-flow.md` → `event-detail-review-flow.md` rename (내용과 파일명 일치). 참조 4곳 갱신 (index.md, main-page-flow.md, use-cases-index.md, sources/2026-04-17_ui-flow-draft.md).
- 정정 C-1/C-3/C-4: ADR 0001 rename 결정을 Key points 본문에 반영. 5개 토픽(`event-state-machine`, `terminology-glossary`, `db-schema-overview`, `roles-and-active-role`, `filters-5-types`, `uploader-flow`) + 3개 소스(`2026-04-16_db-design-spec`, `2026-04-16_event-curation-ddl`, `2026-04-17_requirements-v5`) Open questions에 해소 링크 일괄 추가. Source 본문은 "DDL v3 발행 시점 상태 기록"으로 유지, 토픽 본문은 확정본 기준으로 재작성 + "← DDL v3:" 주석.
- 정정 C-2: `2026-04-17_ui-flow-draft.md` §3 "상세·예약 페이지" → "상세 + 마이페이지 캘린더/리뷰"로 재해석 주석 추가. Summary에도 해석 정정 경고 블록 추가.
- 부수 정정: `db-schema-overview.md` §1 uploader_profiles에 `revision_requested` 추가(ADR 0001 #1 대칭 적용), §1 admin_profiles 신설 반영, §2 event_vibes/event_vibe_assignments rename, §3 approval_logs.action enum 갱신, §4 review_photos + event_subscriptions 신설 반영(20 → 22 테이블).
- 남은 미해결: G-1 ADR wiki 미러, G-2 entities 착수(둘 다 Phase 1 이후 후순위), 지리 쿼리 PostGIS GEOMETRY 전환, 리뷰 sentiment 분류 시점, BFF↔LLM 서비스 DB write 책임 분담.

## 2026-04-17T13:15  ingest  ADR 0001 + ADR 0002 wiki 미러 (G-1 해소)
린트 리포트 G-1 항목 반영. `docs/decisions/` 의 ADR 2건을 위키 topic으로 ingest.
- 생성: `wiki/topics/adr-0001-terminology-reconciliation.md` — 7건 확정표 + DDL v4 마이그레이션 전략 + 적용 페이지 리스트 + 후속 액션.
- 생성: `wiki/topics/adr-0002-stack-decisions.md` — MinIO/OpenAI/Qdrant 단일 결정 + 보류한 대안 + 재평가 트리거.
- 업데이트: `wiki/index.md` "아키텍처 결정 (ADR 위키 미러)" 섹션 신설.
- 업데이트: `terminology-glossary.md`, `db-schema-overview.md`, `tech-stack.md` frontmatter `related:` 에 ADR 링크 추가.
- 근거: sources/ 는 raw/ 와 1:1 매핑 invariant이므로 ADR은 topic으로 분류. adr-index 단일 페이지 대신 ADR당 1페이지 구조 (향후 ADR 추가에 대비).
- 잔여 gap: G-2 entities 레이어 (Kakao/OpenAI/Qdrant 등) — Phase 1 외부 연동 구현 시 필요에 따라 생성.

## 2026-04-17T14:30  ingest  ADR 0003 (Phase 1) — CHECK 제약 + updated_at 트리거 마이그레이션
Phase 1 무결성 보강. `apps/bff/prisma/schema.prisma`가 표현 못한 DDL v4의 DB 수준 보호장치를 SQL 마이그레이션으로 적용.
- 생성: `apps/bff/prisma/migrations/20260417140000_check_constraints_and_triggers/migration.sql`
- CHECK 제약 26건 (ADR 0001 rename 전부 적용 — `revision_requested`, `expected_companion_*`, `event_vibes`, `admin_profiles.scope`, `event_subscriptions.period_months` ∈ {null,3,6}).
- `fn_set_updated_at()` 함수 + BEFORE UPDATE 트리거 8건 (users / uploader_profiles / admin_profiles / events / reviews / event_subscriptions / photo_albums / user_taste_profiles).
- 검증: positive INSERT 2건 PASS, negative CHECK 위반 5건 전부 거부 확인, cross-transaction 트리거 1.45s 갱신 확인.
- 커밋: `a60f907`.

## 2026-04-17T15:00  decision  Design System 확정 — DESIGN.md
`/design-consultation` 세션. Phase 1 UI 착수 전 디자인 시스템 정본 확정.
- 생성: `DESIGN.md` (프로젝트 루트) — 정본.
- 업데이트: `.claude/CLAUDE.md §8-1` — UI 결정 시 DESIGN.md 우선 참조 규칙 추가.
- **방향**: "지도 유틸리티 극대화 + editorial 한 드롭". 레퍼런스 — Airbnb(구조) · Luma(톤) · 당근 동네생활(한국 UX) · Apple Maps(지도 카드 계층).
- **핵심 결정**:
  - 서체 = **Pretendard 단일 패밀리** (한국어 web de facto, Inter/Roboto 한글 fallback 문제 회피).
  - Accent = **단일 버밀리언 `#E8562D`** (단청·주홍 현대화, 핀/CTA/북마크만 사용). 보라·그라디언트 금지.
  - Layout = 메인 지도 페이지는 60:40 map-list (Airbnb 50:50 의도적 차별, A_201 채팅 UI가 지도 하단 차지), 그 외는 grid-disciplined.
  - Signature motion = 핀 클러스터 분해 stagger 50ms.
  - "쇼핑몰" 언어가 아닌 "도시 지도/여행 가이드" 언어 — v5.0의 예약·결제 부재 결정과 정합.
- **SAFE**: map+list 분할, Pretendard, filter pill chip.
- **RISK**: 단일 버밀리언 액센트 / editorial tracking -0.02em display / "종이 위에 놓인" shadow.
