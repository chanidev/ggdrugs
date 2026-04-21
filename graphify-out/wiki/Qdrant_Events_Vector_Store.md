# Qdrant Events Vector Store

> 12 nodes · cohesion 0.27

## Key Concepts

- **ensure_collection()** (6 connections) — `services\llm\qdrant_events.py`
- **_get_client()** (6 connections) — `services\llm\qdrant_events.py`
- **qdrant_events.py** (6 connections) — `services\llm\qdrant_events.py`
- **collection_stats()** (4 connections) — `services\llm\qdrant_events.py`
- **search_events()** (4 connections) — `services\llm\qdrant_events.py`
- **upsert_events()** (4 connections) — `services\llm\qdrant_events.py`
- **Qdrant 클라이언트 래퍼 — alle-events collection.  Collection 스펙:   name:   alle-events** (1 connections) — `services\llm\qdrant_events.py`
- **Batch upsert.     items: [{id: int|str, vector: list[float], payload: dict}]** (1 connections) — `services\llm\qdrant_events.py`
- **관측용 — points 수, dim, status. 실패 시 {available: False}.** (1 connections) — `services\llm\qdrant_events.py`
- **Lazy singleton — qdrant_client 패키지가 없거나 서버 접속 불가면 None.** (1 connections) — `services\llm\qdrant_events.py`
- **Collection 없으면 생성. 이미 있으면 no-op. 반환: True=ready, False=unavailable.** (1 connections) — `services\llm\qdrant_events.py`
- **kNN 검색. 반환 shape: [{eventId: str, score: float, payload: {...}}].** (1 connections) — `services\llm\qdrant_events.py`

## Relationships

- No strong cross-community connections detected

## Source Files

- `services\llm\qdrant_events.py`

## Audit Trail

- EXTRACTED: 36 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*