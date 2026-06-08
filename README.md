# Alle

> 서울의 축제·박람회·심포지움·컨퍼런스를 **지도 위에서** 찾는다.
> 자연어 처리 기반 이벤트·이슈 지도 검색 서비스 — **지도 + 필터 5종 + LLM 채팅**으로 탐색한다.

![phase](https://img.shields.io/badge/phase-1%20서비스%20구동-2ea44f)
![stack](https://img.shields.io/badge/stack-React%2019%20·%20Express%205%20·%20FastAPI-blue)

> 제품 표기는 **Alle**, 레포·패키지·DB 식별자는 `ggdrugs` / `@ggdrugs/*` 를 유지합니다 (2026-04 리브랜딩, 레포 전체 rename 회피).

---

## 무엇을 하는가

공공 데이터(TourAPI·서울문화행사·KCISA)와 뉴스(네이버)를 수집·정제해 **승인된 이벤트를 지도에 띄우고**, 사용자가 자연어로 대화하며 원하는 이벤트를 찾도록 돕는다.

- **지도 검색** — Kakao Maps 위에 이벤트 핀·클러스터, 지역 bbox 질의(PostGIS)
- **필터 5종 (고정)** — 지역 · 기간 · 인원구성 · 이벤트 종류 · 이벤트 성향
- **LLM 채팅** — 필터 5종 기반 대화형 추천 (Qdrant 벡터 검색 + OpenAI)
- **3역할 모델** — `user` / `uploader` / `admin`, **1계정 = 복수 역할 토글** 방식
- **Phase 2 (진행 중)** — 메이트 매칭, 커뮤니티, 그룹 약속, 실시간 채팅(Socket.IO)

현재: 승인 이벤트 **4,111건**, 그중 뉴스 매핑 **1,810건 (44% 커버리지)**.

---

## 아키텍처

```
apps/web   React 19 + Vite 6        →  /api 프록시 (ws)  ┐
apps/bff   Express 5 + Prisma 5      ──────────────────  ├─ Postgres/PostGIS · Redis · MinIO(S3)
services/llm  FastAPI + LangChain    ←  HTTP (:8000)     ┘   Qdrant (벡터)
```

| 경로 | 역할 | 스택 |
|---|---|---|
| `apps/web` | 프론트엔드 (지도·채팅 UI) | React 19, Vite 6, Tailwind 4, SEED Design, Kakao Maps SDK, react-router 7, i18next, socket.io-client |
| `apps/bff` | REST API · 인증/권한 · 비즈니스 로직 | Node, Express 5, Prisma 5, Socket.IO, ioredis, AWS S3 SDK, pino |
| `services/llm` | 채팅 검색·요약·감성분석·뉴스 매칭 | Python, FastAPI, LangChain, OpenAI, Qdrant |
| `packages/shared-types` | BFF↔Web 공유 TypeScript 타입 | — |
| `packages/config` | 환경변수 스키마·공통 설정 | — |
| `infra/` | Docker, DB 마이그레이션·시드 | — |
| `docs/` | 요구사항 · ADR · 산출물 | — |
| `llm_wiki/` | LLM 유지 위키 (Karpathy 패턴) | — |

**로컬 인프라** (`docker-compose.yml`): `postgis/postgis:15-3.4` · `qdrant:v1.13.0` · `redis:7-alpine` · `minio`

---

## 먼저 읽어야 할 문서

- **[CLAUDE.md](CLAUDE.md)** — 에이전트 작업 지시서 (컨벤션 · 금지사항 · 역할 분담)
- **[DESIGN.md](DESIGN.md)** — 디자인 시스템 (폰트·색·간격·모션) — UI 작업 전 필독
- **[docs/decisions/](docs/decisions/)** — 아키텍처 결정 기록 (ADR 0001~0010)
- **[docs/deliverables/](docs/deliverables/)** — 산출물 (기획서·요구사항·테이블·화면설계서)
- **[llm_wiki/wiki/index.md](llm_wiki/wiki/index.md)** — 요구사항·DB 설계 요약 + 용어집

---

## 로컬 실행

### 0. 사전 준비

- Docker Desktop, **Node 20+**, **pnpm 9**, **Python 3.11+**
- `.env.example` → `.env` 복사 후 키 채우기
  (`DATABASE_URL`, `OPENAI_API_KEY`, `VITE_KAKAO_MAP_JS_KEY`, 각종 공공데이터 API 키 등)

### 1. 인프라 기동

```bash
docker compose up -d postgres qdrant redis minio
```

### 2. 의존성 설치 + DB 준비

```bash
pnpm install
pnpm --filter @ggdrugs/bff prisma:generate
pnpm --filter @ggdrugs/bff prisma:migrate:deploy
pnpm --filter @ggdrugs/bff seed:admin        # 관리자 계정 시드
```

### 3. 세 프로세스 기동 (각각 별도 터미널)

```bash
# BFF — http://localhost:3000
pnpm --filter @ggdrugs/bff dev

# LLM — http://localhost:8000
cd services/llm && pip install -r requirements.txt && python -m uvicorn app:app --port 8000 --reload

# Web — http://localhost:5173  (/api → :3000 프록시, ws 포함)
pnpm --filter @ggdrugs/web dev
```

브라우저에서 **http://localhost:5173** 접속.

---

## 데이터 수집 (BFF 잡)

```bash
pnpm --filter @ggdrugs/bff ingest:tourapi      # 한국관광공사 TourAPI
pnpm --filter @ggdrugs/bff ingest:seoul        # 서울 문화행사
pnpm --filter @ggdrugs/bff ingest:kcisa        # KCISA
pnpm --filter @ggdrugs/bff ingest:news:missing # 네이버 뉴스 매핑 (미매핑분)
pnpm --filter @ggdrugs/bff embed:events:missing # Qdrant 임베딩 (미임베딩분)
```

전체 잡 목록은 `apps/bff/package.json` 의 `scripts` 참고 (`ingest:*`, `embed:*`, `*:eval` 평가 하네스 등).

---

## 개발 규약 (요약)

- **용어 통일** — `event`(절대 `festival` 금지), `event_type`, `event_vibe`, `companion_type`, `active_role`, `period`. 근거는 요구사항정의서 Ⅴ장 용어집.
- **이벤트 상태 머신** — `pending → revision_requested → pending` / `pending → approved → ended` / `pending → rejected`
- **필터 5종 고정** — 추가하려면 요구사항정의서 개정 선행.
- **DB 변경은 Prisma 마이그레이션으로만**, 직접 수정 금지.
- **LLM은 추천·검색·요약 전용** — 승인/라벨/승급 등 관리자 판단은 사람이 결정.
- **커밋** — Conventional Commits (`feat(bff): ...`, 범위 태그는 최상위 디렉터리명).

전체 규약은 [CLAUDE.md](CLAUDE.md) 참고.
