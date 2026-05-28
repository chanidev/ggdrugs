# specificDate 자가점검 강화 Implementation Plan (Slice A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** specificDate 추출 정확도 강화 — 결정론적 `_coerce_specific_date` 트리거 어휘 확장 (다다음주 fix, 이번/오는 X요일, MM월 DD일) + LLM 자가점검 룰 보강 + chat-eval 케이스 동적화로 4월 stale 잔존 2건 해소.

**Architecture:** 3 layer 동시 보강 — (1) Python 정규식 5개 신규/분리, (2) SYSTEM_PROMPT 자가점검 2 룰 추가 + `_FEWSHOT` 2-3건, (3) `chat-eval.ts` 의 `specificDateRelative` 동적 토큰 + 4건 회귀 추가. TDD 스타일 — RED 케이스 미리 정의 → 정규식 분기 별 GREEN.

**Tech Stack:** Python 3 (services/llm), TypeScript (apps/bff), OpenAI gpt-4o-mini.

---

## File Structure

수정:
- `services/llm/openai_chain.py` — 정규식 4개 신규 + `_NEXT_WEEK_WD_RE` 분리, `_coerce_specific_date` 본문 + 시그니처 (`today: date | None = None`), `_FEWSHOT` 2-3건, SYSTEM_PROMPT `[specificDate 자가 점검]` 2 룰
- `apps/bff/src/jobs/chat-eval.ts` — `Case.expect.specificDateRelative` 신규 필드, `resolveRelative` helper, 비교 분기
- `apps/bff/src/jobs/chat-eval-cases.json` — 잔존 2건 `specificDateExact` → `specificDateRelative` 교체, 신규 4건 append
- `llm_wiki/wiki/topics/ai-enrichment.md` — 한 단락 추가 (specificDate 자가점검 보강 메모)

신규:
- `services/llm/scripts/check-coerce-date.py` — `_coerce_specific_date` 케이스 검증 (결정론 — fake today)
- `docs/superpowers/plans/2026-05-28-specific-date-self-check.md` (본 plan)

---

## Task 1: `_coerce_specific_date` 시그니처 확장 + 검증 스크립트 (RED)

**Files:**
- Modify: `services/llm/openai_chain.py` (line 361)
- Create: `services/llm/scripts/check-coerce-date.py`

`_coerce_specific_date` 에 `today: date | None = None` optional 파라미터 추가. 기존 호출처 (line 717, 822) 는 default 사용해 호환.

- [ ] **Step 1: 함수 시그니처 확장 (default today=None)**

`services/llm/openai_chain.py` line 361 `_coerce_specific_date` 함수:

이전:
```python
def _coerce_specific_date(user_text: str, current: str | None) -> str | None:
    """user 발화에 결정 가능한 단일 날짜 트리거가 있으면 ISO 날짜로 **강제 override**.
    명시 트리거가 없으면 current 유지.

    ...
    """
    if not user_text:
        return current
    today = date.today()
```

수정 후:
```python
def _coerce_specific_date(
    user_text: str,
    current: str | None,
    today: date | None = None,
) -> str | None:
    """user 발화에 결정 가능한 단일 날짜 트리거가 있으면 ISO 날짜로 **강제 override**.
    명시 트리거가 없으면 current 유지.

    today: 결정론 테스트용 override. None 이면 date.today() 호출.

    ...
    """
    if not user_text:
        return current
    if today is None:
        today = date.today()
```

- [ ] **Step 2: 검증 스크립트 디렉터리 + 파일 생성**

```bash
mkdir -p services/llm/scripts
```

`services/llm/scripts/check-coerce-date.py`:

```python
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
```

- [ ] **Step 3: package.json alias (선택)**

`services/llm/scripts/` 는 pnpm 워크스페이스 무관 Python — 별도 alias 없이 직접 호출. 또는 `apps/bff/package.json` 에 한 줄 추가 (homemade convenience):

```json
    "check:coerce-date": "python3 ../../services/llm/scripts/check-coerce-date.py",
```

(이 alias 는 선택 — 추가 안 해도 무방. 본 plan 에서는 생략, 직접 호출.)

- [ ] **Step 4: 실행 — RED 확인**

```bash
python3 services/llm/scripts/check-coerce-date.py
```

Expected (현재):
- 기존 케이스 5건 PASS (이번주/다음주/내일/current 유지)
- 다다음주 케이스 2건 FAIL (현재 다다음주가 다음주로 잘못 계산 — 2026-06-06 출력)
- 이번/오는 단축 3건 FAIL (트리거 없음 — None 출력)
- MM월 DD일 4건 FAIL (트리거 없음)
- 2월 30일 PASS (None — 트리거 없으니 current 유지)
- 다음주 토 PASS (정상)

요약: ~10/16 FAIL 예상. 의도된 RED 상태.

- [ ] **Step 5: Commit (RED — 시그니처 확장 + 검증 스크립트)**

```bash
git add services/llm/openai_chain.py services/llm/scripts/check-coerce-date.py
git commit -m "test(llm): _coerce_specific_date 검증 스크립트 + today 시그니처 (RED)"
```

---

## Task 2: 다다음주 정규식 분리 + 분기 (GREEN 1단계)

**Files:**
- Modify: `services/llm/openai_chain.py` (line 354~389)

- [ ] **Step 1: `_NEXT_WEEK_WD_RE` lookbehind 추가 + `_AFTER_NEXT_WEEK_WD_RE` 신규**

`services/llm/openai_chain.py` line 354~358 정규식 블록:

이전:
```python
_NEXT_WEEK_WD_RE = _re_date.compile(r"(?:다음\s*주|담주|다다음\s*주|next\s*week)\s*[ ,]*([월화수목금토일])(?:요일)?")
_THIS_WEEK_WD_RE = _re_date.compile(r"(?:이번\s*주|금주|this\s*week)\s*[ ,]*([월화수목금토일])(?:요일)?")
_TOMORROW_RE = _re_date.compile(r"(?<![가-힣])내일(?![가-힣])")
_KO_WD_INDEX = {"월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6}
```

수정 후:
```python
# 다음주 = 다음 월~일. lookbehind (?<!다) 로 "다다음주" 안의 "다음" 매칭 차단.
_NEXT_WEEK_WD_RE = _re_date.compile(r"(?<!다)(?:다음\s*주|담주|next\s*week)\s*[ ,]*([월화수목금토일])(?:요일)?")
# 다다음주 = 다음 다음 월~일 (오늘로부터 +14일 후).
_AFTER_NEXT_WEEK_WD_RE = _re_date.compile(r"다다음\s*주\s*[ ,]*([월화수목금토일])(?:요일)?")
_THIS_WEEK_WD_RE = _re_date.compile(r"(?:이번\s*주|금주|this\s*week)\s*[ ,]*([월화수목금토일])(?:요일)?")
_TOMORROW_RE = _re_date.compile(r"(?<![가-힣])내일(?![가-힣])")
_KO_WD_INDEX = {"월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6}
```

- [ ] **Step 2: `_coerce_specific_date` 본문 — 다다음주 분기 추가**

함수 본문에서 기존 `_NEXT_WEEK_WD_RE` 분기 **앞** 에 다다음주 분기 삽입:

이전:
```python
    today = date.today()
    m = _NEXT_WEEK_WD_RE.search(user_text)
    if m:
        wd = _KO_WD_INDEX.get(m.group(1))
        if wd is not None:
            this_mon = today - timedelta(days=today.weekday())
            target = this_mon + timedelta(days=7 + wd)
            return target.isoformat()
    m = _THIS_WEEK_WD_RE.search(user_text)
```

수정 후 (Task 1 의 today 파라미터 호환 이미 적용됨):
```python
    if today is None:
        today = date.today()
    # 다다음주 X요일 — 다음주 우선 매칭이라 먼저 검사.
    m = _AFTER_NEXT_WEEK_WD_RE.search(user_text)
    if m:
        wd = _KO_WD_INDEX.get(m.group(1))
        if wd is not None:
            this_mon = today - timedelta(days=today.weekday())
            target = this_mon + timedelta(days=14 + wd)
            return target.isoformat()
    m = _NEXT_WEEK_WD_RE.search(user_text)
    if m:
        wd = _KO_WD_INDEX.get(m.group(1))
        if wd is not None:
            this_mon = today - timedelta(days=today.weekday())
            target = this_mon + timedelta(days=7 + wd)
            return target.isoformat()
    m = _THIS_WEEK_WD_RE.search(user_text)
```

- [ ] **Step 3: 검증 — 다다음주 케이스 PASS 확인**

```bash
python3 services/llm/scripts/check-coerce-date.py
```

Expected:
- 다다음주 케이스 2건 PASS (2026-06-13, 2026-06-14)
- 다음주 토 PASS (2026-06-06 — lookbehind 가 다다음 안의 다음 차단 안 함, 일반 다음주 토)
- 나머지 (이번/오는 단축 3건 + MM월 DD일 4건) 여전히 FAIL

요약: ~7/16 PASS.

- [ ] **Step 4: Commit**

```bash
git add services/llm/openai_chain.py
git commit -m "fix(llm): _coerce_specific_date 다다음주 분리 (+14d) — 정규식 lookbehind"
```

---

## Task 3: 이번/오는 X요일 단축 alias (GREEN 2단계)

**Files:**
- Modify: `services/llm/openai_chain.py`

- [ ] **Step 1: `_THIS_WD_SHORT_RE` 정규식 추가**

`services/llm/openai_chain.py` 의 정규식 블록 (Task 2 에서 이미 분리된 블록):

이전:
```python
_AFTER_NEXT_WEEK_WD_RE = _re_date.compile(r"다다음\s*주\s*[ ,]*([월화수목금토일])(?:요일)?")
_THIS_WEEK_WD_RE = _re_date.compile(r"(?:이번\s*주|금주|this\s*week)\s*[ ,]*([월화수목금토일])(?:요일)?")
```

수정 후 (`_THIS_WEEK_WD_RE` 다음에 한 줄 추가):
```python
_AFTER_NEXT_WEEK_WD_RE = _re_date.compile(r"다다음\s*주\s*[ ,]*([월화수목금토일])(?:요일)?")
_THIS_WEEK_WD_RE = _re_date.compile(r"(?:이번\s*주|금주|this\s*week)\s*[ ,]*([월화수목금토일])(?:요일)?")
# "이번 토요일" / "오는 일요일" 같이 주 prefix 생략한 단축형. 가장 가까운 이번주 X요일 alias.
# lookbehind (?<![가-힣다]) 로 "다다음", "지난번" 같은 더 긴 표현 안의 "이번"·"오는" 충돌 차단.
# lookahead (?!\s*주) 로 "이번 주 X요일" (정식) 과 충돌 차단 — 정식은 _THIS_WEEK_WD_RE 가 먼저 처리.
_THIS_WD_SHORT_RE = _re_date.compile(r"(?<![가-힣다])(?:이번|오는)\s*([월화수목금토일])(?!\s*주)(?:요일)?")
```

- [ ] **Step 2: `_coerce_specific_date` 분기 추가 (`_THIS_WEEK_WD_RE` 분기 다음)**

이전:
```python
    m = _THIS_WEEK_WD_RE.search(user_text)
    if m:
        wd = _KO_WD_INDEX.get(m.group(1))
        if wd is not None:
            this_mon = today - timedelta(days=today.weekday())
            target = this_mon + timedelta(days=wd)
            return target.isoformat()
    if _TOMORROW_RE.search(user_text):
```

수정 후:
```python
    m = _THIS_WEEK_WD_RE.search(user_text)
    if m:
        wd = _KO_WD_INDEX.get(m.group(1))
        if wd is not None:
            this_mon = today - timedelta(days=today.weekday())
            target = this_mon + timedelta(days=wd)
            return target.isoformat()
    # 단축형 "이번 토요일" / "오는 일" — 이번주 X요일 alias.
    m = _THIS_WD_SHORT_RE.search(user_text)
    if m:
        wd = _KO_WD_INDEX.get(m.group(1))
        if wd is not None:
            this_mon = today - timedelta(days=today.weekday())
            target = this_mon + timedelta(days=wd)
            return target.isoformat()
    if _TOMORROW_RE.search(user_text):
```

- [ ] **Step 3: 검증**

```bash
python3 services/llm/scripts/check-coerce-date.py
```

Expected:
- 이번/오는 단축 3건 PASS ("이번 토요일", "오는 일요일", "오는 금")
- 다른 케이스 회귀 없음

요약: ~10/16 PASS.

- [ ] **Step 4: Commit**

```bash
git add services/llm/openai_chain.py
git commit -m "feat(llm): _coerce_specific_date 이번/오는 X요일 단축 alias"
```

---

## Task 4: MM월 DD일 / M/D 명시 날짜 (GREEN 3단계)

**Files:**
- Modify: `services/llm/openai_chain.py`

- [ ] **Step 1: `_MD_DATE_RE` 정규식 추가**

이전 (정규식 블록 마지막 한 줄):
```python
_THIS_WD_SHORT_RE = _re_date.compile(r"(?<![가-힣다])(?:이번|오는)\s*([월화수목금토일])(?!\s*주)(?:요일)?")
_KO_WD_INDEX = {"월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6}
```

수정 후 (`_KO_WD_INDEX` 직전에 한 줄 추가):
```python
_THIS_WD_SHORT_RE = _re_date.compile(r"(?<![가-힣다])(?:이번|오는)\s*([월화수목금토일])(?!\s*주)(?:요일)?")
# "6월 15일" 또는 "6/15" 명시 날짜. lookbehind/ahead 로 "12.34.56" 같은 일반 숫자 충돌 차단.
_MD_DATE_RE = _re_date.compile(r"(?<!\d)(?:(\d{1,2})\s*월\s*(\d{1,2})\s*일|(\d{1,2})/(\d{1,2}))(?!\d)")
_KO_WD_INDEX = {"월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6}
```

- [ ] **Step 2: `_coerce_specific_date` 분기 추가 (`_TOMORROW_RE` 분기 직전)**

이전:
```python
    m = _THIS_WD_SHORT_RE.search(user_text)
    if m:
        wd = _KO_WD_INDEX.get(m.group(1))
        if wd is not None:
            this_mon = today - timedelta(days=today.weekday())
            target = this_mon + timedelta(days=wd)
            return target.isoformat()
    if _TOMORROW_RE.search(user_text):
        return (today + timedelta(days=1)).isoformat()
    return current
```

수정 후:
```python
    m = _THIS_WD_SHORT_RE.search(user_text)
    if m:
        wd = _KO_WD_INDEX.get(m.group(1))
        if wd is not None:
            this_mon = today - timedelta(days=today.weekday())
            target = this_mon + timedelta(days=wd)
            return target.isoformat()
    # "6월 15일" / "6/15" — 명시 날짜. 오늘 이전이면 다음해.
    m = _MD_DATE_RE.search(user_text)
    if m:
        m_str = m.group(1) or m.group(3)
        d_str = m.group(2) or m.group(4)
        try:
            month = int(m_str)
            day = int(d_str)
            year = today.year
            candidate = date(year, month, day)
            if candidate < today:
                candidate = date(year + 1, month, day)
            return candidate.isoformat()
        except ValueError:
            # 잘못된 날짜 (2월 30일 등) — 다음 단계로 넘어감
            pass
    if _TOMORROW_RE.search(user_text):
        return (today + timedelta(days=1)).isoformat()
    return current
```

- [ ] **Step 3: 검증 — 전체 PASS**

```bash
python3 services/llm/scripts/check-coerce-date.py
```

Expected:
- MM월 DD일 4건 PASS ("6월 15일", "6/15", "12월 25일", "4월 1일" → 2027 분기)
- "2월 30일" PASS (ValueError → current 유지 → None)
- **Total: 16/16 PASS** (exit 0)

- [ ] **Step 4: Commit**

```bash
git add services/llm/openai_chain.py
git commit -m "feat(llm): _coerce_specific_date MM월 DD일·M/D 명시 날짜 (이전이면 다음해)"
```

---

## Task 5: `_FEWSHOT` 신규 specificDate 케이스 3건

**Files:**
- Modify: `services/llm/openai_chain.py`

- [ ] **Step 1: `_FEWSHOT` 끝 (line ~185, 닫는 `"""` 직전) 에 3건 append**

직전 작업 (Task 3 of LLM nationwide plan) 으로 _FEWSHOT 은 14건. 본 task 신규 추가로 17건.

`services/llm/openai_chain.py` 의 `_FEWSHOT = """예시:` 블록 마지막 "수원시 영통구 가족 행사" 케이스 뒤, 닫는 `"""` 라인 직전에 다음 3건 삽입:

```
- "다다음주 토요일 페스티벌" (다다음주 — 컨텍스트 표 의 '다음주 토' + 7일):
  ※ 가정: [오늘 컨텍스트] 의 "'다음주 토'=2026-06-06" 인 경우 → 다다음주 토 = 2026-06-13.
  {
    filters: {eventTypes:["festival"]},
    specificDate: "2026-06-13",
    referencesLast: false,
    reply: "다다음 주 토요일(6/13) 페스티벌 기준으로 찾아봤어요.",
    followups: ["다음주 토로", "야간 운영", "전시도 함께"]
  }

- "6월 15일 행사 있어?" (MM월 DD일 명시):
  {
    filters: {},
    specificDate: "2026-06-15",
    referencesLast: false,
    reply: "6월 15일 기준으로 찾아봤어요. 종류나 동행을 알려주시면 더 좁혀드려요.",
    followups: ["가족이랑", "전시 위주", "주말 전체로"]
  }

- "이번 토요일 야외 행사" (주 prefix 생략 — 이번주 토 alias):
  ※ 가정: [오늘 컨텍스트] 가 "이번 주말은 2026-05-30(토)~2026-05-31(일)" 라고 명시한 경우.
  {
    filters: {vibes:["활동적"]},
    specificDate: "2026-05-30",
    referencesLast: false,
    reply: "이번 주 토요일(5/30) 활동적 분위기 기준으로 찾아봤어요.",
    followups: ["일요일도", "전시도", "다음주로"]
  }

```

(끝의 빈 줄 1개 유지 — 기존 패턴 일관성.)

- [ ] **Step 2: 카운트 검증**

```bash
cd services/llm && python -c "from openai_chain import _FEWSHOT; print(_FEWSHOT.count('- \"'))"
```

Expected: `17` (기존 14 + 신규 3).

- [ ] **Step 3: import 검증**

```bash
cd services/llm && python -c "import openai_chain; print('OK')"
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add services/llm/openai_chain.py
git commit -m "feat(llm): _FEWSHOT specificDate 신규 3건 (다다음주·MM월DD일·이번 토)"
```

---

## Task 6: SYSTEM_PROMPT `[specificDate 자가 점검]` 보강

**Files:**
- Modify: `services/llm/openai_chain.py` (line 216~219 부근)

- [ ] **Step 1: 자가 점검 룰 2 줄 추가**

`services/llm/openai_chain.py` 의 SYSTEM_PROMPT_TEMPLATE 의 `[specificDate 자가 점검 — 출력 직전]` 섹션:

이전:
```
- reply 텍스트에 "(M/D)" 또는 "M월 D일" 같은 단일 날짜를 적었다면 → 동일한 날짜를 specificDate 에 ISO 로도 채울 것. reply 와 specificDate 가 다른 값을 가리키면 안 됨.
- 사용자 발화에 "다음주" + 요일이 있으면 specificDate 는 절대 null 이면 안 됨. 컨텍스트 표를 다시 보고 채울 것.
- "다음주 X요일" 입력 시 periodKey 는 "tomorrow" 로 설정하지 말 것 (다음주는 내일이 아님). periodKey 는 빈 값 또는 "week" 가능.
```

수정 후 (2 줄 추가, 마지막 룰 위에 삽입):
```
- reply 텍스트에 "(M/D)" 또는 "M월 D일" 같은 단일 날짜를 적었다면 → 동일한 날짜를 specificDate 에 ISO 로도 채울 것. reply 와 specificDate 가 다른 값을 가리키면 안 됨.
- 사용자 발화에 "다음주" + 요일이 있으면 specificDate 는 절대 null 이면 안 됨. 컨텍스트 표를 다시 보고 채울 것.
- 사용자 발화에 "MM월 DD일" 또는 "M/D" 명시가 있으면 specificDate = 그 해의 해당 날짜 ISO. 오늘 이전이면 다음해. 절대 null 두지 말 것.
- 사용자 발화에 "다다음주 X요일" 이 있으면 specificDate = 컨텍스트 표 의 "'다음주 X'" 값 + 7일. 다음주 X요일과 헷갈리지 말 것.
- "다음주 X요일" 입력 시 periodKey 는 "tomorrow" 로 설정하지 말 것 (다음주는 내일이 아님). periodKey 는 빈 값 또는 "week" 가능.
```

- [ ] **Step 2: 빌드 검증**

```bash
cd services/llm && python -c "from openai_chain import _build_system_prompt; p = _build_system_prompt(); print(f'len: {len(p)} chars')"
```

Expected: 정상 빌드, 길이 출력 (이전 ~7625 + ~120 = ~7745).

- [ ] **Step 3: Commit**

```bash
git add services/llm/openai_chain.py
git commit -m "feat(llm): SYSTEM_PROMPT specificDate 자가점검 룰 2 추가 (MM월DD일·다다음주)"
```

---

## Task 7: `chat-eval.ts` `specificDateRelative` 필드 + helper

**Files:**
- Modify: `apps/bff/src/jobs/chat-eval.ts`

- [ ] **Step 1: `Case.expect` 타입에 `specificDateRelative` 추가**

`apps/bff/src/jobs/chat-eval.ts` 의 `Case` 또는 `expect` 타입 정의 (line ~30~40 부근):

이전:
```ts
    specificDateExact?: string;
```

수정 후 (한 줄 추가):
```ts
    specificDateExact?: string;
    /** 동적 토큰 — today 기준 ISO 계산 후 비교. 예: "this-week-saturday", "next-week-sunday", "after-next-week-saturday". */
    specificDateRelative?: string;
```

- [ ] **Step 2: `resolveRelative` helper 추가 (파일 적당 위치 — 다른 helper 들과 같은 영역)**

`apps/bff/src/jobs/chat-eval.ts` 의 helper 함수 영역 (Case 타입 정의 후, main 호출 전) 에 추가:

```ts
/**
 * specificDateRelative 토큰을 today 기준 ISO 날짜로 변환.
 * 토큰: "this-week-<weekday>", "next-week-<weekday>", "after-next-week-<weekday>".
 * weekday: monday|tuesday|wednesday|thursday|friday|saturday|sunday.
 *
 * 알 수 없는 토큰 → null (호출자가 명시 에러 처리).
 */
function resolveRelative(token: string): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay(); // 0=Sun ... 6=Sat
  const monOffset = day === 0 ? -6 : 1 - day;
  const thisMon = new Date(today);
  thisMon.setDate(today.getDate() + monOffset);

  const WEEKDAY_OFFSET: Record<string, number> = {
    monday: 0,
    tuesday: 1,
    wednesday: 2,
    thursday: 3,
    friday: 4,
    saturday: 5,
    sunday: 6,
  };

  const match = token.match(/^(this|next|after-next)-week-(\w+)$/);
  if (!match) return null;
  const weekKey = match[1]!;
  const wdName = match[2]!;
  const wd = WEEKDAY_OFFSET[wdName];
  if (wd === undefined) return null;
  const weekShift = weekKey === 'this' ? 0 : weekKey === 'next' ? 7 : 14;
  const target = new Date(thisMon);
  target.setDate(thisMon.getDate() + weekShift + wd);
  return target.toISOString().slice(0, 10);
}
```

- [ ] **Step 3: 비교 분기에 `specificDateRelative` 추가 (line ~209 부근)**

기존 `specificDateExact` 비교 블록:

이전:
```ts
  if (c.expect.specificDateExact !== undefined) {
    if (reply.specificDate !== c.expect.specificDateExact) {
      fails.push(
        `specificDate: expected ${c.expect.specificDateExact}, got ${reply.specificDate ?? 'null'}`,
      );
    }
  }
```

수정 후 (relative 우선, exact fallback):
```ts
  if (c.expect.specificDateRelative !== undefined) {
    const expected = resolveRelative(c.expect.specificDateRelative);
    if (expected === null) {
      fails.push(
        `specificDateRelative: unknown token ${c.expect.specificDateRelative}`,
      );
    } else if (reply.specificDate !== expected) {
      fails.push(
        `specificDate: expected ${expected} (from ${c.expect.specificDateRelative}), got ${reply.specificDate ?? 'null'}`,
      );
    }
  } else if (c.expect.specificDateExact !== undefined) {
    if (reply.specificDate !== c.expect.specificDateExact) {
      fails.push(
        `specificDate: expected ${c.expect.specificDateExact}, got ${reply.specificDate ?? 'null'}`,
      );
    }
  }
```

- [ ] **Step 4: typecheck**

```bash
cd apps/bff && pnpm typecheck
```

Expected: 0 신규 errors (pre-existing 7 그대로).

- [ ] **Step 5: (선택) 단위 검증 생략 — Task 9 의 chat-eval 통합 실행에서 종합 검증**

resolveRelative 의 정확성은 Task 9 의 chat-eval 실행 (잔존 2건 + 신규 4건 의 specificDateRelative 케이스 PASS 여부) 으로 종합 확인. 별도 inline test 는 Bash heredoc escape 복잡해 생략.

만약 단위 단계에서 의심되면 chat-eval.ts 안의 resolveRelative 를 직접 호출하는 작은 sanity 스크립트 추가 가능 — 본 plan 에서는 생략.

- [ ] **Step 6: Commit**

```bash
git add apps/bff/src/jobs/chat-eval.ts
git commit -m "feat(bff): chat-eval specificDateRelative 동적 토큰 + resolveRelative helper"
```

---

## Task 8: `chat-eval-cases.json` 잔존 2건 동적화 + 신규 4건

**Files:**
- Modify: `apps/bff/src/jobs/chat-eval-cases.json`

- [ ] **Step 1: 잔존 2건 `specificDateExact` → `specificDateRelative` 교체**

`apps/bff/src/jobs/chat-eval-cases.json` 의 두 케이스:

이전 (specific-date-saturday-this-week):
```json
{
  "id": "specific-date-saturday-this-week",
  "messages": [{ "role": "user", "text": "이번 주 토요일 야외 행사" }],
  "expect": {
    "filters": { "vibes": ["활동적"] },
    "specificDateExact": "2026-04-25",
    "referencesLast": false
  }
}
```

수정 후:
```json
{
  "id": "specific-date-saturday-this-week",
  "messages": [{ "role": "user", "text": "이번 주 토요일 야외 행사" }],
  "expect": {
    "filters": { "vibes": ["활동적"] },
    "specificDateRelative": "this-week-saturday",
    "referencesLast": false
  }
}
```

이전 (specific-date-next-sunday):
```json
{
  "id": "specific-date-next-sunday",
  "messages": [{ "role": "user", "text": "다음주 일요일에 갈 만한 거" }],
  "expect": {
    ...
    "specificDateExact": "2026-05-03",
    "referencesLast": false
  }
}
```

수정 후 (`specificDateExact` → `specificDateRelative: "next-week-sunday"`).

- [ ] **Step 2: cases 배열 끝에 신규 4건 append**

`"cases": [` 배열 마지막 entry 뒤에 콤마 추가 후 4 객체 삽입:

```json
    {
      "id": "specific-date-after-next-saturday",
      "messages": [{ "role": "user", "text": "다다음주 토요일 페스티벌" }],
      "expect": {
        "filters": { "eventTypes": ["festival"] },
        "specificDateRelative": "after-next-week-saturday",
        "referencesLast": false
      }
    },
    {
      "id": "specific-date-md-explicit",
      "messages": [{ "role": "user", "text": "6월 15일 행사 있어?" }],
      "expect": {
        "specificDateExact": "2026-06-15",
        "referencesLast": false
      }
    },
    {
      "id": "specific-date-this-saturday-short",
      "messages": [{ "role": "user", "text": "이번 토요일 야외 행사" }],
      "expect": {
        "filters": { "vibes": ["활동적"] },
        "specificDateRelative": "this-week-saturday",
        "referencesLast": false
      }
    },
    {
      "id": "specific-date-coming-sunday",
      "messages": [{ "role": "user", "text": "오는 일요일 가족이랑 갈 곳" }],
      "expect": {
        "filters": { "companions": ["family"] },
        "specificDateRelative": "this-week-sunday",
        "referencesLast": false
      }
    }
```

- [ ] **Step 3: JSON validity 확인**

```bash
cd apps/bff && jq '.cases | length' src/jobs/chat-eval-cases.json
```

Expected: 기존 26 + 4 = 30.

```bash
cd apps/bff && jq '.cases | map(.id) | .[-4:]' src/jobs/chat-eval-cases.json
```

Expected:
```json
["specific-date-after-next-saturday","specific-date-md-explicit","specific-date-this-saturday-short","specific-date-coming-sunday"]
```

- [ ] **Step 4: Commit**

```bash
git add apps/bff/src/jobs/chat-eval-cases.json
git commit -m "test(bff): chat-eval specificDate 동적화 (잔존 2건 fix) + 신규 4건"
```

---

## Task 9: chat-eval 실행 + 회귀 확인

**Files:** (변경 없음, 검증만)

- [ ] **Step 1: services/llm 서버 재시작 (Task 2~6 의 코드 변경 reload)**

이전 task (LLM nationwide) 학습대로 services/llm 서버가 stale 코드면 fail. 재시작:

```bash
# Windows: port 8000 잡고 있는 PID 확인 + 종료
netstat -ano | grep ":8000.*LISTEN"
# 각 PID 에 대해: taskkill /F /PID <PID> (Windows) 또는 kill <PID> (Bash)
```

새 서버:
```bash
cd services/llm && pnpm exec dotenv -e ../../.env -- uvicorn app:app --port 8000 --reload &
sleep 5
curl -sS http://localhost:8000/health 2>&1 | head -3
```

Expected: `stage2-openai` 응답.

- [ ] **Step 2: chat-eval 실행 (30 cases)**

```bash
cd apps/bff && pnpm run chat:eval 2>&1 | tee /tmp/chat-eval-v3.log
```

Expected: 30 cases run. 이전 26 cases 의 잔존 2건 (specific-date-saturday-this-week / specific-date-next-sunday) 도 이번엔 PASS (specificDateRelative 적용).

- [ ] **Step 3: 결과 분석**

```bash
# specific-date 케이스만:
grep -E "specific-date" /tmp/chat-eval-v3.log | head -10
# 신규 4건:
grep -E "after-next|md-explicit|this-saturday-short|coming-sunday" /tmp/chat-eval-v3.log
# 전체 summary:
grep -E "^summary:" /tmp/chat-eval-v3.log
```

Expected:
- 잔존 2건 PASS
- 신규 4건 PASS (LLM + _coerce 합산 결과)
- 전체 ≥ 28/30 PASS (기타 24건 회귀 없음)

만약 신규 4건 일부 FAIL — services/llm 재시작 안 됐을 가능성. PID 다시 확인.

- [ ] **Step 4: (no commit — 검증만)**

---

## Task 10: 위키 메모 + 최종 점검

**Files:**
- Modify: `llm_wiki/wiki/topics/ai-enrichment.md`

- [ ] **Step 1: 위키 단락 추가**

`llm_wiki/wiki/topics/ai-enrichment.md` 의 직전 작업 (LLM nationwide) 에서 추가된 "## 채팅 프롬프트 전국 도메인" 단락 끝에 specificDate 보강 단락 추가:

```markdown

## specificDate 자가점검 강화 (2026-05-28, Slice A)

`_coerce_specific_date` 결정론 트리거 어휘 확장 + SYSTEM_PROMPT 자가점검 룰 보강 + chat-eval 케이스 동적화.

- 정규식 분리/추가: `_NEXT_WEEK_WD_RE` lookbehind `(?<!다)` 로 다다음 충돌 차단, `_AFTER_NEXT_WEEK_WD_RE` 신규 (+14일), `_THIS_WD_SHORT_RE` "이번/오는 X요일" 단축형, `_MD_DATE_RE` "MM월 DD일"·"M/D" 명시.
- `_coerce_specific_date(user_text, current, today=None)` 시그니처 — `today` optional 로 결정론 테스트 가능.
- `_FEWSHOT` specificDate 케이스 3건 추가 — 다다음주 토 / MM월 DD일 / 이번 토 단축. 총 17건.
- SYSTEM_PROMPT `[specificDate 자가 점검]` 2 룰 추가 — MM월 DD일·M/D 채움 강제, 다다음주 ↔ 다음주 헷갈림 차단.
- chat-eval-cases 의 stale 하드코드 날짜 (4월 작성) 2건 → `specificDateRelative` 동적 토큰 (`this-week-saturday` 등). 신규 회귀 4건 (다다음주·MM월DD일·이번 토·오는 일).
- 단위 검증: `services/llm/scripts/check-coerce-date.py` 16 cases 결정론 (fake today=2026-05-25 월요일).
```

- [ ] **Step 2: 최종 점검 — check-coerce-date 전체 PASS**

```bash
python3 services/llm/scripts/check-coerce-date.py
```

Expected: `Total: 16 pass, 0 fail` (exit 0).

- [ ] **Step 3: Python import + typecheck**

```bash
cd services/llm && python -c "import openai_chain, filters; print('LLM OK')"
cd apps/bff && pnpm typecheck 2>&1 | tail -5
```

Expected: LLM OK + BFF 0 신규 errors.

- [ ] **Step 4: 잔존 stale 날짜 grep**

```bash
grep -n '"2026-04-25"\|"2026-05-03"' apps/bff/src/jobs/chat-eval-cases.json 2>&1
```

Expected: 0 매치 (둘 다 specificDateRelative 로 교체됨).

- [ ] **Step 5: Commit (위키 + 검증 단계 — 메모만)**

```bash
git add llm_wiki/wiki/topics/ai-enrichment.md
git commit -m "docs(wiki): ai-enrichment specificDate 자가점검 보강 메모"
```

---

## Definition of Done

- [ ] `services/llm/scripts/check-coerce-date.py` 16 cases 전체 PASS (exit 0)
- [ ] `_coerce_specific_date` 시그니처 `today: date | None = None` (결정론)
- [ ] 정규식 4개 신규/분리 (`_AFTER_NEXT_WEEK_WD_RE`, `_THIS_WD_SHORT_RE`, `_MD_DATE_RE`, `_NEXT_WEEK_WD_RE` lookbehind)
- [ ] `_FEWSHOT` 17건 (기존 14 + 신규 3)
- [ ] SYSTEM_PROMPT `[specificDate 자가 점검]` 2 룰 추가
- [ ] `chat-eval.ts` `specificDateRelative` + `resolveRelative` helper
- [ ] `chat-eval-cases.json` 30 cases — 잔존 2건 동적화 + 신규 4건
- [ ] `chat-eval` 30 cases 회귀 — 잔존 2건 PASS + 신규 4건 PASS + 기타 24건 변동 없음
- [ ] 위키 ai-enrichment 메모
- [ ] `grep "2026-04-25\|2026-05-03" chat-eval-cases.json` 0 매치
- [ ] `pnpm --filter bff typecheck` 0 신규 errors
