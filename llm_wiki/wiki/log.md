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
