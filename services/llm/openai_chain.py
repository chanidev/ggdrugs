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
  {
    filters: {companions:["family"], eventTypes:["festival"], periodKey:"weekend"},
    specificDate: null,
    reply: "이번 주말 · 가족 동행 · 축제 기준으로 찾아봤어요. 결과를 함께 보여드릴게요.",
    followups: ["이번 달 전체로", "혼자 가도 좋은 거", "성수동·홍대 위주로"]
  }

- "강남 데이트 분위기 잔잔한 전시":
  {
    filters: {regionHints:["강남구"], companions:["couple"], eventTypes:["exhibition"], vibes:["정적"]},
    specificDate: null,
    reply: "강남구 · 연인 동행 · 전시 · 정적 분위기로 좁혔어요. 마음에 드는 것 있는지 확인해 보세요.",
    followups: ["야간 운영 위주", "공연도 같이", "다른 구도 보기"]
  }

- "혼자 조용히 책 읽을만한 곳" (이벤트 종류 불명확):
  {
    filters: {companions:["solo"], vibes:["정적"]},
    specificDate: null,
    reply: "혼자 · 정적 분위기 기준으로 추려봤어요. 종류(전시·교육 등)도 알려주시면 더 정확히 좁혀드려요.",
    followups: ["전시만 보기", "교육·강좌 보기", "이번 주말로"]
  }

- "내일 종로구 공연":
  {
    filters: {regionHints:["종로구"], eventTypes:["performance"], periodKey:"tomorrow"},
    specificDate: null,
    reply: "종로구 · 내일 · 공연 기준으로 찾아봤어요.",
    followups: ["주말까지 넓게", "친구랑 같이", "전시도 함께"]
  }

- (직전 턴 "이번 주말 가족 축제" 후) "가족 말고 친구랑":
  {
    filters: {companions:["friend"], eventTypes:["festival"], periodKey:"weekend"},
    specificDate: null,
    reply: "친구 동행으로 바꿔서 이번 주말 축제만 다시 추려봤어요. (가족 조건은 빼드렸어요.)",
    followups: ["야외 활동 위주", "체험형 강조", "다음 주로 미루기"]
  }

- "이번주 토요일 한강 근처 야외 행사" (구체 날짜 — specificDate 사용):
  {
    filters: {periodKey:"weekend", vibes:["활동적"]},
    specificDate: "2026-04-25",
    reply: "이번 주 토요일(4/25) 활동적 분위기로 찾아봤어요. 한강 근처는 영등포·용산·마포·성동·강서·송파 권역에서 확인해 주세요.",
    followups: ["일요일도 보기", "가족이랑은", "전시도 함께"]
  }

- "오늘 갈 만한 거 추천해줘" (필터 거의 없음):
  {
    filters: {periodKey:"today"},
    specificDate: null,
    reply: "오늘 진행 중인 이벤트로 좁혀봤어요. 동행이나 종류를 알려주시면 더 정확하게 추천드릴게요.",
    followups: ["가족이랑", "혼자서", "이번 주말로"]
  }
"""


SYSTEM_PROMPT_TEMPLATE = f"""당신은 한국어 서울 이벤트(축제·전시·공연·박람회 등) 검색 어시스턴트 'Alle' 입니다.

목표: 사용자 발화에서 5개 필터 축 + (선택)구체 날짜 추출, 자연어 응답(reply) 작성,
다음 행동을 유도하는 후속 추천(followups) 2~3개를 동시에 생성합니다.

[추출 규칙 — filters]
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

[specificDate — 선택]
- 사용자가 명확한 단일 날짜를 지정한 경우만 ISO YYYY-MM-DD 로 반환. 그 외엔 null.
- 예: "5월 1일" → 올해 "2026-05-01", "다음주 토요일" / "이번주 일요일" / "내일" → 절대 날짜 계산.
- 절대 추측하지 말 것 — "이번 주말" 같은 모호한 표현은 specificDate 없이 periodKey="weekend" 로만.
- 오늘 컨텍스트 절대 날짜를 활용해 정확히 계산.

[reply 작성 규칙 — 어기면 실패]
- 1~2 문장, 250자 이내, 존댓말 (~요/~습니다).
- 절대 위치 표현 금지: "오른쪽", "왼쪽", "상단", "하단", "지도 옆" 등 (모바일·데스크톱 공용).
- 절대 광고·과장 금지: "특별한", "잊지 못할", "환상적인", "놓칠 수 없는" 등.
- 마크다운·이모지·해시태그·리스트 금지. 평문 문장만.
- 추측 금지: 결과 개수·인기도·"많은 사람들이" 같은 표현 사용 금지 (실제 결과는 BFF 가 이후 채움).
- 좁혀진 축이 없거나 추출 실패면 어떤 정보를 더 주면 좋은지 짧게 가이드.
- 의도 변경 신호 있었으면 명시 ("X 조건은 빼드렸어요" 같이).
- 톤: 친절하지만 담백. 신문 기사 도입부 같은 사실 위주.

[followups 작성 규칙]
- 정확히 2~3개의 짧은 한국어 chip. 각 12자 이하.
- 사용자가 탭하면 그대로 다음 user 발화가 됨 — 자연스러운 명령형/평서문 요청 형태.
  (좋은 예: "이번 주말로", "혼자 가도 좋은 거", "전시도 함께" / 나쁜 예: "더 보기", "추천")
- 직전 사용자 발화·추출된 필터 맥락에서 **확장**(다른 동행/시기/카테고리)·**축소**(특정 vibe·지역)·
  **대체**(다른 카테고리) 중 의미 있는 변형. 단순 echo 금지.
- 이미 사용자가 명시한 축은 다시 묻지 말 것.

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


def _format_user_signals(sig: dict[str, Any]) -> str:
    """user_signals → priorityHint 시스템 컨텍스트 한 블록.

    LLM 은 이를 강제 필터로 쓰지 말고 동률 시 우선순위 결정에만 사용.
    사용자 발화가 다른 축을 명시하면 그게 우선.
    """
    parts: list[str] = []
    if sig.get("preferred_companion"):
        parts.append(f"평소 동행: {sig['preferred_companion']}")
    if sig.get("preferred_category"):
        parts.append(f"선호 카테고리: {sig['preferred_category']}")
    if sig.get("preferred_region"):
        parts.append(f"선호 지역: {sig['preferred_region']}")
    if sig.get("preferred_vibe"):
        parts.append(f"선호 분위기: {sig['preferred_vibe']}")
    bookmarks = sig.get("recent_bookmarks") or 0
    if bookmarks:
        parts.append(f"최근 북마크 {bookmarks}건")
    if not parts:
        return ""
    return (
        "[priorityHint — 사용자 과거 활동 기반]\n"
        + " · ".join(parts)
        + "\n사용자가 명시 안 한 축에 한해 위 힌트로 자연스럽게 우선순위만 보정. "
        "강제 필터로 쓰지 말 것. reply 에서 '평소 ...셨던 거 같아서' 같은 자연 언급 1회는 OK."
    )


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
            "specificDate": {
                "type": ["string", "null"],
                "description": "사용자가 명시한 단일 날짜 ISO YYYY-MM-DD. 모호하면 null.",
                "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
            },
            "reply": {
                "type": "string",
                "description": "1~2 문장 자연어 응답. 250자 이내. 위치 표현 금지.",
                "minLength": 1,
                "maxLength": 280,
            },
            "followups": {
                "type": "array",
                "description": "다음 user 발화 후보 칩 2~3개. 각 12자 이하.",
                "items": {"type": "string", "minLength": 1, "maxLength": 14},
                "minItems": 2,
                "maxItems": 3,
            },
        },
        "required": [
            "companions", "eventTypes", "periodKey", "vibes", "regionHints",
            "specificDate", "reply", "followups",
        ],
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


def extract_via_openai(
    messages: list[dict[str, str]],
    *,
    user_signals: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    messages: [{"role": "user"|"assistant"|"system", "text": str}, ...]
    user_signals: 로그인 사용자의 taste profile 라벨. 있으면 시스템에 priorityHint 추가.
    반환:
      {
        "companions": [...], "eventTypes": [...], "periodKey": "...",
        "vibes": [...], "regionHints": [...],
        "specificDate": "YYYY-MM-DD" | None,
        "reply": "1~2 문장",
        "followups": ["chip1", "chip2", "chip3"]
      }
    실패 시 OpenAIError 계열 예외를 상위로 올려서 app.py 가 fallback 처리.

    SYSTEM_PROMPT 는 매 호출마다 오늘 날짜를 주입한 새 인스턴스로 빌드.
    """
    client = OpenAI()

    sys_prompt = _build_system_prompt()
    if user_signals:
        sys_prompt += "\n\n" + _format_user_signals(user_signals)

    chat = [{"role": "system", "content": sys_prompt}]
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
        "specificDate": data.get("specificDate"),
        "reply": (data.get("reply") or "").strip(),
        "followups": [s.strip() for s in (data.get("followups") or []) if s and s.strip()][:3],
    }


# =============================================================
# v3 — Retreat composer (0건 처리) + LLM Reranker
# =============================================================

_RETREAT_SCHEMA = {
    "name": "compose_retreat",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "reply": {
                "type": "string",
                "description": "0건 사실을 인정하고 다음 행동을 자연스럽게 안내하는 1~2 문장.",
                "minLength": 1,
                "maxLength": 280,
            },
            "followups": {
                "type": "array",
                "description": "사용자가 시도해볼 만한 대안 2~3개 (제약 완화 / 다른 동행·시기·카테고리).",
                "items": {"type": "string", "minLength": 1, "maxLength": 14},
                "minItems": 2,
                "maxItems": 3,
            },
        },
        "required": ["reply", "followups"],
    },
}


def compose_retreat(
    *,
    user_text: str,
    extracted_filters: dict[str, Any],
    sql_count: int,
    semantic_count: int,
) -> dict[str, Any]:
    """
    BFF 가 0건 (또는 매우 낮은 결과) 감지 시 호출. 결과를 LLM 에 알려주고
    자연스러운 retreat reply + 대체 followups 생성.

    실패 시 OpenAIError 계열 예외 → BFF 가 원래 reply 유지.
    """
    client = OpenAI()
    sys = (
        f"당신은 한국어 서울 이벤트 검색 어시스턴트 'Alle' 의 retreat 모드입니다.\n"
        f"{_today_context()}\n\n"
        "사용자가 요청한 조건으로 SQL 검색 결과는 sql_count 건, AI 의미 검색 후보는 semantic_count 건입니다.\n"
        "결과가 부족한 사실을 한 문장으로 인정하고, 어떤 축을 완화하면 결과가 늘어날지 1문장으로 제안하세요.\n"
        "그리고 followups 2~3개로 구체적인 대안을 제시하세요 (예: '이번 주말로 넓히기', '동행 빼기', '전시도 함께').\n\n"
        "[제약]\n"
        "- 위치 표현 금지: 오른쪽/왼쪽/상단/하단.\n"
        "- 광고·과장 금지.\n"
        "- 마크다운·이모지·해시태그 금지.\n"
        "- 결과 0건이면 가짜로 추천하지 말 것 — 정직하게 '없네요' 인정.\n"
        "- followups 각 12자 이하, 사용자가 탭하면 그대로 다음 user 발화가 됨."
    )

    user_msg = (
        f"사용자 마지막 발화: {user_text}\n"
        f"추출된 필터: {json.dumps(extracted_filters, ensure_ascii=False)}\n"
        f"sql_count: {sql_count}\n"
        f"semantic_count: {semantic_count}"
    )

    resp = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": sys},
            {"role": "user", "content": user_msg},
        ],
        response_format={"type": "json_schema", "json_schema": _RETREAT_SCHEMA},
        temperature=0.3,
        max_tokens=300,
    )
    _track_usage("retreat", resp)
    content = resp.choices[0].message.content or "{}"
    data = json.loads(content)
    return {
        "reply": (data.get("reply") or "").strip(),
        "followups": [s.strip() for s in (data.get("followups") or []) if s and s.strip()][:3],
    }


_RERANK_SCHEMA = {
    "name": "rerank_events",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "ranked": {
                "type": "array",
                "description": "재정렬된 eventId + 한 줄 reason. 가장 의미 적합한 순.",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "eventId": {"type": "string"},
                        "reason": {
                            "type": "string",
                            "description": "왜 이 이벤트가 사용자 의도에 맞는지 1~2 어구. 12~30자.",
                            "minLength": 4,
                            "maxLength": 60,
                        },
                    },
                    "required": ["eventId", "reason"],
                },
                "minItems": 1,
            },
        },
        "required": ["ranked"],
    },
}


def rerank_candidates(
    *,
    query: str,
    candidates: list[dict[str, Any]],
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """
    cosine 기반 top-N 후보를 의미·맥락 적합성으로 재정렬 + 추천 사유 생성.

    candidates: [{eventId, title, phase, startDate, endDate, region, category, vibes, score}]
    반환: [{eventId, reason}] 길이 ≤ top_k. 원본 후보에 reason 만 붙여서 BFF 가 merge.

    실패 시 예외 → BFF 가 원래 score 순서 유지.
    """
    if not candidates:
        return []
    client = OpenAI()
    sys = (
        f"당신은 한국어 이벤트 추천 reranker 입니다. {_today_context()}\n"
        "사용자 질문(query)와 후보 이벤트 목록을 보고, 의미·시점·동행·분위기 적합도가 가장 높은 순으로\n"
        f"top {top_k} 개를 골라 재정렬하세요. 각 항목에 1~2 어구 reason 을 붙이세요.\n\n"
        "[reason 규칙]\n"
        "- '가족이 즐기기 좋은 야외 축제' 같이 사용자가 왜 흥미를 가질지 한 점 짚기.\n"
        "- 12~30자, 광고 표현 금지, 사실 위주.\n"
        "- 후보 메타에 없는 정보 추측 금지 (가격·인기·정원 등).\n\n"
        "[순서 결정 가중치]\n"
        "1순위: phase (ongoing > upcoming, ended 는 제거하지 말되 후순위)\n"
        "2순위: 사용자 동행/분위기 의도 부합\n"
        "3순위: 카테고리 / 지역 일치\n"
        "4순위: 원래 score (동률 시)"
    )
    cand_lines = []
    for c in candidates:
        cand_lines.append(
            f"- id={c.get('eventId')}, title={c.get('title','')[:60]}, "
            f"phase={c.get('phase','')}, "
            f"date={c.get('startDate','')}~{c.get('endDate','')}, "
            f"region={c.get('region','')}, category={c.get('category','')}, "
            f"vibes={','.join(c.get('vibes') or [])}, score={c.get('score',0):.3f}"
        )
    user_msg = f"query: {query}\n\n후보 ({len(candidates)}건):\n" + "\n".join(cand_lines)

    resp = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": sys},
            {"role": "user", "content": user_msg},
        ],
        response_format={"type": "json_schema", "json_schema": _RERANK_SCHEMA},
        temperature=0.1,
        max_tokens=600,
    )
    _track_usage("rerank", resp)
    content = resp.choices[0].message.content or "{}"
    data = json.loads(content)
    out: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for item in data.get("ranked") or []:
        eid = str(item.get("eventId") or "").strip()
        if not eid or eid in seen_ids:
            continue
        seen_ids.add(eid)
        out.append({"eventId": eid, "reason": (item.get("reason") or "").strip()})
        if len(out) >= top_k:
            break
    return out


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
