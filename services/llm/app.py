"""
Alle LLM service — Stage 1.5 (multi-turn + vibe 매핑, OpenAI 선택적 연동 준비).

인터페이스: POST /chat
  body  {"messages": [{"role": "user"|"assistant", "text": str}]}
  reply {
    "reply":   str,        자연어 응답
    "filters": {           BFF /events 쿼리 모양. 값 없으면 None/[] 로 표시
      "eventTypes":  [str] ex) ["festival", "exhibition"]
      "companions":  [str] ex) ["family"]
      "periodKey":   str | null ex) "weekend" (Web 에서 start/end 로 변환)
      "vibes":       [str] ex) ["활동적", "체험형"] — BFF 가 vibeId 로 resolve
      "regionHints": [str] ex) ["종로구"]              — BFF 가 regionId 로 resolve
    }
  }

현재 Stage 1.5:
- 다중 턴: 모든 user 발화에서 축 누적 (periodKey 는 최근 덮어쓰기).
- "말고/빼고/대신/아니" → 최근 발화로 reset.
- vibe (성향) 6종 키워드 매핑.
- OPENAI_API_KEY 가 있으면 Stage 2 openai chain 사용 예정 (추후).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# 모노레포 루트 .env 로드 — services/llm/ 기준 두 단계 위.
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env", override=False)

import filters as filter_rules
from summary_guard import sanitize_summary
from cost_tracker import tracker as cost_tracker

app = FastAPI(title="alle-llm", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=False,  # BFF only
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant|system)$")
    text: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class SummarizeRequest(BaseModel):
    title: str
    description: str | None = None
    categoryName: str | None = None
    vibes: list[str] = []
    regionName: str | None = None


class SummarizeResponse(BaseModel):
    summary: str


class SentimentRequest(BaseModel):
    text: str


class SentimentResponse(BaseModel):
    sentiment: str  # "positive" | "negative" | "neutral"


class EmbedRequest(BaseModel):
    texts: list[str]


class EmbedResponse(BaseModel):
    model: str
    dim: int
    vectors: list[list[float]]


class EventSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=20, ge=1, le=100)
    score_threshold: float | None = Field(default=0.3, ge=0.0, le=1.0)
    # 선택적 pre-filter. 예: {"regionId": "3", "categoryCode": ["festival", "exhibition"]}
    filter: dict | None = None


class EventSearchHit(BaseModel):
    eventId: str
    score: float
    payload: dict = Field(default_factory=dict)


class EventSearchResponse(BaseModel):
    query: str
    hits: list[EventSearchHit]


class EventUpsertItem(BaseModel):
    id: int
    vector: list[float]
    payload: dict = Field(default_factory=dict)


class EventUpsertRequest(BaseModel):
    items: list[EventUpsertItem]


class EventUpsertResponse(BaseModel):
    upserted: int
    collection: str


class EventDeleteRequest(BaseModel):
    ids: list[int]


class EventDeleteResponse(BaseModel):
    requested: int
    collection: str


# Personalized 추천 — seed event ids → mean vector → kNN.
class PersonalizedRequest(BaseModel):
    seed_event_ids: list[int] = Field(min_length=1, max_length=100)
    limit: int = Field(default=20, ge=1, le=100)
    score_threshold: float | None = Field(default=0.3, ge=0.0, le=1.0)
    # 결과에서 제외할 event_id (보통 seed 자체 + 이미 본 이벤트). seed 는 자동 제외됨.
    exclude_ids: list[int] = Field(default_factory=list, max_length=500)


class PersonalizedResponse(BaseModel):
    seed_count: int
    used_seed_count: int  # Qdrant 에 vector 가 있던 seed 수
    hits: list[EventSearchHit]


class ChatFilters(BaseModel):
    eventTypes: list[str] = []
    companions: list[str] = []
    periodKey: str | None = None
    vibes: list[str] = []
    regionHints: list[str] = []


class ChatResponse(BaseModel):
    reply: str
    filters: ChatFilters


def _stage_label() -> str:
    """현재 활성 체인 — 환경변수·예산 잔량에 따라 결정."""
    if not os.environ.get("OPENAI_API_KEY"):
        return "stage1-rules"
    if cost_tracker.is_over_budget():
        return "stage1-rules-budget-cap"
    return "stage2-openai"


def _openai_available() -> bool:
    """키 있고 일일 예산 한도 전이면 True."""
    return bool(os.environ.get("OPENAI_API_KEY")) and not cost_tracker.is_over_budget()


@app.get("/health")
def health() -> dict[str, Any]:
    from qdrant_events import collection_stats
    return {
        "ok": True,
        "service": "alle-llm",
        "stage": _stage_label(),
        "cost": cost_tracker.snapshot(),
        "qdrant": collection_stats(),
    }


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    """
    필터 추출 + 자연어 reply 생성. v2 부터 LLM 이 reply 도 직접 작성.

    분기:
      - LLM 활성: extract_via_openai 가 filters + reply 동시 반환. reply 비면 룰 fallback.
      - LLM 비활성/실패: 룰 기반 extract_merge + compose_reply.
    """
    user_texts = [m.text for m in req.messages if m.role == "user"]
    last_user = user_texts[-1] if user_texts else ""

    extracted: dict[str, Any] | None = None
    llm_reply: str = ""
    if _openai_available():
        try:
            extracted = _openai_extract(req.messages)
            llm_reply = (extracted.get("reply") or "").strip() if isinstance(extracted, dict) else ""
        except Exception:
            extracted = None
    if extracted is None:
        extracted = filter_rules.extract_merge(user_texts)

    # 룰 fallback compose_reply 는 LLM reply 가 없거나 빈 경우만.
    reply = llm_reply or filter_rules.compose_reply(last_user, extracted)

    return ChatResponse(
        reply=reply,
        filters=ChatFilters(
            companions=list(extracted.get("companions") or []),
            eventTypes=list(extracted.get("eventTypes") or []),
            periodKey=extracted.get("periodKey"),
            vibes=list(extracted.get("vibes") or []),
            regionHints=list(extracted.get("regionHints") or []),
        ),
    )


def _openai_extract(messages: list[ChatMessage]) -> dict[str, Any]:
    """
    Stage 2 OpenAI chain — gpt-4o-mini + structured outputs.

    실패 시 예외를 올려 chat() 가 규칙 기반으로 fallback.
    """
    # lazy import — OPENAI_API_KEY 없는 환경에서 openai 패키지 로드 비용 회피.
    from openai_chain import extract_via_openai

    payload = [{"role": m.role, "text": m.text} for m in messages]
    return extract_via_openai(payload)


@app.post("/summarize", response_model=SummarizeResponse)
def summarize(req: SummarizeRequest) -> SummarizeResponse:
    """
    이벤트 한 건 → 2~3 문장 한국어 요약.

    OPENAI_API_KEY 없으면 title + category 기반 간단 문장으로 fallback.
    description 이 있을수록 품질↑, 없어도 최소한의 요약은 반환.
    """
    if _openai_available():
        try:
            from openai_chain import summarize_event
            text = summarize_event(
                title=req.title,
                description=req.description,
                category_name=req.categoryName,
                vibes=req.vibes,
                region_name=req.regionName,
            )
            return SummarizeResponse(summary=text)
        except Exception:
            pass  # fallback below
    # Fallback: 키 없음 또는 실패. sanitize 로 마크다운/이모지/길이 통일.
    parts = [req.title]
    if req.categoryName:
        parts.append(f"{req.categoryName} 행사")
    if req.regionName:
        parts.append(f"{req.regionName} 에서 열립니다")
    if req.vibes:
        parts.append(f"분위기: {', '.join(req.vibes)}")
    fallback = ". ".join(parts) + "."
    return SummarizeResponse(summary=sanitize_summary(fallback))


_POSITIVE_WORDS = ["좋", "최고", "만족", "추천", "재밌", "신남", "굿", "행복", "훌륭"]
_NEGATIVE_WORDS = ["별로", "실망", "나쁨", "최악", "비추", "지루", "불편", "화났", "짜증"]


def _rule_sentiment(text: str) -> str:
    t = text.strip()
    pos = sum(1 for w in _POSITIVE_WORDS if w in t)
    neg = sum(1 for w in _NEGATIVE_WORDS if w in t)
    if pos > neg and pos > 0:
        return "positive"
    if neg > pos and neg > 0:
        return "negative"
    return "neutral"


@app.post("/sentiment", response_model=SentimentResponse)
def sentiment(req: SentimentRequest) -> SentimentResponse:
    """리뷰 본문 → positive/negative/neutral 분류. 단문 1회 호출."""
    if _openai_available():
        try:
            from openai_chain import classify_sentiment
            label = classify_sentiment(req.text)
            if label in {"positive", "negative", "neutral"}:
                return SentimentResponse(sentiment=label)
        except Exception:
            pass
    return SentimentResponse(sentiment=_rule_sentiment(req.text))


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    """
    텍스트 배치 임베딩 — text-embedding-3-small(1536d) 기본.

    OPENAI_API_KEY 없거나 예산 초과면 503 (호출자가 keyword-only fallback 책임).
    이벤트-기사 relevance 재랭킹 등 소비자. 배치 권장(1회 호출 / 여러 텍스트).
    """
    from fastapi import HTTPException

    if not _openai_available():
        raise HTTPException(status_code=503, detail="embedding unavailable (no key or over budget)")
    if not req.texts:
        return EmbedResponse(model="", dim=0, vectors=[])
    if len(req.texts) > 256:
        raise HTTPException(status_code=400, detail="max 256 texts per call")

    try:
        from openai_chain import EMBED_MODEL, embed_texts
        vectors = embed_texts(req.texts)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"embedding failed: {e.__class__.__name__}")

    dim = len(vectors[0]) if vectors else 0
    return EmbedResponse(model=EMBED_MODEL, dim=dim, vectors=vectors)


@app.post("/events/search", response_model=EventSearchResponse)
def events_search(req: EventSearchRequest) -> EventSearchResponse:
    """
    Qdrant 의미 검색 — 자연어 쿼리 → 1536d 임베딩 → kNN.

    /chat 체인에서 필터 추출 후 자연어 쿼리로 후속 호출하거나, 독립적으로
    'AI 추천 유사 이벤트' 에 사용. payload 에 최소 메타데이터(title, phase,
    regionId, categoryCode, vibeIds) 가 있어 BFF 가 event_id 만 resolve 하면 됨.

    OPENAI_API_KEY 없거나 Qdrant 비가용이면 503.
    """
    from fastapi import HTTPException

    if not _openai_available():
        raise HTTPException(status_code=503, detail="embedding unavailable (no key or over budget)")
    try:
        from openai_chain import embed_texts
        vectors = embed_texts([req.query])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"embed failed: {e.__class__.__name__}")
    if not vectors:
        return EventSearchResponse(query=req.query, hits=[])

    from qdrant_events import search_events
    hits = search_events(
        vector=vectors[0],
        limit=req.limit,
        score_threshold=req.score_threshold,
        filter_payload=req.filter,
    )
    return EventSearchResponse(
        query=req.query,
        hits=[EventSearchHit(**h) for h in hits],
    )


@app.post("/events/personalized", response_model=PersonalizedResponse)
def events_personalized(req: PersonalizedRequest) -> PersonalizedResponse:
    """
    Personalized 추천 — seed event ids → 각 vector retrieve → mean vector → kNN.

    BFF 의 /me/recommendations 가 사용자의 최근 북마크 + 리뷰 이벤트를 seed 로
    호출. seed 자체와 exclude_ids 는 결과에서 제외.

    seed 가 모두 Qdrant 에 없으면 hits=[] (BFF 가 SQL OR fallback).
    """
    from qdrant_events import retrieve_vectors, search_events

    vectors = retrieve_vectors(req.seed_event_ids)
    if not vectors:
        return PersonalizedResponse(
            seed_count=len(req.seed_event_ids), used_seed_count=0, hits=[]
        )

    dim = len(vectors[0])
    mean = [sum(v[i] for v in vectors) / len(vectors) for i in range(dim)]

    exclude_set = {str(i) for i in req.seed_event_ids} | {str(i) for i in req.exclude_ids}
    # 필터 후 limit 만족시키기 위해 여유분 fetch (제외 비율 고려해 넉넉히)
    over_fetch = max(req.limit + len(exclude_set), req.limit * 2)
    over_fetch = min(over_fetch, 100)

    raw_hits = search_events(
        vector=mean,
        limit=over_fetch,
        score_threshold=req.score_threshold,
    )
    filtered = [h for h in raw_hits if h["eventId"] not in exclude_set][: req.limit]

    return PersonalizedResponse(
        seed_count=len(req.seed_event_ids),
        used_seed_count=len(vectors),
        hits=[EventSearchHit(**h) for h in filtered],
    )


@app.post("/events/upsert", response_model=EventUpsertResponse)
def events_upsert(req: EventUpsertRequest) -> EventUpsertResponse:
    """
    BFF 이벤트 embed 배치가 호출 — Qdrant alle-events collection 에 upsert.
    vector dim=1536 고정 (text-embedding-3-small). payload 자유.
    """
    from fastapi import HTTPException
    from qdrant_events import upsert_events

    if len(req.items) > 256:
        raise HTTPException(status_code=400, detail="max 256 items per call")
    bad = next((i for i in req.items if len(i.vector) != 1536), None)
    if bad is not None:
        raise HTTPException(status_code=400, detail=f"vector dim must be 1536 (id={bad.id})")

    n = upsert_events([it.model_dump() for it in req.items])
    return EventUpsertResponse(upserted=n, collection="alle-events")


@app.post("/events/delete", response_model=EventDeleteResponse)
def events_delete(req: EventDeleteRequest) -> EventDeleteResponse:
    """
    Qdrant alle-events 에서 eventId 기준 포인트 삭제. 이벤트가 거절/수정요청/재제출/삭제로
    approved 상태를 벗어날 때 호출. 없는 id 는 조용히 no-op.
    """
    from fastapi import HTTPException
    from qdrant_events import delete_events

    if len(req.ids) > 256:
        raise HTTPException(status_code=400, detail="max 256 ids per call")
    delete_events(list(req.ids))
    return EventDeleteResponse(requested=len(req.ids), collection="alle-events")
