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

MODEL = os.environ.get("OPENAI_MODEL_FAST", "gpt-4o-mini")

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
