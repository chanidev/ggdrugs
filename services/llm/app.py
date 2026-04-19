"""
Alle LLM service — Stage 1 rule-based stub.

인터페이스: POST /chat
  body  {"messages": [{"role": "user"|"assistant", "text": str}]}
  reply {
    "reply":   str,        자연어 응답
    "filters": {           BFF /events 쿼리 모양. 값 없으면 None/[] 로 표시
      "eventTypes":  [str] ex) ["festival", "exhibition"]
      "companions":  [str] ex) ["family"]
      "periodKey":   str | null ex) "weekend" (Web 에서 start/end 로 변환)
      "regionHints": [str] ex) ["종로구"]  — BFF 가 regionId 로 resolve
    }
  }

Stage 2 에서 OpenAI gpt-4o + LangChain 으로 교체. 인터페이스는 유지.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import filters as filter_rules

app = FastAPI(title="alle-llm", version="0.1.0")

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
    regionHints: list[str] = []


class ChatResponse(BaseModel):
    reply: str
    filters: ChatFilters


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "alle-llm", "stage": 1}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    # 가장 최근 user 메시지 기준으로 필터를 뽑는다.
    last_user = next(
        (m.text for m in reversed(req.messages) if m.role == "user"),
        "",
    )
    extracted = filter_rules.extract(last_user)
    reply = filter_rules.compose_reply(last_user, extracted)
    return ChatResponse(
        reply=reply,
        filters=ChatFilters(**extracted),
    )
