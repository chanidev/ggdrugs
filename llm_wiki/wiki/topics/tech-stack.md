---
title: 기술 스택 (확정본)
type: topic
created: 2026-04-17
updated: 2026-06-08
sources: [2026-04-17_requirements-v5]
related:
  - ../sources/2026-04-17_requirements-v5.md
  - db-schema-overview.md
  - adr-0001-terminology-reconciliation.md
  - adr-0002-stack-decisions.md
---

# 기술 스택

## Summary

GGdrugs의 확정 기술 스택. 요구사항정의서 v5.0 Ⅴ장 6절 "기술 용어" + ADR 0001 + **ADR 0002**를 통합한 단일 근거 페이지.

## 확정 스택

### 데이터 레이어

| 역할 | 기술 | 버전 | 근거 |
|---|---|---|---|
| 관계형 DB | PostgreSQL + PostGIS | `postgis/postgis:15-3.4` | docker-compose |
| PG Extensions | postgis, postgis_topology, pg_trgm, unaccent, citext | — | `infra/db/init/01-postgis.sql` |
| 벡터 DB | Qdrant | `v1.13.0` | ADR 0002 D-3 |
| 캐시 / pub-sub | Redis | `7-alpine` | docker-compose · socket.io 채팅 pub/sub(ioredis, ADR 0007). BullMQ 미채택 |
| 오브젝트 스토리지 | MinIO (S3 호환) | `RELEASE.2024-12-18T13-15-44Z` | ADR 0002 D-1 |

### 애플리케이션

| 컴포넌트 | 기술 | 근거 |
|---|---|---|
| BFF | Node.js + Express 5 + Prisma + TypeScript (`@types/node` `^24`) | 요구사항 v5 Ⅴ-6 |
| BFF 실시간 | socket.io `^4.8.3` + @socket.io/redis-adapter `^8.3.0` + ioredis `^5.11.0` | ADR 0007 (메이트 채팅방, Redis pub/sub) |
| LLM 서비스 | Python + FastAPI + OpenAI SDK (직접 작성 체인) | ADR 0002 D-2 · `services/llm/openai_chain.py` |
| 프론트엔드 | React 19 + Vite 6 + TypeScript + Tailwind 4 | 요구사항 v5 Ⅴ-6 |
| 프론트 디자인 시스템 | SEED Design (`@seed-design/css` `^1.2.12` · `@seed-design/react` `^1.2.10` · `@seed-design/vite-plugin` `^1.1.1`) + Karrot 아이콘 (`@karrotmarket/react-monochrome-icon` `^1.17.0`) | ADR 0008 (SEED 채택 Option B) |
| 프론트 i18n | i18next `^26.3.0` + react-i18next `^17.0.8` + i18next-browser-languagedetector `^8.2.1` + i18next-http-backend `^4.0.0` | ADR 0007 (다국어 6종) |
| 프론트 실시간 | socket.io-client `^4.8.3` | ADR 0007 (메이트 채팅) |
| 모노레포 | pnpm workspaces | Phase 0 스켈레톤 |

### LLM (ADR 0002 D-2)

| 용도 | 모델 | env 변수 |
|---|---|---|
| 채팅 검색 (A_201) | `gpt-4o` | `OPENAI_MODEL_CHAT` |
| 감성분석 · 태깅 · 경량 분류 | `gpt-4o-mini` | `OPENAI_MODEL_FAST` |
| 임베딩 (Qdrant 인덱싱) | `text-embedding-3-small` | `OPENAI_MODEL_EMBEDDING` |

### 외부 API

- Kakao Maps / Kakao REST API — 지도 + 지역 검색.
- Google OAuth, Kakao OAuth — 회원가입·로그인.

### 확정된 항목 (Phase 1~2에서 확정됨)

- **인증**: opaque-session 출하 — `crypto.randomBytes` 기반 세션 토큰(서버 보관). "세션 vs JWT 미결정"은 해소됨(JWT 라이브러리 미사용).
- **큐 / 백그라운드**: BullMQ는 **채택 안 함**(deps 부재). 메이트 타임아웃·스케줄러는 자체 구현(`apps/bff/src/jobs/scheduler.ts`) + `Notification.scheduledAt` 패턴(ADR 0007 #10).
- **프론트 라이브러리**: TanStack Query / React Hook Form은 **deps에 없음**(상태·폼은 자체 처리). CSS는 Tailwind 4 확정, 지도 바인딩 `react-kakao-maps-sdk`, 디자인 시스템 SEED(ADR 0008), i18n i18next, 실시간 socket.io-client(ADR 0007).
- **품질 도구**: Vitest(web) + Playwright(E2E) 확정. MSW(`msw`)로 web 테스트 모킹.
- **로깅**: Pino (Node, dev `pino-pretty`) 확정. PII 마스킹 (CLAUDE.md §6-3).

## Phase 1 실구현 상태 (2026-04-17 기준)

> **갱신(Phase 2 출하)**: Phase 2 소셜 레이어(커뮤니티 + 메이트 동행 매칭, ADR 0007)가 출하됨 — BFF socket.io 실시간 채팅방, web SEED Design 소셜 화면(ADR 0008), i18n 6종, opaque-session 인증. 아래 목록은 Phase 1 초기 스냅샷이며 일부 버전은 이후 상향됨(`@types/node` `^24`, Express 5 등).

**구동 중인 것**:
- Docker Compose 데이터 레이어 4종 (postgres:5433 / qdrant:6333 / redis:6379 / minio:9000-9001) — healthy.
- `@ggdrugs/config` (zod env 검증) — 빌드·동작 확인.
- `@ggdrugs/bff` (Express 5 + pino + Prisma 5.22, `@types/node` `^24`) — `GET /health` 정상.
- `@ggdrugs/web` (Vite 6 + React 19 + Tailwind 4 + Pretendard) — 메인 페이지 shell + Kakao Maps 실제 렌더.
- Prisma 마이그레이션 2건 적용: baseline(22 앱 테이블) + CHECK 제약 26건 + `fn_set_updated_at()` 트리거 8건.

**확정된 추가 선택**:
- 로깅: **Pino** (dev는 `pino-pretty` transport).
- 환경변수 로딩: `dotenv-cli` 로 BFF 스크립트에서 루트 `.env` 주입. web 은 Vite `envDir: '../..'` 로 동일 루트 읽음.
- TypeScript 5.9 / tsx 4 (dev watch).

**해소됨**: 인증 opaque-session 출하 / BullMQ·TanStack Query·React Hook Form 비채택(deps 부재) / 품질도구 Vitest+Playwright+MSW 확정. (상세는 위 "확정된 항목" 참조)

자세한 UI 구조는 [ui-architecture.md](ui-architecture.md) 참조.

## Open questions / contradictions

1. BFF ↔ LLM 서비스의 DB write 책임 분담 명확화 필요 — LLM 서비스가 `chat_messages`, `search_logs` 직접 write 할지 BFF를 경유할지.
2. 프로덕션 환경 인프라 (클라우드 공급자, 배포 파이프라인) 미정 — Phase 4+ 결정.
3. Observability (Sentry, 로그 집계, 메트릭) 미정 — Phase 3+ 결정.

## References

- [ADR 0001 — 용어집 정합성](../../../docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md)
- [ADR 0002 — 기술 스택 결정](../../../docs/decisions/0002-stack-decisions.md)
- [docker-compose.yml](../../../docker-compose.yml)
- [.env.example](../../../.env.example)
