---
title: Qdrant 의미 검색 레이어
type: topic
created: 2026-04-21
updated: 2026-04-22
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
- `POST /events/delete` — 포인트 배치 삭제. body `{ event_ids: number[] }`. 승인 취소 훅이 호출.

### `apps/bff/src/routes/chat.ts` 결합 (v3 — 2026-04-23)

`/chat` 은 더 이상 단순 LLM 프록시가 아님. v3 부터 5-step 파이프라인:

1. **개인화 컨텍스트 빌드** — `resolveAuth` 미들웨어로 로그인 user 면 `user_taste_profiles` 조회 → preferred_companion / category / region / vibe 라벨 + 최근 30d 북마크 수 → LLM `user_signals` 로 전달.
2. **LLM `/chat` 호출** — `services/llm` 에서 filter 5종 + reply + followups (2~3개 칩) + specificDate (선택) 동시 추출. user_signals 는 priorityHint 로만 사용 (강제 필터 아님).
3. **regionHints / vibes → ID resolve** — Prisma.
4. **Semantic suggestions (over-fetch + filter + rerank)**:
   - `/events/search` 호출 limit=30 (`SEMANTIC_OVERFETCH`), score_threshold=0.25, payload filter (categoryCode, single regionId)
   - Prisma resolve **with phase != ended + period 교집합** (`specificDate` 우선, 없으면 `periodKey` → `rangeForPeriod`)
   - 후보 ≥ 6 + query ≥ 8자 → LLM `/events/rerank` (top 12 후보를 의미·시점·동행 적합도로 재정렬 + 1줄 reason 부착) → top 5 cap
   - 그 외 → score desc 순 top 5 cap
5. **Result-aware retreat** — 최종 suggestions ≤ `RETREAT_THRESHOLD` (현 0) 이고 user 발화 있으면 LLM `/chat/compose-retreat` 호출 → 정직한 0건 안내 + 대체 followups 로 reply 덮어쓰기.

응답 shape:
```jsonc
{
  "reply": "...",
  "filters": { ... , "regionIds": [...], "vibeIds": [...] },
  "specificDate": "2026-04-25" | null,
  "followups": ["이번 주말로", "친구랑은", "전시도 함께"],
  "suggestions": [
    { "eventId": "...", "title": "...", "matchReason": "활동적인 가족이 즐기기 좋아요", ... }
  ]
}
```

LLM/Qdrant 503/502 → `suggestions: []` (채팅은 계속). compose-retreat 실패 → 원래 reply 유지.

기존 ended-event leak 버그 (5e51503) — phase 필터 없어 종료 이벤트가 후보로 leak → fix.

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

## 실시간 동기화 (3축)

배치만으로는 신규/탈락/요약변경 이벤트가 검색 인덱스에 시차로 반영된다. 2026-04-22 sprint
이후 실시간 훅 3개로 커버 — 배치는 누락 복구용 safety net 역할.

| 트리거 | 호출 위치 | 동작 | 실패 정책 |
|---|---|---|---|
| 1. **승인 (upsert)** | `apps/bff/src/routes/admin-uploaders.ts::decideEventUpload` (`action==='approved'`) | `runEmbedEvents({ onlyEventId })` fire-and-forget | 실패 무시 — `embed:events:missing` 배치가 커버 |
| 2. **탈락 (delete)** | 동 파일, 이미 approved 였다가 `rejected` / `revision_requested` 로 전환 시 | `deleteEventEmbeddings([eventId])` (→ `services/llm POST /events/delete`) | fire-and-forget |
| 3. **aiSummary 갱신 (re-embed)** | `apps/bff/src/jobs/summarize-events.ts` 워커 내부, summary update 직후 | `await runEmbedEvents({ onlyEventId })` (동일 워커 동시성 풀 5) | try/catch 무시 — 다음 missing 배치가 커버 |

공공 소스 이벤트는 admin 승인을 안 거치므로 1번 훅 대신 daily-batch 후속 파이프라인이
`runEmbedEvents({ onlyMissing: true, eventLimit: 'all' })` 로 커버 — [ingest-pipeline.md §후속
파이프라인](ingest-pipeline.md) 참조.

## Scoring 결합 (뉴스 파이프라인 참조)

별도 use case — 뉴스 기사-이벤트 매칭도 동일 `/embed` 인프라를 쓴다:
1차 keyword overlap + 2차 embedding cosine → `0.4 * kw + 0.6 * emb`, threshold 0.60 (embedding 결합) /
0.55 (keyword-only). `news-article-pipeline.md` 참조.

## Fallback / 가용성

- `OPENAI_API_KEY` 없음 → `/embed` 503 → BFF `suggestions: []`.
- Qdrant 비가용 (docker 꺼짐) → `search_events()` 빈 배열 → `suggestions: []`.
- embed 가능하지만 Qdrant 에 데이터 없음 → hits 0 → `suggestions: []`.

이 degradation 은 `/chat` 이 최소한 필터 추출 + reply 로 계속 동작함을 보장.

## Health

`GET /health` 응답의 `qdrant: { available, points, status }` 필드로 collection 상태 관측. 대시보드나 모니터링에서 points 수 증가로 embed 배치 건강성 확인.

## Open questions

- ~~user_taste_profiles 미사용~~ → **해소** (2026-04-23 v3): `/chat` 가 로그인 user 면 taste profile 라벨을 LLM `user_signals` 로 priorityHint 주입.
- ~~`/chat` reply 가 rule-based echo~~ → **해소** (2026-04-23 prompt 강화 1차 + v3): LLM 이 reply 직접 생성. 룰 기반 `compose_reply` 는 fallback only.
- ~~결과 0건 안내 미흡~~ → **해소** (2026-04-23 v3): `/chat/compose-retreat` 가 결과 사실 + 대체 followups 자율 생성.
- ~~Qdrant kNN 단일 score 만 사용~~ → **해소** (2026-04-23 v3): LLM 이 top 12 → top 5 rerank + matchReason 부착. 토큰 cost +$0.0003/req.
- ~~이벤트가 승인 취소되면 Qdrant 에서 자동 삭제 안 됨~~ → **해소** (커밋 `80cb2a2`):
  탈락 훅이 `deleteEventEmbeddings([id])` 즉시 호출. `isDeleted=true` soft-delete 경로의
  reconcile 만 잔여 — 주기 배치 후보.
- 후속 (v4 후보):
  - **Streaming SSE** — gpt-4o-mini 응답 체감 latency 개선 (현재 ~1.5s).
  - **Article RAG** — `event_article_mappings` (1810건) 의 기사 본문을 reply 근거로 인용.
  - **Hybrid search** — pg_trgm 키워드 + vector 결합 (현재 vector only).
  - **Grounded followup** — "그 중에 무료인 거?" 같은 referential 후속 질문 — 직전 turn 의 suggestions 을 LLM 에 컨텍스트로 재전달.
  - **Prompt injection 방어** — 사용자 입력 sanitize / role isolation.

## References

- [adr-0002-stack-decisions.md](adr-0002-stack-decisions.md) — Qdrant 선택 근거
- [ai-enrichment.md](ai-enrichment.md) — AI 요약 + 감성 + 임베딩 묶음
- `services/llm/qdrant_events.py` — 클라이언트 래퍼
- `apps/bff/src/jobs/embed-events.ts` — 배치 ingest
- `apps/bff/src/routes/chat.ts` — /chat 결합
