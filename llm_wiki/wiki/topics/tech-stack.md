---
title: 기술 스택 (확정본)
type: topic
created: 2026-04-17
updated: 2026-04-17
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
| 캐시 / 큐 | Redis | `7-alpine` | docker-compose, BullMQ 큐 공유 |
| 오브젝트 스토리지 | MinIO (S3 호환) | `RELEASE.2024-12-18T13-15-44Z` | ADR 0002 D-1 |

### 애플리케이션

| 컴포넌트 | 기술 | 근거 |
|---|---|---|
| BFF | Node.js + Express + Prisma + TypeScript | 요구사항 v5 Ⅴ-6 |
| LLM 서비스 | Python + FastAPI + OpenAI SDK | ADR 0002 D-2 |
| 프론트엔드 | React 19 + Vite + TypeScript | 요구사항 v5 Ⅴ-6 |
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

### 아직 결정되지 않은 항목 (Phase 1~2에서 확정)

- **큐**: BullMQ (Node) 유력 — 이미 Redis 있음. Phase 1 BFF 스캐폴드 시 결정.
- **프론트 라이브러리**: 서버 상태 (TanStack Query), 폼 (React Hook Form + Zod), CSS (Tailwind 유력), 지도 바인딩 (`react-kakao-maps-sdk`).
- **품질 도구**: ESLint + Prettier (JS/TS), Ruff + mypy (Python), Vitest + pytest, Playwright (E2E).
- **로깅**: Pino (Node), structlog (Python) 후보. PII 마스킹 유틸 필요 (CLAUDE.md §6-3).
- **세션 vs JWT 전략**: `.env.example`에 둘 다 선언 — 역할 확정 필요.

## Open questions / contradictions

1. BFF ↔ LLM 서비스의 DB write 책임 분담 명확화 필요 — LLM 서비스가 `chat_messages`, `search_logs` 직접 write 할지 BFF를 경유할지.
2. 프로덕션 환경 인프라 (클라우드 공급자, 배포 파이프라인) 미정 — Phase 4+ 결정.
3. Observability (Sentry, 로그 집계, 메트릭) 미정 — Phase 3+ 결정.

## References

- [ADR 0001 — 용어집 정합성](../../../docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md)
- [ADR 0002 — 기술 스택 결정](../../../docs/decisions/0002-stack-decisions.md)
- [docker-compose.yml](../../../docker-compose.yml)
- [.env.example](../../../.env.example)
