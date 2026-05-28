---
title: specificDate 자가점검 강화 (Slice A)
created: 2026-05-28
status: draft → user-review
owner: LLM Agent (주) + Backend Agent
related:
  - docs/superpowers/specs/2026-05-28-llm-prompt-nationwide-domain-design.md
  - services/llm/openai_chain.py
  - apps/bff/src/jobs/chat-eval.ts
  - apps/bff/src/jobs/chat-eval-cases.json
---

# specificDate 자가점검 강화 설계서

## 1. 배경

채팅 `/chat` 의 `specificDate` 추출은 두 layer:

1. **LLM stage** — `SYSTEM_PROMPT_TEMPLATE` 의 `[specificDate]` + `[specificDate 자가 점검]` 룰 + `_today_context()` 표 + `_FEWSHOT` 14건. 모델이 ISO 채움.
2. **결정론적 보정** — `_coerce_specific_date` (`openai_chain.py:361`) 가 user 발화에서 명시 트리거 ("다음주 X요일", "이번주 X요일", "내일") 를 정규식으로 잡아 ISO 강제 override.

현 상태에서 4 가지 갭:

1. **`다다음 주` 정규식 버그** — `_NEXT_WEEK_WD_RE = re.compile(r"(?:다음\s*주|담주|다다음\s*주|...)")` 가 "다다음주 일" 도 다음주 일로 계산. +14일 분기 없음.
2. **트리거 어휘 좁음** — "다음 토요일" (다음주 prefix 없음), "이번 토요일" (이번주 prefix 없음), "오는 일요일", "MM월 DD일", "M/D" 미커버. 모델이 ISO 채우면 통과, 누락하면 null 유지.
3. **`_FEWSHOT` 다양성 부족** — 14건 중 specificDate 사용 케이스 3건 (한강 4/25, 다음주 일 5/3, 다음주 토 5/2). "다다음주", "MM월 DD일", "이번 토요일" 표현 없음.
4. **chat-eval-cases 잔존 2건 FAIL** — `specific-date-saturday-this-week` 의 `specificDateExact: "2026-04-25"`, `specific-date-next-sunday` 의 `"2026-05-03"`. 4월 말 작성 시점 기준 stale. 코드 (`_coerce`) 는 정확히 동작 중 — 케이스 데이터 결함.

본 spec 은 LLM stage 자가점검 룰 보강 + 결정론적 보정 트리거 어휘 확장 + eval 케이스 동적화로 specificDate 추출 정확도를 측정 가능하게 끌어올린다.

## 2. 스코프

포함:

- `_coerce_specific_date` 트리거 확장 (다다음주 fix, 이번/오는 X요일, MM월 DD일·M/D)
- `_NEXT_WEEK_WD_RE` 정규식 분리 (다음주 vs 다다음주)
- `_FEWSHOT` specificDate 표현 다양화 신규 2-3건
- `SYSTEM_PROMPT_TEMPLATE [specificDate 자가 점검]` 섹션 보강 (MM월 DD일, 다다음주 룰 명시)
- `chat-eval-cases.json` 잔존 2건 → `specificDateRelative` 의미 토큰 형태로 동적화
- `chat-eval.ts` 에 `specificDateRelative` helper + 비교 로직 추가
- 신규 회귀 케이스 4-5건 (다다음주 X / MM월 DD일 / 이번 토요일 / 오는 일)

제외:

- "X일 뒤", "이번 달 말", "월말", "주중" 같은 더 모호 표현 (별도 후속)
- 자연어 날짜 라이브러리 (`dateparser` 등) 도입 — 의존성 ↑
- 다국어 (영어 "next saturday" 등) — 한국어만
- 음력·휴일 기반 표현 ("설날", "추석") — 별도 도메인

## 3. 아키텍처 변경 맵

```
services/llm/openai_chain.py
  - _NEXT_WEEK_WD_RE 분리:
    · _NEXT_WEEK_WD_RE = r"(?:다음\s*주|담주|next\s*week)\s*[ ,]*([월화수목금토일])(?:요일)?"  (다다음 제거)
    · _AFTER_NEXT_WEEK_WD_RE = r"다다음\s*주\s*[ ,]*([월화수목금토일])(?:요일)?"  (신규)
  - _THIS_WEEK_WD_RE — 변경 없음
  - _THIS_WD_SHORT_RE = r"(?<![가-힣])(?:이번|오는)\s*([월화수목금토일])(?:요일)?"  (신규, "이번 토요일"·"오는 일")
  - _MD_DATE_RE = r"(?<!\d)(\d{1,2})월\s*(\d{1,2})일|(?<!\d)(\d{1,2})/(\d{1,2})(?!\d)"  (신규)
  - _coerce_specific_date 본문:
    + 다다음주 분기: this_mon + timedelta(days=14 + wd)
    + this_wd_short: 이번주 X요일 alias
    + md_date: date(today.year, m, d), 오늘 이전이면 year+1
  - _FEWSHOT 신규 2-3건 (다다음주 토 / 6월 15일 / 이번 토요일)
  - SYSTEM_PROMPT_TEMPLATE [specificDate 자가 점검] — 2 줄 추가

apps/bff/src/jobs/chat-eval-cases.json
  - 기존 2건 specificDateExact → specificDateRelative ("this-week-saturday" / "next-week-sunday")
  - 신규 4-5건: 다다음주 토 / 6월 15일 / 이번 토요일 / 오는 일

apps/bff/src/jobs/chat-eval.ts
  - specificDateRelative 필드 추가 (`expect.specificDateRelative?: string`)
  - resolveRelative(token: string): string 헬퍼 (오늘 기준 ISO 계산)
  - 비교 로직: specificDateRelative 우선 → 없으면 specificDateExact 기존 그대로
```

## 4. 컴포넌트 상세

### 4.1 `_coerce_specific_date` 트리거 확장

**다다음주 별도 분기** (BUG fix):

이전 `_NEXT_WEEK_WD_RE` 가 "다음주"와 "다다음주" 둘 다 매칭. 분리:

```python
_NEXT_WEEK_WD_RE = _re_date.compile(
    r"(?<!다)(?:다음\s*주|담주|next\s*week)\s*[ ,]*([월화수목금토일])(?:요일)?"
)
# (?<!다) lookbehind 로 "다다음" 안의 "다음" 매칭 차단.
_AFTER_NEXT_WEEK_WD_RE = _re_date.compile(
    r"다다음\s*주\s*[ ,]*([월화수목금토일])(?:요일)?"
)
```

`_coerce_specific_date` 본문에 분기 추가 (다다음 우선, 그 다음 다음):

```python
m = _AFTER_NEXT_WEEK_WD_RE.search(user_text)
if m:
    wd = _KO_WD_INDEX.get(m.group(1))
    if wd is not None:
        this_mon = today - timedelta(days=today.weekday())
        target = this_mon + timedelta(days=14 + wd)  # +14 = 다다음주
        return target.isoformat()
m = _NEXT_WEEK_WD_RE.search(user_text)
# ... 기존 +7 로직
```

**"이번/오는 X요일" alias** — "이번 토요일", "오는 일요일" 같은 주 prefix 생략 발화:

```python
_THIS_WD_SHORT_RE = _re_date.compile(
    r"(?<![가-힣다])(?:이번|오는)\s*([월화수목금토일])(?:요일)?(?!\s*주)"
)
# (?<![가-힣다]) "이번주", "다다음" 같은 더 긴 표현과 충돌 차단.
# (?!\s*주) "이번 주" 후속 매칭 차단.
```

`_THIS_WEEK_WD_RE` 매칭 안 됐을 때 fallback:

```python
m = _THIS_WD_SHORT_RE.search(user_text)
if m:
    wd = _KO_WD_INDEX.get(m.group(1))
    if wd is not None:
        this_mon = today - timedelta(days=today.weekday())
        target = this_mon + timedelta(days=wd)
        return target.isoformat()
```

**"MM월 DD일" 또는 "M/D" 명시 날짜**:

```python
_MD_DATE_RE = _re_date.compile(
    r"(?<!\d)(?:(\d{1,2})\s*월\s*(\d{1,2})\s*일|(\d{1,2})/(\d{1,2}))(?!\d)"
)

m = _MD_DATE_RE.search(user_text)
if m:
    m_str = m.group(1) or m.group(3)
    d_str = m.group(2) or m.group(4)
    try:
        month = int(m_str)
        day = int(d_str)
        if 1 <= month <= 12 and 1 <= day <= 31:
            year = today.year
            candidate = date(year, month, day)
            if candidate < today:
                candidate = date(year + 1, month, day)
            return candidate.isoformat()
    except ValueError:
        pass  # 잘못된 날짜 (예: 2월 30일) → skip, current 유지
```

순서: 다다음주 → 다음주 → 이번주 (정식) → 이번/오는 (단축) → MM월DD일 → 내일 → current.

### 4.2 `_FEWSHOT` 신규 케이스

기존 14건 유지. 신규 2-3건 추가:

```
- "다다음주 토요일 페스티벌" (다다음주 — 컨텍스트 표 + 7일):
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

(specificDate 의 동적 날짜 표기는 기존 fewshot 패턴 동일 — `※ 가정` 라인으로 명시.)

### 4.3 SYSTEM_PROMPT `[specificDate 자가 점검]` 보강

이전 (line 216-219 부근):
```
- reply 텍스트에 "(M/D)" 또는 "M월 D일" 같은 단일 날짜를 적었다면 → 동일한 날짜를 specificDate 에 ISO 로도 채울 것. reply 와 specificDate 가 다른 값을 가리키면 안 됨.
- 사용자 발화에 "다음주" + 요일이 있으면 specificDate 는 절대 null 이면 안 됨. 컨텍스트 표를 다시 보고 채울 것.
- "다음주 X요일" 입력 시 periodKey 는 "tomorrow" 로 설정하지 말 것 (다음주는 내일이 아님). periodKey 는 빈 값 또는 "week" 가능.
```

수정 후 (2 룰 추가):
```
- reply 텍스트에 "(M/D)" 또는 "M월 D일" 같은 단일 날짜를 적었다면 → 동일한 날짜를 specificDate 에 ISO 로도 채울 것. reply 와 specificDate 가 다른 값을 가리키면 안 됨.
- 사용자 발화에 "다음주" + 요일이 있으면 specificDate 는 절대 null 이면 안 됨. 컨텍스트 표를 다시 보고 채울 것.
- 사용자 발화에 "MM월 DD일" 또는 "M/D" 명시가 있으면 specificDate = 그 해의 해당 날짜 ISO. 오늘 이전이면 다음해. 절대 null 두지 말 것.
- 사용자 발화에 "다다음주 X요일" 이 있으면 specificDate = 컨텍스트 표 의 "'다음주 X'" 값 + 7일. 다음주 X요일과 헷갈리지 말 것.
- "다음주 X요일" 입력 시 periodKey 는 "tomorrow" 로 설정하지 말 것 (다음주는 내일이 아님). periodKey 는 빈 값 또는 "week" 가능.
```

### 4.4 `chat-eval-cases.json` 잔존 2건 동적화

이전:
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

`specific-date-next-sunday` 도 동일 패턴 — `specificDateRelative: "next-week-sunday"`.

기존 `specificDateExact` 필드는 유지 — 다른 절대 날짜 케이스 (예: 4/15 명시 발화) 용. 본 spec 에서는 신규 필드 추가만, 기존 호환.

### 4.5 `chat-eval.ts` resolveRelative helper

`apps/bff/src/jobs/chat-eval.ts` 의 expectation 비교 단계 (현 line 209 `c.expect.specificDateExact` 분기 근처) 에 추가:

```ts
function resolveRelative(token: string): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay(); // 0=Sun ... 6=Sat
  const monOffset = day === 0 ? -6 : 1 - day;
  const thisMon = new Date(today);
  thisMon.setDate(today.getDate() + monOffset);

  const toIso = (d: Date) => d.toISOString().slice(0, 10);

  const WEEKDAY_OFFSET: Record<string, number> = {
    monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
    friday: 4, saturday: 5, sunday: 6,
  };

  const match = token.match(/^(this|next|after-next)-week-(\w+)$/);
  if (!match) return null;
  const [, weekKey, wdName] = match;
  const wd = WEEKDAY_OFFSET[wdName!];
  if (wd === undefined) return null;
  const weekShift = weekKey === 'this' ? 0 : weekKey === 'next' ? 7 : 14;
  const target = new Date(thisMon);
  target.setDate(thisMon.getDate() + weekShift + wd);
  return toIso(target);
}
```

기존 specificDateExact 비교 직전에 분기:

이전:
```ts
if (c.expect.specificDateExact !== undefined) {
  if (reply.specificDate !== c.expect.specificDateExact) {
    fails.push(...);
  }
}
```

수정 후:
```ts
if (c.expect.specificDateRelative !== undefined) {
  const expected = resolveRelative(c.expect.specificDateRelative);
  if (expected === null) {
    fails.push(`specificDateRelative: unknown token ${c.expect.specificDateRelative}`);
  } else if (reply.specificDate !== expected) {
    fails.push(`specificDate: expected ${expected} (from ${c.expect.specificDateRelative}), got ${reply.specificDate ?? 'null'}`);
  }
} else if (c.expect.specificDateExact !== undefined) {
  if (reply.specificDate !== c.expect.specificDateExact) {
    fails.push(`specificDate: expected ${c.expect.specificDateExact}, got ${reply.specificDate ?? 'null'}`);
  }
}
```

`Case` 타입에 신규 필드 추가:

이전:
```ts
expect: {
  ...
  specificDateExact?: string;
  ...
}
```

수정 후:
```ts
expect: {
  ...
  specificDateExact?: string;
  /** 동적 토큰 — today 기준 ISO 계산 후 비교. 예: "this-week-saturday", "next-week-sunday", "after-next-week-saturday". */
  specificDateRelative?: string;
  ...
}
```

### 4.6 신규 회귀 케이스 4건

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

## 5. 데이터 흐름 (변경 없음)

```
User 발화 → BFF /chat → services/llm /chat
  → openai_chain.extract_via_openai
    → LLM 응답: { specificDate, ... }
  → _coerce_specific_date(user_text, llm_specificDate)  ← 확장된 트리거
    → user 발화에 명시 트리거 매칭 → 그 값 우선 (override)
    → 매칭 없으면 LLM 값 유지
  → BFF chat.ts 가 specificDate 를 events 검색에 사용
```

## 6. 에러 처리

- `_MD_DATE_RE` 매칭 후 `date(year, m, d)` 잘못된 날짜 (2월 30일 등) → `ValueError` → 본 fix 에서 current 유지 (LLM 값 또는 null).
- `_AFTER_NEXT_WEEK_WD_RE` 매칭에 lookbehind 가 의도대로 동작 안 하면 (정규식 엔진 차이) → 다음주로 fallback (현 동작과 동일). Python re 엔진은 lookbehind 지원이라 OK.
- chat-eval `specificDateRelative` 의 알 수 없는 토큰 → 명확한 에러 메시지 (`unknown token ...`) — fail 처리.

## 7. 테스트

### 7.1 단위 (services/llm)

`services/llm/scripts/check-coerce-date.py` 신규 — `_coerce_specific_date` 케이스 검증:

```python
# 케이스 (오늘=Mon 2026-05-25 가정):
("이번 주 토요일 야외", None, "2026-05-30"),       # this-week-saturday
("다음주 일요일 가자", None, "2026-06-07"),         # next-week-sunday
("다다음주 토요일 페스티벌", None, "2026-06-13"),    # after-next-saturday
("이번 토요일 행사", None, "2026-05-30"),           # short alias
("오는 일요일", None, "2026-05-31"),                # short alias
("6월 15일", None, "2026-06-15"),                  # MD format
("6/15 행사", None, "2026-06-15"),                 # M/D format
("2월 30일", None, None),                          # invalid date — current 유지
("내일", None, "2026-05-26"),                       # tomorrow
("아무 내용", None, None),                          # no trigger
```

스크립트는 `date.today()` 를 monkey-patch 또는 pytest freeze 로 deterministic 화. 가장 단순: 함수 시그니처에 `_today_override` 추가 또는 환경변수 `COERCE_DATE_TODAY_OVERRIDE`. 본 spec 에서는 단순화 — script 안에 fake `today` 받는 helper 함수.

대안: `_coerce_specific_date` 시그니처에 `today: date | None = None` 추가 (default date.today()). 운영 무영향, 테스트 결정론 확보.

### 7.2 통합 (chat-eval)

- 기존 26건 + 신규 4건 = 30건.
- `chat-eval` 실행 — 잔존 2건 (이번주 토 / 다음주 일) PASS 회귀.
- 신규 4건 (다다음주 토 / 6월 15일 / 이번 토요일 / 오는 일) PASS.

### 7.3 수동 spot

- "이번 토요일 야외" → specificDate = 이번주 토 ISO
- "다다음주 일 강릉" → specificDate = 이번주 월 + 14 + 일 offset
- "6/15 가족 행사" → specificDate = 2026-06-15

## 8. 롤백 정책

순수 정규식 + helper 추가 + 케이스 데이터 변경. `git revert` 만으로 OK. 다만 `chat-eval-cases.json` 의 `specificDateExact` → `specificDateRelative` 변경은 revert 시 기존 4월 stale 값으로 복귀 (재 FAIL). 운영 무관.

## 9. 비용 영향

| 항목 | 변경 |
|---|---|
| SYSTEM_PROMPT input tokens | +30~50 (자가점검 2 룰 추가) |
| _FEWSHOT input tokens | +120~180 (신규 2-3건) |
| chat 호출 당 input | ~+200 tokens |
| 비용 변동 | 무관 ($0.0001 미만/호출) |

## 10. 영향 받는 파일

신규:
- `docs/superpowers/specs/2026-05-28-specific-date-self-check-design.md` (본 spec)
- `services/llm/scripts/check-coerce-date.py` (단위 검증)

수정:
- `services/llm/openai_chain.py` — `_NEXT_WEEK_WD_RE` 분리, `_AFTER_NEXT_WEEK_WD_RE` / `_THIS_WD_SHORT_RE` / `_MD_DATE_RE` 신규, `_coerce_specific_date` 분기, `_FEWSHOT` 2-3건, SYSTEM_PROMPT [specificDate 자가 점검] 2 룰
- `apps/bff/src/jobs/chat-eval.ts` — `Case.expect.specificDateRelative` 신규 필드, `resolveRelative` helper, 비교 분기
- `apps/bff/src/jobs/chat-eval-cases.json` — 잔존 2건 동적화, 신규 4건 추가

미변경:
- BFF `chat.ts` 라우트 — LLM 응답 shape 무관 (specificDate ISO string 그대로)
- `_today_context()` — 이미 풍부함, 추가 없음
- `compose_retreat`, `judge_relevance`, `summarize_event` — 무관

## 11. 오픈 아이템

- **`_coerce_specific_date` 결정론 테스트 시그니처**: `today: date | None = None` 추가 vs 환경변수 — 구현 단계에서 선택. 권장: 시그니처 파라미터 (호출처 영향 0, 기본값 유지).
- **`_AFTER_NEXT_WEEK_WD_RE` lookbehind 미사용**: Python re 의 lookbehind 가 가변 길이 안 됨 — `다다음 주` 는 `다다음\s*주` 라 고정 길이 패턴 가능. OK.
- **"다음 토요일" (주 prefix 없음, "이번/오는" 도 없음) 단순 발화**: 본 spec 에서 미커버. 모델 출력 의존. 추후 모니터링 결과로 룰 추가 결정.
- **`specificDateRelative` 토큰 형식**: `this-week-saturday` / `next-week-sunday` / `after-next-week-saturday` 가 최종. 다른 표현은 신규 추가 시점에 확장.
