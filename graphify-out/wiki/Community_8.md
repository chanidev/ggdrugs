# Community 8

> 28 nodes · cohesion 0.13

## Key Concepts

- **app.py** (20 connections) — `services\llm\app.py`
- **BaseModel** (10 connections)
- **_openai_available()** (6 connections) — `services\llm\app.py`
- **chat()** (5 connections) — `services\llm\app.py`
- **sentiment()** (5 connections) — `services\llm\app.py`
- **embed()** (4 connections) — `services\llm\app.py`
- **summarize()** (4 connections) — `services\llm\app.py`
- **ChatFilters** (3 connections) — `services\llm\app.py`
- **ChatResponse** (3 connections) — `services\llm\app.py`
- **EmbedResponse** (3 connections) — `services\llm\app.py`
- **_openai_extract()** (3 connections) — `services\llm\app.py`
- **SentimentResponse** (3 connections) — `services\llm\app.py`
- **_stage_label()** (3 connections) — `services\llm\app.py`
- **SummarizeResponse** (3 connections) — `services\llm\app.py`
- **ChatMessage** (2 connections) — `services\llm\app.py`
- **ChatRequest** (2 connections) — `services\llm\app.py`
- **EmbedRequest** (2 connections) — `services\llm\app.py`
- **health()** (2 connections) — `services\llm\app.py`
- **_rule_sentiment()** (2 connections) — `services\llm\app.py`
- **SentimentRequest** (2 connections) — `services\llm\app.py`
- **SummarizeRequest** (2 connections) — `services\llm\app.py`
- **Alle LLM service — Stage 1.5 (multi-turn + vibe 매핑, OpenAI 선택적 연동 준비).  인터페이스: P** (1 connections) — `services\llm\app.py`
- **현재 활성 체인 — 환경변수·예산 잔량에 따라 결정.** (1 connections) — `services\llm\app.py`
- **키 있고 일일 예산 한도 전이면 True.** (1 connections) — `services\llm\app.py`
- **Stage 2 OpenAI chain — gpt-4o-mini + structured outputs.      실패 시 예외를 올려 chat()** (1 connections) — `services\llm\app.py`
- *... and 3 more nodes in this community*

## Relationships

- No strong cross-community connections detected

## Source Files

- `services\llm\app.py`

## Audit Trail

- EXTRACTED: 96 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*