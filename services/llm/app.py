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
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import json as _json

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
    # v3.4 — prompt injection payload 크기 차단. 2000자 이상은 BFF 에서 400.
    text: str = Field(max_length=2000)


class UserSignals(BaseModel):
    """로그인 사용자의 taste profile 요약 — LLM 이 추천 톤 보정용 컨텍스트로 사용.

    값은 사람이 읽는 라벨 (예: '가족', '강남구', '체험형'). 없으면 None.
    LLM 은 이를 강제 필터로 쓰지 말고 'priorityHint' 로만 활용 — 사용자 발화가 명시적이면 그게 우선.

    v3.4: 각 라벨 80자 cap — taste profile 테이블이 event title/description 에서 유래하므로
    공격자 통제 가능하다고 가정.
    """
    preferred_companion: str | None = Field(default=None, max_length=80)
    preferred_category: str | None = Field(default=None, max_length=80)
    preferred_region: str | None = Field(default=None, max_length=80)
    preferred_vibe: str | None = Field(default=None, max_length=80)
    recent_bookmarks: int = 0


class LastSuggestion(BaseModel):
    """v3.5 — grounded followup. 직전 turn 에 보여준 이벤트 요약.

    eventId 는 BFF 가 referencesLast=true 시 rerank pool 로 사용. LLM system prompt
    에는 title/category/region/dates 만 노출 (id 노출 시 reply 에 섞일 위험).
    """
    eventId: str = Field(max_length=40)
    title: str = Field(default="", max_length=200)
    category: str = Field(default="", max_length=30)
    region: str = Field(default="", max_length=40)
    startDate: str = Field(default="", max_length=10)
    endDate: str = Field(default="", max_length=10)


class ChatRequest(BaseModel):
    # v3.4 — history 총 길이·개수 cap. BFF 가 주는 history 는 UI 세션 하나 분량이라 20 로 충분.
    messages: list[ChatMessage] = Field(max_length=30)
    user_signals: UserSignals | None = None
    # v3.5 — grounded followup. 직전 assistant turn 에 보여준 suggestions.
    last_suggestions: list[LastSuggestion] = Field(default_factory=list, max_length=10)


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
    # v3 — 명시적 단일 날짜 (있으면 BFF 가 periodKey 보다 우선 적용).
    specificDate: str | None = None
    # v3 — 다음 user 발화 후보 칩 2~3개. 12자 이하.
    followups: list[str] = []
    # v3.5 — grounded followup. true 면 BFF 가 기존 suggestion pool 에서 rerank 만 재실행.
    referencesLast: bool = False


class RetreatRequest(BaseModel):
    user_text: str
    filters: ChatFilters
    sql_count: int = Field(ge=0)
    semantic_count: int = Field(ge=0)


class RetreatResponse(BaseModel):
    reply: str
    followups: list[str] = []


class RerankCandidate(BaseModel):
    eventId: str
    title: str
    phase: str = ""
    startDate: str = ""
    endDate: str = ""
    region: str = ""
    category: str = ""
    vibes: list[str] = []
    score: float = 0.0
    # v3.2 — Article RAG. BFF 가 event_article_mappings 에서 top 1 기사 summary
    # (또는 contentBody 앞부분) 을 200자 내로 잘라 넘김. 없으면 빈 문자열.
    articleSnippet: str = ""


class RerankRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    candidates: list[RerankCandidate] = Field(min_length=1, max_length=50)
    top_k: int = Field(default=5, ge=1, le=20)


class RerankItem(BaseModel):
    eventId: str
    reason: str


class RerankResponse(BaseModel):
    ranked: list[RerankItem]


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
            extracted = _openai_extract(
                req.messages,
                user_signals=req.user_signals,
                last_suggestions=req.last_suggestions,
            )
            llm_reply = (extracted.get("reply") or "").strip() if isinstance(extracted, dict) else ""
        except Exception:
            extracted = None
    if extracted is None:
        extracted = filter_rules.extract_merge(user_texts)

    # 룰 fallback compose_reply 는 LLM reply 가 없거나 빈 경우만.
    reply = llm_reply or filter_rules.compose_reply(last_user, extracted)

    followups = list(extracted.get("followups") or []) if isinstance(extracted, dict) else []
    specific_date = extracted.get("specificDate") if isinstance(extracted, dict) else None
    refs_last = bool(extracted.get("referencesLast") or False) if isinstance(extracted, dict) else False

    return ChatResponse(
        reply=reply,
        filters=ChatFilters(
            companions=list(extracted.get("companions") or []),
            eventTypes=list(extracted.get("eventTypes") or []),
            periodKey=extracted.get("periodKey"),
            vibes=list(extracted.get("vibes") or []),
            regionHints=list(extracted.get("regionHints") or []),
        ),
        specificDate=specific_date,
        followups=followups,
        referencesLast=refs_last,
    )


def _openai_extract(
    messages: list[ChatMessage],
    *,
    user_signals: UserSignals | None = None,
    last_suggestions: list[LastSuggestion] | None = None,
) -> dict[str, Any]:
    """
    Stage 2 OpenAI chain — gpt-4o-mini + structured outputs.

    user_signals 가 있으면 LLM 시스템 컨텍스트에 priorityHint.
    last_suggestions 가 있으면 [직전 제안] 블록 + referencesLast 탐지.

    실패 시 예외를 올려 chat() 가 규칙 기반으로 fallback.
    """
    from openai_chain import extract_via_openai

    payload = [{"role": m.role, "text": m.text} for m in messages]
    sig = user_signals.model_dump() if user_signals else None
    last = [s.model_dump() for s in (last_suggestions or [])] or None
    return extract_via_openai(payload, user_signals=sig, last_suggestions=last)


@app.post("/chat/stream")
def chat_stream(req: ChatRequest) -> StreamingResponse:
    """
    /chat 의 SSE 스트림 버전. reply 텍스트가 생성되는 즉시 'reply_delta' 로 흘려보내고,
    구조적 필드(filters / specificDate / followups) 는 스트림 종료 시 'meta' 로 한 번에.

    BFF 가 /chat/stream 을 proxy — meta 수신 후 semantic/rerank/retreat 실행.

    이벤트 타입:
      reply_delta  {text: str}            # reply 누적 증분
      meta         {filters, specificDate, followups}
      done         {}
      error        {message}              # 스트림 중 예외 발생
    """
    user_texts = [m.text for m in req.messages if m.role == "user"]
    last_user = user_texts[-1] if user_texts else ""

    def gen():
        sent_reply = ""
        final_extracted: dict[str, Any] | None = None

        if _openai_available():
            try:
                from openai_chain import extract_via_openai_stream

                payload = [{"role": m.role, "text": m.text} for m in req.messages]
                sig = req.user_signals.model_dump() if req.user_signals else None
                last = [s.model_dump() for s in req.last_suggestions] or None
                for kind, value in extract_via_openai_stream(
                    payload, user_signals=sig, last_suggestions=last
                ):
                    if kind == "delta":
                        sent_reply += value
                        yield _sse_event("reply_delta", {"text": value})
                    elif kind == "final":
                        final_extracted = value
            except Exception as e:  # noqa: BLE001
                yield _sse_event("error", {"message": f"{e.__class__.__name__}"})
                final_extracted = None

        if final_extracted is None:
            # Fallback — rule-based. reply 를 한 번에 보낸다 (tokens 없이).
            extracted = filter_rules.extract_merge(user_texts)
            fallback_reply = filter_rules.compose_reply(last_user, extracted)
            remainder = fallback_reply[len(sent_reply):] if fallback_reply.startswith(sent_reply) else fallback_reply
            if remainder:
                yield _sse_event("reply_delta", {"text": remainder})
            sent_reply = fallback_reply
            final_extracted = {
                **extracted,
                "reply": fallback_reply,
                "followups": [],
                "specificDate": None,
                "referencesLast": False,
            }
        else:
            # LLM 이 보낸 최종 reply 가 이미 흘려보낸 sent_reply 와 다르면 누락분 보완.
            final_reply = (final_extracted.get("reply") or "").strip()
            if final_reply and final_reply.startswith(sent_reply) and len(final_reply) > len(sent_reply):
                yield _sse_event("reply_delta", {"text": final_reply[len(sent_reply):]})
                sent_reply = final_reply

        meta = {
            "filters": {
                "companions": list(final_extracted.get("companions") or []),
                "eventTypes": list(final_extracted.get("eventTypes") or []),
                "periodKey": final_extracted.get("periodKey"),
                "vibes": list(final_extracted.get("vibes") or []),
                "regionHints": list(final_extracted.get("regionHints") or []),
            },
            "specificDate": final_extracted.get("specificDate"),
            "followups": list(final_extracted.get("followups") or [])[:3],
            "referencesLast": bool(final_extracted.get("referencesLast") or False),
            "reply": sent_reply,
        }
        yield _sse_event("meta", meta)
        yield _sse_event("done", {})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # nginx 버퍼링 방지 — SSE 즉시 flush
            "Connection": "keep-alive",
        },
    )


def _sse_event(event: str, data: dict[str, Any]) -> str:
    """SSE 프레임 직렬화. ensure_ascii=False 로 한글 raw — 네트워크 바이트 절약 + 디버그 용이."""
    return f"event: {event}\ndata: {_json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/chat/compose-retreat", response_model=RetreatResponse)
def chat_compose_retreat(req: RetreatRequest) -> RetreatResponse:
    """
    BFF 가 사용자 검색 결과 0건 (또는 매우 적음) 감지 시 호출. LLM 이 결과 사실
    인지 + 자연스러운 retreat reply + 대체 followups 생성.

    LLM 비활성/실패면 정적 fallback (정직한 0건 안내).
    """
    if _openai_available():
        try:
            from openai_chain import compose_retreat
            out = compose_retreat(
                user_text=req.user_text,
                extracted_filters=req.filters.model_dump(),
                sql_count=req.sql_count,
                semantic_count=req.semantic_count,
            )
            if out.get("reply"):
                return RetreatResponse(reply=out["reply"], followups=out.get("followups") or [])
        except Exception:
            pass
    # Fallback: 룰 기반 retreat. periodKey 가 좁은 케이스부터 완화 제안.
    period = req.filters.periodKey
    soft = {
        "today": ("내일은 어떠세요?", "이번 주말로", "이번 달 전체"),
        "tomorrow": ("주말로", "이번 주 전체", "다음 주말"),
        "weekend": ("이번 주 전체", "이번 달", "동행 빼기"),
        "week": ("이번 달", "동행 빼기", "다른 카테고리"),
        "month": ("동행 빼기", "지역 넓히기", "다른 카테고리"),
    }.get(period or "", ("동행 빼기", "지역 넓히기", "기간 넓히기"))
    return RetreatResponse(
        reply="입력하신 조건으로 진행 중인 이벤트가 없네요. 조건을 조금 완화해 보세요.",
        followups=list(soft),
    )


# v4 (2026-04-25) — A/B bench harness 전용. (query, suggestion[]) → 0~3 graded score.
class JudgeCandidate(BaseModel):
    eventId: str
    title: str
    category: str = ""
    region: str = ""
    startDate: str = ""
    endDate: str = ""
    matchReason: str = ""


class JudgeRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    candidates: list[JudgeCandidate] = Field(min_length=1, max_length=20)


class JudgeItem(BaseModel):
    eventId: str
    score: int = Field(ge=0, le=3)
    reason: str


class JudgeResponse(BaseModel):
    scores: list[JudgeItem]


@app.post("/judge/relevance", response_model=JudgeResponse)
def judge_relevance_endpoint(req: JudgeRequest) -> JudgeResponse:
    """
    LLM-as-judge — chat-rank-bench 가 호출. 각 후보에 0~3 graded relevance score.
    LLM 비활성이면 503.
    """
    from fastapi import HTTPException

    if not _openai_available():
        raise HTTPException(status_code=503, detail="judge unavailable (no key or over budget)")
    try:
        from openai_chain import judge_relevance
        scored = judge_relevance(
            query=req.query,
            candidates=[c.model_dump() for c in req.candidates],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"judge failed: {e.__class__.__name__}")
    return JudgeResponse(scores=[JudgeItem(**s) for s in scored])


@app.post("/events/rerank", response_model=RerankResponse)
def events_rerank(req: RerankRequest) -> RerankResponse:
    """
    cosine 기반 후보 N 개를 LLM 이 의미·맥락 적합도로 재정렬 + 추천 사유 1줄 생성.
    BFF chat 의 over-fetch 30 → top 5 cap 단계에 삽입 가능.

    LLM 비활성이면 503 — 호출자가 원래 score 순서 유지 책임.
    """
    from fastapi import HTTPException

    if not _openai_available():
        raise HTTPException(status_code=503, detail="rerank unavailable (no key or over budget)")
    try:
        from openai_chain import rerank_candidates
        ranked = rerank_candidates(
            query=req.query,
            candidates=[c.model_dump() for c in req.candidates],
            top_k=req.top_k,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"rerank failed: {e.__class__.__name__}")
    return RerankResponse(ranked=[RerankItem(**r) for r in ranked])


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


class TranslateRequest(BaseModel):
    title: str = Field(max_length=200)
    body: str = Field(max_length=5000)
    lang: str = Field(pattern="^(en|vi|zh|ja|fr)$")


class TranslateResponse(BaseModel):
    translatedTitle: str
    translatedBody: str


@app.post("/translate", response_model=TranslateResponse)
def translate_post(req: TranslateRequest) -> TranslateResponse:
    """
    게시글 제목+본문을 지정 언어로 번역.
    LLM 비활성 → 503 (BFF 가 캐시 없을 때만 호출하므로 503 은 BFF 가 그대로 중계).
    """
    from fastapi import HTTPException

    if not _openai_available():
        raise HTTPException(status_code=503, detail="translate unavailable (no key or over budget)")

    lang_names = {"en": "English", "vi": "Vietnamese", "zh": "Chinese (Simplified)", "ja": "Japanese", "fr": "French"}
    target = lang_names.get(req.lang, req.lang)

    try:
        from openai_chain import translate_text
        translated_title = translate_text(req.title, target)
        translated_body = translate_text(req.body, target)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"translate failed: {e.__class__.__name__}")

    return TranslateResponse(translatedTitle=translated_title, translatedBody=translated_body)


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


# ── Slice 7: 번역 엔드포인트 ────────────────────────────────────────────────
from pydantic import BaseModel as _BaseModel, Field as PydField


class TranslateBundleRequest(_BaseModel):
    namespace: str = PydField(max_length=50)
    lang: str = PydField(pattern="^(en|vi|zh|ja|fr)$")
    keys: dict


class TranslateBundleResponse(_BaseModel):
    namespace: str
    lang: str
    translated: dict


class TranslatePostRequest(_BaseModel):
    content: str = PydField(min_length=1, max_length=10000)
    target_lang: str = PydField(pattern="^(en|vi|zh|ja|fr)$")


class TranslatePostResponse(_BaseModel):
    translated: str


@app.post("/translate-bundle", response_model=TranslateBundleResponse)
def translate_bundle_endpoint(req: TranslateBundleRequest):
    from fastapi import HTTPException
    if not _openai_available():
        raise HTTPException(status_code=503, detail="translation unavailable")
    try:
        from translate import translate_bundle
        result = translate_bundle(req.namespace, req.lang, req.keys)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"translation failed: {type(e).__name__}: {e}")
    return TranslateBundleResponse(namespace=req.namespace, lang=req.lang, translated=result)


@app.post("/translate-post", response_model=TranslatePostResponse)
def translate_post_endpoint(req: TranslatePostRequest):
    from fastapi import HTTPException
    if not _openai_available():
        raise HTTPException(status_code=503, detail="translation unavailable")
    try:
        from translate import translate_post_content
        result = translate_post_content(req.content, req.target_lang)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"translation failed: {type(e).__name__}: {e}")
    return TranslatePostResponse(translated=result)
