# LLM Cost Tracker

> 11 nodes · cohesion 0.29

## Key Concepts

- **CostTracker** (6 connections) — `services\llm\cost_tracker.py`
- **._rollover_if_needed_locked()** (4 connections) — `services\llm\cost_tracker.py`
- **_daily_budget_usd()** (4 connections) — `services\llm\cost_tracker.py`
- **cost_tracker.py** (4 connections) — `services\llm\cost_tracker.py`
- **.is_over_budget()** (3 connections) — `services\llm\cost_tracker.py`
- **.snapshot()** (3 connections) — `services\llm\cost_tracker.py`
- **.track()** (3 connections) — `services\llm\cost_tracker.py`
- **_price_for()** (2 connections) — `services\llm\cost_tracker.py`
- **.__init__()** (1 connections) — `services\llm\cost_tracker.py`
- **OpenAI API 호출 비용 관측 + 일일 예산 가드.  - track(endpoint, prompt_tokens, completion_tok** (1 connections) — `services\llm\cost_tracker.py`
- **TOKEN_BUDGET_DAILY_USD 환경변수. 없으면 None (가드 off).** (1 connections) — `services\llm\cost_tracker.py`

## Relationships

- No strong cross-community connections detected

## Source Files

- `services\llm\cost_tracker.py`

## Audit Trail

- EXTRACTED: 32 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*