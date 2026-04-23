"""
Stage 2 — OpenAI gpt-4o-mini 기반 채팅 체인.

역할 변천:
- v1: 필터 추출기 (5개 축 JSON). reply 는 룰 기반 compose_reply 가 담당.
- v2 (현재): 필터 추출 + 자연어 reply 동시 생성 (single structured output 호출).
  reply 는 LLM 이 추출된 필터 + 사용자 발화 맥락 보고 직접 작성. 룰 fallback 만 유지.

규칙
- 인터페이스: app.py /chat 이 호출. 반환은 {filters: {...}, reply: str}.
- Structured outputs (json_schema) 로 스키마 위반 차단.
- 어떤 실패든 예외를 올려서 app.py 가 규칙 기반 fallback 하게.
- 호출 비용: gpt-4o-mini + 400 tokens ≈ $0.0004/req. 대화 당 1회.
"""

from __future__ import annotations

import json
import os
from datetime import date, timedelta
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
_ALLOWED_PERIOD = [None, "today", "tomorrow", "weekend", "week", "month"]
_ALLOWED_VIBES = sorted({v for _, v in VIBE_TABLE})
_ALLOWED_REGIONS = SEOUL_GU

# 한국어 요일 (0=Mon).
_WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"]


def _today_context() -> str:
    """SYSTEM_PROMPT 에 매번 주입할 오늘 날짜 컨텍스트.

    LLM 이 '오늘'/'내일'/'이번 주말' 의 절대 시점을 인지하도록 — 또한 시즌 표기
    (봄/여름/가을/겨울) 도 함께 줘서 어휘 추출(예: '꽃놀이' → 봄 축제) 에 도움.
    """
    today = date.today()
    wd = _WEEKDAY_KO[today.weekday()]
    tomorrow = today + timedelta(days=1)
    days_to_sat = (5 - today.weekday()) % 7
    sat = today + timedelta(days=days_to_sat or 7 if today.weekday() == 5 else days_to_sat)
    sun = sat + timedelta(days=1)
    season = (
        "봄" if today.month in (3, 4, 5)
        else "여름" if today.month in (6, 7, 8)
        else "가을" if today.month in (9, 10, 11)
        else "겨울"
    )
    return (
        f"오늘은 {today.isoformat()} ({wd}요일), 계절은 {season}입니다. "
        f"내일은 {tomorrow.isoformat()}, 이번 주말은 {sat.isoformat()}~{sun.isoformat()} 입니다."
    )


# Few-shot 예시 — 변형 발화 학습. 실 데이터 기반 (오늘 날짜 의존 없는 표현 위주).
_FEWSHOT = """예시:
- "이번 주말 애들이랑 갈만한 축제":
  filters {companions:["family"], eventTypes:["festival"], periodKey:"weekend"}
  reply "이번 주말 · 가족 동행 · 축제 기준으로 찾아봤어요. 결과를 함께 보여드릴게요."

- "강남 데이트 분위기 잔잔한 전시":
  filters {regionHints:["강남구"], companions:["couple"], eventTypes:["exhibition"], vibes:["정적"]}
  reply "강남구 · 연인 동행 · 전시 · 정적 분위기로 좁혔어요. 마음에 드는 것 있는지 확인해 보세요."

- "혼자 조용히 책 읽을만한 곳" (이벤트 종류 불명확):
  filters {companions:["solo"], vibes:["정적"]}
  reply "혼자 · 정적 분위기 기준으로 추려봤어요. 종류(전시·교육 등)도 알려주시면 더 정확히 좁혀드려요."

- "내일 종로구 공연":
  filters {regionHints:["종로구"], eventTypes:["performance"], periodKey:"tomorrow"}
  reply "종로구 · 내일 · 공연 기준으로 찾아봤어요."

- (직전 턴 "이번 주말 가족 축제" 후) "가족 말고 친구랑":
  filters {companions:["friend"], eventTypes:["festival"], periodKey:"weekend"}
  reply "친구 동행으로 바꿔서 이번 주말 축제만 다시 추려봤어요. (가족 조건은 빼드렸어요.)"

- "오늘 갈 만한 거 추천해줘" (필터 거의 없음):
  filters {periodKey:"today"}
  reply "오늘 진행 중인 이벤트로 좁혀봤어요. 동행이나 종류를 알려주시면 더 정확하게 추천드릴게요."
"""


SYSTEM_PROMPT_TEMPLATE = f"""당신은 한국어 서울 이벤트(축제·전시·공연·박람회 등) 검색 어시스턴트 'Alle' 입니다.

목표: 사용자 발화에서 5개 필터 축을 추출하고, 동시에 1~2 문장 자연어 응답(reply) 도 작성하세요.
응답은 사용자가 무엇을 좁혔는지 안심하고, 다음 행동(결과 확인 또는 추가 조건 제공)으로 넘어가게 도와줍니다.

[추출 규칙]
- 값은 반드시 허용 목록에서만 선택. 없는 값은 만들지 말 것.
- 다중 턴: 이전 턴 + 이번 턴 의도 union.
- 최근 턴에 "말고/빼고/아니/대신/바꿔/그게 아니라/이번엔 다른" 등 의도 변경 신호가 있으면
  이전 턴 다중값 축은 무시하고 최근 턴만 반영.
- 부정+긍정 혼합("가족 말고 연인"): 부정값 제외 + 긍정값 포함.
- periodKey 단일값. 가장 최근 턴 우선.
- "강남" → "강남구" 처럼 접미어 없어도 매칭. 단 "구로구" 같이 글자 일부가 다른 구와
  겹치면 정확히 일치하는 구만.
- vibes 의미 매핑: "힐링·잔잔" → "정적", "신나는·역동" → "활동적", "직접·DIY" → "체험형",
  "보러" → "관람형", "배움" → "교육형", "사람들" → "네트워킹 중심".
- "팝업 스토어/플리마켓/마켓" 도 festival 로 분류 (현 카테고리 체계 한도).

[reply 작성 규칙 — 어기면 실패]
- 1~2 문장, 250자 이내, 존댓말 (~요/~습니다).
- 절대 위치 표현 금지: "오른쪽", "왼쪽", "상단", "하단", "지도 옆" 등 (모바일·데스크톱 공용).
- 절대 광고·과장 금지: "특별한", "잊지 못할", "환상적인", "놓칠 수 없는" 등.
- 마크다운·이모지·해시태그·리스트 금지. 평문 문장만.
- 추측 금지: 결과 개수·인기도·"많은 사람들이" 같은 표현 사용 금지 (실제 결과는 BFF 가 이후 채움).
- 좁혀진 축이 없거나 추출 실패면 어떤 정보를 더 주면 좋은지 짧게 가이드.
- 의도 변경 신호 있었으면 명시 ("X 조건은 빼드렸어요" 같이).
- 톤: 친절하지만 담백. 신문 기사 도입부 같은 사실 위주.

[오늘 컨텍스트]
{{TODAY}}

[허용 값]
- companions: {_ALLOWED_COMPANIONS}
- eventTypes: {_ALLOWED_EVENT_TYPES}
- periodKey:  {_ALLOWED_PERIOD}
- vibes:      {_ALLOWED_VIBES}
- regionHints: 서울 25개 구 ({", ".join(_ALLOWED_REGIONS[:5])} ... {", ".join(_ALLOWED_REGIONS[-3:])})

{_FEWSHOT}
"""


def _build_system_prompt() -> str:
    return SYSTEM_PROMPT_TEMPLATE.replace("{TODAY}", _today_context())


# 하위 호환 (외부 import 시 깨지지 않게) — 첫 import 시점 컨텍스트로 컴파일.
SYSTEM_PROMPT = _build_system_prompt()

_SCHEMA = {
    "name": "chat_extract",
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
            "reply": {
                "type": "string",
                "description": "1~2 문장 자연어 응답. 250자 이내. 위치 표현 금지.",
                "minLength": 1,
                "maxLength": 280,
            },
        },
        "required": ["companions", "eventTypes", "periodKey", "vibes", "regionHints", "reply"],
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
    반환:
      {
        "companions": [...], "eventTypes": [...], "periodKey": "...",
        "vibes": [...], "regionHints": [...],
        "reply": "1~2 문장 자연어 응답"
      }
    실패 시 OpenAIError 계열 예외를 상위로 올려서 app.py 가 fallback 처리.

    SYSTEM_PROMPT 는 매 호출마다 오늘 날짜를 주입한 새 인스턴스로 빌드 — 자정
    경계 변경 즉시 반영. (모듈 캐시 SYSTEM_PROMPT 는 외부 import 호환용.)
    """
    client = OpenAI()  # OPENAI_API_KEY 환경변수 자동 로드

    chat = [{"role": "system", "content": _build_system_prompt()}]
    for m in messages:
        role = m.get("role", "user")
        if role not in {"user", "assistant"}:
            continue
        chat.append({"role": role, "content": m.get("text", "")})

    resp = client.chat.completions.create(
        model=MODEL,
        messages=chat,
        response_format={"type": "json_schema", "json_schema": _SCHEMA},
        temperature=0.2,  # reply 자연스러움 위해 약간의 변동성 허용. 추출은 결정론에 가깝게 유지.
        max_tokens=500,
    )
    _track_usage("chat", resp)
    content = resp.choices[0].message.content or "{}"
    data = json.loads(content)
    return {
        "companions": list(data.get("companions") or []),
        "eventTypes": list(data.get("eventTypes") or []),
        "periodKey": data.get("periodKey"),
        "vibes": list(data.get("vibes") or []),
        "regionHints": list(data.get("regionHints") or []),
        "reply": (data.get("reply") or "").strip(),
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
