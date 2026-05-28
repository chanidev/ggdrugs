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
    (["가족", "부모님", "애들", "아이", "아기", "어린이", "아동", "유아", "자녀"], "family"),
    (["연인", "데이트", "커플", "여자친구", "남자친구", "여친", "남친", "썸"], "couple"),
    (["친구", "동창", "동기", "동료"], "friend"),
    (["혼자", "솔로", "나 혼자", "혼술", "혼밥", "1인"], "solo"),
]

EVENT_TYPE_TABLE: list[tuple[list[str], str]] = [
    (["축제", "페스티벌", "마켓", "플리마켓", "장터", "팝업", "팝업스토어"], "festival"),
    (["박람회", "엑스포", "페어"], "expo"),
    (["심포지움", "심포지엄", "포럼"], "symposium"),
    (["컨퍼런스", "컨퍼런", "세미나"], "conference"),
    (["전시", "전시회", "미술관", "갤러리", "박물관"], "exhibition"),
    (["공연", "뮤지컬", "연극", "콘서트", "라이브", "버스킹"], "performance"),
    (["교육", "강좌", "클래스", "워크샵", "워크숍", "원데이"], "education"),
    (["영화", "시네마", "상영"], "movie"),
]

PERIOD_TABLE: list[tuple[list[str], str]] = [
    # 순서 중요: 더 구체적인 키가 먼저. '이번 주말' 이 '이번 주' 보다 먼저 매칭.
    (["오늘", "당일"], "today"),
    (["내일", "낼"], "tomorrow"),
    (["주말", "토요일", "일요일", "토일"], "weekend"),
    (["이번주", "이번 주", "금주"], "week"),
    (["이번달", "이번 달", "이달", "당월"], "month"),
]

# vibe 라벨 (DB `event_vibes.vibe_name`) — 키워드 → 정확한 vibe 이름 매핑.
# BFF 가 vibe_name → vibe_id 로 resolve 해 /events?vibeIds=... 쿼리에 사용.
VIBE_TABLE: list[tuple[list[str], str]] = [
    (["활동적", "액티브", "몸 쓰", "뛰", "신나는", "에너지", "역동", "활기"], "활동적"),
    (["정적", "차분", "조용", "힐링", "잔잔", "여유", "릴렉스", "고요"], "정적"),
    (["체험형", "체험", "참여", "만들기", "직접", "DIY", "핸즈온"], "체험형"),
    (["관람형", "관람", "보기", "구경", "감상", "보는", "보러"], "관람형"),
    (["교육형", "교육적", "배우는", "배움", "학습", "공부"], "교육형"),
    (["네트워킹", "교류", "친목", "사람들", "인맥"], "네트워킹 중심"),
]

# ADR 0006 — LLM 없는 dev/CI fallback. sido 17 단축형만 매칭. 자치구·시·군 미인식.
# 정확도 우선순위 낮음 (LLM stage 가 정상 작동하면 이 경로는 거의 안 탐).
_SIDO_KEYWORDS = [
    "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
    "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
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
        "vibes":      _match_any(t, VIBE_TABLE),
        # Sido 17 lite fallback — LLM stage 2 비활성화 시만 사용.
        "regionHints": [k for k in _SIDO_KEYWORDS if k in t],
    }


def extract_merge(messages: list[str]) -> dict[str, Any]:
    """
    다중 턴 — 모든 user 발화에서 추출한 필터를 머지. 최근 발화가 우선.

    - 다중 값 축(companions/eventTypes/vibes/regionHints): 모든 턴의 union.
    - 단일 값 축(periodKey): 가장 최근 턴의 값이 우선.
    - "말고" / "빼고" / "대신" 이 최근 발화에 있으면 이전 턴의 다중 값 축을
      해당 발화의 값으로 완전 교체 (사용자 의도 변경 힌트).
    """
    # 최근 턴이 교체(reset) 신호를 가졌는지 먼저 체크.
    if not messages:
        return {"companions": [], "eventTypes": [], "periodKey": None, "vibes": [], "regionHints": []}

    latest = messages[-1]
    # 의도 변경 신호. "그게 아니라", "이번엔 다른" 같은 자연 표현도 포함.
    reset_keys = [
        "말고", "빼고", "대신", "바꿔", "아니",
        "그게 아니라", "이번엔 다른", "이번엔 말고", "다른 거", "다른거",
    ]
    reset_flag = any(k in latest for k in reset_keys)
    if reset_flag:
        return extract(latest)

    # 머지: 모든 턴 추출 → union.
    merged = {"companions": [], "eventTypes": [], "periodKey": None, "vibes": [], "regionHints": []}
    for t in messages:
        ex = extract(t)
        for k in ("companions", "eventTypes", "vibes", "regionHints"):
            for v in ex[k]:
                if v not in merged[k]:
                    merged[k].append(v)
        if ex["periodKey"] is not None:
            merged["periodKey"] = ex["periodKey"]  # 최근 덮어쓰기
    return merged


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
    "today": "오늘",
    "tomorrow": "내일",
    "week": "이번 주",
    "weekend": "이번 주말",
    "month": "이번 달",
}


def compose_reply(user_text: str, extracted: dict[str, Any]) -> str:
    """
    룰 기반 fallback reply. LLM 실패 / 키 없을 때만 사용.
    LLM 활성 시 openai_chain.extract_via_openai 가 reply 도 직접 생성.

    톤 가이드:
    - 절대 "오른쪽" / "상단" 같은 위치 한정 표현 금지 — 모바일/데스크톱 동일 reply.
    - 좁혀진 축 echo + 결과 확인 유도 (행동 지시 없음). 데스크톱은 좌우 동기화,
      모바일은 시트 peek 자동 노출 — 양쪽에서 자연스럽게 작동.
    """
    # 빈 입력은 안내 문구.
    if not user_text.strip():
        return "어떤 이벤트를 찾고 계세요? 지역·기간·동행·종류·성향(예: '이번 주말 가족이랑 강남 축제') 중 떠오르는 것부터 편하게 알려주세요."

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
    if vibes := extracted.get("vibes"):
        parts.append(", ".join(vibes))

    if not parts:
        return (
            "조건을 못 잡았어요. 지역(강남구·종로구 등), 기간(오늘·이번 주말·이달),"
            " 동행(가족·연인·친구), 종류(축제·전시·공연), 성향(활동적·정적·체험형)"
            " 중 한두 개를 섞어서 다시 말씀해 주세요."
        )

    summary = " · ".join(parts)
    return f"{summary} 기준으로 좁혀봤어요. 지도와 목록이 갱신됐고 의미가 맞는 후보도 함께 보여드릴게요."
