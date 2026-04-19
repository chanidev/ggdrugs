# services/llm

LLM 마이크로서비스. Python FastAPI + LangChain.

## 책임 (CLAUDE.md §4)

- 채팅 검색(A_201) — 필터 5종 기반 대화형 이벤트 추천.
- 리뷰 감성분석 (`reviews.sentiment` 컬럼 값 생성).
- 사진 이미지 태깅 (`photos.ai_tags` JSONB).
- 뉴스 기사-이벤트 매칭 (`event_article_mappings.relevance_score`).
- Qdrant 벡터 검색 연동.

## LLM 공급자 (ADR 0002 D-2)

- **OpenAI 단일**. SDK: `openai` (공식 Python).
- 모델: `gpt-4o` (채팅), `gpt-4o-mini` (경량 분류·태깅·감성), `text-embedding-3-small` (임베딩).
- 공급자 추상화 레이어를 두어 향후 Anthropic 혼합 대비.

## 인터페이스

- BFF가 유일한 클라이언트. 프론트는 LLM 서비스를 직접 호출하지 않는다.
- REST 또는 gRPC 엔드포인트 (Phase 2에서 확정).

## 제약 (CLAUDE.md §6-4)

- 관리자 판단을 위임하지 않는다. 이벤트 승인·라벨 부여·업로더 승급 심사는 사람(관리자)의 결정.
- LLM은 추천·검색·요약·분류에만 사용.

## 상태

**Stage 1 (라이브, 2026-04)** — 규칙 기반 한국어 키워드 매핑 스텁.
외부 LLM 미사용. `filters.py` 의 단순 사전으로 자연어 → 5종 필터 매핑.

- `POST /chat` — `{messages:[{role,text}]}` → `{reply, filters}` 반환
- `GET /health`

**Stage 2 (예정)** — `openai` SDK + LangChain chain 으로 chat 핸들러 교체.
Stage 1 의 `filters.py` 는 eval/fallback dataset 으로 보존.

## 실행

```bash
pip install -r requirements.txt
python -m uvicorn app:app --port 8000 --reload
```

BFF (`apps/bff`) 가 `LLM_SERVICE_URL` (기본 `http://localhost:8000`) 로 프록시.
브라우저는 `/api/chat` → BFF → LLM 순으로 호출.

## 필터 매핑 예

| 사용자 발화 | 추출 필터 |
|---|---|
| "이번 주말 연인이랑 강남에서 볼만한 공연" | eventTypes=[performance], companions=[couple], periodKey=weekend, regionHints=[강남구] |
| "가족이랑 주말 전시" | eventTypes=[exhibition], companions=[family], periodKey=weekend |
| "오늘 종로 축제" | eventTypes=[festival], periodKey=today, regionHints=[종로구] |
