#!/usr/bin/env python3
"""
_coerce_specific_date 케이스 검증. 결정론 — fake today 주입.

사용: python3 services/llm/scripts/check-coerce-date.py
exit 0: 전체 PASS. exit 1: 1건 이상 FAIL.

오늘 = 2026-05-25 (월요일) 고정. 이 날짜 기준:
  이번주: 2026-05-25(월) ~ 2026-05-31(일)
  다음주: 2026-06-01(월) ~ 2026-06-07(일)
  다다음주: 2026-06-08(월) ~ 2026-06-14(일)
"""
import sys
from datetime import date
from pathlib import Path

# services/llm 을 import path 에 추가
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from openai_chain import _coerce_specific_date  # noqa: E402

FAKE_TODAY = date(2026, 5, 25)  # 월요일

CASES: list[tuple[str, str | None, str | None]] = [
    # 기존 동작 — 회귀 보호
    ("이번 주 토요일 야외", None, "2026-05-30"),
    ("다음주 일요일 가자", None, "2026-06-07"),
    ("내일", None, "2026-05-26"),
    ("아무 내용", None, None),
    ("아무 내용", "2026-07-01", "2026-07-01"),  # current 유지
    # 신규 — 다다음주
    ("다다음주 토요일 페스티벌", None, "2026-06-13"),
    ("다다음주 일", None, "2026-06-14"),
    # 신규 — 이번/오는 X요일 단축 (주 prefix 없음)
    ("이번 토요일 행사", None, "2026-05-30"),
    ("오는 일요일 가족이랑", None, "2026-05-31"),
    ("오는 금 전시 보러", None, "2026-05-29"),
    # 신규 — MM월 DD일 / M/D
    ("6월 15일 행사", None, "2026-06-15"),
    ("6/15 가족 행사", None, "2026-06-15"),
    ("12월 25일", None, "2026-12-25"),
    ("4월 1일 이벤트", None, "2027-04-01"),  # 오늘 이전 → 다음해
    ("2월 30일", None, None),  # invalid date → current 유지
    # 경계 — "다음주" 와 "다다음주" 충돌 방지
    ("다음주 토요일", None, "2026-06-06"),  # 다음주만 (다다음 prefix 없음)
]


def main() -> int:
    pass_count = 0
    fail_count = 0
    for user_text, current, expected in CASES:
        got = _coerce_specific_date(user_text, current, today=FAKE_TODAY)
        if got == expected:
            pass_count += 1
            print(f"  PASS  {user_text!r:50} → {got}")
        else:
            fail_count += 1
            print(f"  FAIL  {user_text!r:50} expected {expected}, got {got}")
    print(f"\nTotal: {pass_count} pass, {fail_count} fail")
    return 1 if fail_count > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
