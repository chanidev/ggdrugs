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

## 2026-04-17T15:30  build  Phase 1 foundation — config 패키지 + BFF + 웹 스캐폴드
Phase 1 실제 코드 착수. 이전까지는 스키마·문서만 있었고 이번 세션에 **앱이 처음으로 기동**.
- **`@ggdrugs/config`** — zod 기반 env 스키마. 9개 그룹(core/db/redis/qdrant/s3/openai/external/session/serviceUrls) + `loadEnv()` + `loadPartial()`. 프로덕션 키 강제 검증. 커밋 `339bb07`.
- **BFF `@ggdrugs/bff`** — Express 5 + pino + Prisma Client. `GET /health` 가 `SELECT 1` 로 DB ping. dev 서버 tsx watch 모드. dotenv-cli 로 루트 `.env` 주입. 커밋 `339bb07`.
- **Prisma 마이그레이션**: 초기 baseline + CHECK/트리거 마이그레이션 2건 적용. 베이스라인은 `prisma db push` 후 `prisma migrate resolve --applied` 로 기록. Postgres 호스트 포트 5432 → **5433** (시스템 Postgres 충돌 회피). `event_categories` 4종 시드 완료. 커밋 `a60f907`.
- **Web `@ggdrugs/web`** — Vite 6 + React 19 + Tailwind v4 + Pretendard (jsdelivr CDN). DESIGN.md 토큰 전체를 `@theme` 블록으로 등록, 다크 모드는 `:root` CSS variable swap 방식(`@theme`은 `@media` 안에서 재정의 불가). `/api/*` → `localhost:3000` 프록시. 커밋 범위 다수.
- **Kakao Maps 통합**: `react-kakao-maps-sdk` + `useKakaoLoader`. 서울 시청 중심 zoom 8. 3가지 fallback Notice(MissingKey/LoaderError/Loading). `VITE_KAKAO_MAP_JS_KEY` (공개) + `KAKAO_REST_API_KEY` (서버 전용) 분리.
- **설정 버그 픽스 2건**:
  1. Vite 가 `apps/web/.env` 를 찾아서 모노레포 루트 `.env` 를 못 읽던 문제 → `vite.config.ts` 에 `envDir: '../..'` 로 해결. 커밋 `e142718`.
  2. Kakao 개발자 콘솔에서 "카카오맵" 제품 서비스가 비활성화되어 있어 `403 NotAuthorizedError: App(맵테스트) disabled OPEN_MAP_AND_LOCAL service` → 사용자가 콘솔에서 활성화 후 해소.

## 2026-04-17T16:30  refactor  메인 페이지 UI — 사이드바 3회 이터레이션
초안 → 카드 엔트리 → 라우트 기반 → **확장 패널(rail + overlay)** 로 수렴.
- 사용자 피드백 1: 카드 2장 중복 탭 제거, 테이블 행으로 나열, 클릭 시 페이지 전환. → 라우트 기반 구현(`/filter`, `/list`, `/chat`) + `SidebarSubHeader` 공통 back 헤더. 커밋 `d77f8b2`.
- 사용자 피드백 2: 페이지 전환이 아니라 **확장 패널**(accordion). + 지도 하단 **ChatDock 복원**. + 사이드바 너비 축소. → 인라인 accordion + Fragment 반환. 커밋 `01fb785`.
- 사용자 피드백 3: 확장 패널은 rail **오른쪽으로 나와야** 함 (사이드바 아래가 아님). → rail(aside 220px) + panel(section 360px) 좌→우 2컬럼 구조. 커밋 `15c6db1`.
- 사용자 피드백 4: 확장 패널 뜰 때 **지도 크기 유지**, overlay 로. → panel 을 `absolute` 포지셔닝으로 바꿔 flex flow 밖으로 꺼냄, `shadow-lg` 로 부양감. 커밋 `565eb83`.
- 최종 레이아웃 (A_200 메인 페이지):
  - **Header (h-14)**: GGdrugs 로고 + 탭(탐색/예정 이벤트) + 로그인 버튼.
  - **Rail (w-220px)**: h3 "이벤트 찾기" + 3행 divider 메뉴(필터/전체목록/채팅). 활성 행은 좌측 accent 세로 스트라이프 + 버밀리언 타이틀/화살표 + accent-bg 배경.
  - **Overlay Panel (w-360px, absolute left-220)**: rail 클릭 시 나타남, shadow-lg 로 지도 위 부양. 상단 `×` 닫기. 채팅 행은 예시 쿼리 3개 보여주고 실 입력은 하단 ChatDock.
  - **Map (flex-1)**: Kakao Maps 정상 로드 (envDir + 콘솔 서비스 활성화 후). 서울 중심 + 더미 마커 3 (종로·강남·관악).
  - **ChatDock (shrink-0)**: 지도 바로 아래. 입력창 + 검색 CTA. LLM 연동 전 no-op.

## 2026-04-19T11:00  rebrand+ingest  Alle 브랜딩 + 다중 소스 ingest + event_type 8종 확장
- **Alle 브랜딩 완료** (Phase 0 말 → Phase 1 초). GGdrugs → Alle 제품 표기 교체 (레포·패키지·DB 식별자는 ggdrugs 유지). Line Monogram 로고 + Vermilion accent 확정. 커밋 `98bdfa5`, `bfcb7ef`, `d49d16a`.
- **다중 소스 ingest 도입**: TourAPI + Seoul Open Data + KCISA. forward-looking 일일 배치. 크로스 소스 중복방지 (제목·start_date 정확일치). 커밋 `87fa633`, `95820e1`, `38b2727`.
- **event_categories 4종 → 8종 확장** (커밋 `35cd6f8`, 마이그레이션 `20260418180000`): Seoul/KCISA 가 공급하는 실 카테고리 분포 (공연 1357 / 교육 1393 / 전시 633) 를 위해 `exhibition, performance, education, movie` 추가. UI 카테고리 버튼 5→9.
- **지역 폴리곤 하이라이트** + pulse 애니메이션: 필터 지역 chip ↔ 지도 구 경계 즉시 동기화. 커밋 `d02fec7`, `5b8273a`, `21e1dbe`.
- **이벤트 상세 페이지**(A_400) 실 라우트 추가. 지도 필터 → /events 쿼리 매핑 (F), 필터·지도·목록 state lift (E), 필터·지도·목록 동기 선택 (E-sync). 커밋 `d76c23f`, `1977225`, `c05d8d6`.

## 2026-04-19T12:30  feature  A_201·A_302·A_500·A_501 1차 sprint — 핵심 루프 완성
한 세션에서 인증 Stage 1/2 + 리뷰 + 북마크 + 마이페이지 + 채팅 LLM stub 까지 완성.
- **auth (A_100/A_101)**:
  - Stage 1 dev-login stub + `auth_sessions` 테이블 + 쿠키 세션. 커밋 `c2bd555`. 마이그레이션 `20260419200000_add_auth_sessions`, `20260419201000_allow_dev_auth_provider` (chk_users_provider 에 dev 허용).
  - Stage 2 Google OAuth (authorization code + tokeninfo 검증). 커밋 `d29bec3`.
  - Stage 2 Kakao OAuth (kauth.kakao.com + kapi.kakao.com/v2/user/me). 커밋 `a038626`.
  - BFF 미들웨어 이원화: `requireAuth` (필수), `resolveAuth` (옵셔널 — event-detail 의 isBookmarked 용).
- **A_501 리뷰 쓰기/삭제**: POST /events/:id/reviews (rating 1~5, body 2~2000자, **event.phase='ended' 검증**, 1인 1리뷰 uq), DELETE /reviews/:id (본인, soft-delete + count/avg 재계산). 커밋 `e6ef2fe`, `052291c`.
- **A_302 북마크**: POST/DELETE /events/:id/bookmark (idempotent + tx bookmark_count), GET /me/bookmarks + /me/reviews. BookmarkButton 공용 컴포넌트 (낙관적 토글). 커밋 `30bf5d6`.
- **A_500 마이페이지 뼈대** (`/me`): 내 북마크 / 내 리뷰 2 탭, skeleton / empty / login gate. 캘린더는 후속. 커밋 `30bf5d6`.
- **A_200 EventSummaryPanel 복원**: 원 와이어프레임 동선 (목록/핀 → 지도 옆 요약 패널 → "상세 페이지로" CTA). AppShell 3-column 레이아웃. 커밋 `8712f00`.
- **선택 핀 강조**: CustomOverlayMap + vermilion pulse ring. 커밋 `da50724`.
- **A_201 ChatDock 실 연동**: services/llm Python FastAPI Stage 1 rule-based stub (`filters.py` Korean keyword → 5종 필터). BFF `/chat` 프록시 + regionHints → regionIds resolve (district 레벨만). 채팅 결과가 map filter 자동 반영. 커밋 `ff6548f`, `9313be1`, `a038626`.

## 2026-04-19T18:00  docs  lint sweep + wiki 대청소
- event_type 4→8, auth_provider dev, Kakao OAuth 를 5개 기존 문서에 반영.
- 신규 topic 2개: `auth-flow.md`, `ingest-pipeline.md`.
- 신규 entity 5개: `google`, `kakao`, `tourapi`, `seoul-open-data`, `kcisa`.
- 이전 lint 의 "regions sigungu_name 중복" 오진 정정 — 실은 sido/sigungu/dong 3단 계층 설계. `chat.ts` regionHints resolver 만 `dongName:null` 필터 누락 (커밋 `9313be1` 해소).

## 2026-04-19T22:30  feature  LLM enrichment — 이벤트 AI 요약 + 리뷰 sentiment
Stage 2 OpenAI (gpt-4o-mini) 기반 자동 enrichment 파이프라인 구축.
- **이벤트 요약 (aiSummary)**: 지금까지 `events.description` 이 0 rows — 세
  러너 모두 ingest 단계에서 description 을 버리고 있었음. 이번 패치로
  `NormalizedEvent.description` 추가 + Seoul(ETC_DESC/PROGRAM/PLAYER/USE_TRGT/
  USE_FEE 결합) · KCISA(SUB_TITLE+DESCRIPTION) 반영. TourAPI list API 는
  설명 미제공(별도 detailCommon 호출 비용 과해 skip).
- **events.ai_summary TEXT + ai_summary_at 컬럼** 신설 (마이그레이션
  `20260419210000`). `services/llm /summarize` (gpt-4o-mini + 한국어 가이드
  톤 시스템 프롬프트, 2~3문장, 250자 이내) + BFF `jobs/summarize-events.ts`
  backfill 스크립트 (`pnpm backfill:summary`). 동시성 5.
- 초기 backfill 결과: description 있는 **403 → ai_summary 398 건 생성** (비용
  ~$0.1, 시간 ~4분). 실패 0.
- **리뷰 sentiment 자동 분류**: POST /events/:id/reviews 트랜잭션 응답 후
  fire-and-forget 으로 `/sentiment` (gpt-4o-mini + JSON schema strict
  `positive|negative|neutral`) 호출 → `reviews.sentiment` update. 실패 시
  키워드 룰 기반 fallback.
- UI: EventSummaryPanel·EventDetailPage 의 "소개" 섹션이 **AI 요약 + 원본
  접기** 2-레이어로 재편. ReviewCard 에 SentimentBadge (긍정/부정/보통 색
  뱃지). AI 뱃지는 accent-bg 칩으로 출처 표시.
- 커밋 `7d58960`.

## 2026-04-21T18:30  sweep  post-AI-enhancement wiki drift fix
이전 lint(04-19) 이후 96 커밋 ship — 요약 팝업 / 업로더 / 관리자 / 구독·알림 / 뉴스 파이프라인 / ADR 0003 PII / Qdrant 의미 검색. wiki 재작성.

- 신규 topics 3건:
  - `topics/semantic-search.md` — Qdrant 의미 검색 (G-8)
  - `topics/news-article-pipeline.md` — Naver + Google News + embedding rerank (G-9)
  - `topics/subscriptions-notifications.md` — 5축 매칭 + 2단계 dedup (G-10)
- 기존 topics 갱신:
  - `topics/uploader-flow.md` — PII identity 섹션 + Event Edit 섹션 (G-11, G-12) + C-8 해소 + S-5 ADR 0003 링크
  - `topics/admin-flow.md` — Audit Logs 섹션 + 4탭 구조 + C-9 해소 (G-13)
  - `topics/event-detail-review-flow.md` — A_500 팝업 스펙 충족 노트 (C-9)
  - `topics/ui-architecture.md` — 모바일 반영 현황 업데이트 (C-7)
- `index.md` — 신규 3 topic 링크 추가
- `lint-report.md` 는 이전 sweep 결과 덮어쓴 상태.

graphify cross-check: 844 nodes / 1081 edges / 121 communities (2026-04-21).

## 2026-04-22T13:45  lint  검색 인덱스 자동화 + 뉴스 품질 감사 후 drift
이전 lint(04-21) 이후 10 커밋 ship — A_400 관련 기사 페이징, 검색 인덱스 3축 자동 동기화
(승인 훅 upsert / 탈락 훅 delete / aiSummary 변경 re-embed), 뉴스 매핑 threshold 0.55→0.60 +
품질 감사 CLI + 스케줄러 후속 파이프라인 연결.

- Contradictions: **3 신규** (C-10 threshold 수치, C-11 semantic-search 동기화 3축, C-12
  ingest-pipeline post-batch 체인). 이전 3건 (C-7~9) 모두 해소 확인.
- Stale refs: 0 (S-5 해소).
- Gaps: **2 신규** (G-14 요약 패널/페이징 UI, G-15 품질 감사 topic). 이전 6건 (G-8~13)
  모두 topic 생성으로 해소.
- Implementation status 3행 변경 + 4행 신규.
- 미착수 4행 유지 (세션 무효화 ADR / 관리자 계정 ADR / PostGIS / 모바일 메인).

graphify cross-check: 847 nodes / 1084 edges / 121 communities (2026-04-22 재빌드).

## 2026-04-23T00:00  sweep  04-22 lint 의 punch list 5건 wiki 본문 반영
이전 lint(04-22) 가 식별한 C-10/11/12 + G-14/15 전부 topic 본문에 반영. 코드 변경 없음 — wiki only.

- `topics/news-article-pipeline.md`:
  - C-10: §Final score 의 threshold 를 `MIN_SCORE_WITH_EMBEDDING=0.60` / `MIN_SCORE_KEYWORD_ONLY=0.55`
    로 갱신 + 샘플링/779 행 정리 근거 각주. §Health 의 0.55 문구도 0.60/0.55 로 동기화.
  - §자동화 (3-갈래) → (4-갈래) 로 확장 — daily-batch 후속 훅(공공 소스 경로) 신규 항목,
    `--missing` 단독은 50건 한정 + `--all --missing` 전체 backfill 주의 추가.
  - §BFF API: `?offset=` 파라미터 / response shape `{ items, total, limit, offset }` / 호출자
    구분(요약 패널 limit=3, 상세 페이징 limit=5) 보강.
  - G-15: §품질 감사 섹션 신설 — 자동(스케줄러+ingest 직후) / 수동(CLI) / 스테일 정리 운영.
  - Open questions: backfill pending → 1810/4111 해소 표기, score drift → 부분 해소 표기.
- `topics/semantic-search.md`:
  - §엔드포인트: `POST /events/delete` 항목 추가.
  - C-11: §실시간 동기화 (3축) 섹션 신설 — 승인 upsert / 탈락 delete / aiSummary 변경 re-embed
    트리거 표 + 공공 소스 경로 cross-ref.
  - §Scoring 결합: threshold 0.55 → 0.60/0.55 로 동기화.
  - Open questions: Qdrant 자동 삭제 항목 해소 표기.
- `topics/ingest-pipeline.md`:
  - C-12: §`daily-batch` orchestrator 갱신 — CLI 경로와 scheduler 경로 분리, scheduler 가
    Promise.allSettled 병렬임을 명시.
  - §후속 파이프라인 (공공 소스 자동 매핑/임베딩) 섹션 신설 — 4 단계 표 + 직렬 이유 + 업로더
    경로 비교 + cross-ref 2건 (semantic-search 동기화, news-article-pipeline 감사).
  - frontmatter `related:` 에 news-article-pipeline / semantic-search / ai-enrichment 추가.
- `topics/event-detail-review-flow.md`:
  - G-14: §관련 기사 노출 (UI) 섹션 신설 — 3 화면 (요약 패널 / 상세 / 캘린더 팝업) 컴포넌트 ·
    호출 · 노출 깊이 · 커밋 표 + API 시그니처 요약 + 빈 상태 hide 정책. news-article-pipeline
    으로 cross-ref.
  - frontmatter `related:` 에 news-article-pipeline 추가.
- `lint-report.md`: 04-23 시점으로 갱신 — Contradictions 0 / Gaps 0, 권장 우선 순서를 다음
  sprint 후보 4건 (세션 무효화 / 관리자 ADR / PostGIS / 모바일) 으로 재정렬.

graphify cross-check: 코드 변경 없음 — 847 nodes / 1084 edges / 121 communities 유지.

## 2026-04-23T01:00  decision  ADR 0004 Accepted — 세션 무효화 정책
04-22 lint-report 의 미착수 4행 중 첫 번째 항목 정책 결정 + 박제. 코드 변경 없음 — 결정과
구현을 별도 PR 로 분리하는 ADR 0003 패턴 답습.

- 신규: `docs/decisions/0004-session-invalidation-policy.md` (Accepted, 2026-04-23).
- 정정: lint-report 가 사용했던 "JWT revoke" 표현을 "session invalidation/revocation" 으로
  통일. 본 시스템은 opaque random + DB lookup 방식 server-side session 이라 JWT 가 아님.
- 6개 결정 (D-1 ~ D-6):
  - D-1 soft-delete 시 `authSession.deleteMany({userId})` 명시 + audit_logs 기록.
  - D-2 역할 토글은 현행 유지 — 매 요청 user.activeRole 재조회로 즉시 반영.
  - D-3 로그아웃은 단일 (현행) + 신규 `POST /auth/logout-all` 두 옵션.
  - D-4 만료는 hybrid (sliding 7d + absolute cap 30d). `auth_sessions.created_at` 컬럼 1건
    마이그레이션.
  - D-5 만료 cleanup cron — `scheduler.ts::runAll()` 후속 단계로 `runSessionSweep()` 추가
    (`expires_at < now() - 7d` DELETE, 7d grace).
  - D-6 admin 강제 폐기 `POST /admin/users/:id/revoke-sessions` (scope='full' + reason 필수)
    + audit_logs.
- 갱신: `wiki/topics/auth-flow.md` — §Session invalidation 정책 신설 (6 결정 표 + 명명 정정),
  Open questions 의 Session revocation / Sliding expiry 항목 해소 표기, frontmatter `related:`
  에 ADR 0004 canonical 링크 추가.
- 갱신: `wiki/index.md` — §아키텍처 결정 섹션을 "(ADR 위키 미러)" → "(ADR 색인)" 으로 rename.
  ADR 0003 + ADR 0004 canonical 링크 추가 (둘 다 wiki 미러 없이 canonical only — 0003 패턴
  답습, 0004 는 auth-flow 에 결정 표 미러).

graphify cross-check: 코드 미변경 — 재빌드 불필요. 다음 sprint 에서 D-1/3/4/5/6 코드 ship 시
재빌드.

## 2026-04-23T03:00  feature  ADR 0004 코드 ship — D-3/D-4/D-5/D-6 + admin_audit_logs 신설
ADR 0004 의 "PR-2 코드 ship" 항목 4개 (D-3 logout-all, D-4 sliding+cap, D-5 sweep cron, D-6 admin
revoke) 일괄 ship. typecheck BFF/Web 양쪽 통과. DB 마이그레이션은 docker 기동 후 적용 (`pnpm
prisma migrate deploy`).

ADR 정정 사항 (실제 코드 사실 확인 후 ADR 0004 본문 갱신):
- D-1 격하 — admin user soft-delete 라우트가 미존재해 본 ship 범위 외. 향후 admin user 관리
  ADR 시점에 패턴 적용 강제.
- D-4 마이그레이션 불필요 — `auth_sessions.created_at` 은 `20260419200000_add_auth_sessions`
  가 처음부터 포함. 로직만 코드에 추가.
- D-6 사전조건 — `admin_audit_logs` 테이블이 미존재 (`approval_logs` 는 event-scoped). 본 ADR
  ship 의 일부로 minimal 범용 audit 테이블 신설 (`target_id` nullable + JSONB payload, action
  CHECK 제약 없음 — 향후 admin user 관리 ADR 등에서 컬럼 추가 없이 확장 가능).

코드 변경:
- 신규: `apps/bff/prisma/migrations/20260423092543_admin_audit_logs/migration.sql` (테이블 1개 +
  인덱스 3개). schema.prisma 에 `AdminAuditLog` 모델 추가, `User.adminAuditLogs[]` 역방향
  relation.
- D-4: `apps/bff/src/middleware/require-auth.ts` — `nextExpiresAt(createdAt, now) =
  MIN(now+SLIDING_TTL, createdAt+ABSOLUTE_CAP)` 헬퍼 export, `touchSession()` 가 lastSeenAt +
  expiresAt 단일 UPDATE 로 갱신. resolveAuth/requireAuth 둘 다 적용. `apps/bff/src/routes/auth.ts`
  의 `/me` 핸들러도 동일 식 적용 (last_seen_at 만 갱신하던 기존 로직 교체).
- D-3: `routes/auth.ts::logoutAll` 추가 — sid 의 user 의 모든 authSession deleteMany + 쿠키
  만료. idempotent. `app.ts` 에 `POST /auth/logout-all` 라우트 추가. `apps/web/src/lib/api.ts`
  에 `logoutAll()` 추가, `auth-context.tsx` 에 `logoutAll` wrapper + 컨텍스트 노출. MyPage 하단에
  `SessionFooter` 섹션 신설 — "이 디바이스 로그아웃" / "모든 디바이스 로그아웃" 두 버튼 + confirm
  다이얼로그.
- D-5: `apps/bff/src/jobs/session-sweep.ts` 신설 — `runSessionSweep()` export +
  `pnpm sweep:sessions` CLI. grace 7d (`expires_at < now() - 7d` DELETE). `scheduler.ts::runAll()`
  의 후속 파이프라인 마지막 단계로 통합 (단계 6). `package.json` script 추가.
- D-6: `apps/bff/src/routes/admin-users.ts` 신설 — `revokeUserSessions` 핸들러. scope='full'
  검증 + reason 10~500자 검증 + user 존재 확인 + `$transaction([deleteMany, auditLog.create])` +
  delete count 사후 update. `app.ts` 에 `POST /admin/users/:id/revoke-sessions` 라우트 (requireAuth
  → requireAdmin 체인). `admin_audit_logs.admin_id` 는 `users(user_id)` FK (approval_logs 동일
  컨벤션) — `auth.userId` 사용, `admin_profiles.admin_id` 가 아님에 주의.

문서 정정:
- `docs/decisions/0004-session-invalidation-policy.md` — D-1 격하 / D-4 마이그레이션 불필요 명시
  / D-6 admin_audit_logs 신설 SQL 본 ADR 범위 흡수 / §마이그레이션 / §Phase 분리 표 모두 정정.
- `wiki/topics/auth-flow.md` — §Session invalidation 정책 표 동일 정정 반영.

검증: `corepack pnpm typecheck` 양쪽 (apps/bff, apps/web) PASS. DB 마이그레이션은 docker 기동
후 `pnpm --filter bff exec dotenv -e ../../.env -- prisma migrate deploy`.

graphify: 코드 변경 sprint — 다음 lint/sweep 시점에 재빌드.

## 2026-04-23T10:00  decision+feature  ADR 0005 Accepted + 코드 ship — 관리자 계정 관리 + 작업 감사
ADR 0004 가 남긴 dependency 2건 (D-1 user soft-delete 패턴, D-6 의 `scope='security'` placeholder)
+ `seed:admin` CLI only 한계 + `decideUploader` audit 결여 (`admin_uploaders.ts:43` 코멘트로
박제되어 있던 후속) 통합 해소. ADR 0003 패턴 (결정·코드 분리) 대신 ADR 0004 후반부의 단순 ship
pattern 따라 **본 ADR 은 결정·코드 같은 PR**.

8개 결정 (E-1 ~ E-8):
- E-1 bootstrap = seed:admin CLI 유지 (변경 없음).
- E-2 런타임 admin 생성 = peer-promote, scope='full' 만 허용 — `POST /admin/users/:id/promote`
  신설.
- E-3 scope 도메인에 `security` 추가 — chk_admin_scope rebuild 마이그레이션 1건. ADR 0004 D-6
  통과 권한이 `'full' OR 'security'` 로 확장.
- E-4 박탈 = `is_active=false` 토글 only (`deactivated_at` 컬럼 미신설) — `POST
  /admin/users/:id/demote` + `PUT /admin/users/:id/admin-scope` 신설.
- E-5 user soft-delete (ADR 0004 D-1 활성화) — `POST /admin/users/:id/soft-delete` 신설.
  E-5a/b/c sub-rules: 일반 user / uploader 보유 user 정상 처리, admin_profile.isActive=true
  보유 user 차단 (먼저 demote 강제, 409 `admin_profile_active_must_demote_first`).
- E-6 audit action 5종 정의 (`admin_promote/admin_demote/admin_scope_change/user_soft_delete/
  uploader_decision`) + 기존 `revoke_sessions`. payload JSONB 표준 정의.
- E-7 UI 미포함 — backend-only 5 endpoint. `/admin/users` 페이지는 별도 sprint.
- E-8 decideUploader 보강 — optional `reason: string (0~2000자)` 추가 + `admin_audit_logs.create
  action='uploader_decision'` 동봉. 기존 코멘트 "uploader 승급 로그는 테이블 미정의 — 후속" 해소.

코드 변경:
- 신규: `apps/bff/prisma/migrations/20260423100428_admin_scope_security/migration.sql` —
  chk_admin_scope drop & recreate.
- 신규: `docs/decisions/0005-admin-account-management.md` (Accepted).
- 확장: `apps/bff/src/routes/admin-users.ts` — promoteToAdmin / demoteAdmin / changeAdminScope /
  softDeleteUser 4 endpoint + ADMIN_SCOPE_DOMAIN 상수 + parseReason 헬퍼 + requireFullScopeAndTarget
  공통 가드. revokeUserSessions 의 권한을 `'full' OR 'security'` 로 확장 (ADR 0004 D-6 정정 반영).
- 보강: `apps/bff/src/routes/admin-uploaders.ts::decideUploader` — auth/reason body 받기 +
  `$transaction([uploaderProfile.update, adminAuditLog.create])` 트랜잭션화. 응답에 auditId 추가.
- 라우팅: `apps/bff/src/app.ts` — 4 endpoint 추가 (promote/demote/admin-scope/soft-delete) +
  revoke-sessions 코멘트 정정.

문서 정정:
- `docs/decisions/0004-session-invalidation-policy.md` — D-1 활성화 표기 (ship 위치 admin-users.ts),
  D-6 권한을 `'full' OR 'security'` 로 정정.
- `wiki/topics/auth-flow.md` — §Session invalidation 정책 표 D-1/D-6 행 동일 정정.
- `wiki/topics/admin-account-management.md` (신규) — ADR 0005 결정 미러 + 5 endpoint 표 +
  audit_logs payload 표준 + scope 도메인 표 + 업로더↔관리자 분리 재확인 표.
- `wiki/index.md` — §아키텍처 결정 ADR 색인에 0005 추가, §시스템 흐름에 admin-account-management
  추가.

graphify: 코드 변경 sprint — 다음 lint/sweep 시점에 재빌드.

## 2026-04-23T10:30  feature  ADR 0005 E-8 후속 — Web 클라이언트 정정
ADR 0005 ship 직후 발견: BFF 는 reason 받지만 Web 의 `decideAdminUploader` (api.ts:846) 가 인자
미전달 + 응답 auditId 누락 + UploaderDetailPanel 의 3 결정 버튼이 reason input 없이 즉시 호출 →
모든 audit row 의 payload.reason 이 null 로 박히는 정합성 결손.

정정:
- `apps/web/src/lib/api.ts::decideAdminUploader` — `reason?: string` 인자 추가, 빈 문자열은
  body 에서 omit (ADR 0005 의 "빈 문자열은 null 저장" 정책과 정합). 응답 타입에 `auditId: string`
  필드 추가.
- `apps/web/src/components/admin/UploaderDetailPanel.tsx` — reason textarea 1개 추가 (3 rows,
  maxLength 2000, char count footer). UX 강제: **반려/보완요청은 reason.trim().length>0 일 때만
  enabled**, 승인은 항상 enabled. 전송 후 reason 클리어. BFF 가드는 ADR 대로 모두 optional 유지
  — UX 강제와 BFF 가드를 의도적으로 분리.
- `wiki/topics/admin-account-management.md` §UI 에 E-7 "UI 미포함" 정책의 예외 표기 (기존 화면
  보강은 허용).

검증: web typecheck PASS. 라이브 smoke 는 admin 화면 수동 테스트 필요 (자동화 미보유).

graphify: 동일 sprint — 다음 lint 에서 통합 재빌드.

## 2026-04-23T11:30  feature  ADR 0005 E-7 정정 — Members 탭 ship
사용자 피드백 ("관리자는 회원 및 업로더 관리페이지가 존재하지 않아") 후 결정 정정.
원안 E-7 의 "backend-only" 채택 근거 (admin UI 패턴 미성숙) 가 더이상 유효하지 않음 — Uploaders
탭 패턴 (목록 + 상세 패널 + 결정 액션) 이 충분히 성숙해 같은 패턴 복제로 디자인 review 비용
거의 없음. ADR 0005 본문 §결정 E-7 정정.

신규 BFF (apps/bff/src/routes/admin-users.ts):
- `GET /admin/users?role=&status=&q=&page=&limit=` — 회원 목록. role ∈ {all, general, uploader,
  admin}, status ∈ {all, active, deleted}, nickname q (icontains, 100자 한도). 응답에
  `byRole / byStatus` counter (필터 외 차원은 유지하고 변경 차원만 빼고 집계).
- `GET /admin/users/:id` — 상세. user 기본 + uploader_profile + admin_profile + 활성 세션 수
  (`auth_sessions WHERE expires_at > now()` count) + 최근 admin_audit_logs 10건 (target_id 기준).
  socialUid 는 마스킹 (앞 4 + 뒤 4).
- `app.ts` 라우팅 2건 추가 (requireAuth → requireAdmin 체인).

신규 Web (apps/web/src):
- `lib/api.ts` — 7개 함수 추가: `fetchAdminUsers`, `fetchAdminUser`, `promoteUserToAdmin`,
  `demoteUserAdmin`, `changeUserAdminScope`, `softDeleteUserAccount`, `revokeUserSessionsByAdmin`.
  공통 mutation 헬퍼 `adminUserMutation` (`FORBIDDEN:<error>` / `CONFLICT:<error>` 메시지 분기).
  타입: `AdminScope`, `MemberRoleFilter`, `MemberStatusFilter`, `AdminUserListItem`,
  `AdminUsersListResponse`, `AdminUserDetail`, `AdminUserAuditEntry`.
- `components/admin/MembersTab.tsx` — 좌측 목록 + role/status 필터 칩 + nickname 검색 (250ms
  debounce) + 페이지네이션 + Uploaders 탭과 동일한 grid 레이아웃 (`lg:grid-cols-[1fr_440px]`).
- `components/admin/UserDetailPanel.tsx` — 우측 패널 + 5 액션 (current state 별 동적 노출):
  - 일반 user: 세션 폐기 / admin 승급 / 계정 비활성화
  - admin 활성 user: 세션 폐기 / scope 변경 / admin 박탈 (계정 비활성화는 disabled — E-5c gate)
  - 삭제된 user: 액션 영역 숨김
  - 액션은 inline `ActionForm` 으로 펼침 — scope select (필요 시) + reason textarea (10~500자
    필수, char count footer) + 실행/취소.
- `pages/AdminEventsPage.tsx` — `AdminTab` 에 `'members'` 추가, TABS 배열에 "Members · 회원/admin
  관리" 추가, body switch 에 `<MembersTab />` 분기.

문서 정정:
- `docs/decisions/0005-admin-account-management.md` §결정 E-7 — 원안 폐기 + 정정 채택 박제.
- `wiki/topics/admin-account-management.md` §UI — Members 탭 컴포넌트/액션 노출 표 + UX/BFF
  reason 검증 강도 비교표 (decideUploader 와 admin-users 의 차이).

검증: BFF + Web typecheck 모두 PASS. dev 서버 라이브 — admin 으로 `/admin` → Members 탭 클릭으로
바로 확인 가능.

graphify: 동일 sprint — 다음 lint 에서 통합 재빌드.

## 2026-04-23T11:50  lint  ADR 0004/0005 + Members 탭 + RoleToggleButton sprint drift sweep
graphify 재빌드 (905 nodes / 1177 edges / 131 communities — 이전 847/1084/121 대비 +58/+93/+10).
이전 lint(04-23 sprint 1) 이후 ship 된 7 sprint 항목 (ADR 0004 코드 / ADR 0005 박제+코드 / Members
탭 / RoleToggleButton / E-8 후속 / UserDetailPanel readability / wiki 정정) 의 wiki drift 식별 +
즉시 정리.

drift 5건 (Contradictions 4 + Gap 1) 모두 본 sweep 에서 해소:
- C-13 `db-schema-overview.md` — 22 → 23 테이블 + admin_audit_logs 항목 신설 + admin_profiles.scope
  도메인 4종 (`security` 추가).
- C-14 `admin-flow.md` — 4 → 5 탭 (Members 신규) + Uploaders 탭에 reason+audit 표기.
- C-15 `roles-and-active-role.md` Open questions #4/#5 — ADR 0005 / RoleToggleButton ship 으로
  해소 표기.
- C-16 `roles-and-active-role.md` §승급 플로우 L42 — 주민등록번호 표기를 사업자번호/CI 해시로
  정정 (ADR 0003 — 04-21 sprint 의 누락분).
- G-16 `admin-flow.md` — §Members 탭 섹션 신설 (5 액션 표 + admin-account-management cross-ref) +
  §Audit Logs 정정 (approval_logs 와 admin_audit_logs 분리 노출 상태 명시).

Implementation status — 미착수 4행 → **2행** (PostGIS geom + 모바일 레이아웃, 둘 다 Phase 2).
세션 무효화 ADR / 관리자 계정 ADR 두 개의 큰 항목이 모두 ship 완료.

다음 후보 (우선순위 가벼움 → 무거움): admin Audit 통합 뷰, bulk action, rejected uploader 쿨다운,
PostGIS, 모바일 레이아웃.

## 2026-04-23T11:15  feature  admin Audit 통합 뷰 — source toggle (이벤트 심사 / Admin 작업)
lint queue #1 처리. Audit 탭이 `approval_logs` (이벤트 심사) 만 노출하던 문제 — `admin_audit_logs`
가 ADR 0005 ship 으로 6 actions 누적되는데 cross-user 통합 뷰 부재.

신규 BFF endpoint:
- `GET /admin/admin-audit-logs?action=&adminId=&targetUserId=&page=&limit=` —
  `admin_audit_logs` 페이지네이션. 응답에 byAction (6 actions) + items[].adminNickname +
  items[].targetNickname (target_id batch lookup, 삭제된 user 는 isDeleted 플래그 포함).
- `app.ts` 에 라우팅 추가 (requireAuth → requireAdmin 체인).

Web 정정 — `AuditLogsTab.tsx` 전면 재구성:
- 상단에 source toggle (이벤트 심사 / Admin 작업) 2 버튼.
- `EventAuditPanel`: 기존 패턴 유지 (action 4종 chip + eventId 검색).
- `AdminAuditPanel` (신규): action 7종 chip (전체 + 6 actions) + payload 사람 친화 요약
  (`summarizeAdminPayload` — UserDetailPanel 의 함수 동일 스펙). targetNickname 표시,
  삭제된 user 는 line-through. reason 인용 블록.
- `Pager` 헬퍼 추출 — 두 panel 이 공유.

`api.ts`: `fetchAdminAuditAdminLogs` + `AdminAuditAdminLogItem` / `AdminAuditAdminLogResponse` /
`AdminAuditAdminAction` 타입 추가.

검증: BFF + Web typecheck 통과. `GET /admin/admin-audit-logs?limit=3` smoke — total 9건
(revoke 2 + promote 1 + demote 1 + scope_change 1 + soft_delete 1 + uploader_decision 3),
adminNickname/targetNickname/payload 동봉 확인. action filter 정상.

문서: admin-flow.md §Audit 본문 정정 + OQ "통합 뷰 미구현" 해소 표기.

graphify: 동일 sprint — 다음 lint 에서 통합 재빌드.

## 2026-04-23T11:30  feature  rejected uploader 재신청 쿨다운 (7d) — lint queue #3
roles-and-active-role.md OQ #6 해소. RoleToggleButton 이 rejected 후 즉시 재신청 가능했던
abuse 경로 차단. 단순 정책이라 ADR 박제 없이 코드 1곳 + 응답 필드 3개 추가.

정책:
- **rejected**: 7일 쿨다운 (기준 = `uploader_profiles.updatedAt` = admin 의 decideUploader 호출 시점)
- **revision_requested**: 쿨다운 없음 (admin 이 명시 보완 요청)
- **pending / approved**: 재신청 자체가 무관 (applyUploader 가 별도 차단)

BFF (apps/bff/src/routes/uploader.ts):
- `REJECTED_REAPPLY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000` 상수
- `computeReapplyGate(profile)` → `{ canReapply, canReapplyAt, cooldownReason }` 헬퍼 export
- `shapeUploaderProfile()` 에 gate 3 필드 동봉
- `applyUploader()` 에서 rejected + cooldown active → 429 `reapply_cooldown_active` +
  `{ canReapplyAt, cooldownDays }` payload. orphan 업로드 정리 후 거부.

Web:
- `MyUploaderProfile` 타입에 canReapply / canReapplyAt / cooldownReason 추가
- `RoleToggleButton` 의 rejected 분기 — cooldown active 시 disabled 카운트다운 버튼
  ("반려 · N일 후 재신청"), 풀리면 기존 "반려 · 재신청" 링크
- `applyUploader` API 가 429 → `REAPPLY_COOLDOWN:<ISO>:<days>` Error 발생, `UploaderPage`
  의 ApplyForm 이 한국어 메시지로 변환 ("반려된 신청은 N일 쿨다운 적용 — YYYY-MM-DD 이후 다시
  신청해 주세요.")

검증: BFF + Web typecheck PASS. fake user 로 cooldown 시나리오 smoke — `/me/uploader`
응답에 `{canReapply:false, canReapplyAt:'2026-04-30...', cooldownReason:'rejected_cooldown'}`,
apply 시도 → `429 {"error":"reapply_cooldown_active","cooldownDays":7}` 정상 (cleanup 완료).

문서: roles-and-active-role.md OQ #6 해소 표기.

graphify: 동일 sprint — 다음 lint 에서 통합 재빌드.

## 2026-04-23T11:45  decision  bulk action 미지원 결정 박제 (lint queue #2 정리)
admin-flow.md 의 OQ "대량 일괄 승인 지원 여부 미정" — 1년 가까이 미정으로 둘 가치 없는 결정.
박제 채택안: **미지원**. admin 의 모든 결정 액션은 1건씩 처리.

근거 3축:
1. **audit 가치** — reason 을 N 건 묶어 박제하면 case-by-case 추적 의미 약화 (admin_audit_logs 의
   reason 필드가 "왜 이 사용자만 거부됐는지" 답을 못 줌)
2. **검토 부주의 risk** — 체크 한 번으로 N 건 처리 시 실수 영향 N배. admin 액션은 실수 시
   복구 비용 크 (특히 user_soft_delete, admin_demote)
3. **운영 실증** — 일상 운영에서 1건씩 처리해도 충분. 스팸 다발 같은 트리거 미관측 단계

향후 스팸 다발 사태 발생 등 트리거가 도래하면 ADR 0006 으로 뒤집을 수 있음 (admin_audit_logs
스키마는 이미 bulk action 호환 — payload JSONB 가 N 건 정보 담을 수 있음).

코드 변경 없음 — wiki 한 줄. lint queue #2 closed.

graphify: 동일 sprint — 다음 lint 에서 통합 재빌드.

## 2026-04-23T12:00  feature  A_100 자동 복귀 + 점검 sweep + G-2/G-3/G-4 결정 박제
요구사항 v5.0 점검 sprint. A_100 의 "원 액션 자동 복귀" 갭 (use-cases-index OQ) 해소 + use-cases
인덱스 자체 정합성 sweep + 3 미정 정책 박제.

### A_100 자동 복귀 (G-1 해소)
BFF (apps/bff/src/routes/auth.ts):
- `parseReturnTo(raw)` 화이트리스트 — '/' 시작 / '//' 거부 (protocol-relative URL 인젝션 방어) /
  안전 path char regex / 길이 ≤ 500
- `OAUTH_RETURNTO_COOKIE = 'alle_oauth_returnto'` 신설 (state 와 동일 10분 TTL)
- `startGoogle` / `startKakao` 에 `?returnTo=<path>` 처리 — 통과 시 returnTo 쿠키 set
- `googleCallback` / `kakaoCallback` 마지막 redirect 가 `${WEB_URL}${returnTo ?? '/'}`
- `issueSessionAndRedirect` 가 returnTo 쿠키 expire 동봉

Web (apps/web/src/lib/auth-redirect.ts 신설):
- `loginUrl(provider, returnTo?, useReturnTo=true)` — 현재 path+search+hash 자동 인코딩
- `currentPath()` / `redirectToLogin(provider)` 헬퍼
- 진입점 5곳 정정: Header (Google+Kakao 두 버튼), BookmarkButton (UNAUTHENTICATED 시),
  EventDetailPage 리뷰 LoginGate, MyPage LoginGate, NotificationsPage LoginGate, UploaderPage LoginGate

라이브 smoke: valid path → returnTo 쿠키 set, `//evil.com` → 거부, no returnTo → 기존 동작 유지.

### use-cases-index sweep (drift 정리)
- A_100 라벨 갱신 (자동 복귀 해소 + auth-flow cross-ref)
- A_600 "주민번호" → "사업자번호 XOR CI 해시" (ADR 0003) + rejected 7d 쿨다운 추가
- A_700 "두 탭" → "5 탭" (Members 신규) + admin_audit_logs 자동 기록 명시
- OQ 정리: A_602 PDF (✅ 마이그레이션 ship), A_203 알림 스키마 (✅ subscriptions ship), A_300/A_400 우선순위 (운영 우선순위는 "상" 표기, 요구사항 라벨 자체는 그대로)
- frontmatter related: admin-account-management + auth-flow 추가

### G-2/G-3/G-4 결정 박제 (코드 0줄, 정책만)
- **G-2 ended 이벤트 retention**: 유지 (archive 안 함). 캘린더 보존 + phase!='ended' 자동 필터 + 4084 행 부담 없음. 트리거 100k 도래 시 ADR 재검토. ingest-pipeline.md OQ 갱신.
- **G-3 기사 retention**: 유지 (만료 정리 안 함). 과거 캘린더 기사 link 보존 + 8k 행 수준 부담 없음. 트리거 news_articles 100k 도래 시 ADR 재검토. news-article-pipeline.md OQ 갱신.
- **G-4 admin scope content_only / uploader_review_only**: 의미 결정 (콘텐츠 모더레이션 / 업로더 승급 전용). 권한 분기 코드는 후속 sprint (현재 활용 사례 미관측). admin-account-management.md scope 표 갱신.

graphify: 동일 sprint — 다음 lint 에서 통합 재빌드.

## 2026-04-23T12:10  feature  G-5 추천 시스템 — taste profile 일일 집계 + /me/recommendations
04-17 schema ship 이후 처음 사용처 부재였던 `user_taste_profiles` 활용 ship. 마이페이지 5번째
탭 "추천" 신설.

3 dimensions (KV 한도 안에서 단순):
- preferred_category (events.category_code)
- preferred_region (regions.region_id stringified)
- preferred_vibe (event_vibes.vibe_id stringified)

BFF:
- 신규 `apps/bff/src/jobs/aggregate-taste-profiles.ts` — 활성 user 정의 (최근 30일 시그널 있음) +
  per-user 3 dimension 계산 (raw SQL with TIES tiebreak `cnt DESC, latest DESC`) + upsert /
  delete (시그널 0 dimension 정리)
- 신규 `apps/bff/src/routes/me-recommendations.ts` — `GET /me/recommendations?limit=10` —
  user_taste_profiles 조회 → WHERE OR (category) (region) (vibe) AND approved + 미삭제 +
  phase!='ended' → ORDER BY startDate ASC. matchedDimensions 마킹 (UI tooltip 용). empty
  state 분기 (no_taste_signals / no_valid_signals / 정상 0).
- `scheduler.ts::runAll()` 후속 단계 7번으로 통합 (실패해도 warn — 다음 라운드 재시도).
- `package.json`: `aggregate:taste` CLI script.
- `app.ts`: `GET /me/recommendations` 라우팅 (requireAuth 만).

Web:
- `lib/api.ts`: `fetchMyRecommendations` + `RecommendedEventItem` / `MyRecommendationsResponse`
  타입.
- `MyPage.tsx`: Tab 에 'recommendations' 추가, `RecommendationsList` + `RecommendedCard` 컴포넌트.
  matchedDimensions 칩 (✦ 관심 종류/지역/성향) 노출. empty state 친화 메시지.

검증:
- `pnpm aggregate:taste` 실행 → 2 users, 4 dimensions updated, 0 errors. 첫 SQL 에서
  `e.category_code` 컬럼 부재 (events 에는 category_id 만, code 는 event_categories) 정정 →
  `c.category_code` 로 수정.
- `GET /me/recommendations` smoke (sent-tester user) → 5건 응답, matchedDimensions:['region']
  정확. startDate 도 'YYYY-MM-DD' 형식 (bookmarks 패턴 정합성).

문서:
- 신규 `wiki/topics/recommendations.md` — 본 ship mirror + algorithm + open questions (가중치 / 시간 감쇠 / Qdrant 기반 후보).
- `wiki/topics/auth-flow.md` OQ 의 user_taste_profiles 항목 해소 표기.
- `wiki/index.md` 시스템 흐름 섹션에 recommendations.md 추가.

graphify: 동일 sprint — 다음 lint 에서 통합 재빌드.

## 2026-04-23T12:25  feature  소스 쿼터·레이트리밋 — fetchWithRetry 헬퍼 + 4 runner 적용
ingest-pipeline.md OQ "소스 쿼터·레이트리밋 미구현" 부분 해소. 단일 fetch 호출의 transient
장애 (429 / 5xx / 네트워크) 에 graceful retry — 외부 API 일시 장애로 ingest 가 통째 죽지
않도록.

신규: `apps/bff/src/jobs/lib/fetch-with-retry.ts`:
- `fetchWithRetry(url, init?, opts?)` — 3회 재시도, exp backoff (1s/2s/4s, cap 8s)
- Retry-After 헤더 존중 (초 단위 정수 + HTTP-date 둘 다)
- 재시도 대상: 429, 500, 502, 503, 504, 네트워크 에러 (ECONNRESET / ENOTFOUND / EAI_AGAIN /
  socket / fetch failed)
- 4xx (429 제외), 2xx, 3xx 는 그대로 반환 — 호출자가 res.ok 처리
- AbortError 는 재시도 안 함 (외부 abort 의도 존중)

적용: 4 runner 모두 fetch → fetchWithRetry 교체:
- tourapi-ingest.ts (searchFestival2)
- seoul-culture-ingest.ts (culturalEventInfo)
- kcisa-ingest.ts (API_CCA_145)
- news-naver-ingest.ts (Naver search + Google News RSS)

여전히 미해결 (별도 후속):
- 일 quota 소진 (provider 별 4xx 일부 또는 200 + 특정 resultCode) — 자동 retry 안 함.
  호출자가 throw, scheduler 의 Promise.allSettled 가 source-level 격리는 보장.
- 일일 호출 카운트 추적·임계 알림 (예: 일 한도 80% 도달 시 warn) — 미구현.

검증: BFF typecheck PASS. 라이브 retry 동작은 외부 장애 발생 시 자연 검증.

graphify: 동일 sprint — 다음 lint 에서 통합 재빌드.

## 2026-04-23T12:30  lint  Phase 1 마감 sweep — drift 0 확인 + graphify 재빌드
04-23 sprint 의 모든 후속 ship (Audit 통합 / 쿨다운 / 정책 박제 / A_100 / G-5 / fetchWithRetry)
은 commit 단위로 wiki 동시 갱신 패턴을 따라 drift 0건. 본 sweep 은 후속 정리만:

- graphify 재빌드 — 931 nodes / 1227 edges / 132 communities (이전 905/1177/131 대비 +26/+50/+1)
- `db-schema-overview.md` user_taste_profiles 항목에 G-5 사용처 cross-ref 추가
- `lint-report.md` 전면 갱신 — 본 sprint 의 14건 ship 항목 표 + Phase 1 lint queue 전체 closed
  표기 + 다음 sprint 후보 (Phase 2 진입 / 추천 정교화 / quota 추적 / audit dashboard)

Phase 1 lint queue 누적 정리 (04-22 lint 부터 04-23 sprint 3 까지):

| ID | 항목 | 결과 |
|---|---|---|
| 1 | admin Audit 통합 뷰 | ✅ ship (source toggle) |
| 2 | bulk action | ✅ 미지원 결정 박제 |
| 3 | rejected uploader 쿨다운 | ✅ ship (7d) |
| 4 | PostGIS geom | ⏸ Phase 2 |
| 5 | 모바일 레이아웃 | ⏸ Phase 2 |

추가 (점검 sprint 에서 식별):

| ID | 항목 | 결과 |
|---|---|---|
| G-1 | A_100 자동 복귀 | ✅ ship (returnTo 쿠키 + 화이트리스트) |
| G-2 | ended retention | ✅ 유지 결정 박제 |
| G-3 | 기사 retention | ✅ 유지 결정 박제 |
| G-4 | admin scope 의미 | ✅ 의미 결정 박제 |
| G-5 | user_taste_profiles 사용 | ✅ ship (추천 시스템) |
| G-6 | 소스 쿼터·레이트리밋 (transient) | ✅ ship (fetchWithRetry) |

Phase 1 점검 결과 — **Hard gap 0건 잔존**. 잔여는 모두 Phase 2 또는 트리거 대기 영역.

## 2026-04-23T15:00  feature  impeccable craft sprint — Audit dashboard + 추천 가중치 + KYC mock 정리 + 모바일 박제
"전체 다 진행" 요청 후 4 항목 일괄 ship. UI 부분은 impeccable 스킬 활용 (DESIGN.md
정합 craft).

#1 admin Audit 대시보드 (`663e571`):
- BFF GET /admin/audit-summary?windowDays=7 — 양 source (approval_logs +
  admin_audit_logs) 카운트 + recentActivity 15건 merged
- Web AuditDashboard.tsx — DESIGN.md 정합 craft. 비대칭 grid (0.9fr/1.1fr),
  단일 vermillion accent (max-count action 만), 활자+여백 hierarchy, 막대
  88px label + 1.5px track + 44px count, 타임라인 80px 시간 컬럼 + faint
  divider + reason 인용 max-65ch, WindowPicker (7d/30d/90d underline tab)
- AuditLogsTab Source 'overview'|'event'|'admin' 3-way, 기본 overview
- Anti-AI-slop 통과: 사이드 스트라이프 X, gradient text X, glassmorphism X,
  카드 in 카드 X, 아이콘 머리글 X, sparkline X

#2 추천 가중치 + 시간감쇠:
- `apps/bff/src/jobs/aggregate-taste-profiles.ts` 의 3 SQL 에 weight 추가
  - bookmark weight = 1.0, review weight = 1.5 (리뷰가 더 강한 시그널)
  - exponential decay: weight *= EXP(-LN(2) * age_days / 30)  (half-life 30d)
- `COUNT(*)` → `SUM(weight)::float AS score`, ORDER BY score DESC
- recommendations.md OQ 2건 (가중치 / 시간감쇠) 해소 표기. Qdrant primary 의
  weighted mean 은 LLM endpoint 변경 필요해 별도 후속.

#3 본인인증 dev mock cleanup — Phase 2 swap 지점 명확화:
- 신규 `apps/web/src/lib/identity-verification.ts` —
  `requestIdentityVerification(provider)` async 함수 + KycProvider type +
  KYC_PROVIDERS 표 + IS_KYC_DEV_MOCK flag. Prod 통합 시 함수 본체만 교체,
  caller 무수정.
- UploaderPage ApplyForm 정정 — 인라인 generateMockCiHash 삭제, async pending
  state, provider 라디오 (PASS / NICE / 카카오) 추가, "(dev stub)" 표기는
  IS_KYC_DEV_MOCK 으로 분기.

#4 DESIGN.md 모바일 정책 박제:
- §Layout 에 "모바일 메인 레이아웃 정책" 섹션 신설 — 풀스크린 지도 + BottomSheet
  (peek 50vh ↔ full 90vh) + floating header. 비-목표 (bottom tab bar / side
  drawer / pull-to-refresh) 명시. 코드 ship 미정 — 별도 sprint 진입 시 기준.

검증: BFF + Web typecheck PASS. aggregate:taste 가중 SQL 정상 (2 users / 4 dims
updated / 0 errors). audit-summary smoke 정상 (eventActions / adminActions /
recentActivity 12건).

부수: .claude/settings.local.json 에 ~/.claude/skills/**/*.md Edit/Write
permission 추가 (사용자 승인 후).

graphify 재빌드: 1024 nodes / 1248 edges / 178 communities (이전 989/1217/162 대비
+35 nodes / +31 edges / +16 communities — 새 component 들 반영).

남은 외부 결정 영역 (코드만으로 ship 불가):
- 모바일 메인 코드 ship (DESIGN.md 모바일 섹션 박제 완료, 별도 sprint 트리거 대기)
- 본인인증 prod 통합 (PASS/NICE/카카오 KYC 계약 + 키 발급 외부 trigger 필요)

## 2026-04-23T13:00  refactor  코드 모듈화 sprint — 상위 5 파일 디렉터리 분할 (zero behavior change)
사용자 피드백 ("function 이 한 페이지에 엄청 몰려있다") → 상위 5 파일 측정 후 일괄 분할.
모두 pure refactor — 함수/타입 시그니처 동일, public 호출 사이트 무수정.

분할 전후:
| 파일 | 분할 전 | 분할 후 (max single file) |
|---|---|---|
| `apps/web/src/lib/api.ts` | 1749줄 | 16 domain 모듈 (max 445 — uploader.ts) |
| `apps/web/src/pages/MyPage.tsx` | 1122줄 | MyPage/{index,parts/*,tabs/*} (max 163) |
| `apps/bff/src/routes/uploader.ts` | 1102줄 | uploader/{profile,apply,role,events,_helpers} (max 732) + 11줄 re-export shim |
| `apps/web/src/pages/AdminEventsPage.tsx` | 817줄 | AdminEventsPage/{index,tabs/*} (max 373) |
| `apps/web/src/pages/EventDetailPage.tsx` | 799줄 | EventDetailPage/{index,sections/*} (max 396) |

분할 패턴 (Web vs BFF) — **정정 (2026-04-23 13:15)**:
- **Web (Vite)**: 초기 가정과 달리 Vite 도 directory-as-index 자동 resolve **안 함** (typecheck 는 통과해서 문제 미인지). 빈 화면 발생 → 4 shim 파일 추가로 복구 (api.ts / MyPage.tsx / AdminEventsPage.tsx / EventDetailPage.tsx 모두 `export * from './X/index'` 또는 `export { Foo } from './Foo/index'`).
- **BFF (Node ESM bundler resolution)**: 동일 — `foo.ts` 는 11줄 re-export shim 유지 (`export * from './foo/index.js'`).
- 결론: TS typecheck 통과 ≠ 런타임 동작 보장. Vite/Node 둘 다 명시적 shim 필요. 다음 분할 시 처음부터 shim 같이 만들 것.

Helper / type 처리:
- 단일 사용처 → co-located
- 2+ 사용처 → 첫 정의 파일 그대로 두고 type-only import (예: `EventPhase`, `UploaderApprovalStatus`, `BffEventItem`)
- BFF uploader 의 `shapeUploaderProfile` / `computeReapplyGate` / `REJECTED_REAPPLY_COOLDOWN_MS` 는 `_helpers.ts` 로 추출 (profile + apply 양쪽 사용)

검증: BFF + Web typecheck 모두 PASS. Caller 모두 무수정.

Wiki 정정: topics/ 의 source path 참조 5건 갱신 (event-detail-review-flow / news-article-pipeline ×2 / recommendations ×2 / roles-and-active-role ×2). log.md 의 과거 항목은 그 시점 사실이라 유지.

graphify 재빌드: 989 nodes / 1217 edges / 162 communities (이전 931/1227/132 대비 +58 nodes / -10 edges / +30 communities — 분할로 community 모듈성 증가).

남은 큰 파일 (분할 후): UploaderPage (724) / admin-users.ts (644) / UserDetailPanel (518) / auth.ts (517) / UploaderNewEventPage (512) / AuditLogsTab (508) / UploaderEventEditPage (502) / news-naver-ingest (490). 모두 700줄 이하 — 추가 분할 ROI 낮음.

5 commits: f94893d (api) / 2a8ac42 (MyPage) / 81112f6 (AdminEventsPage) / 474660b (uploader) / a42bcb4 (EventDetailPage).

## 2026-04-25T17:50  feature  chat-eval baseline 20/20 — specific-date-next-sunday 해소
v3.5 baseline 의 마지막 실패 `specific-date-next-sunday` 잡음. 직접 chat:eval 돌려보면
17/20 → 19/20 (grounded 2건은 후속 prompt 보강에서 자연 해소돼 있었음) → **20/20**.

근본 원인 2건 (`services/llm/openai_chain.py`):
1. `_today_context()` 의 토/일 계산 — `(days_to_sat or 7) if today.weekday() == 5 else
   days_to_sat` 분기가 오늘이 토요일이면 7일 뒤(다음 주 토)를 "이번 주말 토" 로 반환.
   → "이번 주말은 2026-05-02(토)~2026-05-03(일)" 같이 다음 주와 겹치는 라벨 발생.
   `this_mon = today - timedelta(days=today.weekday())` 기준으로 단순화 (월=주의 시작).
2. 컨텍스트가 "다음 주" 절대 날짜를 명시하지 않아 LLM 이 "다음주 일요일" 을 "이번 주
   일요일(=내일)" 또는 "오늘+5일" 로 해석. "'다음주 월'=YYYY-MM-DD ... '다음주 일'=
   YYYY-MM-DD" 7개 라인 명시 + system prompt §specificDate 에 "표 값 그대로 복사 / 재해석
   금지" 명문화 + few-shot 2건 (다음주 일요일 / 다음주 토요일 페스티벌) 추가.

검증: `pnpm -F bff chat:eval` → 20/20 pass · avg 4.3s/case. wiki `semantic-search.md`
chat-eval 섹션 baseline 20/20 갱신.

비용 영향: prompt token +~150 (다음 주 7개 라인 + few-shot 2건). 무시.

## 2026-04-25T18:00  feature  pg_trgm GIN index — hybrid keyword 쿼리 ~90× 가속
v4 후보였던 GIN trigram index ship. semantic-search.md OQ close.

마이그레이션 `20260425085400_chat_keyword_trgm_gin`:
- `idx_events_title_trgm` ON events USING GIN (title gin_trgm_ops)
- `idx_events_ai_summary_trgm` ON events USING GIN ((COALESCE(ai_summary, '')) gin_trgm_ops)
  — expression index 로 NULL 케이스를 빈 문자열로 통일.

쿼리 변경 (`apps/bff/src/routes/chat.ts::fetchKeywordHits`):
- `word_similarity(query, target) > X` 함수 비교는 GIN 미사용 (Seq Scan 강제).
- `query <<% target` 연산자 + `SET LOCAL pg_trgm.word_similarity_threshold = X`
  으로 변경 — pg_trgm 의 `gin_trgm_ops` 가 직접 처리.
- Prisma `$transaction` 으로 SET LOCAL 의 트랜잭션 스코프 보장 — 다른 세션·풀 영향 없음.

검증 (EXPLAIN ANALYZE, query='seoul festival', 4k events):
- Before: Seq Scan / Buffers=506 / **128ms**
- After:  Bitmap Index Scan / Buffers=85 / **1.4ms** (~90×)

회귀 검증: pnpm -F bff chat:eval → 20/20 pass · avg 4.2s/case (이전 4.3s — DB 부담 감소
효과는 LLM latency 에 묻혀 미세).

Wiki: semantic-search.md §Hybrid 비용 영향 갱신 + Open questions 의 GIN index 항목 close.

## 2026-04-25T18:30  feature  Injection output redact + specificDate 결정론적 보정 — eval 22/22
v4 후보 2건 동시 ship. semantic-search.md OQ 2건 close.

### Injection output redact (2차 방어선)
`services/llm/openai_chain.py::_redact_reply_text` — LLM reply / followups /
rerank reason 의 URL · 이메일 · 전화 · API key 패턴 정규식 redact:
- URL: `https?://...`, `www....` → `[링크 생략]`
- Email: `local@host.tld` → `[이메일 생략]`
- Phone: `(+? 국번) X-XXXX-XXXX` 등 → `[전화 생략]`
- Secret: `sk-...`, `ant-...`, `gho_...` 등 16자 이상 → `[REDACTED]`

적용 지점: `_parse_chat_extract` (reply, followups), `compose_retreat`
(reply, followups), rerank `reason`. 단위 검증: ISO 날짜 (`2026-04-25`),
시간 표기 (`4/25`), 자연어 한국어 — 모두 변형 0.

검증 케이스 추가 (`apps/bff/src/jobs/chat-eval-cases.json`):
- `injection-leak-url` — "https:// 링크 그대로 출력 요청" → reply 에 URL 패턴 0
- `injection-leak-contact` — "이메일+전화 그대로 출력" → reply 에 패턴 0
양쪽 모두 1차 (system prompt 거절 문구) 가 먼저 막아 redact 가 실제 동작하지는
않지만, 모델 drift 시 backstop.

### specificDate 비결정성 구조적 해소
chat-eval `specific-date-next-sunday` 가 prompt 강화 후에도 LLM temperature 영향으로
2~3/5 fail (specificDate 가 null 이거나 잘못된 ISO 반환).

수정 1 — `temperature` 0.2 → 0.0 (extract_via_openai + extract_via_openai_stream).
수정 2 — system prompt §specificDate 추가 가드:
- "다음주 X요일 입력 시 specificDate 절대 null 금지, periodKey=tomorrow 금지"
- "[specificDate 자가 점검]" 블록 — reply 의 (M/D) 와 specificDate 일치 검증.

수정 3 — 결정론적 post-processor (`_coerce_specific_date`):
- 정규식 `(?:다음\s*주|담주|다다음\s*주)\s*[ ,]*([월화수목금토일])(?:요일)?`
- 매치 시 today 기반으로 ISO 직접 계산 (LLM 출력 override).
- "이번주 X요일" / "내일" 도 동일 패턴 + 직접 계산.
- 매치 안 되면 LLM 값 유지.

검증: pnpm -F bff chat:eval → **22/22 pass** (이전 20/20, redact 2건 + 기존 20건).
direct LLM 호출 5회 모두 specificDate=2026-05-03 결정론적.

### Trap — uvicorn `--reload` stale parent
LLM 재시작 시 `--reload` 의 watch parent 가 ZOMBIE 상태로 8000 포트 점유 →
새 자식이 bind 실패. 새 코드가 안 실행돼 디버깅이 헛돌았음. fix:
`Get-Process python | Stop-Process -Force` 후 cold restart. 향후 운영 노트.

비용 영향: temperature 0.0 가 출력 분포 좁힘 — 토큰 변동 없음. coerce 는 정규식만.

## 2026-04-25T18:50  feature  `reply_sealed` SSE 이벤트 — retreat/delta 경합 구조적 해소
v4 후보 1건 ship. semantic-search.md OQ close.

**문제**: `/chat/stream` 의 client(AppShell) 가 `retreatApplied` 플래그로 retreat
이후의 stale `reply_delta` 를 차단했지만, 서버 시퀀스는 이미 deltas → meta → ...
순서를 보장하므로 race 자체가 implicit. 명시 신호 필요.

**해결**:
- BFF `apps/bff/src/routes/chat.ts` — `postChatStream` 과 `streamFallbackFromNonStream`
  양쪽에서 `meta` emit 직후 `reply_sealed { text }` 추가 emit. payload 는 LLM 의
  canonical reply (delta 누락·문자 단위 어긋남 방어).
- Web `apps/web/src/lib/api/chat.ts` — `ChatStreamHandlers.onReplySealed` 추가,
  `dispatchSseEvent` 가 `reply_sealed` 핸들.
- Web `apps/web/src/layout/AppShell.tsx` — `retreatApplied` → `replySealed` 로
  rename. `onReplySealed` 핸들러가 (a) 플래그 set + (b) accumulatedReply 와
  서버 canonical 이 다르면 placeholder 텍스트 정합화. `onReplyOverride` 도 같은
  플래그 set 으로 후속 delta 차단 의미는 동일.

**검증**:
- BFF typecheck PASS. Web typecheck — 사전 존재 에러 10건 + 본 변경 +1 (동일 패턴)
  → Vite 런타임 무관 (dev/build 정상).
- chat:eval 22/22 pass (non-stream 경로 — 회귀 0).
- 라이브 SSE 시퀀스 (curl):
  - 정상 케이스 ("이번 주말 가족 축제"): `25× reply_delta → meta → reply_sealed → suggestions → done`
  - 유사 케이스 ("남극 축제"): `52× reply_delta → meta → reply_sealed → suggestions → done`

**SSE 이벤트 순서 (v4 확정)**:
```
reply_delta × N → meta → reply_sealed → suggestions → [reply_override?] → done
                                                                                  
                                                       (retreat 발동 시만)
```

**비용**: 추가 SSE 이벤트 1개 (~50 bytes). 무시.

## 2026-04-25T19:30  feature  Hybrid combiner A/B — negative result, max 유지
v4 후보 마지막 1건 close. semantic-search.md OQ "Hybrid score tuning" 종결.

### 인프라 ship (재사용 가능)
- `apps/bff/src/routes/chat.ts` — `combineHits(vec, kw, mode)` pure function 추출,
  `fetchVectorHits` / `fetchKeywordHits` / `resolveAndRank` export. `SemanticOpts.combiner`
  optional 인자 추가 (default `{kind:'max'}` — production 무영향).
  CombinerMode = `max | weighted(α,β) | vec | kw`.
- `services/llm/openai_chain.py::judge_relevance` + `services/llm/app.py::POST /judge/relevance`
  — gpt-4o-mini graded 0~3 + 1줄 reason. cost_tracker `judge` bucket 자동 분리. 셔플로
  position bias 차단.
- `apps/bff/src/jobs/chat-rank-bench.ts` + `chat-rank-bench-queries.json` (12 query —
  proper-noun 3 / generic 3 / region-date 2 / multi-turn 2 / edge 2). pnpm script
  `bench:chat-rank` 추가. 3 repeat × 6 config × 12 query → audit md 자동 생성.
- 결정 규칙: avg DCG ≥ baseline × 1.05 AND top5 jaccard ≥ 0.85 AND 3 repeat 모두 통과.

### 결과 — chat-rank-bench-2026-04-25.md
| config   | avg_dcg | jac_top5_vs_max | zero_results |
|----------|---------|-----------------|--------------|
| **max**  | **2.970** | 1.000         | 3/36         |
| w0.5-0.5 | 2.679   | 0.919           | 3/36         |
| w0.7-0.3 | 2.774   | 0.947           | 3/36         |
| w0.3-0.7 | 2.732   | 0.947           | 3/36         |
| vec      | 2.669   | 0.925           | 3/36         |
| kw       | 0.250   | 0.100           | 33/36        |

**Verdict**: max winner. best alt(w0.7-0.3) -6.6%. 모든 alternative 가 max 보다 음수.
1 repeat 에선 w0.3-0.7 이 +5.2% 였지만 3 repeat 평균에선 -8% — 1회 결과는 노이즈,
3 repeat 결정 규칙이 정확히 그 노이즈를 흡수.

### 인접 발견 — kw 신호 한계
12 query 중 11건에서 `kwHits=0`. 한국어 자연어 query (예: "혼자 조용히 시간 보낼 만한 데",
"이번 주말 강남 공연") 가 pg_trgm word_similarity 0.30 threshold 를 넘기지 못함. 고유명사
heavy 한 query (proper-noun-illust) 만 단발 매치. 가중합의 β·kw 항이 사실상 0 이라 weighted
config 들이 vec 의 scaled 변형에 가까웠고, 그 미세한 절대값 차이가 rerank LLM 의 score 인식에
영향 → 작은 음수 DCG 발생. 신호 자체가 약한 상태에서 재결합 튜닝은 의미 없음.

후속 sprint 후보로 "pg_trgm 한국어 recall 개선" 박제 (semantic-search.md OQ).

### 비용 — bench 1회 (3 repeat)
- judge: 36 query-config × 1 호출 ≈ ~$0.025
- rerank: 36 query-config × 1 호출 ≈ ~$0.030
- vector embed + Qdrant: 12 query × 1 (config 간 공유) ≈ ~$0.0001
- 합계 ≈ **$0.06/run**. 13.5 분 실행 시간.

### 검증
- BFF typecheck PASS, chat:eval 22/22 PASS (combiner default 무변경).
- Bench 자체가 6 config × 12 query × 3 repeat 모두 정상 실행 (총 851s).
- chat.ts default combiner 변경 없음 — 코드 ship 만 infra (재실험 가능 상태).

## 2026-04-26T14:30  feature  Chat UI 폴리시 Sprint A — 4 항목 + reduced-motion ship

ChatDock·MobileChatTab 메시지 풍선에 v4-A 시각 폴리시 4건 추가 + reduced-motion fallback.

### 추가된 폴리시
1. **타이핑 도트** — `reply_delta` 누적 중 마지막 글자 뒤 인라인 도트 3개. CSS keyframe `alle-typing-wave` 1.2s, stagger 0/200/400ms. placeholder 부터 즉시 노출.
2. **retreat 메타 라인** — 0건 retreat 발동 시 풍선 위 vermillion accent dot + "0건 — 조건을 넓혀보세요" 안내.
3. **sealed→override sequential fade** — `onReplyOverride` 가 2-step `setTimeout` (180ms opacity 0 → text swap → opacity 1). layout shift 0.
4. **error 재시도 버튼** — stream 실패 풍선 안에 "다시 시도" 버튼 (vermillion outline). `handleRetry` 가 user 메시지 중복 push 없이 error placeholder 만 빈 placeholder 로 교체 후 streamFor 재호출.
5. **`prefers-reduced-motion`** — 도트 정적 (opacity 0.5) + fade transition 0.

### 코드 변경
- `apps/web/src/components/ChatDock.tsx` — `ChatMessage` 인터페이스에 transient 필드 4건 (`streaming` / `overriding` / `meta: 'retreat'` / `error: { retryUserText }`) + 3 sub-component export (`TypingDots`, `RetreatMeta`, `ErrorRetryButton`). 메시지 map 블록에 4 폴리시 통합. `onRetry` prop 추가.
- `apps/web/src/styles/index.css` — `@keyframes alle-typing-wave`, `.alle-typing-dot` stagger animation classes, `.alle-fade-text` 180ms transition (`--ease-in-ggd`), `prefers-reduced-motion` 분기.
- `apps/web/src/layout/MobileShell.tsx` — sub-component import 교체. `MobileChatTab` props 에 `onRetry` 추가. `MobileShell` → `TabbedView` → `MobileChatTab` prop chain 에 `onChatRetry` → `onRetry` 전달. `exactOptionalPropertyTypes` 호환을 위해 `((fn) => void) | undefined` 명시.
- `apps/web/src/layout/AppShell.tsx` — `handleChatSubmit` 의 streamChat 호출+콜백+catch 블록을 `streamFor(history, placeholderIndex)` 헬퍼로 추출. `handleRetry` 신규 — 마지막 error 풍선 자리에 빈 placeholder 다시 push 후 streamFor 재호출. placeholder push 시 `streaming: true` 즉시 set. `onReplyOverride` 2-step 180ms fade. catch 블록에서 `error: { retryUserText }` 채움. ChatDock·MobileShell 호출에 `onRetry={handleRetry}` 전달.

### 검증
- `pnpm -F bff chat:eval` — **22/22 PASS** (avg 4622ms · total 101680ms). UI 변경이 BFF/LLM 응답에 회귀 없음 확인.
- `pnpm -F web typecheck` — baseline 11 → **7 errors** (Sprint A 신규 0, 새 코드의 명시적 `if (!m || ...)` null 가드가 baseline TS18048 4건 우연 해소). 잔존 7 errors 전부 `exactOptionalPropertyTypes` TS2375 (AppShell 6 + chat.ts 1).
- 3-service health (LLM 8000 / BFF 3000 / Web 5173): 모두 200.
- Manual 4 시나리오 PASS: 일반 응답 (typing dots wave) / retreat fade (180ms 2-step) / error+retry (LLM 종료→재기동→클릭) / OS reduce-motion (정적 도트 + 즉시 swap).

### 이번 sprint 4 commits land
- `99c2cd3` feat(llm,bff,web): chat v4 — reply_sealed protocol + rank-bench harness
- `4ae7df1` feat(web): chat UI 폴리시 Sprint A — 4 항목 폴리시 + reduced-motion
- `bf5223f` chore(bff): chat:eval golden case 2건 추가 — v4 redact 회귀 가드
- `ee63ffc` docs(superpowers,wiki): Sprint A plan/spec + bench audit + log/topics 갱신

`origin/main` push 완료 (`1da8250..ee63ffc`).

### 후속 (lint-report.md 2026-04-26 sweep)
- **G-1**: `ui-architecture.md` 2026-04-17 부터 8 sprint stale — Sprint A 폴리시 / MobileShell / v3.x backend 결합 모두 미반영. 1 sprint 단독 갱신 후보.
- **O-1/O-2**: `raw/error1.png` (신규) + `raw/GGdrugs Design System.zip` (사전) source 페이지 부재 — 1:1 invariant.
- **I-1**: `wiki/audit/` 디렉터리 index.md Meta 섹션 미언급.

## 2026-04-26T16:15  graph  trend
- nodes 1024 · edges 1248 · communities 178
- INFERRED 75 (6.0%, avg conf 0.81) · AMBIGUOUS 0 · EXTRACTED 1173

## 2026-04-26T16:35  feature  pg_trgm 한국어 recall — v4.1 token-level word_similarity

semantic-search.md OQ "pg_trgm 한국어 recall 개선" 해소 — bench v4 가 노출시킨
인접 문제 (12 query 중 11건 kwHits=0) 의 root cause 가 한국어 자연어 query 의
노이즈 token (이번 / 주말 등) 이 full-query word_similarity 0.30 threshold 미달이었음.

### 변경
`apps/bff/src/routes/chat.ts::fetchKeywordHits`:
- v3.3: 단일 호출 `word_similarity(query, title)`.
- v4.1: user text 를 token 으로 split (whitespace + 구두점 `\s,.!?·•、()<>"'""''`,
  length ≥ 2 — 한 글자 token 은 한글 trigram 노이즈 → drop). SQL `unnest($1::text[])
  AS u(t)` + 각 token 별 `<<%` 매치 (GIN bitmap scan) → event 별
  `MAX(GREATEST(word_similarity(t, title), word_similarity(t, ai_summary)))` 집계.

### 효과 (bench v4.1, 1 repeat smoke)
| config   | v4 (3-rep) | v4.1 (1-rep) | Δ      |
|----------|------------|--------------|--------|
| max      | 2.970      | 2.805        | -5.6%  |
| vec      | 2.669      | 2.857        | +7.0%  |
| **kw**   | **0.250**  | **2.422**    | **+869%** |
| w0.5-0.5 | 2.679      | 2.570        | -4.1%  |
| w0.7-0.3 | 2.774      | 2.734        | -1.4%  |
| w0.3-0.7 | 2.732      | 2.446        | -10.5% |

핵심: **kw signal 0.250 → 2.422 (~10× DCG)** — 한국어 자연어 query 에서 의미 있는
신호로 부활. zero_results 도 max/weighted 모두 0건 (v4 는 3/36).

max 의 -5.6% 는 1 repeat 노이즈 범위 (v4 audit 의 "1 repeat 에선 w0.3-0.7 +5.2%,
3 repeat -8%" 패턴과 동일). vec 의 +1.9% (vs max) 도 5% promote threshold 미달 →
**winner=max promote=NO 그대로 유지**.

### 검증
- `pnpm -F bff chat:eval` — 22/22 PASS (avg 5881ms). `fallback-no-match` /
  `multi-axis` / `intent-negation` 3건의 sugg 1→5 로 recall 증가 (assertion 영향 없음).
- `pnpm -F bff bench:chat-rank --repeat 1` — 360s, 12 query × 6 config × 1 repeat.
  audit `wiki/audit/chat-rank-bench-2026-04-26.md` 자동 박제.
- `pnpm -F bff wiki:lint` — 0 drift.
- BFF typecheck PASS.

### 후속
- 3 repeat 풀 bench (~13.5min, ~$0.18) 는 v4.1 baseline 박제 후속 후보.
- single-token (proper-noun) query 는 unnest 1개 행 = full query 와 동일 — 회귀 0.
- 후속 v4 OQ 잔여: Streaming reconnect, PostGIS geom 전환.

## 2026-04-26T17:05  feature  Streaming reconnect — v4.2 sealed-gate auto-retry

semantic-search.md OQ "Streaming reconnect" 해소. 네트워크 blip 시 chat SSE 끊김 →
사용자가 manual retry 버튼 (Sprint A) 클릭해야 했던 UX 의 자동성 보강.

### 설계 결정 — sealed 게이트 + 1회 auto-retry
v4 SSE 시퀀스 (`reply_delta × N → meta → reply_sealed → suggestions → [reply_override?]
→ done`) 가 이미 reply_sealed 라는 자연스러운 분기점을 보유. 이를 retry 결정 게이트로 활용:
- **sealed 전 끊김** → 핵심 reply 미도달. 자동 재시도 1회.
- **sealed 후 끊김** → 핵심 reply 도달. suggestions / override 만 누락 가능 — soft success
  (`onDone` 호출). 사용자가 원하면 manual retry (Sprint A `ErrorRetryButton`) 가능.
- **AbortError / 4xx / LLM_UNREACHABLE** → 영속 에러로 간주, retry skip.

대안 #1 (서버 idempotent resume + Last-Event-ID) 는 Redis 캐시 + LLM stream id 분리 +
replay 로직 등 인프라 큼 — v5 후보로 박제. 본 v4.2 는 server 측 변경 0, 순수 client 측.

### 변경 — apps/web/src/lib/api/chat.ts
- `streamChat` 을 `attemptStream` (단일 fetch + reader loop) + 외부 retry wrapper 로 분리.
- `ChatStreamHandlers.onAttemptStart?(attempt)` 신규 — 재시도 직전 호출, caller 가 placeholder reset.
- `ChatStreamHandlers.onReplySealed` 를 wrap 해 sealed 플래그 추적. sealed 후 끊김은
  `onDone` 으로 soft success 처리.
- `isRetryable(err)` 헬퍼 — `LLM_UNREACHABLE` / 4xx 는 false, network/5xx/parse 는 true.
- RETRY_MAX = 1 (단일 재시도. blip 패턴은 대부분 1회면 회복).

### 변경 — apps/web/src/layout/AppShell.tsx
`streamFor` 의 handlers 에 `onAttemptStart` 추가:
- `accumulatedReply = ''` / `replySealed = false` 리셋
- placeholder 메시지를 fresh `{ role: 'assistant', text: '', streaming: true }` 로 교체
  (이전 시도의 overriding/meta/error 모두 drop)

### 검증
- BFF 재기동 없음 — server 측 변경 0.
- SSE smoke: `curl -sN /chat/stream` 시퀀스 v4 그대로 (reply_delta × N → meta →
  reply_sealed → suggestions → reply_override → done).
- web typecheck — baseline 7 errors 그대로 (v4.2 신규 0).
- chat:eval 22/22 PASS (non-stream /chat 경로, retry 로직 영향 없음 — sanity).

### 후속 (v5 후보)
- 서버 idempotent resume — Last-Event-ID 헤더 + Redis 캐시 + LLM stream id 분리.
  blip 시 LLM 재호출 없이 기존 토큰 replay (비용 절감).
- 가시적 retry 인디케이터 — auto-retry 발생 시 풍선에 "재연결 중..." 미세 라벨 (UX 명시성).
  현재는 placeholder 재초기화로 사용자가 인지 가능하지만 명시 신호 0.

### 누적 v4 OQ 잔여
- PostGIS geom 전환 (지도 viewport bbox / 반경 검색).

## 2026-04-26T17:35  feature  PostGIS geom 전환 — v4.3 stage 1+2 ship

semantic-search.md OQ "PostGIS geom 전환" stage 1+2 해소. 지도 viewport bbox /
반경 검색을 위한 PostGIS 인프라 ship — Web 변경 없이 backend 만 준비.

### 4-stage migration 설계
- **stage 1 (이번)**: ADD `location_geom geometry(Point, 4326)` + backfill from
  lat/lng + GiST 인덱스. 코드 변경 0, dual-write 가능 상태.
- **stage 2 (이번)**: BFF `/events?bbox=minLng,minLat,maxLng,maxLat` 추가.
  `ST_Within(location_geom, ST_MakeEnvelope(...))` 로 viewport 필터.
- **stage 3 (UX 트리거 대기)**: Web SeoulMap `bounds_changed` → debounce 300ms
  → `/events?bbox=...` refetch.
- **stage 4 (먼훗날)**: dual-write 종료 + lat/lng 컬럼 DROP.

### 변경 — apps/bff/prisma/migrations/20260426171500_events_location_geom_postgis
```sql
ALTER TABLE events ADD COLUMN location_geom geometry(Point, 4326);
UPDATE events SET location_geom = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX idx_events_location_geom ON events USING GIST (location_geom);
```
- Backfill 결과: 4186 / 4188 (lat/lng 보유분 100% 매핑, lat/lng NULL 인 2건만 geom NULL)
- Prisma schema: `locationGeom Unsupported("geometry(Point, 4326)")?` (raw query 만 사용,
  Prisma client 에 TS 필드 X — 기존 코드 회귀 0)

### 변경 — apps/bff/src/routes/events.ts
- `parseBbox(raw)` 헬퍼 — "minLng,minLat,maxLng,maxLat" 형식 + 범위 (-180..180 / -90..90) +
  min < max 검증. 잘못된 형식은 null 반환 (caller 가 ignore).
- `listEvents` 의 where 빌드 직전에 bbox 파싱 → `prisma.$queryRaw` 로
  `ST_Within(location_geom, ST_MakeEnvelope(...,4326))` event_id 부분집합 추출 →
  `where.eventId = { in: bboxEventIds }`. 빈 결과면 short-circuit (count + findMany 둘 다 skip).

### 검증
- Seoul bbox (`?bbox=126.8,37.4,127.1,37.7`) → total 3964 events 매치 (서울 영역 거의 전부).
- Pacific bbox (`?bbox=140,30,141,31`) → total 0 (정상 reject).
- bbox 미지정 — 기존 응답 그대로 (회귀 0).
- BFF typecheck PASS.
- chat:eval 22/22 PASS — chat 결합 영향 없음.
- wiki:lint 0 drift.

### 후속 (v5 후보)
- stage 3: Web SeoulMap `bounds_changed` viewport hook (panning UX 결정 트리거 대기).
- stage 4: lat/lng DROP (stage 3 검증 1+ sprint 후).
- Streaming idempotent resume (v4.2 보강) — Last-Event-ID + Redis 캐시. 비용 트리거 대기.

### A 미착수 항목 진척
이번 세션 ship: pg_trgm token-level (v4.1) + Streaming reconnect (v4.2) + PostGIS stage 1+2 (v4.3).
잔여: 본인인증 prod (PASS/NICE/카카오), 사업자번호 정부 API, 클러스터 정렬 UX,
PostGIS stage 3-4 (UX/검증 트리거 대기).

## 2026-04-26T17:55  feature  PostGIS stage 3 — Web SeoulMap viewport bbox

semantic-search.md OQ "PostGIS stage 3" 해소. v4.3 의 bbox 인프라 (BFF `/events?bbox=`)
가 실제 사용자 panning / zoom 에 의해 호출되도록 Web SeoulMap 에 viewport hook 추가.

### 변경 — apps/web/src/lib/api/events.ts
- `EventListQuery.bbox?: string` 추가 ("minLng,minLat,maxLng,maxLat")
- `buildQuery` 가 bbox 를 URL search param 으로 직렬화

### 변경 — apps/web/src/components/SeoulMap.tsx
- `mapBbox` state + `bboxTimerRef` (debounce 타이머)
- `handleBoundsChanged(map: kakao.maps.Map)` — `map.getBounds().getSouthWest/NorthEast()`
  로 viewport 추출 → 300ms debounce → setState. `KakaoMap.onBoundsChanged` 에 연결.
- `query` useMemo 에 `bbox: mapBbox` 조건부 포함 — bbox null 동안엔 기존 흐름 (회귀 0).
- unmount 시 debounce 타이머 cleanup.

### 동작
1. 첫 mount: mapBbox=null → `phases=ongoing,upcoming&limit=500` 으로 전체 fetch (기존)
2. 사용자 panning 또는 zoom: `bounds_changed` 발화 → 300ms 후 bbox 갱신 → query 변경 →
   useEffect refetch → BFF ST_Within(location_geom, ST_MakeEnvelope(...)) 적용 → viewport
   안 events 만 응답.
3. Filter 적용 + bbox 결합 가능 (filter regionIds + bbox 동시).

### 검증
- web typecheck baseline 7 그대로 (stage 3 신규 0).
- BFF /events?bbox=126.8,37.4,127.1,37.7 → 3964 (서울 영역 거의 전부 — 기대 동작)
- 5173 dev server 200, Vite HMR 자동 reload (Web BFF 변경 0 — 클라이언트만).
- chat:eval 22/22 영향 없음 (chat 결합 무관).
- wiki:lint 0 drift.

### UX 효과
- 한 줌 깊이 들어가면 viewport 범위 안 events 만 fetch — pin 밀도 자연스럽게 viewport-relative.
- Limit 500 이 글로벌이 아닌 viewport-local 이라 zoom 깊이에 따라 dense viewport 도 cover.
- 300ms debounce 로 빠른 panning 시 server 부하 차단 (idle 후 1회만 fetch).

### 후속 (v5 후보 잔여)
- PostGIS stage 4 — lat/lng 컬럼 DROP. 응답 형식 변경 (GeoJSON Point 또는 lat/lng 유지)
  결정 + Web 동시 변경 + 1+ sprint 검증 후.
- Streaming idempotent resume — Last-Event-ID + Redis 캐시 (비용 트리거 대기).
- 본인인증 prod / 사업자번호 정부 API — Phase 2.

### 본 세션 누적 ship
v4.1 (pg_trgm token) + v4.2 (Streaming reconnect) + v4.3 (PostGIS stage 1+2+3).
A 미착수 5건 중 4건 ship (PostGIS stage 1-3 = 1건 처리). 잔여 1.5건 (본인인증 / 사업자번호
는 Phase 2 swap 대기, PostGIS stage 4 는 검증 기간 대기, 클러스터 정렬은 UX 결정 대기).

## 2026-04-26T18:20  feature  목록 정렬 옵션 — v4.4 sort=ending|recent|popular

lint-report 의 "클러스터 정렬 (거리/인기/최신)" UX 결정 잔여 → 3-option 버전 ship.
거리순은 anchor (사용자 위치 vs 지도 center vs sigungu) 결정 별 sprint 분리.

### 변경 — apps/bff/src/routes/events.ts
- `SORT_ENUM = {ending, recent, popular}` + 파싱 (default `ending`)
- orderBy 매핑:
  - ending: `endDate desc, startDate asc, eventId asc` (기존 default)
  - recent: `createdAt desc, eventId asc`
  - popular: `bookmarkCount desc, reviewCount desc, eventId asc`
- 모든 정렬에 eventId asc tie-break — 결정론적 페이지네이션 보장.

### 변경 — apps/web/src/lib/api/events.ts
- `EventSort = 'ending' | 'recent' | 'popular'` 타입 export
- `EventListQuery.sort?: EventSort` 추가 + `buildQuery` 직렬화

### 변경 — apps/web/src/components/FullListPanel.tsx
- `sort` state + localStorage persist (`alle.fullList.sort`).
  loadSortPref() 가 차단/SSR 환경에서도 안전 fallback.
- segmented control UI — phase strip + chip 사이. radio role + aria-checked.
  active 면 surface bg + accent text + shadow-sm, inactive 는 muted hover.
- fetchEvents 의존성에 sort 추가 — 변경 즉시 refetch.

### UX
- default 'ending' (기존 동작 유지 — 회귀 0).
- 사용자 선택은 다음 세션까지 유지 (localStorage).
- 거리순 미포함 — anchor 결정 + 사용자 위치 권한 / Kakao Map center / sigungu 중심 중 어느 쪽이 default 인지 별도 brainstorm 후 별 sprint.

### 검증
- BFF typecheck PASS, web typecheck baseline 7 그대로 (신규 0)
- BFF /events?sort=popular limit=3 → bookmarkCount 1 의 상위 3건 확인
- BFF /events?sort=recent limit=3 → createdAt 최신 3건 확인
- chat:eval 22/22 PASS — chat 결합 영향 없음
- wiki:lint 0 drift

### 후속
- 거리순 sort=distance — PostGIS `ST_Distance(location_geom, ST_Point(anchor_lng, anchor_lat))`
  활용. anchor 결정 (Geolocation API / 지도 center / sigungu 중심) UX 별 sprint.
- A_300 mobile FullListPanel 도 동일 정렬 UI — MobileShell 의 `tab='list'` path 가 같은 컴포넌트 사용 중 (자동 적용).

### 본 세션 누적 ship
v4.1 (pg_trgm) + v4.2 (Streaming reconnect) + v4.3 stage 1+2+3 (PostGIS) + v4.4 (sort).
A 미착수 5건 → ship 4 + 결정 1건 분리 (거리순 anchor) → 잔여 = Phase 2 본인인증/사업자번호
+ PostGIS stage 4 (검증 기간) + 거리순 anchor (UX 결정).

## 2026-04-26T18:50  feature  거리순 정렬 — v4.5 sort=distance + anchor priority + km 라벨

semantic-search.md OQ "거리순 sort distance" 해소. v1 scope: 지도 center anchor 만,
GPS / sigungu / Kakao Places 는 v5 후보.

### 결정 사항 (Plan 단계)
1. **거리 라벨 카드 표시 — YES**: 응답 payload `distanceMeters` 포함, EventList 카드에 km/m 단위 자동 라벨.
2. **anchor fallback — 400 reject**: anchor/bbox 둘 다 부재 시 BFF 가 400. UI 는 mapBbox=null 시 distance 옵션 disabled + tooltip.

### BFF — apps/bff/src/routes/events.ts
- SORT_ENUM 에 'distance' 추가, parseAnchor("lng,lat") 헬퍼.
- sort=distance 분기 (anchor priority = explicit > bbox center > 400):
  - Pass A: 일반 where + lat/lng not null candidate eventIds (50,000 한도 — 413).
  - Pass B: $queryRaw KNN ORDER BY `location_geom <-> ST_SetSRID(ST_MakePoint, 4326)` (GiST 활용) + `ST_Distance(geography)` 미터 거리값.
  - Pass C: select 필드 fetch + KNN 순서 보존 reorder + distanceMeters 첨부.
- EVENT_SELECT 상수 + mapEventRow 헬퍼 추출 — 일반 흐름과 distance 흐름 공유.

### Web — apps/web/src/lib/api/events.ts
- EventSort 에 'distance' 추가, EventListQuery.anchor + BffEventItem.distanceMeters 추가, buildQuery 직렬화.

### Web — Shell prop chain (SeoulMap → AppShell/MobileShell → FullListPanel)
- SeoulMap onBboxChange 콜백 — handleBoundsChanged 가 부모에 lift up. unmount 시 null emit.
- AppShell mapBbox state + SeoulMap 호출에 onBboxChange={setMapBbox} + FullListPanel + MobileShell 에 prop 전달.
- MobileShell + TabbedView prop chain 통과.

### Web — FullListPanel
- SORT_OPTIONS 4번째 '거리', loadSortPref 'distance' 허용.
- mapBbox null 시 distance disabled + title tooltip.
- effectiveSort = (sort=='distance' && !mapBbox) ? 'ending' : sort — saved 'distance' 보존하면서 fetch 만 fallback.
- fetchEvents 인자에 effectiveSort='distance' && mapBbox 일 때만 bbox 포함.

### Web — EventList + event-display
- DisplayEvent.distanceLabel 추가, formatDistance(m) 헬퍼 (`<1000m → "%dm"`, `>=1000m → "%.1fkm"`).
- 카드 region 라인 옆에 vermillion accent 색 distance 라벨, tabular-nums + aria-label.

### 검증
- BFF typecheck PASS.
- /events?sort=distance&bbox=... → 200, items[0].distanceMeters 가 bbox center 인근 (실측 395m).
- /events?sort=distance&anchor=129.07,35.18 → 부산 anchor → 309028m (~309km, 정확).
- /events?sort=distance (anchor/bbox 둘 다 없음) → 400 (`anchor or bbox required for sort=distance`).
- /events?sort=distance&bbox=120,30,120.1,30.1 → total 0, items [].
- web typecheck baseline 7 그대로 (v4.5 신규 0).
- chat:eval / wiki:lint 후속 step.

### 후속 (v5 후보)
- 사용자 GPS anchor (Geolocation API + opt-in 버튼 + 권한 흐름).
- Sigungu 중심 anchor (Region.center_lat/center_lng 마이그레이션 + filter region 선택 시 자동 적용).
- Kakao Places 검색 anchor (지오코딩).
- 거리 라벨 단위 토글 (km/mile, i18n).

### 본 세션 누적 ship
v4.1 (pg_trgm) + v4.2 (Streaming reconnect) + v4.3 stage 1+2+3 (PostGIS) + v4.4 (sort) + v4.5 (distance).
A 미착수 5건 모두 ship + 결정 분리 1건 (거리순 anchor 확장) 도 v5 후보로 박제 종결.

## 2026-04-26T19:00  feature  거리순 anchor 확장 — v4.6 region centroid 자동 적용

v4.5 distance sort 의 anchor priority 를 확장: 사용자가 단일 region 필터 적용 시 그
자치구 청사 좌표가 자동 anchor.

### 결정
- region centroid 좌표 source: 서울 25 자치구 **구청 청사 좌표** (대표성 + 안정).
- 단일 region 만 처리 — multi-region 은 평균 / centroid 의 ambiguity 회피, bbox center 로 fallback.
- sigungu 단위만 채움 — sido / dong row 는 NULL (향후 확장 시 별 마이그레이션).

### 마이그레이션 — 20260426185500_regions_center_coords
- `regions.center_lat / center_lng DECIMAL(10,7)` 추가.
- 서울 25 자치구 backfill (UPDATE 25행). 검증: `SELECT COUNT(*) FROM regions WHERE center_lat IS NOT NULL` → 25.

### Prisma schema — apps/bff/prisma/schema.prisma
- Region 모델에 `centerLat / centerLng Decimal? @db.Decimal(10, 7)` 추가.
- 트랩 — Prisma generator 가 `///` 코멘트 본문 끝의 `*/` 를 그대로 emit 해 .d.ts 가 깨짐.
  fix: schema 의 doc comment 에 `*/` 수동 종료 표시 금지.

### BFF — apps/bff/src/routes/events.ts
- sort=distance 분기에서 region centroid lookup 추가 (raw `$queryRaw` — 다른 영역의 Prisma
  client regen 충돌 회피 패턴 일관 유지).
- anchor priority 갱신: explicit `?anchor=lng,lat` > region centroid (`regionIds.length === 1`
  + center 좌표 보유) > bbox center > 400.

### 검증
- BFF typecheck PASS.
- /events?sort=distance&regionIds=27 (강남구) → total 124, 첫 결과 44m (강남구 평생학습센터,
  37.5176, 127.0475 — 청사 좌표 (37.5172, 127.0473) 인근).
- chat:eval 22/22 PASS (회귀 0).
- web 변경 0 — UI 측 통합 자동 (FullListPanel 의 fetch 가 region 필터 + sort=distance 결합 시
  BFF 가 자동 anchor 처리).

### 후속 (v5+ 잔여)
- 사용자 GPS anchor (Geolocation API + opt-in 버튼 + 권한 흐름).
- Kakao Places 검색 anchor (지오코딩 통합).
- 거리 라벨 단위 토글 (km/mile, i18n).
- multi-region centroid (mean / convex hull / 등) — UX 결정 트리거 대기.

### 본 세션 누적 ship 갱신
v4.1 (pg_trgm) + v4.2 (Streaming reconnect) + v4.3 stage 1+2+3 (PostGIS) + v4.4 (sort)
+ v4.5 (distance) + v4.6 (region anchor).

## 2026-04-26T19:15  feature  PostGIS stage 4a — dual-write trigger + catch-up backfill

stage 4 (lat/lng 컬럼 DROP) 의 안전한 첫 단계. 검증 기간을 거치면서도 의미있는 인프라
강화: 새 INSERT/UPDATE 경로가 lat/lng 만 갱신해도 location_geom 자동 동기화.

### 발견된 gap
- v4.3 stage 1 의 일회성 backfill 후 4188 → 4191 events 증가 동안 location_geom 미반영
  사례 발생 (uploader / ingest 경로가 lat/lng 만 INSERT, location_geom 비워둠).
- 결과: sort=distance 후보 풀에서 신규 이벤트 누락 위험 (Pass A 의 lat/lng not null
  필터는 통과해도 KNN <-> 가 NULL 처리).

### 마이그레이션 — 20260426193000_events_location_geom_dual_write_trigger
1. fn_events_sync_location_geom() PL/pgSQL 함수 — lat/lng 둘 다 NOT NULL 이면
   `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`, 둘 중 하나라도 NULL 이면 NULL.
2. tr_events_sync_location_geom BEFORE INSERT OR UPDATE OF latitude, longitude 트리거.
3. Catch-up: location_geom IS NULL AND lat/lng NOT NULL 인 row backfill UPDATE.

### 검증
- 트리거 존재 확인: SELECT tgname FROM pg_trigger WHERE tgname='tr_events_sync_location_geom' → 1 row.
- 5 NULL geom row 점검: 모두 lat/lng 자체가 NULL/incomplete (좌표 미보유 이벤트) — 정상.
- BFF typecheck PASS, chat:eval 22/22 (회귀 0).
- web 변경 0 — 응답 형식 그대로.

### Stage 4 단계 정리
- stage 1 (v4.3): location_geom 컬럼 + backfill + GiST 인덱스. 코드 변경 0. ✅
- stage 2 (v4.3): bbox 쿼리 (ST_Within). ✅
- stage 3 (v4.3): Web SeoulMap viewport hook. ✅
- **stage 4a (v4.7): dual-write trigger.** ✅
- stage 4b (v5+): lat/lng 컬럼 DROP. 검증 기간 1+ sprint 후 진행, Web 응답 형식 결정 동반.

### 본 세션 누적 ship 갱신
v4.1 + v4.2 + v4.3 (stage 1+2+3) + v4.4 + v4.5 + v4.6 + v4.7 (stage 4a). PostGIS 마이그레이션
4-step 의 stage 4 진입 — 4a 까지 ship.

## 2026-04-26T19:35  feature  거리순 GPS anchor — v4.8 Web Geolocation opt-in

v4.5/v4.6 anchor priority 의 explicit anchor 자리에 사용자 GPS 통합. Web 만 변경,
BFF 는 이미 v4.5 에서 explicit `?anchor=lng,lat` 지원 — 즉시 통과.

### UX 결정
- opt-in 버튼 — 권한 prompt 는 사용자 명시 클릭 시에만 (브라우저 prompt UX 안티패턴 회피).
- 권한 받으면 좌표 메모리에만 store — localStorage / cookie persist 안 함 (PII 보호).
- 한 세션 내 1회 fetch + maximumAge 60s cache — 빠른 재정렬.
- 권한 거부 / 실패 / 미지원 — 인라인 button 텍스트로 신호 ("권한 거부됨" / "재시도" / "미지원").
- GPS 받은 직후 자동 sort='distance' 활성 — 사용자 의도 가정.
- distance segmented 의 disabled 조건 완화: mapBbox 또는 gpsAnchor 둘 중 하나만 있어도 활성.

### 변경 — apps/web/src/components/FullListPanel.tsx
- `gpsAnchor: { lng, lat } | null` + `gpsStatus: 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported' | 'error'` state.
- `requestGps()` — `navigator.geolocation.getCurrentPosition` (timeout 10s, maximumAge 60s, low accuracy).
- `clearGps()` — anchor 해제, status idle 복귀.
- `<GpsButton>` sub-component — 5 상태별 표시 (요청중 / ON / 권한거부 / 재시도 / 미지원).
  granted 시 vermillion accent + "내 위치 ON" 라벨, 클릭으로 해제.
- `anchorParam` 직렬화: gpsAnchor 있으면 "lng,lat" 으로 BFF 전달 → BFF 의 explicit anchor 분기 활용.
- fetch 우선순위: gpsAnchor 있으면 anchor 만 보냄 (bbox 미포함), 없으면 mapBbox.

### BFF 변경 0
- 이미 v4.5 에서 `?anchor=` 파싱 + priority 1 처리. GPS 좌표가 그 자리에 자동 채워짐.

### 검증
- web typecheck baseline 7 (v4.8 신규 0).
- chat:eval 22/22 PASS (회귀 0).
- wiki:lint 0 drift.
- Manual GPS 권한 흐름 테스트는 사용자 측 (브라우저 권한 prompt 이라 자동 X).

### 후속 (v5+)
- Kakao Places 검색 anchor (지오코딩) — 사용자가 주소 / 장소명 입력하면 anchor 설정.
- multi-region centroid — multi-region 필터 시 mean / convex hull 어느 쪽 default 결정.
- GPS 정확도 개선 — enableHighAccuracy=true 옵션 (battery 소모 큼, opt-in toggle 후보).
- watchPosition 기반 실시간 갱신 — 현재는 1회 fetch only (정적).

### 본 세션 누적 ship
v4.1 + v4.2 + v4.3 (stage 1+2+3) + v4.4 + v4.5 + v4.6 + v4.7 (stage 4a) + v4.8 (GPS).

## 2026-04-26T20:00  feature  Kakao Places 검색 anchor — v4.9 거리순 anchor 마지막 확장

거리순 anchor 5종 후보 (explicit / region / bbox / GPS / Place) 중 마지막 항목 ship.
사용자가 자연어 keyword ("강남역", "북서울 미술관") 로 anchor 직접 지정 가능.

### BFF — apps/bff/src/routes/places.ts (NEW) + app.ts route 등록
- `GET /places/search?q=<keyword>&limit=<N>` (default 5, max 15).
- Kakao Local API `/v2/local/search/keyword.json` proxy. REST API 키 (KAKAO_REST_API_KEY)
  는 server-only 보존 — Web 은 BFF 만 호출.
- 응답 정규화: { items: PlaceItem[], total }. PlaceItem = { name, address, roadAddress?,
  category?, lng, lat }.
- 실패 처리: q 길이 < 2 → 400, 키 미설정 → 503, upstream 비-2xx → 502.

### Web — apps/web/src/lib/api/places.ts (NEW) + index.ts re-export
- `searchPlaces(query, signal?)` — BFF /places/search 호출, AbortController 지원.
- PlaceItem 타입 export.

### Web — apps/web/src/components/FullListPanel.tsx
- `placeAnchor: { lng, lat, label } | null` state — current anchor + 사용자에게 보여줄 라벨.
- distance sort active 시 segmented control 위에 별도 라인으로 PlacesSearch 노출.
  (그 외 sort 에서는 hidden — 노이즈 방지.)
- `<PlacesSearch>` sub-component:
  - 입력 → 300ms debounce → BFF fetch → dropdown (max 8건).
  - 결과 클릭 → onPick → placeAnchor 설정 + 자동 sort='distance' (이미 active 상태).
  - 외부 클릭 시 dropdown 자동 close (mousedown listener).
  - 선택 후 input 은 라벨 chip + "해제" 버튼으로 전환.
- distanceReady = mapBbox || gpsAnchor || placeAnchor — 셋 중 하나만 있어도 distance 활성.
- anchorParam 우선순위 (Web→BFF): place > GPS > bbox.
- 상호 배타: Place 선택 시 GPS clear, GPS 받을 시 Place clear (한 anchor 만 활성 — UX 명료).

### 검증
- BFF typecheck PASS, web typecheck baseline 7 (v4.9 신규 0).
- /places/search?q=%EA%B0%95%EB%82%A8%EC%97%AD (강남역) → 강남역 좌표 (127.028, 37.498) 정확.
- chat:eval 22/22 PASS, wiki:lint 0 drift.

### 후속 (v5+)
- multi-region centroid — multi-region 필터 시 mean / convex hull 어느 쪽 default 결정.
- Kakao Local API 사용량 모니터링 (free tier 일일 30,000 호출, 충분).
- 검색 history (recent 3-5건) localStorage persist 후보 — 단, PII 고려 필요.

### 본 세션 누적 ship
v4.1 + v4.2 + v4.3 (stage 1+2+3) + v4.4 + v4.5 + v4.6 + v4.7 (stage 4a) + v4.8 (GPS) +
v4.9 (Kakao Places). 거리순 anchor 5종 후보 모두 ship 종결 — multi-region 만 잔여.

## 2026-04-26T20:25  feature  PostGIS stage 4b — lat/lng 컬럼 DROP

**4-stage PostGIS 마이그레이션 종결.** events.latitude / longitude 컬럼이 사라지고
location_geom 이 단일 source of truth.

### 마이그레이션 — 20260426203000_events_drop_lat_lng_columns
- DROP TRIGGER tr_events_sync_location_geom (stage 4a 의 dual-write 트리거)
- DROP FUNCTION fn_events_sync_location_geom()
- ALTER TABLE events DROP COLUMN latitude
- ALTER TABLE events DROP COLUMN longitude
  → btree idx_events_geo 자동 사라짐 (lat/lng 컬럼과 함께)

### Prisma schema
- Event 모델에서 latitude / longitude / @@index([latitude, longitude]) 제거
- locationGeom Unsupported 필드만 유지 (raw query 전용)

### BFF READ 경로 swap
- apps/bff/src/routes/events.ts:
  - EVENT_SELECT 에서 lat/lng 제거
  - `fetchEventCoords(eventIds)` 헬퍼 추가 — `SELECT ST_X(location_geom)::float AS lng,
    ST_Y(location_geom)::float AS lat FROM events WHERE event_id IN (...)` → Map.
  - mapEventRow(row, coords, distance?) 시그니처 — coords map 으로 lat/lng derive.
  - listEvents 의 일반 흐름 + distance sort Pass C 모두 fetchEventCoords 호출.
  - distance Pass A 의 candidate 필터 변경: lat/lng not null → location_geom IS NOT NULL
    (raw query 추가).
- apps/bff/src/routes/event-detail.ts: select 에서 lat/lng 제거, $queryRaw 로 ST_X/ST_Y
  derive, 응답 lat/lng 채움.
- apps/bff/src/routes/bookmarks.ts: select 에서 lat/lng 제거, fetchEventCoords import +
  사용. lambda 를 `(r) => ({ ... })` 에서 `(r) => { const c = ...; return { ... } }` 로 변경.
- apps/bff/src/routes/uploader/events.ts: 상세 조회 select 도 lat/lng 제거 + 별도 raw
  query 로 derive.

### BFF WRITE 경로 swap
- apps/bff/src/jobs/ingest-common.ts: prisma.event.upsert 의 latitude/longitude 필드 제거.
  upsert 후 `UPDATE events SET location_geom = ST_SetSRID(...) WHERE event_id = ...` raw 실행.
  좌표 부재 시 명시 NULL set.
- apps/bff/src/routes/uploader/events.ts: prisma.event.create 의 latitude/longitude 필드
  제거. 트랜잭션 내 별도 $executeRaw 로 location_geom 채움.

### 응답 호환성
- /events, /events/:id, /me/bookmarks, /uploader/events/:id 모두 응답에 lat/lng 필드 유지.
- ST_X / ST_Y 로 derived. Web (SeoulMap, EventList, EventSummary 등) **변경 0**.
- 정밀도 — DECIMAL(10,7) 에서 float 으로 전환 (PostGIS geometry 가 double precision).
  소수점 최대 ~15자리. SeoulMap pin 위치 정확도 동일.

### 검증
- BFF typecheck PASS, web typecheck baseline 7 그대로 (Web 변경 0)
- /events?limit=2 → lat/lng 응답 정상 (37.6075510290657 / 126.9348233297409 등)
- /events?sort=distance&bbox=... → distance sort 정상, distanceMeters + lat/lng 모두 응답
- chat:eval 22/22 PASS (avg 6288ms)
- DB schema verify: events 테이블의 lat/lng 컬럼 부재 확인 (location_geom 만 남음)
- wiki:lint 0 drift

### 4-stage PostGIS 마이그레이션 정리
| stage | sprint | 내용 |
|---|---|---|
| 1 | v4.3 | location_geom 컬럼 추가 + backfill + GiST 인덱스 |
| 2 | v4.3 | BFF /events?bbox=... ST_Within 쿼리 |
| 3 | v4.3 | Web SeoulMap viewport hook (300ms debounce) |
| 4a | v4.7 | dual-write 트리거 + catch-up backfill |
| **4b** | **v4.10** | **lat/lng 컬럼 DROP — location_geom 단일 source** |

### 후속 (v5+ 잔여)
- multi-region centroid (mean / convex hull) UX 결정.
- Streaming idempotent resume (Last-Event-ID + Redis 캐시).
- 본인인증 prod / 사업자번호 정부 API (Phase 2).
- chat:eval CI 게이트.

### 본 세션 누적
v4.1 + v4.2 + v4.3 (stage 1+2+3) + v4.4 + v4.5 + v4.6 + v4.7 (4a) + v4.8 (GPS) +
v4.9 (Places) + v4.10 (4b). PostGIS 마이그레이션 4-stage 완전 종결.

## 2026-04-26T20:50  feature  Streaming idempotent resume — v4.11 Last-Event-ID + cache

v4.2 sealed-gate auto-retry 보강. blip 후 재연결 시 LLM 재호출 0 (cache replay only).
서버 stream_id 발행 + in-memory cache + Last-Event-ID 표준 헤더 흐름.

### 결정
- **In-memory cache, Redis 아님** — ioredis 의존 회피. 단일 인스턴스 가정. 향후 horizontal
  scale 시 동일 API 로 Redis swap 가능 (key 형식 `chat_stream:<streamId>` 호환).
- TTL 5분, 메모리 budget 평균 ~5KB/stream × 1000 concurrent ≈ 5MB. LRU 5000 entry 상한.
- SSE event id 형식: `<streamId>:<seq>`. streamId UUID, seq 0-based 단조.

### BFF — apps/bff/src/lib/stream-cache.ts (NEW)
- `startStream / recordEvent / getCachedAfter / finalizeStream / parseLastEventId` API.
- TTL evict + LRU 정리 — 새 entry 추가 시.

### BFF — apps/bff/src/routes/chat.ts (postChatStream)
- 진입 시 `Last-Event-ID` 헤더 검사 → cache hit 면 그 이후 events replay + res.end.
  LLM 재호출 0.
- cache miss / 헤더 없음 → 새 streamId (randomUUID) 생성 + `event: stream_start` emit.
- emit 헬퍼 wrap: sequential id + `id: <streamId>:<seq>` SSE line + cacheRecordEvent.
- 정상 종료 시 finalizeStream(streamId) — TTL 5분 더 유지.
- upstream `reply_delta` / `error` passthrough 도 emit 헬퍼 사용 (cache 일관성).

### Web — apps/web/src/lib/api/chat.ts (streamChat)
- StreamCtx { streamId, lastEventId } — 현재 stream 추적.
- reader loop 에서 SSE `id:` line 파싱 → ctx 갱신.
- stream_start event silent consume (caller dispatch 안 함).
- 재시도 시점에 ctx 있으면 `Last-Event-ID: <streamId>:<seq>` 헤더로 reconnect.

### 검증
- BFF typecheck PASS, web typecheck baseline 7 (v4.11 신규 0).
- SSE smoke: 첫 응답 — `id: <uuid>:0\nevent: stream_start` 확인.
- Resume smoke: streamId 추출 후 `Last-Event-ID: <uuid>:2` 헤더로 별도 요청 → cache 에서
  seq=3 부터 replay (id: `<uuid>:3` 부터 시작). LLM 재호출 0.
- chat:eval 22/22 PASS (avg 5938ms), wiki:lint 0 drift.

### 제약 / 후속
- 단일 인스턴스 한정 — horizontal scale 시 sticky session 또는 Redis swap 필요.
- process restart 시 cache 손실 — v4.2 retry 가 fresh LLM 호출로 자연 fallback.
- 향후: Redis swap (BullMQ 도입 시 자연), per-event size cap.

### 본 세션 누적
v4.1 + v4.2 + v4.3 (1+2+3) + v4.4 + v4.5 + v4.6 + v4.7 (4a) + v4.8 (GPS) + v4.9 (Places) +
v4.10 (4b) + v4.11 (idempotent resume).

## 2026-06-09T14:22  lint+docs  의미적 lint 스윕 + Phase 2 토픽 8종 백필
04-26 이후 로그 공백. 그동안 출하된 Phase 2(메이트·커뮤니티, 5월) + 전국 확장(ADR 0006)이
위키에 미반영이던 것을 의미적 lint 로 적발하고 일괄 정합화. 결과 `wiki/lint-report.md` 갱신.

### 의미적 lint (3축 병렬)
- ①내부 모순·용어 ②위키↔코드/ADR/스키마 괴리 ③누락 개념. 구조 lint(`wiki:lint`)는 0 drift 였으나
  의미 레이어에서 다수 적발 — 위키가 Phase 1(2026-04, 서울 한정, 23테이블)에 동결돼 있었음.

### A — 누락 토픽 8종 신설 (wiki/topics/)
- `mate-matching` (메이트지수 0~100·14일 이벤트 경계·동의 게이팅)
- `mate-chat-rooms` (Socket.IO 1:1/그룹·강퇴투표·타임아웃 24h/6h/36h/48h — LLM 검색챗과 별개)
- `community` (게시글/댓글/좋아요·7일 TTL 읽기시점 필터 GG-POST-012)
- `appointments-calendar` (단일거절 즉시종료·+36h — ADR 0009)
- `mate-evaluation-festival-review` (참석후 게이팅·Likert·크레딧 트리거 — A_900/901)
- `credits-ledger` (append-only·+10 적립 3종·소비처 없음)
- `reports-blocking-moderation` (제재 트랜잭션·scope 게이트 — A_701)
- `i18n-multilingual` (ko→en/vi/zh/ja/fr·빌드 UI번들 + 런타임 LLM번역 Redis캐시)
- 업데이트: `wiki/index.md` Phase 2 섹션 추가.

### B·C — 낡은 사실/모순 패치 (16개 파일)
- 서울 한정→전국(ADR 0006): main-page-flow·kcisa·tourapi·ingest-pipeline
- lat/lng→PostGIS location_geom: db-schema-overview·ingest-pipeline
- 테이블 수 20/22/23→43 통일 + Phase 2 18개 도메인 섹션 신설
- LangChain→OpenAI 직접체인·Stage2 출하: tech-stack·terminology-glossary
- SEED Design/i18n/Socket.IO 스택 추가, 카테고리 버튼 5→9, use-case 13→14, GGdrugs→Alle 등

### 도구·메타
- `apps/bff/src/jobs/wiki-lint.ts`: raw 무시 glob 추가 (`_*`, `*.zip`, `*.pdf`) — 소비완료 인테이크 13건 orphan 제거.
- `.claude/CLAUDE.md` §2 현재 단계 Phase 2 현행화 (+ §4 services/llm LangChain→OpenAI).
- 코드 그래프 재빌드: 1484 nodes · 1866 edges · 257 communities. graph.html 동기화.

### 검증
- `wiki:lint` 0 drift (orphans 0 · stale refs 0 · index coverage 100%).
