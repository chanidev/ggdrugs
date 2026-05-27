# Alle 프로젝트 — 사용 기술 전체 정리

> 생성일: 2026-04-27
> 출처: `llm_wiki/wiki/topics/*.md`, `graphify-out/GRAPH_REPORT.md`, `CLAUDE.md`, `docker-compose.yml`, `.env.example`
> 네이밍: 제품명 **Alle** (2026-04 리브랜딩) / 레포·패키지·DB 식별자는 `ggdrugs` 유지

---

## 0. 한 줄 요약

**"공공 API에서 이벤트 끌어와 → AI로 요약·임베딩·뉴스매핑 → 지도+채팅 UI에서 자연어로 검색·추천·구독"** 하는 자연어 처리 기반 이벤트·이슈 지도 검색 서비스.

---

## 1. 데이터 레이어 (Docker Compose 4종)

| 역할 | 기술 | 버전 | 비고 |
|---|---|---|---|
| 관계형 DB | **PostgreSQL + PostGIS** | `postgis/postgis:15-3.4` | 23 테이블, 5 도메인 그룹 |
| PG Extensions | postgis · postgis_topology · pg_trgm · unaccent · citext | — | `infra/db/init/01-postgis.sql` |
| 벡터 DB | **Qdrant** | `v1.13.0` | `alle-events` collection, 1536d cosine |
| 캐시 / 큐 | **Redis** | `7-alpine` | BullMQ 후보 (미확정) |
| 오브젝트 스토리지 | **MinIO** (S3 호환) | `RELEASE.2024-12-18T13-15-44Z` | 4 버킷 |

### MinIO 버킷 4종
- `approval-docs` — 업로더 서류 (JPG/PNG 10MB 이하)
- `review-photos` — 리뷰 첨부 사진 (최대 5장)
- `event-posters` — 이벤트 포스터 이미지
- `user-photos` — 사용자 앨범 사진

### Qdrant Collection 스펙
- name: `alle-events`
- vector: 1536 차원, Cosine distance
- model: `text-embedding-3-small`
- point id: event_id (정수)
- payload: `{title, phase, startDate, endDate, regionId, categoryCode, vibeIds[], approvedAt}`

---

## 2. 애플리케이션 스택

### 2-1. BFF (`apps/bff/`)

| 항목 | 기술 |
|---|---|
| 런타임 | Node.js 22 |
| 프레임워크 | Express 5 |
| ORM | Prisma 5.22 |
| 언어 | TypeScript 5.9 |
| 로깅 | Pino (dev: `pino-pretty` transport) |
| dev watch | tsx 4 |
| 환경변수 | `dotenv-cli` 로 루트 `.env` 주입 |

**핵심 모듈**:
- `apps/bff/src/jobs/` — 3 ingest 러너 + ingest-common + scheduler + run-ingest CLI
- `apps/bff/src/jobs/lib/fetch-with-retry.ts` — 429/5xx exponential backoff (1s/2s/4s, max 8s, Retry-After 존중, 3회 재시도)
- `apps/bff/src/jobs/lib/quota-counter.ts` — UTC 일자 reset, 80% warn / 95% error
- `apps/bff/src/middleware/require-auth.ts` — `requireAuth` (필수) / `resolveAuth` (옵셔널)
- `apps/bff/src/routes/chat.ts` — 5-step 채팅 파이프라인 (v3+)
- `apps/bff/src/routes/admin-uploaders.ts::decideEventUpload` — 승인 훅 fan-out

### 2-2. LLM 서비스 (`services/llm/`)

| 항목 | 기술 |
|---|---|
| 런타임 | Python |
| 프레임워크 | FastAPI |
| LLM SDK | OpenAI SDK |
| 벡터 DB 클라이언트 | qdrant-client |

**엔드포인트**:
- `POST /embed` — 배치 임베딩 (1536d, 256 상한)
- `POST /events/search` — 자연어 → embed → Qdrant kNN
- `POST /events/upsert` — 포인트 배치 upsert
- `POST /events/delete` — 포인트 배치 삭제 (승인 취소 훅)
- `POST /chat` — filter 5종 + reply + followups + specificDate 동시 추출
- `POST /events/rerank` — top 12 후보 의미·시점·동행 적합도 재정렬 + matchReason
- `POST /chat/compose-retreat` — 0건 안내 + 대체 followups
- `POST /summarize` — 이벤트 AI 요약 (gpt-4o-mini)

**특징**: 키 없으면 fallback (dev/CI에서 OPENAI_API_KEY 미설정 시 규칙 기반 대체).

### 2-3. Web (`apps/web/`)

| 계층 | 라이브러리 | 버전 | 비고 |
|---|---|---|---|
| 빌드 도구 | Vite | 6.x | `envDir: '../..'` |
| 프레임워크 | React | 19 | `@types/react` 19 |
| 라우팅 | react-router | 7 | 단일 `/` + `/me` `/uploader` `/admin` `/events/:id` |
| 스타일 | Tailwind CSS | 4 | `@tailwindcss/vite`, `@theme` 블록 |
| 서체 | Pretendard Variable | 1.3.9 | jsdelivr CDN, `@font-face` 자동 로딩 |
| 지도 | react-kakao-maps-sdk + Kakao Maps JS SDK | 1.2 | `useKakaoLoader` dynamic load |
| Streaming | 자체 `apps/web/src/lib/api/chat.ts::streamChat` | — | SSE |
| 헬스체크 | 자체 `HealthBadge` | — | 10초마다 `/api/health` |

**핵심 컴포넌트**:
- `Sidebar.tsx` — 데스크톱 rail (236px, filter/list/chat)
- `OverlayPanel.tsx` — `absolute left=236 w=380 z-20`, slide-in 280ms
- `EventSummaryPanel` — 핀 클릭 시 등장
- `ChatDock` — floating dock (`bottom-6 z-7 w≤820`)
- `MobileFloatingHeader` — h-12 blur-md
- `BottomSheet` — drag+tap, 3 snap (10vh / 52vh / 90vh)

---

## 3. LLM 모델 (3분할, ADR 0002 D-2)

| 용도 | 모델 | env 변수 |
|---|---|---|
| 채팅 검색 (A_201) | `gpt-4o` | `OPENAI_MODEL_CHAT` |
| 감성분석 · 태깅 · 경량 분류 · 요약 | `gpt-4o-mini` | `OPENAI_MODEL_FAST` |
| 임베딩 (Qdrant 인덱싱) | `text-embedding-3-small` | `OPENAI_MODEL_EMBEDDING` |

비용 예시: 이벤트 1건 요약 ≈ $0.00015 (입력 ~300 + 출력 ~120 tokens).

---

## 4. 외부 API · 의존성

| 서비스 | 용도 | 키 |
|---|---|---|
| **Google OAuth** | 회원가입·로그인 (id_token tokeninfo 검증) | `GOOGLE_CLIENT_ID/SECRET` |
| **Kakao OAuth** | 회원가입·로그인 (userinfo API) | `KAKAO_CLIENT_ID/SECRET` |
| **Kakao Maps SDK + REST** | 지도 + 지역 검색 + 거리순 anchor | `KAKAO_JAVASCRIPT_KEY` / `KAKAO_REST_API_KEY` |
| **TourAPI** (한국관광공사) | 전국 축제 forward-looking ingest (`searchFestival2`) | `TOUR_API_KEY` (URL-인코딩 보존) |
| **Seoul Open Data** | 서울 문화행사 8 카테고리 (`culturalEventInfo`) | `SEOUL_OPEN_API_KEY` |
| **KCISA** (한국문화정보원) | 공연·전시 (`API_CCA_145`) | `KCISA_API_KEY` |
| **Naver 뉴스 검색 API** | 뉴스 매핑 주력 (10 req/s, 25k/일) | `X-Naver-Client-Id/Secret` |
| **Google News RSS** | 뉴스 fallback (Naver < 3건일 때) | (불필요) |
| **OpenAI API** | LLM·임베딩 | `OPENAI_API_KEY` |

---

## 5. DB 스키마 (PostgreSQL 23 테이블, 5 도메인)

### 5-1. 사용자·역할 (5)
- `regions` — 행정구역 마스터 (시/도 · 시/군/구 · 읍/면/동)
- `users` — `auth_provider IN (google, kakao, dev)`, soft delete, `active_role` 컬럼
- `auth_sessions` — `session_id VARCHAR(128) PK` (crypto random), TTL 7d, sliding `last_seen_at`
- `uploader_profiles` — users 1:1 확장, `approval_status IN (pending, approved, revision_requested, rejected)`
- `admin_profiles` — `scope IN (full, content_only, uploader_review_only, security)`

### 5-2. 이벤트 코어 (4)
- `event_categories` — **8종** (festival, expo, symposium, conference, exhibition, performance, education, movie)
- `events` — 통합 테이블 (crawled + uploaded), `approval_status × phase` 2축, `expected_companion_primary/secondary`, 비정규화 집계 (`bookmark_count, avg_rating, review_count`), `ai_summary`, `description_hash`, PostGIS `location` geography
- `event_vibes` — 성향 라벨 마스터, `label_group IN (mood, activity, theme)`
- `event_vibe_assignments` — 이벤트-라벨 N:M

### 5-3. 승인 흐름 (3)
- `approval_documents` — 업로더 서류 (JPG/PNG 10MB 이하)
- `approval_logs` — 이벤트 심사 감사 (event-scoped)
- `admin_audit_logs` — admin 보안·운영 액션 범용 감사 (event 무관). action 6종: `revoke_sessions / admin_promote / admin_demote / admin_scope_change / user_soft_delete / uploader_decision`

### 5-4. 콘텐츠 상호작용 (8)
- `bookmarks` — UNIQUE (user_id, event_id)
- `reviews` — 1인 1이벤트 1리뷰, rating 1-5, sentiment(AI) positive/negative/neutral
- `review_photos` — review_id FK + 순번, 최대 5장
- `notifications` — 예약 발송, is_sent/sent_at 정합성 CHECK
- `event_subscriptions` — A_203 조건 기반 (5축 JSONB 배열)
- `photo_albums` — 사용자 앨범
- `photos` — ai_tags JSONB + GIN 인덱스
- `user_taste_profiles` — taste_dimension/taste_value KV (`preferred_category` / `preferred_region` / `preferred_vibe`)

### 5-5. LLM·크롤링 (5)
- `chat_sessions` — 채팅 검색 세션
- `chat_messages` — user/assistant, **PARTITION BY RANGE(created_at)**
- `search_logs` — 90일 보관, 분기별 파티션, search_params JSONB
- `news_articles` — title GIN(trigram), originalUrl UNIQUE
- `event_article_mappings` — N:M, relevance_score DECIMAL(5,4)

### 5-6. 상태 머신
```
pending → revision_requested → pending  (재제출)
pending → approved            → ended   (종료일 도래)
pending → rejected                       (종결)
```

### 5-7. 필터 5종 (고정)
**지역 / 기간 / 인원구성 / 이벤트 종류 / 이벤트 성향** — 추가하려면 요구사항정의서 개정 필요.

---

## 6. 모노레포 구조 (pnpm workspaces)

```
real_Project/
├── apps/
│   ├── bff/                  # Express + Prisma + ingest jobs
│   └── web/                  # React 19 + Vite + Kakao Maps
├── services/
│   └── llm/                  # FastAPI + OpenAI + Qdrant client
├── packages/
│   ├── config/               # zod env 검증
│   └── shared-types/         # BFF↔Web 공유 TS 타입
├── infra/
│   └── db/
│       ├── init/             # postgis init SQL
│       └── migrations/       # Prisma 마이그레이션
├── docs/
│   ├── requirements/         # 요구사항정의서 v5.0
│   └── decisions/            # ADR 0001~0005
├── llm_wiki/                 # LLM Wiki (graphify 참조)
├── graphify-out/             # 지식 그래프 (1024 nodes, 1248 edges, 178 communities)
└── docker-compose.yml
```

---

## 7. 핵심 파이프라인 4종

### 7-1. Ingest 파이프라인 (`scheduler.ts::runAll`)

```
부팅+2s, 24h 주기
└─ Promise.allSettled 병렬 실행 (3 러너)
    ├─ tourapi-ingest.ts        (TourAPI / 전국 축제)
    ├─ seoul-culture-ingest.ts  (Seoul OpenData / 8 카테고리, 압도적 비중)
    └─ kcisa-ingest.ts          (KCISA / 공연·전시, Seoul 필터)
└─ ingest-common.ts (8단계)
    1. Seoul guard (정규식)
    2. sigungu 추출 (25 구 매칭)
    3. regionId resolve (district 단위)
    4. category 8종 매핑
    5. cross-source dedup (title + start_date)
    6. phase 계산 (upcoming/ongoing/ended)
    7. approval_status='approved' (crawled 한정)
    8. Prisma upsert on (source_type, crawl_origin, external_source_id)
└─ 후속 4단계 직렬
    1. runBackfillSummaries({})              — gpt-4o-mini 요약
    2. runNewsNaverIngest({onlyMissing})     — Naver+Google News 매핑
    3. runEmbedEvents({onlyMissing})         — Qdrant upsert
    4. auditMappingDistributionQuick()       — 분포 감사
```

**프로비넌스**: `events.source_type` (`crawled` / `uploaded`) + `crawl_origin` + `external_source_id`.

### 7-2. AI Enrichment

#### 이벤트 요약
- 컬럼: `events.ai_summary`, `ai_summary_at`, `description_hash CHAR(32)`
- 트리거 `trg_events_invalidate_ai_summary` BEFORE UPDATE — description 변경 시 자동 NULL 처리
- 프롬프트: "신문 기사 도입부 톤, 2~3문장, 250자, 사실만, 이모지 금지" (금지 수식어 명시)
- 옵션: `--no-summarize` (비용 회피), `--with-description-only` (구 동작)

#### 뉴스 매핑 (V2 scoring)
```
final_score = 0.4 × keyword_overlap + 0.6 × embedding_cosine
```
- threshold: embedding 0.60 / keyword-only 0.55
- Naver 주력 (exact match → unquoted 재시도) + Google News RSS fallback (Naver < 3건일 때)
- HTML strip (`<b>` 하이라이트 제거)

#### Qdrant 동기화 (3축)
1. 승인 훅 (uploaded 이벤트 단건)
2. daily-batch 후속 (crawled 이벤트, `onlyMissing`)
3. 수동 backfill CLI (`pnpm ingest:embed`)

### 7-3. `/chat/stream` 5-step 파이프라인

1. **개인화 컨텍스트** — `user_taste_profiles` + 최근 30일 북마크 → `user_signals`
2. **LLM `/chat`** — filter 5종 + reply + followups (2~3 chip) + specificDate 동시 추출
3. **regionHints / vibes → ID resolve** (Prisma)
4. **Semantic suggestions** (over-fetch + filter + rerank):
   - Qdrant `/events/search` limit=30 (`SEMANTIC_OVERFETCH`), score≥0.25
   - Prisma resolve: `phase != 'ended'` + period 교집합 (`specificDate` 우선)
   - 후보 ≥ 6 + query ≥ 8자 → LLM `/events/rerank` (top 12 → top 5 + matchReason 1줄)
5. **Result-aware retreat** — suggestions ≤ `RETREAT_THRESHOLD` (=0)이고 user 발화 있으면 `/chat/compose-retreat` 호출

**SSE 이벤트 stream**: `reply_delta` → `meta` → `reply_sealed` → `suggestions` → `reply_override` → `done`

**v4.11**: `Last-Event-ID` + 캐시로 idempotent resume.

### 7-4. 인증 흐름 (Auth)

- 세션 저장: `auth_sessions` DB 행 + opaque random cookie
- 쿠키: `alle_sid; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` (prod에서 `Secure`)
- 미들웨어 이원화: `requireAuth` (필수, 401) / `resolveAuth` (옵셔널, 게스트 허용)
- Provider 3종:
  1. **Google OAuth** — authorization code flow + id_token tokeninfo 검증
  2. **Kakao OAuth** — authorization code + `GET kapi.kakao.com/v2/user/me`
  3. **dev-login stub** — `NODE_ENV != production`만, `POST /auth/dev-login {nickname}`
- CSRF 방어: `alle_oauth_state` 쿠키 (24 byte random, 10분 TTL)
- returnTo: same-origin path 화이트리스트 통과 시 `alle_oauth_returnto` 쿠키
- same-origin 전략: Web `:5173` → Vite proxy `/api/*` → BFF `:3000`

---

## 8. 구독·알림·추천

### 구독·알림 (A_203 / A_500)
- `event_subscriptions` 5축 배열 (regionIds · companions · eventTypes · vibeIds · periodMonths)
- 매칭: 축 간 AND, 축 내 OR
- **2단계 dedup** (한 사용자 × 한 이벤트 평생 1건):
  1. in-run userId dedup (Map)
  2. cross-run dedup (`notifications` 행 존재 체크)
- 사용자당 구독 상한 `MAX_SUBS_PER_USER` = 20
- 승인 훅 fan-out (fire-and-forget):
  - `notifyMatchingSubscribers(eventId)`
  - `runNewsNaverIngest({onlyEventId})`

### 추천 (G-5)
- `user_taste_profiles` 3 dimensions: `preferred_category` / `preferred_region` / `preferred_vibe`
- 출처: bookmarks + reviews 시그널, 활성 user = 최근 30일 북마크/리뷰 작성자
- TIES tiebreak: `COUNT DESC, MAX(signal.created_at) DESC`
- 일일 집계: `scheduler.ts::runAll()` 후속 7번 + `pnpm aggregate:taste` CLI
- `GET /me/recommendations?limit=10`: WHERE OR 3축 매칭, `phase != 'ended'`, `startDate ASC`

---

## 9. UI 아키텍처

**AppShell이 데스크톱 + 모바일 두 트리 동시 렌더, CSS 미디어 쿼리로 한쪽만 노출.**

### 데스크톱 (`md:` ≥)
```
Header (h-14)
├ Sidebar rail (236px, filter/list/chat + stats)
├ OverlayPanel (absolute left=236 w=380 z-20, slide-in 280ms)
├ Map (flex-1, Kakao + 클러스터러 + vermilion pulse pin + viewport bbox refetch 300ms debounce)
├ EventSummaryPanel (핀 클릭 시)
└ ChatDock (floating bottom-6 z-7 w≤820, handle 접기/펼치기)
```

### 모바일 (`md:` 미만)
```
MobileFloatingHeader (h-12 blur-md, z-40)
└ Map (full-screen, z-0)
└ BottomSheet (z-30, drag+tap, 3 snap: 10vh / 52vh / 90vh)
    └ MobileChatTab
```

### 디자인 시스템 (DESIGN.md)
- 서체: **Pretendard Variable**
- accent: **버밀리언 (vermilion)**
- 레이아웃: map-first hybrid
- Tailwind v4 `@theme` 블록에 토큰 등록
- 금지 패턴: 보라 그라디언트, 3-column icon grid, 뚱뚱한 pill 버튼, gradient CTA, stock photo hero, 서체 fallback 깨진 Inter/Roboto 한글 혼용

---

## 10. 품질·운영 도구

### 안정성
- `fetch-with-retry.ts` — 429/5xx exponential backoff (1s/2s/4s, max 8s, Retry-After 존중, 3회 재시도)
- `quota-counter.ts` — UTC 일자 reset, 80% warn / 95% error (1일 1회 로깅)
- `chat:eval` harness — `pnpm -F bff chat:eval`, 20 case seed, e2e 구조 assertion (BFF + LLM + DB + Qdrant 전체)

### 환경변수 관리
- `.env`는 `.gitignore` (절대 커밋 금지)
- 새 env 추가 시 `.env.example` + `packages/config/schema.ts` 동시 업데이트
- BFF: `dotenv-cli`로 루트 `.env` 주입
- Web: Vite `envDir: '../..'`로 동일 루트 참조

### 로깅
- BFF: **Pino** (dev `pino-pretty` transport)
- LLM: structlog (후보)
- PII 마스킹 유틸 필요 (CLAUDE.md §6-3, 주민번호·전화·이메일 절대 출력 금지)

### 미결정 (Phase 1~2)
- 큐: BullMQ (Node) 유력
- 서버 상태: TanStack Query
- 폼: React Hook Form + Zod
- E2E: Playwright
- 품질: ESLint + Prettier (JS/TS), Ruff + mypy (Python), Vitest + pytest

---

## 11. ADR 인덱스

| ADR | 주제 | 상태 |
|---|---|---|
| 0001 | DDL v3 ↔ Terminology v5 정합성 | 7건 확정 (rename 3 + 신설 3 + 컬럼 추가 1) |
| 0002 | 기술 스택 결정 (MinIO / OpenAI / Qdrant 단일) | 확정 |
| 0003 | 업로더 PII 정책 (주민번호 제거 + 사업자번호/CI 분기) | 확정 |
| 0004 | 세션 무효화 정책 (soft-delete cascade + sliding-cap + logout-all + admin revoke) | 확정 |
| 0005 | 관리자 계정 관리 + 작업 감사 (admin promote/demote/scope + uploader_decision) | 확정 |

---

## 12. 현재 운영 상태 (2026-04-27)

| 항목 | 값 |
|---|---|
| events approved 총 | **4,111건** |
| 뉴스 매핑 커버리지 | **1,810 / 4,111 = 44%** |
| events phase 분포 | upcoming 163 / ongoing 260 / ended 3,661 |
| 소스 분포 | Seoul Culture 압도적 / TourAPI forward window 짧음 / KCISA 키 의존 |
| chat 버전 | **v4.11** (Streaming idempotent resume, Last-Event-ID + 캐시) |
| PostGIS 마이그레이션 | **stage 4b 완료** (lat/lng 컬럼 DROP, location geography 단일) |
| 그래프 | 1024 nodes / 1248 edges / 178 communities |
| God 노드 top 5 | UI 플로우 와이어프레임(23 edges) / ADR 0001(18) / Use Cases Index(15) / Tech Stack(12) / UI Architecture(11) |

### 다음 세션 후보 (v5+)
1. multi-region centroid (지역 다중 선택 시 지도 중심점)
2. 본인인증 prod (SMS 본인인증 production 전환)
3. 사업자번호 검증 (uploader_profiles)
4. chat:eval CI 게이트 (PR 머지 차단)
5. Streaming Redis swap (chat stream cache를 in-memory → Redis)

---

## 13. 참조

### Wiki 토픽
- `llm_wiki/wiki/topics/tech-stack.md`
- `llm_wiki/wiki/topics/db-schema-overview.md`
- `llm_wiki/wiki/topics/ingest-pipeline.md`
- `llm_wiki/wiki/topics/ai-enrichment.md`
- `llm_wiki/wiki/topics/semantic-search.md`
- `llm_wiki/wiki/topics/news-article-pipeline.md`
- `llm_wiki/wiki/topics/auth-flow.md`
- `llm_wiki/wiki/topics/subscriptions-notifications.md`
- `llm_wiki/wiki/topics/recommendations.md`
- `llm_wiki/wiki/topics/ui-architecture.md`
- `llm_wiki/wiki/topics/admin-account-management.md`
- `llm_wiki/wiki/topics/event-state-machine.md`
- `llm_wiki/wiki/topics/filters-5-types.md`
- `llm_wiki/wiki/topics/roles-and-active-role.md`
- `llm_wiki/wiki/topics/terminology-glossary.md`

### ADR canonical
- `docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md`
- `docs/decisions/0002-stack-decisions.md`
- `docs/decisions/0003-uploader-pii-policy.md`
- `docs/decisions/0004-session-invalidation-policy.md`
- `docs/decisions/0005-admin-account-management.md`

### 인프라
- `docker-compose.yml` — 4 데이터 서비스 정의
- `.env.example` — 환경변수 스키마
- `infra/db/init/01-postgis.sql` — PG extensions
- `infra/db/migrations/` — Prisma 마이그레이션 본진

---

*마지막 업데이트: 2026-04-27 (chat v4.11, PostGIS stage 4b, 4,111 events ship 시점)*
