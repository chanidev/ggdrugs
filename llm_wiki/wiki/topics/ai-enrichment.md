---
title: AI Enrichment (요약 · 감성)
type: topic
created: 2026-04-19
updated: 2026-04-21
sources: []
related:
  - ingest-pipeline.md
  - auth-flow.md
  - ../entities/google.md
---

# AI Enrichment — 이벤트 요약 · 리뷰 감성

## Summary

Alle 는 두 종류의 구조화된 텍스트 추출에 OpenAI `gpt-4o-mini` 를 사용한다.
공통 원칙: **LLM 은 의미 추출·요약에만, 결정은 사람이**. CLAUDE.md §6-4 의
"LLM 에 관리자 판단 위임 금지" 규칙에 따라 이벤트 승인·라벨 부여 같은 권한
작업은 LLM 대상 아님.

services/llm 엔드포인트는 전부 **키 없으면 fallback** 형태. dev·CI 환경에서
OPENAI_API_KEY 미설정 시 규칙 기반 대체로 동작하므로 막히지 않음.

## 1. 이벤트 AI 요약 (events.ai_summary)

### 데이터 흐름

1. **Ingest**: Seoul/KCISA 러너가 원본 description 필드를 정리해
   `NormalizedEvent.description` 로 담음. `ingest-common.cleanDescription`
   이 HTML strip + 엔티티 디코드 + 공백 정규화. TourAPI 는 list API 에
   설명이 없어 null.
2. **저장**: `events.description TEXT` 컬럼 (기존) + 새로 생긴
   `events.ai_summary TEXT` + `ai_summary_at TIMESTAMPTZ` (마이그레이션
   `20260419210000_add_event_ai_summary`).
3. **Backfill**: `pnpm backfill:summary [--limit N]` (`apps/bff/src/jobs/
   summarize-events.ts`). concurrency 5, description 있는 event 중
   ai_summary 없는 것만. `services/llm/summarize` 호출.
4. **LLM**: `openai_chain.summarize_event` — system prompt 는 여행 가이드
   톤 + "2~3문장 + 250자 + 사실만 + 이모지 금지". temperature 0.3.
5. **조회**: `GET /events/:id` 응답에 `aiSummary` 필드. UI 는 AI 뱃지 + 본문
   + "원본 설명 보기" details 접기.

### 비용

`gpt-4o-mini` 입력 ~300 tokens + 출력 ~120 tokens ≈ $0.00015/건. 초기 backfill
398건 ≈ $0.06. 이후 ingest 성장분만 증분 비용.

### 재요약 정책 (2026-04-21)

`events.description_hash CHAR(32)` 컬럼을 추가하고 BEFORE UPDATE 트리거
`trg_events_invalidate_ai_summary` 로 description 변경 시 ai_summary /
ai_summary_at / description_hash 를 자동 NULL 처리. 다음 backfill 실행 시
자동으로 재요약 대상이 됨. 재ingest 에서 설명이 바뀐 이벤트든, 관리자 수동
편집이든 동일 경로로 무효화. 마이그레이션
`20260421100000_event_summary_cache_invalidation`.

### 미구현 (후속)

- Ingest 시점 자동 summarize (현재 backfill 만). 새 이벤트 upsert 후
  비동기 호출 패턴은 reviews.sentiment 와 동일하게 추가 가능.
- description 없는 이벤트 요약 (title + category 기반 fallback). 현재는 스킵.

## 2. 리뷰 감성 분류 (reviews.sentiment)

### 데이터 흐름

1. **Write**: `POST /events/:id/reviews` 트랜잭션에서 review 만 먼저 insert +
   event 집계 재계산. 응답에는 `sentiment: null`.
2. **Async classify**: `classifyAndStoreSentiment(reviewId, body)` fire-and-
   forget. `services/llm/sentiment` 호출 → `reviews.sentiment` update.
3. **조회**: `GET /events/:id/reviews` 응답 아이템에 `sentiment` 포함.
4. **LLM**: `openai_chain.classify_sentiment` — structured output
   `{sentiment: "positive"|"negative"|"neutral"}` enum strict. temperature 0.
5. **Fallback**: 키 없거나 호출 실패 시 단순 키워드 집계 (좋/최고/추천 vs
   별로/실망/비추). null 은 "분류 전" 상태로 UI 가 뱃지 숨김.

### UI

- `ReviewCard` 가 별점 옆에 `SentimentBadge`. 색: 긍정=success tint, 부정=
  error tint, 보통=surface-alt.
- 작성 직후엔 뱃지 없음. 새로고침 3초 내에 뱃지 생김 (LLM round-trip).

### 비용

리뷰 당 ~150 tokens 입출력 ≈ $0.00005/건. 연 리뷰 10k 기준 $0.5.

## 공통 패턴

### 키 유무·예산 자동 분기

`services/llm/app.py::_openai_available()` 가 OPENAI_API_KEY 보유 +
일일 예산 미초과 두 조건 모두 만족할 때만 Stage 2 호출. 예외 시 규칙 기반
fallback. `GET /health` 의 `stage` 필드가 현재 경로 표시:
- `stage1-rules` — 키 없음, 규칙만
- `stage1-rules-budget-cap` — 키 있으나 TOKEN_BUDGET_DAILY_USD 초과
- `stage2-openai` — 키 있음, LLM 우선

### Structured output 강제

분류·JSON 반환 계열은 전부 `response_format={"type": "json_schema", "strict":
true}` + enum 강제. 허용값 외 반환 불가능 → 다운스트림 validation 불필요.

### 출력 sanitize (summary_guard.py)

요약 반환값은 모델/fallback 양쪽에서 `sanitize_summary` 통과:
- 이모지 제거 (주요 유니코드 블록)
- 마크다운 제거 (`**bold**`, `*em*`, `` `code` ``, `[link](url)`, `-` 리스트, `#` 헤딩)
- 공백 정규화 (개행 → 공백, 연속 공백 1개)
- 250자 제한 (문장 경계 우선, 없으면 하드컷 + `…`)

### 비용 관측 (cost_tracker.py)

`CostTracker` 싱글턴이 openai 응답의 `usage.prompt_tokens` /
`completion_tokens` 누적. 모델별 per-M-token 가격표(`_PRICING_PER_MTOK`)
로 USD 환산. `/health` 응답의 `cost` 필드에 일일 누적 노출:
```json
{
  "date": "2026-04-21",
  "tokensToday": 12345,
  "estimatedUsd": 0.0037,
  "byEndpoint": { "summarize": {...}, "sentiment": {...}, "chat": {...} },
  "dailyBudgetUsd": 1.0
}
```
환경변수 `TOKEN_BUDGET_DAILY_USD` 가 설정되어 있으면 해당 한도 도달 시 자동
fallback 으로 전환 (stage label 변경).

### BFF → services/llm 호출 policy

`apps/bff/src/llm-client.ts::callLlm` 공용 helper.
- 429 / 5xx / network error 시 **1회 300ms 백오프 재시도**.
- 그 외 4xx 즉시 실패.
- 재시도 포함 실패 시 null 반환 → 호출자는 업무 로직 fallback (summary 스킵
  또는 sentiment null).

### Eval 샘플링 CLI

`pnpm eval:summary --n 20` — ai_summary 가 있는 approved 이벤트 중 N 건 랜덤
샘플 출력 (title, description 발췌, ai_summary, 생성 시점, hash prefix).
사람이 직접 읽어서 환각·이모지·과장 탐지. `apps/bff/src/jobs/eval-summaries.ts`.

## References

- `services/llm/openai_chain.py` — `extract_via_openai`, `summarize_event`,
  `classify_sentiment`, `_track_usage`
- `services/llm/app.py` — /chat, /summarize, /sentiment, /health 엔드포인트
- `services/llm/summary_guard.py` — `sanitize_summary` 마크다운/이모지/길이 가드
- `services/llm/cost_tracker.py` — 토큰 누적 + 일일 예산 가드
- `apps/bff/src/llm-client.ts` — callLlm 재시도 helper
- `apps/bff/src/jobs/summarize-events.ts` — backfill (description_hash 캐싱)
- `apps/bff/src/jobs/eval-summaries.ts` — 스팟체크 CLI (`pnpm eval:summary`)
- `apps/bff/src/routes/event-reviews.ts` — POST 시 sentiment 비동기 호출
- 마이그레이션 `20260419210000_add_event_ai_summary` (컬럼 추가)
- 마이그레이션 `20260421100000_event_summary_cache_invalidation` (hash + 트리거)
- 커밋 `7d58960` (AI 요약 + sentiment 통합)
