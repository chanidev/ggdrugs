# AI Summary Guard

> 9 nodes · cohesion 0.33

## Key Concepts

- **summary_guard.py** (6 connections) — `services\llm\summary_guard.py`
- **sanitize_summary()** (6 connections) — `services\llm\summary_guard.py`
- **truncate_at_sentence()** (3 connections) — `services\llm\summary_guard.py`
- **normalize_whitespace()** (2 connections) — `services\llm\summary_guard.py`
- **strip_emoji()** (2 connections) — `services\llm\summary_guard.py`
- **strip_markdown()** (2 connections) — `services\llm\summary_guard.py`
- **AI 요약 post-processing 가드.  모델/fallback 양쪽에서 공통으로 적용되는 server-side 정제기. 프롬프트에는 "이** (1 connections) — `services\llm\summary_guard.py`
- **max_len 초과 시 가까운 문장 경계에서 자르기. 못 찾으면 하드 자르고 '…'.** (1 connections) — `services\llm\summary_guard.py`
- **모델/fallback 양쪽 요약에 적용하는 최종 정제.** (1 connections) — `services\llm\summary_guard.py`

## Relationships

- No strong cross-community connections detected

## Source Files

- `services\llm\summary_guard.py`

## Audit Trail

- EXTRACTED: 24 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*