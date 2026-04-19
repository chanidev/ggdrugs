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
    """현재 활성 체인 — 환경변수에 따라 결정."""
    return "stage2-openai" if os.environ.get("OPENAI_API_KEY") else "stage1-rules"


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "alle-llm", "stage": _stage_label()}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    user_texts = [m.text for m in req.messages if m.role == "user"]
    last_user = user_texts[-1] if user_texts else ""

    # Stage 2 OpenAI 연동은 선택적 — 키 없으면 규칙 기반으로 fallback.
    if os.environ.get("OPENAI_API_KEY"):
        try:
            extracted = _openai_extract(req.messages)
        except Exception:
            # LLM 호출 실패 시 조용히 fallback.
            extracted = filter_rules.extract_merge(user_texts)
    else:
        extracted = filter_rules.extract_merge(user_texts)

    reply = filter_rules.compose_reply(last_user, extracted)
    return ChatResponse(
        reply=reply,
        filters=ChatFilters(**extracted),
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
