"""
Korean keyword → filter mapping (Stage 1 rule-based).

의도적으로 단순하게 유지. Stage 2 에서 LLM chain 으로 교체할 때 본 모듈은
fallback / eval dataset 으로 재사용 가능.
"""

from __future__ import annotations

import re
from typing import Any

# ---------------------------------------------------------------------------
# 어휘 사전
# ---------------------------------------------------------------------------

COMPANION_TABLE: list[tuple[list[str], str]] = [
    (["가족", "부모님", "애들", "아이", "아기"], "family"),
    (["연인", "데이트", "커플", "여자친구", "남자친구", "여친", "남친"], "couple"),
    (["친구", "동창"], "friend"),
    (["혼자", "솔로", "나 혼자"], "solo"),
]

EVENT_TYPE_TABLE: list[tuple[list[str], str]] = [
    (["축제", "페스티벌"], "festival"),
    (["박람회", "엑스포"], "expo"),
    (["심포지움", "심포지엄"], "symposium"),
    (["컨퍼런스", "컨퍼런"], "conference"),
    (["전시", "전시회", "미술관"], "exhibition"),
    (["공연", "뮤지컬", "연극", "콘서트"], "performance"),
    (["교육", "강좌", "클래스", "워크샵", "워크숍"], "education"),
    (["영화", "시네마"], "movie"),
]

PERIOD_TABLE: list[tuple[list[str], str]] = [
    # 순서 중요: '이번 주말' 이 '이번 주' 보다 먼저 매칭되도록 weekend 를 앞으로.
    (["오늘"], "today"),
    (["주말", "토요일", "일요일"], "weekend"),
    (["이번주", "이번 주"], "week"),
    (["이번달", "이번 달", "이달"], "month"),
]

# 서울 25개 구 — 단순 텍스트 매칭. BFF /regions 가 실제 regionId 로 resolve.
SEOUL_GU = [
    "종로구", "중구", "용산구", "성동구", "광진구", "동대문구", "중랑구",
    "성북구", "강북구", "도봉구", "노원구", "은평구", "서대문구", "마포구",
    "양천구", "강서구", "구로구", "금천구", "영등포구", "동작구", "관악구",
    "서초구", "강남구", "송파구", "강동구",
]


# ---------------------------------------------------------------------------
# 공용 매칭
# ---------------------------------------------------------------------------

def _match_any(text: str, table: list[tuple[list[str], str]]) -> list[str]:
    """table 의 각 그룹(동의어)에서 하나라도 걸리면 해당 code 를 수집."""
    hits: list[str] = []
    for keywords, code in table:
        for kw in keywords:
            if kw in text:
                hits.append(code)
                break
    return hits


def _match_first(text: str, table: list[tuple[list[str], str]]) -> str | None:
    for keywords, code in table:
        for kw in keywords:
            if kw in text:
                return code
    return None


def extract(text: str) -> dict[str, Any]:
    """사용자 발화에서 5개 필터 축을 뽑는다. 없으면 빈 값."""
    t = text.strip()
    return {
        "companions": _match_any(t, COMPANION_TABLE),
        "eventTypes": _match_any(t, EVENT_TYPE_TABLE),
        "periodKey":  _match_first(t, PERIOD_TABLE),
        "regionHints": [gu for gu in SEOUL_GU if gu in t or gu.replace("구", "") in t],
    }


# ---------------------------------------------------------------------------
# 응답 문자열 composer
# ---------------------------------------------------------------------------

_TYPE_LABEL = {
    "festival": "축제", "expo": "박람회", "symposium": "심포지움",
    "conference": "컨퍼런스", "exhibition": "전시", "performance": "공연",
    "education": "교육 프로그램", "movie": "영화",
}
_COMPANION_LABEL = {
    "family": "가족", "couple": "연인", "friend": "친구", "solo": "혼자",
}
_PERIOD_LABEL = {
    "today": "오늘", "week": "이번 주", "weekend": "이번 주말", "month": "이번 달",
}


def compose_reply(user_text: str, extracted: dict[str, Any]) -> str:
    # 빈 입력은 안내 문구.
    if not user_text.strip():
        return "어떤 이벤트를 찾고 계세요? 지역, 기간, 누구랑 가는지 알려주시면 좁혀드릴게요."

    parts: list[str] = []
    if regions := extracted.get("regionHints"):
        parts.append(", ".join(regions))
    if period := extracted.get("periodKey"):
        parts.append(_PERIOD_LABEL.get(period, period))
    if companions := extracted.get("companions"):
        labeled = ", ".join(_COMPANION_LABEL.get(c, c) for c in companions)
        parts.append(f"{labeled} 동행")
    if types := extracted.get("eventTypes"):
        labeled = ", ".join(_TYPE_LABEL.get(t, t) for t in types)
        parts.append(labeled)

    if not parts:
        return (
            "아직 필터를 못 찾았어요. '이번 주말 가족이랑 전시', '연인이랑 강남 공연'"
            " 같이 지역·기간·동행·종류를 섞어서 물어봐 주세요."
        )

    summary = " · ".join(parts)
    return f"{summary} 기준으로 좁혀드릴게요. 오른쪽 지도와 목록이 업데이트돼요."
