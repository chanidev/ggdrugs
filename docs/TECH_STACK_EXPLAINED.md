# Alle 프로젝트 — 사용 기술 설명서

> 생성일: 2026-04-27
> 목적: 이 프로젝트에서 쓰인 모든 기술이 **무엇이고, 왜 골랐고, 우리 프로젝트에서 어떻게 쓰이는지** 한 페이지로 정리.

---

## 1. 데이터 레이어

### 1-1. PostgreSQL + PostGIS

**무엇**: 오픈소스 관계형 DB. PostGIS는 PostgreSQL에 지리공간(geography/geometry) 자료형·연산을 더해주는 확장.

**왜**: 이벤트 데이터는 (1) 트랜잭션 보장이 필요한 정형 도메인(예약/승인/리뷰), (2) "지도 위 박스 안의 이벤트" 같은 지리 쿼리가 핵심. 두 요건을 한 엔진으로 처리할 수 있는 사실상 표준이 PostgreSQL+PostGIS.

**우리 프로젝트에서**:
- 23 테이블 (사용자·역할 / 이벤트 코어 / 승인 흐름 / 콘텐츠 상호작용 / LLM·크롤링)
- `events.location geography(Point, 4326)` — 지도 viewport bbox 쿼리
- `chat_messages` PARTITION BY RANGE(created_at) — 메시지 누적 대비
- `search_logs` 분기별 파티션, 90일 보관
- 트리거 `trg_events_invalidate_ai_summary` — description 변경 시 ai_summary 자동 NULL 처리

**확장 5종** (`infra/db/init/01-postgis.sql`):
| 확장 | 용도 |
|---|---|
| `postgis` | 지리 자료형·인덱스(GIST) |
| `postgis_topology` | 지리 토폴로지 (현재 미활용, 옵션) |
| `pg_trgm` | 문자열 trigram 유사도 (제목 검색·중복 탐지) |
| `unaccent` | 발음구분기호 제거 (검색 노이즈 감소) |
| `citext` | 대소문자 구분 없는 text (이메일·닉네임 unique) |

---

### 1-2. Qdrant

**무엇**: Rust로 작성된 오픈소스 벡터 DB. HNSW 인덱스로 고차원 벡터 kNN 검색.

**왜**:
- 이벤트를 자연어로 찾으려면 "쿼리 임베딩 ↔ 이벤트 임베딩" 코사인 유사도 비교가 필요
- 후보군: pgvector (Postgres 확장) vs Qdrant vs Pinecone
- ADR 0002 D-3에서 Qdrant 단일 채택 — 운영 분리(벡터 부하가 메인 DB에 영향 없음) + payload 필터링 native 지원 + self-host 가능

**우리 프로젝트에서**:
- collection `alle-events`, vector 1536d cosine
- payload: `{title, phase, startDate, endDate, regionId, categoryCode, vibeIds[], approvedAt}`
- point id = event_id (정수)
- 동기화 3축: 승인 훅(uploaded) / daily-batch(crawled) / 수동 backfill CLI
- `/chat/stream`에서 `/events/search limit=30, score≥0.25` over-fetch 후 Prisma 재필터

---

### 1-3. Redis

**무엇**: in-memory key-value 스토어. 캐시·pub/sub·큐 백엔드로 표준.

**왜**: (1) 채팅 스트림 idempotent resume 캐시, (2) 향후 BullMQ 큐 백엔드, (3) rate limit 카운터 후보. Postgres에 안 올려도 되는 ephemeral state 분리.

**우리 프로젝트에서**:
- 현재: chat v4.11 stream resume 캐시 (in-memory → Redis swap이 v5+ 후보로 대기)
- 큐 도입 시 BullMQ가 Redis를 백엔드로 사용 예정
- `quota-counter.ts`는 단일 인스턴스 한정 in-memory Map — multi-instance 시 Redis로 교체 필요 (박제됨)

---

### 1-4. MinIO

**무엇**: S3 API 호환 오픈소스 오브젝트 스토리지. self-host 가능.

**왜**: 업로더 서류·리뷰 사진·이벤트 포스터·앨범 사진을 DB BLOB으로 넣으면 백업·CDN·이미지 변환이 모두 깨짐. S3가 표준이지만 dev/staging은 클라우드 비용·격리 문제로 self-host 선호. MinIO는 S3 SDK를 그대로 쓸 수 있어 prod 이관 시 endpoint만 바꾸면 됨.

**우리 프로젝트에서**:
- 4 버킷 — `approval-docs` (JPG/PNG 10MB↓) / `review-photos` (1리뷰 5장↓) / `event-posters` / `user-photos`
- BFF가 presigned URL 발급 → 클라이언트가 직접 업로드 (BFF 대역폭 절약)

---

## 2. 애플리케이션 런타임

### 2-1. Node.js 22 + Express 5

**무엇**:
- **Node.js**: V8 기반 JavaScript 런타임. 비동기 I/O 모델로 외부 API 호출이 많은 BFF에 적합
- **Express 5**: 미니멀 HTTP 프레임워크. 미들웨어 체인이 단순하고 학습곡선 낮음

**왜**:
- 프론트(React)와 동일 언어(TypeScript)로 풀스택 — `packages/shared-types`로 BFF↔Web DTO 공유
- LLM 호출·외부 API fan-out이 IO-bound — 비동기 모델 효율
- Express 5는 native async/await 미들웨어 지원 (4.x는 try/catch 래핑 필요했음)

**우리 프로젝트에서**:
- `apps/bff/` — REST API + SSE streaming
- 미들웨어: `requireAuth` / `resolveAuth` / `dotenv-cli`로 env 주입
- 라우트 파일: `routes/auth.ts`, `routes/chat.ts`, `routes/admin-uploaders.ts`, `routes/me-recommendations.ts` 등

---

### 2-2. Prisma 5.22

**무엇**: Node 진영 표준 ORM. schema.prisma DSL로 모델 정의 → 타입 안전 클라이언트 생성 + 마이그레이션 도구 내장.

**왜**: TypeORM/Sequelize 대비 (1) 타입 추론 강력 (where/select/include 다 추론), (2) 마이그레이션 워크플로 단순 (schema diff → SQL 자동 생성), (3) raw SQL 탈출구(`$queryRaw`) 명확.

**우리 프로젝트에서**:
- `apps/bff/prisma/schema.prisma` — 23 테이블 모델 + relation
- 마이그레이션 본진: `infra/db/migrations/` (baseline + CHECK 제약 26건 + `fn_set_updated_at()` 트리거 8건)
- 추천·구독 매칭 등 복잡 쿼리는 `$queryRaw`로 raw SQL 사용 (TIES tiebreak 등)

---

### 2-3. TypeScript 5.9 + tsx 4

**무엇**:
- **TypeScript**: JS에 정적 타입을 더한 언어
- **tsx**: TypeScript 직접 실행기 (esbuild 기반). dev watch 모드 빠름

**왜**: 도메인 enum (event_type, approval_status, role) 휴먼 에러 차단. 컴파일 타임에 잡으면 런타임 디버깅 비용 0.

**우리 프로젝트에서**:
- BFF·Web·shared-types 전부 TS
- BFF dev: `tsx watch` (재시작 < 1s)
- 빌드 타깃: ES2022, Node 22 native ESM

---

### 2-4. Pino

**무엇**: Node 진영에서 가장 빠른 구조화 로거. JSON 1줄 출력.

**왜**: console.log → 검색·집계 불가. Pino는 ndjson 출력으로 Loki·CloudWatch·Datadog 어디든 그대로 들어감. dev에서는 `pino-pretty` transport로 사람이 읽기.

**우리 프로젝트에서**:
- BFF 전체 로깅 (`apps/bff/src/lib/logger.ts`)
- PII 마스킹 유틸 필요 (CLAUDE.md §6-3 — 주민번호·전화·이메일 절대 출력 금지)
- `logger.warn` (quota 80%) / `logger.error` (95%) 표준화

---

### 2-5. Python + FastAPI

**무엇**:
- **Python**: LLM·임베딩 SDK 생태계가 가장 풍부한 언어
- **FastAPI**: Pydantic 기반 ASGI 프레임워크. 타입 힌트로 자동 validation + OpenAPI 문서 생성

**왜**:
- OpenAI Python SDK + qdrant-client가 1급 시민
- LangChain·LlamaIndex 같은 LLM 도구 chain이 Python 우선
- BFF(Node)와 분리해서 (1) 모델 메모리 격리, (2) Python 의존성 격리, (3) 향후 GPU 워커 분리 가능

**우리 프로젝트에서**:
- `services/llm/app.py` — `/embed`, `/events/search`, `/events/upsert`, `/chat`, `/events/rerank`, `/chat/compose-retreat`, `/summarize`
- 키 없으면 fallback (dev/CI에서 OPENAI_API_KEY 미설정 시 규칙 기반 대체로 막히지 않음)

---

## 3. LLM 모델 (OpenAI 3분할)

### 3-1. `gpt-4o`

**무엇**: OpenAI 플래그십 멀티모달 모델. 추론 정확도와 한국어 처리 모두 강함.

**왜 채팅에만**: 사용자 자연어를 5개 필터(지역/기간/인원/종류/성향)로 정확히 추출하는 게 핵심. 4o-mini는 미묘한 한국어 의도(예: "가볍게 친구랑")에서 헛다리 잡음 빈도 높음. 비용 차이는 실제 채팅 트래픽 규모에서 충분히 감수 가능.

**우리 프로젝트에서**:
- `services/llm /chat` 호출에만 사용 (filter 5종 + reply + followups + specificDate 동시 추출)
- `OPENAI_MODEL_CHAT` env 변수

---

### 3-2. `gpt-4o-mini`

**무엇**: 4o의 경량 버전. 비용 1/30, 속도 ~2-3배.

**왜 요약·태깅에만**: (1) 4,000건+ 이벤트 backfill 비용 통제, (2) "신문 기사 도입부 톤 2~3문장" 같은 정형 작업은 4o-mini로 충분, (3) 리뷰 sentiment 분류처럼 분류 라벨이 적은 작업.

**우리 프로젝트에서**:
- 이벤트 AI 요약 (`/summarize` 엔드포인트)
- 비용: 1건 ~$0.00015 (입력 ~300 + 출력 ~120 tokens)
- 향후: 리뷰 감성 분류, 이벤트 vibe 자동 제안 (관리자 보조)

---

### 3-3. `text-embedding-3-small`

**무엇**: OpenAI 임베딩 모델. 1536차원, 가격 $0.02/1M tokens.

**왜**: large(3072d)는 정확도 ~+5%지만 Qdrant 메모리 비용·query latency 2배. 이벤트 검색 도메인은 small로 충분히 변별됨 (실측 0.6 threshold에서 노이즈 < 5%).

**우리 프로젝트에서**:
- Qdrant `alle-events` collection 인덱싱
- 뉴스 매핑 V2 scoring의 embedding rerank (cosine)
- `OPENAI_MODEL_EMBEDDING` env 변수

---

## 4. 프론트엔드

### 4-1. React 19 + Vite 6

**무엇**:
- **React 19**: declarative UI 라이브러리. server components·use() hook 등 최신
- **Vite**: esbuild + Rollup 기반 dev server·빌드 도구. HMR < 50ms

**왜**: Next.js는 SSR·라우팅 강제가 있고 우리는 단일 SPA(`/`)에 overlay panel 패턴이라 가벼운 Vite + react-router로 충분. dev 시작 < 1s.

**우리 프로젝트에서**:
- `apps/web/` — 단일 entry, react-router 7로 `/me`, `/uploader`, `/admin`, `/events/:id` 라우팅
- Vite `envDir: '../..'`로 모노레포 루트 `.env` 참조 (BFF와 env 단일 source)

---

### 4-2. Tailwind CSS 4

**무엇**: utility-first CSS 프레임워크. v4부터 `@theme` 블록·CSS-first config·LightningCSS 엔진.

**왜**: DESIGN.md 토큰(버밀리언 accent, Pretendard 서체, spacing scale)을 `@theme {}`에 한 번 등록하면 Tailwind 클래스로 그대로 사용 가능. CSS-in-JS 대비 런타임 비용 0, css-modules 대비 디자인 시스템 일관성 강제.

**우리 프로젝트에서**:
- `@tailwindcss/vite` 플러그인
- `apps/web/src/styles/theme.css`에 DESIGN.md 토큰 매핑
- 금지 패턴: 보라 그라디언트·gradient CTA·뚱뚱한 pill 버튼 (DESIGN.md §금지)

---

### 4-3. Pretendard Variable

**무엇**: 한국어 가독성에 맞춰 만든 오픈소스 가변 서체. `font-variation-settings`로 wght 100~900 단일 파일.

**왜**: Inter/Roboto는 한글 fallback이 깨지는 순간 디자인 무너짐. Pretendard는 한·영 hinting이 같은 디자인 언어로 잡혀있어 hybrid 콘텐츠(이벤트 제목 한글 + 영문 카테고리)에서 일관됨.

**우리 프로젝트에서**:
- jsdelivr CDN, `@font-face` 자동 로딩
- Tailwind `font-sans` 기본값 교체

---

### 4-4. react-kakao-maps-sdk

**무엇**: Kakao Maps JS SDK의 React 바인딩. `<Map>`, `<MapMarker>`, `<MarkerClusterer>` 같은 컴포넌트 제공.

**왜**: Google Maps는 한국 정확도·POI가 부족(특히 행사장). Naver Maps API는 클러스터링·Custom Overlay가 약함. Kakao가 한국 도메인 1순위.

**우리 프로젝트에서**:
- `useKakaoLoader` dynamic load (SDK lazy)
- 클러스터러 + vermilion pulse pin
- v4.3 viewport bbox refetch (300ms debounce) — 지도 이동/줌 시 BFF에 박스 쿼리

---

### 4-5. SSE (Server-Sent Events)

**무엇**: HTTP 위에서 서버 → 클라이언트 단방향 스트림. WebSocket보다 단순하고 HTTP/2와 호환.

**왜**: 채팅 reply는 단방향이고 LLM 토큰을 typing 효과로 흘려야 함. WebSocket은 양방향이라 over-engineering, polling은 응답성·비용 모두 손해. SSE는 fetch + ReadableStream으로 native 지원.

**우리 프로젝트에서**:
- `apps/web/src/lib/api/chat.ts::streamChat` — SSE 클라이언트
- 이벤트 6종: `reply_delta` → `meta` → `reply_sealed` → `suggestions` → `reply_override` → `done`
- v4.11: `Last-Event-ID` header + 캐시로 idempotent resume (재연결 시 누락 없이 이어붙기)

---

## 5. 외부 API · 데이터 소스

### 5-1. Google OAuth + Kakao OAuth

**무엇**: OAuth 2.0 authorization code flow 기반 소셜 로그인.

**왜**: 자체 비밀번호 관리 = 보안 책임 폭증. 한국 사용자 침투력은 Kakao + Google이 사실상 전부.

**우리 프로젝트에서**:
- Google: `id_token` tokeninfo 검증 → users.upsert(authProvider='google', socialUid=info.sub)
- Kakao: access_token으로 `kapi.kakao.com/v2/user/me` 호출
- CSRF: `alle_oauth_state` 쿠키 (24 byte random, 10분 TTL)
- returnTo: same-origin path 화이트리스트 통과만 허용
- dev-login stub: `NODE_ENV != production`만, curl·QA 자동화용

---

### 5-2. TourAPI (한국관광공사)

**무엇**: 공공데이터포털 제공 관광·축제 API. `searchFestival2` 엔드포인트가 전국 축제 데이터 forward-looking 제공.

**우리 프로젝트에서**:
- `apps/bff/src/jobs/tourapi-ingest.ts`
- `TOUR_API_KEY` (URL-인코딩 보존 — encode 두 번 하면 깨짐)
- forward window가 짧아 daily fetched=0가 자주 발생 (정상)

---

### 5-3. Seoul Open Data

**무엇**: 서울특별시 공식 오픈 API. `culturalEventInfo`가 서울 문화행사(축제·전시·공연·교육 등 8 카테고리) 풀 스펙트럼 제공.

**우리 프로젝트에서**:
- `apps/bff/src/jobs/seoul-culture-ingest.ts`
- `SEOUL_OPEN_API_KEY`
- **압도적 비중** — 현재 4,111건의 대부분이 이 소스
- CODENAME ("축제/자연(하천)", "공연/클래식" 등)을 8종 event_category로 매핑

---

### 5-4. KCISA (한국문화정보원)

**무엇**: `API_CCA_145` — 전국 공연·전시 데이터.

**우리 프로젝트에서**:
- `apps/bff/src/jobs/kcisa-ingest.ts`
- `KCISA_API_KEY` 미설정 시 러너 시작점에서 skip (warn 로그 1줄)
- Seoul 필터로 ingest-common Seoul guard와 결합

---

### 5-5. Naver 뉴스 검색 API

**무엇**: `openapi.naver.com/v1/search/news.json` — 한국 언론사 뉴스 검색.

**왜**: 이벤트 상세 페이지 "관련 기사" 섹션을 자동으로 채우려면 한국 뉴스 인덱스 1순위가 필요.

**우리 프로젝트에서**:
- `X-Naver-Client-Id` + `X-Naver-Client-Secret` 헤더
- `?query="{title}"&display=20&sort=sim` (exact → unquoted 재시도)
- 일일 25k call, 10 req/s — concurrency 4로 제한 (안전마진)
- 결과 HTML strip (`<b>` 하이라이트 제거)

---

### 5-6. Google News RSS

**무엇**: `news.google.com/rss/search` — 무료 RSS 피드. 인증 없음.

**왜 fallback**: Naver가 미색인한 해외 언론사·매체 보강. 다만 결과 품질·메타데이터가 Naver 대비 약해 주력은 안 됨.

**우리 프로젝트에서**:
- Naver 결과 < 3건일 때만 호출
- 간이 XML regex 파서 (외부 deps 회피)
- `when:30d&hl=ko&gl=KR&ceid=KR:ko` 쿼리

---

## 6. 인프라·운영 도구

### 6-1. Docker Compose

**무엇**: 다중 컨테이너 로컬 오케스트레이션.

**왜**: 새 개발자가 5분 안에 PG+PostGIS+Qdrant+Redis+MinIO 4종을 동일 버전으로 띄우게 하려면 이게 표준.

**우리 프로젝트에서**:
- `docker-compose.yml` — 4 데이터 서비스 정의
- 포트: postgres:5433 / qdrant:6333 / redis:6379 / minio:9000-9001
- healthcheck로 BFF 부팅 시점 검증
- `infra/db/init/01-postgis.sql`을 PG 컨테이너 초기화 스크립트로 마운트

---

### 6-2. pnpm workspaces

**무엇**: pnpm의 monorepo 기능. 디스크 효율(콘텐츠 주소 저장) + workspace protocol(`workspace:*`)로 패키지 간 참조.

**왜**: yarn workspaces 대비 디스크 사용 1/3, npm workspaces 대비 lockfile 안정성. shared-types 같은 cross-package 작업이 일상.

**우리 프로젝트에서**:
- root `pnpm-workspace.yaml` — `apps/*`, `services/*`, `packages/*`
- 패키지: `@ggdrugs/bff`, `@ggdrugs/web`, `@ggdrugs/config`, `@ggdrugs/shared-types`
- 명령: `pnpm -F bff dev`, `pnpm -F web build` (필터 실행)

---

### 6-3. Pretendard (서체) 외 — `dotenv-cli`, `zod`

**dotenv-cli**: BFF 스크립트에서 루트 `.env` 주입 (Node 22의 `--env-file`도 가능하지만 호환성).

**zod**: `packages/config/schema.ts`에서 env 변수 schema validation. 키 누락 시 부팅 거부. 런타임 KeyError 차단.

---

## 7. 품질·안정성 도구

### 7-1. `fetch-with-retry.ts`

**왜**: 공공 API는 429·5xx·일시 단절이 일상. 재시도 없으면 daily ingest가 자주 깨짐.

**구현**:
- 429/5xx/네트워크 에러 → exponential backoff (1s/2s/4s, max 8s)
- `Retry-After` 헤더 존중
- 3회 재시도 후 fail
- 4 runner (tourapi/seoul-culture/kcisa/news-naver) 모두 적용

### 7-2. `quota-counter.ts`

**왜**: 일일 quota 초과 = 다음 날까지 ingest 마비. 80% 도달 시점에 알림이 있어야 대응 가능.

**구현**:
- in-memory Map, UTC 일자 기준 reset
- `fetchWithRetry`가 매 호출에 `record(source)` 호출
- provider 별 default: tourapi/seoul/kcisa 1000, naver-news 25k
- **80% → logger.warn, 95% → logger.error** (각각 1일 1회)
- `scheduler.ts::runAll()` 끝 시점 snapshot 로그
- **단일 인스턴스 한정** — multi-instance 시 Redis/DB 교체 필요 (박제)

### 7-3. `chat:eval` harness

**왜**: chat v3.x→v4.11까지 5 sprint 빠르게 돌면서 regression 방지.

**구현**:
- CLI: `pnpm -F bff chat:eval [--id <case>] [--verbose]`
- runner: `apps/bff/src/jobs/chat-eval.ts` — BFF `/chat`에 POST, structural assertion
- cases: 20건 seed (5 필터 축 각각 + multi-axis + edge case)
- e2e 경로 검증 (BFF + LLM + DB + Qdrant 전체 필요)
- v5+ 후보: CI gate로 PR 머지 차단

---

## 8. 디자인 시스템 (DESIGN.md)

**왜 별도 문서**: UI는 코드 review만으론 일관성이 안 잡힘. "이건 DESIGN.md에 없는 선택" 만으로 PR 차단할 수 있는 단일 진실 소스가 필요.

**핵심**:
- 서체 **Pretendard Variable**
- accent **버밀리언** (단일 강조색)
- 레이아웃 **map-first hybrid** (지도가 1차, 패널이 2차)
- 모션 280ms (slide-in/out 표준)

**금지 패턴**:
- 보라 그라디언트
- 3-column icon grid
- 뚱뚱한 pill 버튼
- gradient CTA
- stock photo hero
- 서체 fallback 깨진 Inter/Roboto 한글 혼용

---

## 9. ADR (Architecture Decision Record)

**왜**: "왜 이걸 골랐나"를 코드 리뷰가 아니라 문서로 박제. 6개월 후 같은 논쟁 반복 방지.

**우리 프로젝트의 ADR 5건**:

| ADR | 결정 | 이유 |
|---|---|---|
| 0001 | DDL v3 ↔ Terminology v5 정합성 (rename 3 + 신설 3 + 컬럼 추가 1) | 컬럼명·enum 도메인 단일화 |
| 0002 | MinIO / OpenAI / Qdrant 단일 채택 | 운영 복잡도 ↓, ADR 0002에 후보 vs 채택 박제 |
| 0003 | 업로더 PII 정책 (주민번호 제거 + 사업자번호/CI 분기) | 개인정보보호법 + 사업자 검증 분리 |
| 0004 | 세션 무효화 정책 (soft-delete cascade + sliding-cap + logout-all + admin revoke) | 보안 사고 대응 + UX |
| 0005 | 관리자 계정 관리 + 작업 감사 (admin promote/demote/scope + uploader_decision) | admin 권한 변경 추적성 |

---


## 11. 한 줄 정리 (전체 스택)

> **PostgreSQL+PostGIS**(데이터 본진) + **Qdrant**(의미 검색) + **Redis**(캐시) + **MinIO**(이미지) 위에서, **Node 22 + Express 5 + Prisma**(BFF) + **Python + FastAPI + OpenAI**(LLM 서비스) + **React 19 + Vite + Tailwind 4 + Kakao Maps**(Web) 3계층이 **Docker Compose로 통합**되어, **TourAPI/Seoul/KCISA**에서 이벤트를 끌어 **gpt-4o-mini로 요약 + text-embedding-3-small로 인덱싱 + Naver/Google News로 매핑**한 뒤, **gpt-4o가 자연어 채팅을 5필터로 변환해 Qdrant kNN + Postgres 필터 + LLM rerank**로 응답을 **SSE 스트리밍**한다.

---

*마지막 업데이트: 2026-04-27*
