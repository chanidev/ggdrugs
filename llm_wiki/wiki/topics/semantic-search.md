---
title: Qdrant 의미 검색 레이어
type: topic
created: 2026-04-21
updated: 2026-04-21
sources: [2026-04-17_requirements-v5]
related:
  - adr-0002-stack-decisions.md
  - ai-enrichment.md
  - ingest-pipeline.md
  - main-page-flow.md
  - ../sources/2026-04-17_requirements-v5.md
---

# Qdrant 의미 검색 레이어

## Summary

이벤트를 **자연어 쿼리 → 임베딩 → Qdrant kNN** 으로 찾는 의미 기반 검색. 필터 5종(SQL WHERE)과 병렬로 동작해, /chat 응답에 후보 이벤트 N건을 포함시켜 사용자가 채팅창에서 바로 이벤트 카드를 클릭할 수 있게 한다. ADR 0002 D-3에서 "Qdrant 단일 벡터 스토어" 결정 후 Phase 1 AI 강화 sprint(2026-04-21) 에서 실제 파이프라인 완성.

## Collection 스펙

- **name**: `alle-events`
- **vector**: 1536 차원, Cosine distance
- **model**: `text-embedding-3-small` (OpenAI, `OPENAI_MODEL_EMBEDDING` 환경변수)
- **point id**: event_id (정수)
- **payload**: `{ title, phase, startDate, endDate, regionId, categoryCode, vibeIds[], approvedAt }`

collection 은 `services/llm/qdrant_events.py::ensure_collection()` 이 첫 호출 시 자동 생성 (dev 편의). 프로덕션은 별도 마이그레이션 권장.

## 엔드포인트

### `services/llm/app.py`

- `POST /embed` — 배치 임베딩. 1536차원 벡터 list 반환. 256 상한.
- `POST /events/search` — 자연어 쿼리 → embed → kNN. optional payload filter 지원.
  - Request: `{ query, limit?, score_threshold?, filter? }`
  - Response: `{ query, hits: [{ eventId, score, payload }] }`
- `POST /events/upsert` — 포인트 배치 upsert. 1536d 고정, 256 상한.

### `apps/bff/src/routes/chat.ts` 결합

사용자 대화 최근 3턴을 concat 해 `/events/search` 호출:
- filters.categoryCode → payload filter `categoryCode`
- filters.regionIds 길이 1 → payload filter `regionId` (다건은 OR 안 돼서 생략)
- score_threshold 기본 0.25, limit 5
- 응답 hit eventId 를 Prisma 로 resolve (approved + 미삭제) 후 `ChatSuggestion[]` 으로 반환

services/llm 이 503/502 이거나 Qdrant 가 비가용이면 `suggestions: []` 로 유지. 채팅 자체는 계속 동작.

## 데이터 채우기

### 배치 (BFF `apps/bff/src/jobs/embed-events.ts`)

approved + 미삭제 이벤트 → `title + category + aiSummary|description` 으로 텍스트 구성 → `/embed` 배치 → `/events/upsert` 배치:

- `pnpm --filter bff embed:events` — 최신 200건
- `pnpm --filter bff embed:events:all` — 전체 (~2분, $0.05)
- `pnpm --filter bff embed:events:missing` — Qdrant 에 아직 없는 이벤트만 (scroll 로 판별)

### Embed 텍스트 전략

1. `title` (항상)
2. `분류: {categoryCode}` 한 줄
3. `aiSummary` (있으면) 또는 `description[:1500]` (fallback)
4. 합쳐서 2000자 슬라이스

aiSummary 가 있을수록 임베딩 품질이 좋아지므로 `summarize-events.ts` (gpt-4o-mini) 를 먼저 돌리고 embed 하는 순서가 권장.

## Scoring 결합 (뉴스 파이프라인 참조)

별도 use case — 뉴스 기사-이벤트 매칭도 동일 `/embed` 인프라를 쓴다:
1차 keyword overlap + 2차 embedding cosine → `0.4 * kw + 0.6 * emb`, threshold 0.55. `news-article-pipeline.md` 참조.

## Fallback / 가용성

- `OPENAI_API_KEY` 없음 → `/embed` 503 → BFF `suggestions: []`.
- Qdrant 비가용 (docker 꺼짐) → `search_events()` 빈 배열 → `suggestions: []`.
- embed 가능하지만 Qdrant 에 데이터 없음 → hits 0 → `suggestions: []`.

이 degradation 은 `/chat` 이 최소한 필터 추출 + reply 로 계속 동작함을 보장.

## Health

`GET /health` 응답의 `qdrant: { available, points, status }` 필드로 collection 상태 관측. 대시보드나 모니터링에서 points 수 증가로 embed 배치 건강성 확인.

## Open questions

- 현재 user_taste_profiles 미사용 — 북마크/리뷰 기반 개인화 추천 추가 여부 미정.
- `/chat` reply 자체를 LLM 이 suggestion 후보를 참조해 자연어로 합성하는 단계 (현 reply 는 rule-based echo) 미구현. 다음 sprint 후보.
- 이벤트가 승인 취소(isDeleted=true) 되면 Qdrant 에서 자동 삭제 안 됨 — 주기 배치로 reconcile 필요.

## References

- [adr-0002-stack-decisions.md](adr-0002-stack-decisions.md) — Qdrant 선택 근거
- [ai-enrichment.md](ai-enrichment.md) — AI 요약 + 감성 + 임베딩 묶음
- `services/llm/qdrant_events.py` — 클라이언트 래퍼
- `apps/bff/src/jobs/embed-events.ts` — 배치 ingest
- `apps/bff/src/routes/chat.ts` — /chat 결합
