"""
AI 요약 post-processing 가드.

모델/fallback 양쪽에서 공통으로 적용되는 server-side 정제기. 프롬프트에는
"이모지/마크다운 금지, 250자 이내" 라고 걸어두지만 모델 드리프트로 깨질 수 있어
반환값 시점에서도 한 번 더 강제한다.

규칙:
- 마크다운 제거: **bold**, *em*, _em_, `code`, ### heading, [text](url) → text, 리스트 bullet(-, *, +, 숫자.)
- 이모지 제거: 주요 유니코드 이모지 블록
- 공백 정규화: 연속 공백 1개, 줄바꿈 → 공백
- 250자 제한: 문장 경계(。./!/?)에서 잘라내고, 없으면 하드 자르고 말줄임(…)
"""

from __future__ import annotations

import re
from typing import Final

MAX_LEN: Final[int] = 250

# 이모지 주요 블록 (전부 아님 — 한국어 UI 에 자주 뜨는 것 커버).
_EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001F6FF"  # symbols & pictographs, transport
    "\U0001F700-\U0001F77F"  # alchemical
    "\U0001F780-\U0001F7FF"  # geometric shapes extended
    "\U0001F800-\U0001F8FF"  # supplemental arrows-C
    "\U0001F900-\U0001F9FF"  # supplemental symbols and pictographs
    "\U0001FA00-\U0001FA6F"  # chess symbols
    "\U0001FA70-\U0001FAFF"  # symbols and pictographs extended-A
    "\U00002600-\U000026FF"  # miscellaneous symbols
    "\U00002700-\U000027BF"  # dingbats
    "\U0001F000-\U0001F02F"  # mahjong
    "\U0001F0A0-\U0001F0FF"  # playing cards
    "\U0001F100-\U0001F1FF"  # enclosed alphanum supplement
    "\U0001F200-\U0001F2FF"  # enclosed ideographic supplement
    "]",
    flags=re.UNICODE,
)

_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_MD_BOLD_IT_RE = re.compile(r"(\*\*|__)(.+?)\1")
_MD_EMPH_RE = re.compile(r"(?<!\w)[\*_]([^\*_\n]+)[\*_](?!\w)")
_MD_CODE_RE = re.compile(r"`([^`]+)`")
_MD_HEADING_RE = re.compile(r"^\s*#{1,6}\s*", flags=re.MULTILINE)
_MD_LIST_RE = re.compile(r"^\s*(?:[-*+]\s+|\d+\.\s+)", flags=re.MULTILINE)
_WHITESPACE_RE = re.compile(r"\s+")

# 문장 경계 후보 (한/영/일본식 구두점). 뒷부분이 공백/끝이면 경계로 인정.
_SENTENCE_END_CHARS = "。.!?！？…"


def strip_markdown(text: str) -> str:
    t = _MD_LINK_RE.sub(r"\1", text)
    t = _MD_BOLD_IT_RE.sub(r"\2", t)
    t = _MD_EMPH_RE.sub(r"\1", t)
    t = _MD_CODE_RE.sub(r"\1", t)
    t = _MD_HEADING_RE.sub("", t)
    t = _MD_LIST_RE.sub("", t)
    return t


def strip_emoji(text: str) -> str:
    return _EMOJI_RE.sub("", text)


def normalize_whitespace(text: str) -> str:
    return _WHITESPACE_RE.sub(" ", text).strip()


def truncate_at_sentence(text: str, max_len: int = MAX_LEN) -> str:
    """max_len 초과 시 가까운 문장 경계에서 자르기. 못 찾으면 하드 자르고 '…'."""
    if len(text) <= max_len:
        return text
    # max_len 이내에서 마지막 문장 경계 위치 찾기.
    window = text[:max_len]
    best = -1
    for ch in _SENTENCE_END_CHARS:
        idx = window.rfind(ch)
        if idx > best:
            best = idx
    if best >= 60:  # 너무 짧게 잘리면 의미 훼손, 최소 60자 보장.
        return window[: best + 1].rstrip()
    # 문장 경계 못 찾으면 하드 컷 + 말줄임. '…' 자체도 길이에 포함되므로 한 자 여유.
    return text[: max_len - 1].rstrip() + "…"


def sanitize_summary(raw: str) -> str:
    """모델/fallback 양쪽 요약에 적용하는 최종 정제."""
    if not raw:
        return ""
    t = strip_markdown(raw)
    t = strip_emoji(t)
    t = normalize_whitespace(t)
    return truncate_at_sentence(t, MAX_LEN)
