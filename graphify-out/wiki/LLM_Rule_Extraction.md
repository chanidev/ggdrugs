# LLM Rule Extraction

> 10 nodes · cohesion 0.27

## Key Concepts

- **filters.py** (6 connections) — `services\llm\filters.py`
- **extract()** (5 connections) — `services\llm\filters.py`
- **extract_merge()** (3 connections) — `services\llm\filters.py`
- **_match_any()** (3 connections) — `services\llm\filters.py`
- **_match_first()** (2 connections) — `services\llm\filters.py`
- **compose_reply()** (1 connections) — `services\llm\filters.py`
- **Korean keyword → filter mapping (Stage 1 rule-based).  의도적으로 단순하게 유지. Stage 2 에서** (1 connections) — `services\llm\filters.py`
- **다중 턴 — 모든 user 발화에서 추출한 필터를 머지. 최근 발화가 우선.      - 다중 값 축(companions/eventTypes/v** (1 connections) — `services\llm\filters.py`
- **table 의 각 그룹(동의어)에서 하나라도 걸리면 해당 code 를 수집.** (1 connections) — `services\llm\filters.py`
- **사용자 발화에서 5개 필터 축을 뽑는다. 없으면 빈 값.** (1 connections) — `services\llm\filters.py`

## Relationships

- No strong cross-community connections detected

## Source Files

- `services\llm\filters.py`

## Audit Trail

- EXTRACTED: 24 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*