---
title: 다중 턴 처리 심화 — intent shift + referencesLast (Slice B)
created: 2026-05-29
status: draft → user-review
owner: LLM Agent (주) + Backend Agent
related:
  - docs/superpowers/specs/2026-05-28-llm-prompt-nationwide-domain-design.md
  - docs/superpowers/specs/2026-05-28-specific-date-self-check-design.md
  - services/llm/openai_chain.py
  - apps/bff/src/routes/chat.ts
  - apps/bff/src/jobs/chat-eval-cases.json
---

# 다중 턴 처리 심화 설계서 (Slice B)

## 1. 배경

채팅 `/chat` 의 두 다중 턴 메커니즘:

1. **Intent shift (의도 변경)**: 사용자가 이전 턴의 axis 일부를 부정·교체 ("가족 말고 친구랑", "축제 말고 전시"). 현재 `SYSTEM_PROMPT_TEMPLATE` 의 `[추출 규칙 — filters]` 에 "말고/빼고/아니/대신/바꿔" 신호 룰 있고 `_FEWSHOT` 1건 (`"가족 말고 친구랑"`) 존재.
2. **referencesLast (직전 제안 지칭)**: 사용자 발화가 직전 N 건 제안을 명시·묵시적으로 가리킴 ("그 중에 주말만", "2번째 전시 어디서 해?"). `[referencesLast — 불리언]` 룰 + `_FEWSHOT` 2건. BFF `chat.ts:406` 의 `useGrounded = referencesLast===true && lastSuggestions.length>0` 로 `groundedRerank` 분기.

이전 chat-eval 30 cases 중 두 영역 관련 4건만 (`multi-turn-intent-change-companion`, `intent-negation`, `grounded-narrow-to-weekend`, `grounded-which-one`) — 모두 PASS 하지만 **다양성·edge case 부족**:

**Intent shift 약점**:
- 카테고리 변경 ("축제 말고 전시") — fewshot 없음
- 지역 변경 (서울 자치구 / sido 단위) — fewshot 없음
- 전체 리셋 ("다 빼고 다시", "처음부터") — fewshot 없음
- 다중 부정 ("가족 말고, 주말도 말고") — fewshot 없음 (본 spec 우선순위 외)

**referencesLast 약점**:
- fewshot 2건 모두 "그 중 X" / "N번째" 패턴
- 시간 표현 prefix ("아까 본", "방금 그", "조금 전") — 미커버
- `referencesLast=true` + 새 axis 동시 ("그 중에 가족도 OK") — `groundedRerank` 가 새 axis 사후 필터링하는지 미검증
- 입력에 `[직전 제안]` 블록 비어있을 때 `referencesLast=false` 강제 룰 미명시

본 spec 은 fewshot 6건 추가 + SYSTEM_PROMPT 룰 2 (intent shift) + 2 (referencesLast) 보강 + groundedRerank 새 axis 사후 필터 보강 + chat-eval 회귀 6건으로 다중 턴 처리 정확도를 측정 가능하게 끌어올린다.

## 2. 스코프

포함:

- `_FEWSHOT` 신규 6건 (intent shift 4 + referencesLast 2)
- SYSTEM_PROMPT `[추출 규칙 — filters]` 다중 턴 룰 — 축 단위 부정 + 전체 리셋 명시
- SYSTEM_PROMPT `[referencesLast — 불리언]` 보강 — lastSuggestions 빈 입력 + 새 axis 동시 처리
- `apps/bff/src/routes/chat.ts` `groundedRerank` 새 axis 사후 필터 (필요 시 — plan 단계에서 코드 read 후 결정)
- `chat-eval-cases.json` 신규 6건 회귀

제외:

- 다중 부정 ("가족 말고, 주말도 말고") — 다중 부정 신호 룰. 별도 후속.
- 의도 모호 케이스 분류기 (referencesLast 자가 점검 루프) — 별도 후속
- 다국어 (영어 발화) — 한국어만
- Slice C: 자연어 파싱 의미 매핑 (vibes/eventTypes 사전) — 별도 spec

## 3. 아키텍처 변경 맵

```
services/llm/openai_chain.py
  - _FEWSHOT (line 84~252) — 17 → 23 (신규 6건 끝에 append)
    · intent shift 4건: 카테고리/지역/sido/전체 리셋
    · referencesLast 2건: 시간 표현 (아까 본) + 새 axis 동시 (그 중에 가족도)
  - SYSTEM_PROMPT_TEMPLATE [추출 규칙 — filters] (line ~195~204) — 2 줄 추가
    · 축 단위 부정 처리 명시
    · 전체 리셋 신호 처리
  - SYSTEM_PROMPT_TEMPLATE [referencesLast — 불리언] (line ~221~229) — 2 줄 추가
    · [직전 제안] 블록 비면 false 강제
    · 새 axis 동시 추출 처리 — filters 에 새 axis 포함

apps/bff/src/routes/chat.ts
  - groundedRerank (line 906~) — plan 단계에서 코드 read 후 결정:
    · (a) 이미 새 axis 사후 필터 — 변경 불필요
    · (b) LLM rerank 만 — 후속 filter 보강 (filterByFilters 헬퍼 추가)

apps/bff/src/jobs/chat-eval-cases.json — 6건 추가 (30 → 36)
```

## 4. 컴포넌트 상세

### 4.1 `_FEWSHOT` 신규 6건

플랫폼은 직전 LLM nationwide + specificDate Slice A 적용 후 fewshot 17건. 본 spec 끝에 6건 append → 23건.

**Intent shift 4건**:

```
- (직전 턴 "이번 주말 축제 추천해줘" 후) "축제 말고 전시":
  {
    filters: {eventTypes:["exhibition"], periodKey:"weekend"},
    specificDate: null,
    referencesLast: false,
    reply: "축제 조건은 빼고 전시로 바꿔서 이번 주말 기준 다시 추려봤어요.",
    followups: ["공연도 함께", "야간 운영만", "가족이랑은"]
  }

- (직전 턴 "강남구 데이트" 후) "강남구 말고 마포구":
  {
    filters: {regionHints:["마포구"], companions:["couple"]},
    specificDate: null,
    referencesLast: false,
    reply: "강남구 조건은 빼고 마포구 · 연인 동행 기준으로 다시 찾아봤어요.",
    followups: ["전시 위주", "야간 운영만", "주말로"]
  }

- (직전 턴 "부산 가족 축제" 후) "부산 말고 서울로":
  {
    filters: {regionHints:["서울"], companions:["family"], eventTypes:["festival"]},
    specificDate: null,
    referencesLast: false,
    reply: "부산 조건은 빼고 서울 · 가족 · 축제 기준으로 다시 찾아봤어요.",
    followups: ["전시도 함께", "이번 주말로", "혼자 가도 좋은 거"]
  }

- (직전 턴 "강남 연인 잔잔 전시" 후) "다 빼고 다시 보여줘":
  {
    filters: {},
    specificDate: null,
    referencesLast: false,
    reply: "이전 조건은 다 비우고 다시 시작할게요. 종류·동행·지역 중 좁히고 싶은 게 있으면 알려주세요.",
    followups: ["이번 주말 행사", "가족이랑", "전시 위주"]
  }
```

**referencesLast 2건**:

```
- (직전 제안 5건 후) "아까 본 거 중에 가족도 OK 인 거":
  {
    filters: {companions:["family"]},
    specificDate: null,
    referencesLast: true,
    reply: "방금 본 다섯 건 중 가족 동행 가능한 일정으로 다시 추려봤어요.",
    followups: ["주말만", "전시도 함께", "다시 보여줘"]
  }

- (직전 제안 3건 후) "방금 그 전시 어디서 해?":
  {
    filters: {},
    specificDate: null,
    referencesLast: true,
    reply: "말씀하신 전시의 위치 정보는 상세 카드에서 확인하실 수 있어요. 여기에 같은 목록 다시 고정해둘게요.",
    followups: ["야간 운영만", "주말로", "다른 전시"]
  }
```

(referencesLast `"방금 그 전시"` 케이스는 기존 `"2번째 전시 어디서 해?"` 와 유사. 차이: 시간 표현 prefix 학습.)

### 4.2 SYSTEM_PROMPT `[추출 규칙 — filters]` 보강

이전 (line 195~204 부근 — 직전 작업 후 라인 이동 가능):
```
- 다중 턴: 이전 턴 + 이번 턴 의도 union.
- 최근 턴에 "말고/빼고/아니/대신/바꿔/그게 아니라/이번엔 다른" 등 의도 변경 신호가 있으면
  이전 턴 다중값 축은 무시하고 최근 턴만 반영.
- 부정+긍정 혼합("가족 말고 연인"): 부정값 제외 + 긍정값 포함.
- periodKey 단일값. 가장 최근 턴 우선.
```

수정 후 (2 줄 추가):
```
- 다중 턴: 이전 턴 + 이번 턴 의도 union.
- 최근 턴에 "말고/빼고/아니/대신/바꿔/그게 아니라/이번엔 다른" 등 의도 변경 신호가 있으면
  이전 턴 다중값 축은 무시하고 최근 턴만 반영.
- 부정+긍정 혼합("가족 말고 연인"): 부정값 제외 + 긍정값 포함.
- 축 단위 부정 ("축제 말고 전시", "강남구 말고 마포구") → 해당 축 (eventTypes/regionHints 등) 의 이전 턴 값 제거, 이번 턴 새 값 포함. 다른 축의 union 은 유지.
- 전체 리셋 신호 ("다 빼고", "처음부터", "다시 보여줘") → 이전 턴 union 전부 무시, 이번 턴 만 반영. filters 가 비어도 OK.
- periodKey 단일값. 가장 최근 턴 우선.
```

### 4.3 SYSTEM_PROMPT `[referencesLast — 불리언]` 보강

이전 (line 221~229 부근):
```
- 입력에 `[직전 제안]` 블록이 주어지고, 사용자 최근 발화가 그 목록을 명시적·묵시적으로
  가리키면 true. 그렇지 않으면 false.
- true 예: "그 중에 무료인 거 있어?", "아까 그 전시 언제까지야?", "2번째 이벤트는 어디야?",
  "방금 본 거 다 주말이야?", "그거 말고 다른 거".
- false 예: "이번 주말 가족 축제" (새 쿼리), "강남 공연" (새 축 추가).
- true 일 때 reply 는 직전 제안 목록 안에서 답하거나 (예: "그 중 A, B 두 건이 주말에
  진행돼요") / 모르는 축(가격·정원 등)은 "그 정보는 제 데이터에 없어요" 로 정직하게.
- 후보 id 를 reply 에 숫자나 eventId 로 드러내지 말 것 — "첫번째" 대신 "X 축제" 처럼 title 로 지칭.
```

수정 후 (2 줄 추가, 4번째·5번째 자리):
```
- 입력에 `[직전 제안]` 블록이 주어지고, 사용자 최근 발화가 그 목록을 명시적·묵시적으로
  가리키면 true. 그렇지 않으면 false.
- 입력에 `[직전 제안]` 블록이 없거나 비어있으면 referencesLast=false 강제. 이 경우 발화가 "그 중에" 같이 보여도 무시.
- true 일 때 사용자가 새 axis (companions/eventTypes/vibes/regionHints) 를 같이 언급했으면 filters 에 그 새 axis 도 포함 (예: "그 중에 가족도 OK" → referencesLast=true + filters.companions=["family"]). BFF 가 직전 제안 안에서 새 axis 로 필터.
- true 예: "그 중에 무료인 거 있어?", "아까 그 전시 언제까지야?", "2번째 이벤트는 어디야?",
  "방금 본 거 다 주말이야?", "그거 말고 다른 거".
- false 예: "이번 주말 가족 축제" (새 쿼리), "강남 공연" (새 축 추가).
- true 일 때 reply 는 직전 제안 목록 안에서 답하거나 (예: "그 중 A, B 두 건이 주말에
  진행돼요") / 모르는 축(가격·정원 등)은 "그 정보는 제 데이터에 없어요" 로 정직하게.
- 후보 id 를 reply 에 숫자나 eventId 로 드러내지 말 것 — "첫번째" 대신 "X 축제" 처럼 title 로 지칭.
```

### 4.4 `groundedRerank` 새 axis 사후 필터 — Plan 단계에서 결정

`apps/bff/src/routes/chat.ts:906~` 의 `groundedRerank` 함수 본문에서 다음 두 경우 분리:

- (a) **이미 새 axis 사후 필터함** — `filters` 매개변수가 들어와 events 메타로 사후 필터링 후 LLM rerank. 본 spec 변경 없음.
- (b) **LLM rerank 만 함** — `filters.companions` 같은 새 axis 가 와도 무시되거나 reason 문구로만 반영. 보강 필요:
  - `lastSuggestions` 를 events 메타 (companions·eventTypes·vibes·regionHints 등) 로 사후 필터 → 매칭된 부분집합만 rerank
  - 빈 부분집합이면 자연스러운 retreat reply ("말씀하신 조건에 해당하는 게 직전 목록엔 없네요")

Plan 단계에서 코드 read → 결정 후 task 추가/생략.

### 4.5 `chat-eval-cases.json` 신규 6건

```json
{
  "id": "intent-shift-category",
  "messages": [
    { "role": "user", "text": "이번 주말 축제 추천해줘" },
    { "role": "user", "text": "축제 말고 전시" }
  ],
  "expect": {
    "filters": { "eventTypes": ["exhibition"], "periodKey": "weekend" },
    "referencesLast": false
  }
},
{
  "id": "intent-shift-region-gu",
  "messages": [
    { "role": "user", "text": "강남구 데이트 좋은 곳" },
    { "role": "user", "text": "강남구 말고 마포구" }
  ],
  "expect": {
    "filters": { "regionHints": ["마포구"], "companions": ["couple"] },
    "referencesLast": false
  }
},
{
  "id": "intent-shift-sido",
  "messages": [
    { "role": "user", "text": "부산 가족 축제" },
    { "role": "user", "text": "부산 말고 서울로" }
  ],
  "expect": {
    "filters": { "regionHints": ["서울"], "companions": ["family"], "eventTypes": ["festival"] },
    "referencesLast": false
  }
},
{
  "id": "intent-shift-full-reset",
  "messages": [
    { "role": "user", "text": "강남 연인 잔잔한 전시" },
    { "role": "user", "text": "다 빼고 다시 보여줘" }
  ],
  "expect": {
    "filters": {},
    "referencesLast": false
  }
},
{
  "id": "references-last-new-axis",
  "messages": [
    { "role": "user", "text": "이번 주말 전시 추천해줘" },
    { "role": "assistant", "text": "이번 주말 전시 다섯 건 보여드릴게요." },
    { "role": "user", "text": "아까 본 거 중에 가족도 OK 인 거" }
  ],
  "expect": {
    "filters": { "companions": ["family"] },
    "referencesLast": true
  },
  "lastSuggestionsStub": 5
},
{
  "id": "references-last-where",
  "messages": [
    { "role": "user", "text": "한강 전시" },
    { "role": "assistant", "text": "한강 근처 전시 세 건 찾아왔어요." },
    { "role": "user", "text": "방금 그 전시 어디서 해?" }
  ],
  "expect": {
    "filters": {},
    "referencesLast": true
  },
  "lastSuggestionsStub": 3
}
```

**Multi-turn 표기**: `messages` 배열에 `user` + (가짜) `assistant` + `user` 순으로 자연 표기. assistant 응답은 시각적 컨텍스트 (실 평가엔 LLM 이 두 user 발화만 보고 분류). chat-eval 의 multi-turn 처리는 plan 단계 첫 task 에서 확인.

`lastSuggestionsStub: N` 신규 필드 — N 건의 가짜 lastSuggestions 를 평가 시 BFF 에 주입. 본 spec §4.6 에서 chat-eval.ts 변경 필요 여부 결정.

### 4.6 `chat-eval.ts` 변경 (필요 시)

- `references-last-*` 케이스는 `lastSuggestionsCount > 0` 컨텍스트 필요. chat-eval 이 `lastSuggestions` 가짜 데이터 주입 가능한지 확인.
- 만약 미지원 → 평가 코드에 fake `lastSuggestions` 주입 옵션 추가 (예: `expect.lastSuggestionsStub: number`).

Plan 단계에서 결정.

## 5. 데이터 흐름 (변경 없음)

```
User 발화 (n turn) → BFF /chat → services/llm /chat
  → openai_chain.extract_via_openai
    → SYSTEM_PROMPT 의 [추출 규칙] + [referencesLast] 룰 + _FEWSHOT 23건
    → 응답: { filters, specificDate, referencesLast, reply, followups }
  → BFF chat.ts:
    · useGrounded = referencesLast===true && lastSuggestions.length>0
    · useGrounded → groundedRerank({ lastSuggestions, userTexts, filters, specificDate })
    · 아니면 기존 hybrid 검색
  → groundedRerank: lastSuggestions 안에서 새 axis (filters) 로 사후 필터 → LLM rerank → reasons
```

## 6. 에러 처리

- LLM 이 `referencesLast=true` 반환했는데 lastSuggestions 빈 경우 → BFF `useGrounded=false` 로 fallback (기존 동작). 본 spec 의 SYSTEM_PROMPT 룰이 `referencesLast=false` 강제하도록 학습.
- LLM 이 새 axis 누락 (예: "그 중에 가족" 인데 companions 빈 배열) → groundedRerank 가 모든 lastSuggestions rerank → 부정확 결과. fewshot E 가 학습 보강.
- LLM 이 `다 빼고` 발화에 이전 turn union 잔존 → fewshot D 학습 + SYSTEM_PROMPT 룰.

## 7. 테스트

### 7.1 자동
- `chat-eval` 36 cases (기존 30 + 신규 6). 신규 6 PASS + 기존 4 다중 턴 관련 (intent-negation, multi-turn-intent-change-companion, grounded-narrow-to-weekend, grounded-which-one) 회귀 보호.

### 7.2 수동 spot
- "이번 주말 축제 추천해줘" → "축제 말고 전시" — eventTypes 교체 확인
- "강남구 데이트" → "강남구 말고 마포구" — regionHints 교체
- "부산 가족 축제" → "부산 말고 서울" — sido 교체
- "강남 연인 잔잔 전시" → "다 빼고 다시" — filters 비움
- 직전 5건 제안 후 → "아까 본 거 중에 가족도 OK" — referencesLast=true + companions=family
- 직전 3건 제안 후 → "방금 그 전시 어디서 해?" — referencesLast=true + reply 안내

## 8. 롤백 정책

- `_FEWSHOT` + SYSTEM_PROMPT 텍스트 변경 — `git revert` OK
- `chat-eval-cases.json` 추가 — revert 시 자동 사라짐
- `groundedRerank` (만약 변경 시) — 단위 정합성 우선, revert 시 옛 동작 복귀

## 9. 비용 영향

| 항목 | 변경 |
|---|---|
| SYSTEM_PROMPT input tokens | +50~80 (4 룰 추가) |
| _FEWSHOT input tokens | +400~500 (6 신규) |
| 호출 당 input | ~+500 tokens |
| 비용 변동 | ~$0.00002/호출, 무관 |

## 10. 영향 받는 파일

신규:
- `docs/superpowers/specs/2026-05-29-multi-turn-intent-references-design.md` (본 spec)

수정:
- `services/llm/openai_chain.py` — `_FEWSHOT` 6건 append, SYSTEM_PROMPT 2 + 2 룰
- `apps/bff/src/jobs/chat-eval-cases.json` — 6 케이스 추가
- (조건부) `apps/bff/src/routes/chat.ts` — `groundedRerank` 새 axis 사후 필터 보강
- (조건부) `apps/bff/src/jobs/chat-eval.ts` — fake `lastSuggestions` 주입 지원 (필요 시)
- `llm_wiki/wiki/topics/ai-enrichment.md` — 한 단락 추가 (다중 턴 처리 심화)

미변경 (확인 완료):
- `_today_context()` / `_coerce_specific_date` — 무관
- `compose_retreat` / `judge_relevance` / `rerank_candidates` / `summarize_event` / `classify_sentiment` — 무관

## 11. 오픈 아이템

- **`groundedRerank` 새 axis 사후 필터 — 현재 처리 방식**: Plan 단계 첫 task 에서 코드 read → (a) 변경 없음 또는 (b) 보강 결정. 결정 후 본 spec §4.4 업데이트.
- **`chat-eval.ts` multi-turn + lastSuggestions stub 지원**: 현재 형식 점검 → 케이스 JSON 표기 결정.
- **다중 부정 ("가족 말고, 주말도 말고")**: 본 spec 우선순위 외. 별도 후속 (Slice B 의 v2).
- **모호 케이스 분류기 (referencesLast 자가 점검 루프)**: 현재 SYSTEM_PROMPT 룰 만으로 학습. 실측 결과 정확도 부족 시 별도 후속.
