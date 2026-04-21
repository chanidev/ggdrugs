# LLM Stage 2 OpenAI Chain

> 9 nodes · cohesion 0.31

## Key Concepts

- **openai_chain.py** (6 connections) — `services\llm\openai_chain.py`
- **_track_usage()** (4 connections) — `services\llm\openai_chain.py`
- **extract_via_openai()** (3 connections) — `services\llm\openai_chain.py`
- **classify_sentiment()** (2 connections) — `services\llm\openai_chain.py`
- **embed_texts()** (2 connections) — `services\llm\openai_chain.py`
- **summarize_event()** (2 connections) — `services\llm\openai_chain.py`
- **Stage 2 — OpenAI gpt-4o-mini 기반 필터 추출 체인.  규칙 - 인터페이스는 Stage 1 의 extract_merge 와** (1 connections) — `services\llm\openai_chain.py`
- **messages: [{"role": "user"|"assistant"|"system", "text": str}, ...]     반환: Stag** (1 connections) — `services\llm\openai_chain.py`
- **임베딩 배치 호출 — text-embedding-3-small (1536 dim) 기본.      빈 문자열은 호출 전에 단일 공백 으로 치환** (1 connections) — `services\llm\openai_chain.py`

## Relationships

- No strong cross-community connections detected

## Source Files

- `services\llm\openai_chain.py`

## Audit Trail

- EXTRACTED: 22 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*