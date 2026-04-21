"""
Stage 2 — OpenAI gpt-4o-mini 기반 필터 추출 체인.

규칙
- 인터페이스는 Stage 1 의 extract_merge 와 동일 shape. app.py 가 키 유무로 분기.
- Structured outputs (json_schema) 로 스키마 위반 차단.
- 어떤 실패든 예외를 올려서 app.py 가 규칙 기반 fallback 하게.
- 호출 비용: gpt-4o-mini + 300 tokens 출력 ≈ $0.0003/req. 대화 당 1회.
"""

from __future__ import annotations

import json
import os
from typing import Any

# openai SDK 는 requirements 에 포함. 환경변수 없으면 app.py 에서 호출하지 않음.
from openai import OpenAI

from filters import (  # noqa: F401 — ALLOW 값 참조
    COMPANION_TABLE,
    EVENT_TYPE_TABLE,
    PERIOD_TABLE,
    VIBE_TABLE,
    SEOUL_GU,
)
from summary_guard import sanitize_summary
from cost_tracker import tracker as _cost_tracker

MODEL = os.environ.get("OPENAI_MODEL_FAST", "gpt-4o-mini")
EMBED_MODEL = os.environ.get("OPENAI_MODEL_EMBEDDING", "text-embedding-3-small")

_ALLOWED_COMPANIONS = sorted({v for _, v in COMPANION_TABLE})
_ALLOWED_EVENT_TYPES = sorted({v for _, v in EVENT_TYPE_TABLE})
_ALLOWED_PERIOD = [None, "today", "weekend", "week", "month"]
_ALLOWED_VIBES = sorted({v for _, v in VIBE_TABLE})
_ALLOWED_REGIONS = SEOUL_GU

SYSTEM_PROMPT = f"""당신은 한국어로 서울 이벤트(축제·전시·공연 등) 검색을 돕는 필터 추출기입니다.

사용자의 대화(여러 턴)를 읽고, 아래 JSON 스키마의 값을 뽑아 반환하세요.

규칙:
- 값은 반드시 허용된 목록에서만 선택하세요. 없는 값은 만들지 마세요.
- 다중 턴: 이전 턴과 이번 턴의 의도를 **합쳐** 반환 (union).
- 단, 최근 턴에 "말고", "빼고", "아니", "대신", "바꿔" 가 있으면 **이전 턴은 무시**하고 최근 턴만 반영하세요 (사용자가 의도를 바꿨다는 신호).
- 최근 턴이 "가족 말고 연인" 같이 부정+긍정을 섞으면, 부정된 값(가족)은 **제외**, 긍정된 값(연인)은 **포함**.
- periodKey 는 단일 값(또는 null). 가장 최근 턴의 의도가 우선.
- 지역은 서울 25개 구 중 해당하는 것만. "강남" 같이 접미어 없어도 "강남구"로 매칭.
- 성향(vibes)은 의미상 일치하는 것만. "힐링" → "정적", "체험" → "체험형" 등.

허용 값:
- companions: {_ALLOWED_COMPANIONS}
- eventTypes: {_ALLOWED_EVENT_TYPES}
- periodKey:  {_ALLOWED_PERIOD}
- vibes:      {_ALLOWED_VIBES}
- regionHints: 서울 25개 구 이름 ({", ".join(_ALLOWED_REGIONS[:5])}, ... 등)
"""

_SCHEMA = {
    "name": "filter_extract",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "companions": {
                "type": "array",
                "items": {"type": "string", "enum": _ALLOWED_COMPANIONS},
            },
            "eventTypes": {
                "type": "array",
                "items": {"type": "string", "enum": _ALLOWED_EVENT_TYPES},
            },
            "periodKey": {
                "type": ["string", "null"],
                "enum": _ALLOWED_PERIOD,
            },
            "vibes": {
                "type": "array",
                "items": {"type": "string", "enum": _ALLOWED_VIBES},
            },
            "regionHints": {
                "type": "array",
                "items": {"type": "string", "enum": _ALLOWED_REGIONS},
            },
        },
        "required": ["companions", "eventTypes", "periodKey", "vibes", "regionHints"],
    },
}


SUMMARY_SYSTEM = """당신은 서울 이벤트 안내 어시스턴트입니다.

주어진 정보만 사용해 **사실 기반의 2~3문장 한국어 요약**을 작성하세요.
여행 잡지·홍보 문구가 아니라 **신문 기사 도입부** 같은 담백한 톤이 목표입니다.

구조:
- 첫 문장: 무엇(카테고리 + 핵심 주제). 제공된 제목/분류를 그대로 활용.
- 둘째 문장: 원문 설명에 나온 대상·프로그램·특징을 요약. 없으면 장소/분류만.
- 셋째 문장 (선택): 원문에 명시된 장소/기간/대상 같은 실용 정보.

엄격한 금지 — 어기면 요약 실패로 간주:
- **제공되지 않은 정보 추가 금지**: 분위기·감상·추천 대상·체험 내용을 입력에
  없으면 만들지 마세요. 특히 "누구에게 추천", "~~을 경험할 수 있습니다",
  "~~한 분위기" 는 원문에 없으면 쓰지 않습니다.
- **홍보·과장 표현 금지**: "특별한 경험", "잊지 못할", "감동적인", "완벽한",
  "즐거운 추억", "놓칠 수 없는", "환상적인", "마음을 사로잡는" 같은 수식어 금지.
- **추측 금지**: 별점·가격·예매·인기도 등은 원문에 명시된 경우에만 사실 그대로 인용.
- **서술 형식 제약**: 이모지·해시태그·마크다운·리스트(-, *, 숫자.)·헤딩(#) 금지.
  평문 문장만 사용하세요.
- **존댓말**: "~습니다/입니다" 체.
- **길이 제한**: 전체 250자 이내.

원문 설명이 비어 있으면, 제목과 분류만 가지고 "[지역]에서 [분류] [제목]이
열립니다." 정도의 짧은 사실만 쓰고 억지로 2~3문장을 채우지 마세요.
"""


SENTIMENT_SYSTEM = """당신은 이벤트 리뷰의 감성을 분류하는 분류기입니다.
주어진 한국어 리뷰를 positive / negative / neutral 중 하나로 분류하세요.
반드시 JSON 으로 {"sentiment": "positive|negative|neutral"} 만 반환하세요."""

_SENTIMENT_SCHEMA = {
    "name": "sentiment_classify",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "sentiment": {"type": "string", "enum": ["positive", "negative", "neutral"]},
        },
        "required": ["sentiment"],
    },
}


def classify_sentiment(text: str) -> str:
    client = OpenAI()
    resp = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SENTIMENT_SYSTEM},
            {"role": "user", "content": text[:2000]},
        ],
        response_format={"type": "json_schema", "json_schema": _SENTIMENT_SCHEMA},
        temperature=0,
        max_tokens=30,
    )
    _track_usage("sentiment", resp)
    content = resp.choices[0].message.content or "{}"
    return json.loads(content).get("sentiment", "neutral")


def _track_usage(endpoint: str, resp: Any) -> None:
    usage = getattr(resp, "usage", None)
    if not usage:
        return
    _cost_tracker.track(
        endpoint=endpoint,
        prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
        completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
        model=MODEL,
    )


def summarize_event(
    *,
    title: str,
    description: str | None,
    category_name: str | None,
    vibes: list[str],
    region_name: str | None,
) -> str:
    client = OpenAI()
    user_lines = [f"제목: {title}"]
    if category_name:
        user_lines.append(f"분류: {category_name}")
    if region_name:
        user_lines.append(f"지역: {region_name}")
    if vibes:
        user_lines.append(f"성향: {', '.join(vibes)}")
    if description:
        user_lines.append(f"원본 설명: {description[:2000]}")
    user_msg = "\n".join(user_lines)

    resp = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SUMMARY_SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.3,
        max_tokens=220,
    )
    _track_usage("summarize", resp)
    raw = (resp.choices[0].message.content or "").strip()
    return sanitize_summary(raw)


def extract_via_openai(messages: list[dict[str, str]]) -> dict[str, Any]:
    """
    messages: [{"role": "user"|"assistant"|"system", "text": str}, ...]
    반환: Stage 1 extract_merge 와 동일 shape.
    실패 시 OpenAIError 계열 예외를 상위로 올려서 app.py 가 fallback 처리.
    """
    client = OpenAI()  # OPENAI_API_KEY 환경변수 자동 로드

    # OpenAI chat.completions 규약으로 변환 (system 은 우리가 세팅).
    chat = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in messages:
        role = m.get("role", "user")
        if role not in {"user", "assistant"}:
            continue
        chat.append({"role": role, "content": m.get("text", "")})

    resp = client.chat.completions.create(
        model=MODEL,
        messages=chat,
        response_format={"type": "json_schema", "json_schema": _SCHEMA},
        temperature=0,  # 결정론적.
        max_tokens=400,
    )
    _track_usage("chat", resp)
    content = resp.choices[0].message.content or "{}"
    data = json.loads(content)
    # 스키마 강제라 키는 전부 존재. 그래도 방어적으로 fill.
    return {
        "companions": list(data.get("companions") or []),
        "eventTypes": list(data.get("eventTypes") or []),
        "periodKey": data.get("periodKey"),
        "vibes": list(data.get("vibes") or []),
        "regionHints": list(data.get("regionHints") or []),
    }


def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    임베딩 배치 호출 — text-embedding-3-small (1536 dim) 기본.

    빈 문자열은 호출 전에 단일 공백 으로 치환 (OpenAI 가 빈 입력을 거절).
    입력 순서와 동일한 순서로 vector list 반환. 실패 시 OpenAIError 계열 예외를 상위로.
    """
    if not texts:
        return []
    clean = [t if (t and t.strip()) else " " for t in texts]
    client = OpenAI()
    resp = client.embeddings.create(model=EMBED_MODEL, input=clean)
    # usage 는 prompt_tokens 만 (임베딩은 출력 없음).
    usage = getattr(resp, "usage", None)
    if usage:
        _cost_tracker.track(
            endpoint="embed",
            prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            completion_tokens=0,
            model=EMBED_MODEL,
        )
    # data 는 입력 순서를 보존 — index 기반 정렬 불필요. 그래도 안전하게 index 로 sort.
    items = sorted(resp.data, key=lambda d: d.index)
    return [list(d.embedding) for d in items]
