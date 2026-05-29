# 다중 턴 처리 심화 Implementation Plan (Slice B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** intent shift (카테고리/지역/sido/전체리셋) + referencesLast (시간 표현 / 새 axis 동시) 다양화 — `_FEWSHOT` 6 신규 + SYSTEM_PROMPT 4 룰 + `groundedRerank` 새 axis 사후 필터 보강 + chat-eval 회귀 6건.

**Architecture:** LLM stage (SYSTEM_PROMPT 룰 + fewshot) + BFF stage (`groundedRerank` 의 lastSuggestions 사후 필터링) 두 layer 보강. chat-eval 의 기존 `lastSuggestions` 필드 활용 (신규 필드 불필요).

**Tech Stack:** Python (services/llm), TypeScript (apps/bff), Prisma, OpenAI gpt-4o-mini.

---

## Plan Deviations from Spec

코드 read 결과로 확정된 spec open item:

1. **§4.4 `groundedRerank` 옵션** → **(b) 보강 진행** 확정. `chat.ts:920-933` 가 periodKey/specificDate 만 사후 필터, companions/vibes/eventTypes/regionHints 미필터링. 본 plan Task 5 가 `filterSuggestionsByFilters` helper 추가.
2. **§4.6 `chat-eval.ts` `lastSuggestionsStub`** → **신규 필드 불필요** 확정. `chat-eval.ts:34, 324` 가 `Case.lastSuggestions?: Array<Record<string,unknown>>` 이미 지원 + payload 에 `last_suggestions` 포함. 본 plan 의 케이스 JSON 에 `lastSuggestions: [{...},...]` 가짜 데이터 직접 작성.

---

## File Structure

수정:
- `services/llm/openai_chain.py` — `_FEWSHOT` 6건 (Task 1+2), SYSTEM_PROMPT `[추출 규칙 — filters]` 2 룰 (Task 3), `[referencesLast — 불리언]` 2 룰 (Task 4)
- `apps/bff/src/routes/chat.ts` — `filterSuggestionsByFilters` helper + `groundedRerank` 사후 필터 분기 (Task 5)
- `apps/bff/src/jobs/chat-eval-cases.json` — 6건 추가 (Task 6)
- `llm_wiki/wiki/topics/ai-enrichment.md` — 한 단락 추가 (Task 8)

신규: 없음.

---

## Task 1: `_FEWSHOT` intent shift 4건 추가

**Files:**
- Modify: `services/llm/openai_chain.py`

- [ ] **Step 1: `_FEWSHOT` 끝 (닫는 `"""` 직전) 에 4건 append**

`services/llm/openai_chain.py` 의 `_FEWSHOT = """예시:` 블록 마지막 사례 (Slice A 의 "이번 토요일 야외 행사") 뒤, `"""` 라인 직전에 다음 4건 그대로 삽입:

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

(끝의 빈 줄 1개 유지.)

- [ ] **Step 2: 카운트 검증**

```bash
cd services/llm && python -c "from openai_chain import _FEWSHOT; print(_FEWSHOT.count('- \"'))"
```

Expected: `21` (직전 17건 + 신규 4건).

- [ ] **Step 3: import 검증**

```bash
cd services/llm && python -c "import openai_chain; print('OK')"
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add services/llm/openai_chain.py
git commit -m "feat(llm): _FEWSHOT intent shift 4건 (카테고리/지역구/sido/전체리셋)"
```

---

## Task 2: `_FEWSHOT` referencesLast 2건 추가

**Files:**
- Modify: `services/llm/openai_chain.py`

- [ ] **Step 1: `_FEWSHOT` 끝에 2건 append**

Task 1 에서 추가된 4건 뒤, `"""` 라인 직전에 다음 2건 삽입:

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

- [ ] **Step 2: 카운트 검증**

```bash
cd services/llm && python -c "from openai_chain import _FEWSHOT; print(_FEWSHOT.count('- \"'))"
```

Expected: `23` (Task 1 후 21 + 신규 2).

- [ ] **Step 3: Commit**

```bash
git add services/llm/openai_chain.py
git commit -m "feat(llm): _FEWSHOT referencesLast 2건 (시간 표현·새 axis 동시)"
```

---

## Task 3: SYSTEM_PROMPT `[추출 규칙 — filters]` 2 룰 추가

**Files:**
- Modify: `services/llm/openai_chain.py`

- [ ] **Step 1: 추출 규칙 섹션 정확한 위치 grep**

```bash
grep -n "축 단위\|periodKey 단일값\|부정+긍정" services/llm/openai_chain.py | head -5
```

`periodKey 단일값. 가장 최근 턴 우선.` 라인 직전이 삽입 위치.

- [ ] **Step 2: 2 줄 추가**

해당 위치에서:

이전:
```
- 부정+긍정 혼합("가족 말고 연인"): 부정값 제외 + 긍정값 포함.
- periodKey 단일값. 가장 최근 턴 우선.
```

수정 후:
```
- 부정+긍정 혼합("가족 말고 연인"): 부정값 제외 + 긍정값 포함.
- 축 단위 부정 ("축제 말고 전시", "강남구 말고 마포구") → 해당 축 (eventTypes/regionHints 등) 의 이전 턴 값 제거, 이번 턴 새 값 포함. 다른 축의 union 은 유지.
- 전체 리셋 신호 ("다 빼고", "처음부터", "다시 보여줘") → 이전 턴 union 전부 무시, 이번 턴 만 반영. filters 가 비어도 OK.
- periodKey 단일값. 가장 최근 턴 우선.
```

- [ ] **Step 3: 빌드 검증**

```bash
cd services/llm && python -c "from openai_chain import _build_system_prompt; p = _build_system_prompt(); print(f'len: {len(p)} chars')"
```

Expected: 정상 빌드, 길이 출력 (이전 +80 정도).

- [ ] **Step 4: Commit**

```bash
git add services/llm/openai_chain.py
git commit -m "feat(llm): SYSTEM_PROMPT 추출 규칙 다중 턴 룰 2 (축 단위 부정·전체 리셋)"
```

---

## Task 4: SYSTEM_PROMPT `[referencesLast — 불리언]` 2 룰 추가

**Files:**
- Modify: `services/llm/openai_chain.py`

- [ ] **Step 1: referencesLast 섹션 grep**

```bash
grep -n "referencesLast — 불리언\|입력에 \[직전 제안\]" services/llm/openai_chain.py | head -5
```

- [ ] **Step 2: 2 줄 추가 — 첫 룰 다음, "true 예" 룰 앞**

이전:
```
[referencesLast — 불리언]
- 입력에 `[직전 제안]` 블록이 주어지고, 사용자 최근 발화가 그 목록을 명시적·묵시적으로
  가리키면 true. 그렇지 않으면 false.
- true 예: "그 중에 무료인 거 있어?", "아까 그 전시 언제까지야?", "2번째 이벤트는 어디야?",
  "방금 본 거 다 주말이야?", "그거 말고 다른 거".
```

수정 후:
```
[referencesLast — 불리언]
- 입력에 `[직전 제안]` 블록이 주어지고, 사용자 최근 발화가 그 목록을 명시적·묵시적으로
  가리키면 true. 그렇지 않으면 false.
- 입력에 `[직전 제안]` 블록이 없거나 비어있으면 referencesLast=false 강제. 이 경우 발화가 "그 중에" 같이 보여도 무시.
- true 일 때 사용자가 새 axis (companions/eventTypes/vibes/regionHints) 를 같이 언급했으면 filters 에 그 새 axis 도 포함 (예: "그 중에 가족도 OK" → referencesLast=true + filters.companions=["family"]). BFF 가 직전 제안 안에서 새 axis 로 필터.
- true 예: "그 중에 무료인 거 있어?", "아까 그 전시 언제까지야?", "2번째 이벤트는 어디야?",
  "방금 본 거 다 주말이야?", "그거 말고 다른 거".
```

- [ ] **Step 3: 빌드 검증**

```bash
cd services/llm && python -c "from openai_chain import _build_system_prompt; p = _build_system_prompt(); print(f'len: {len(p)} chars')"
```

Expected: 정상 빌드 (Task 3 길이 + ~150).

- [ ] **Step 4: Commit**

```bash
git add services/llm/openai_chain.py
git commit -m "feat(llm): SYSTEM_PROMPT referencesLast 룰 2 (빈 lastSuggestions·새 axis 동시)"
```

---

## Task 5: `groundedRerank` 새 axis 사후 필터 (`filterSuggestionsByFilters`)

**Files:**
- Modify: `apps/bff/src/routes/chat.ts`

`groundedRerank` 가 현재 periodKey/specificDate 만 prisma where 절로 사후 필터. 본 task 가 companions/eventTypes/vibes/regionHints 도 사후 필터하는 헬퍼 추가 + 호출.

- [ ] **Step 1: `filterSuggestionsByFilters` helper 추가**

`apps/bff/src/routes/chat.ts` 의 `groundedRerank` 함수 **직전** 또는 같은 helper 영역 (chat-eval 의 `resolveRegionHintsToIds` 헬퍼 위치 근처) 에 추가:

```ts
/**
 * groundedRerank 의 lastSuggestions events 메타를 새 axis (companions/eventTypes/
 * vibes/regionHints) 로 사후 필터링. 빈 filters axis 는 무시 (모두 통과).
 *
 * 매개:
 *   scored — DB 에서 메타 조회한 events 배열 (groundedRerank 내부 타입)
 *   filters — LLM 이 추출한 filters (sido/sigungu hint 가 이미 regionHints 에 있음)
 *
 * 반환: filters 모두 만족하는 부분집합. 0건 시 모두 탈락 — 호출자는 retreat 처리.
 */
function filterSuggestionsByFilters<T extends {
  eventId: string;
  category: { code: string };
  region: { sidoName: string; sigunguName: string | null };
  vibesNames: string[];
}>(scored: T[], filters: LlmFilters): T[] {
  const wantCategories = filters.eventTypes ?? [];
  const wantVibes = filters.vibes ?? [];
  const wantRegions = filters.regionHints ?? [];
  if (wantCategories.length === 0 && wantVibes.length === 0 && wantRegions.length === 0) {
    return scored;
  }
  return scored.filter((s) => {
    if (wantCategories.length > 0 && !wantCategories.includes(s.category.code)) return false;
    if (wantVibes.length > 0 && !s.vibesNames.some((v) => wantVibes.includes(v))) return false;
    if (wantRegions.length > 0) {
      const sigunguMatch = s.region.sigunguName !== null && wantRegions.includes(s.region.sigunguName);
      const sidoMatch = wantRegions.includes(s.region.sidoName);
      if (!sigunguMatch && !sidoMatch) return false;
    }
    return true;
  });
}
```

**Note**: `companions` 는 events 메타에 없음 — `companions` 는 event 특성이 아닌 사용자 동행 의도. 본 helper 에선 무시 (LLM rerank 가 reply 에서 가족 친화 여부 반영). spec §4.4 의 "companions" 도 사실은 동일 처리 — 메타로 사후 필터 불가능. **companions 는 사후 필터 대상 외**.

- [ ] **Step 2: `groundedRerank` 본문에 호출 삽입**

`groundedRerank` 함수 내부 — `scored` 배열을 만든 후 (`.sort(...)` 다음, `query` 만들기 전):

이전:
```ts
  const scored = rows
    .map((r) => ({ ... }))
    .sort((a, b) => b.score - a.score);

  // rerank query 는 사용자 turn 전체 history 반영 — 직전 제안 기반이라도 의도 변화 반영해야.
  const query = opts.userTexts.slice(-3).join('\n').slice(0, 500);
```

수정 후:
```ts
  const scored = rows
    .map((r) => ({ ... }))
    .sort((a, b) => b.score - a.score);

  // ADR 0006 follow-up — 사용자가 새 axis (eventTypes/vibes/regionHints) 를 같이 언급
  // 했으면 lastSuggestions 안에서 사후 필터 (LLM rerank 만으로 strict 보장 안 됨).
  const filteredScored = filterSuggestionsByFilters(scored, opts.filters);
  if (filteredScored.length === 0) {
    // 직전 제안 안에 새 조건을 만족하는 건 없음. 빈 배열 반환 → 호출자가 retreat.
    return [];
  }

  // rerank query 는 사용자 turn 전체 history 반영 — 직전 제안 기반이라도 의도 변화 반영해야.
  const query = opts.userTexts.slice(-3).join('\n').slice(0, 500);
```

`scored` 를 사용하던 이후 모든 라인을 `filteredScored` 로 교체.

확인 방법:
```bash
grep -n "scored" apps/bff/src/routes/chat.ts
```

`groundedRerank` 안에서 위 변경 직후 `scored` 참조가 있는 라인은 모두 `filteredScored` 로 변경. 보통 3-5 곳:
- `if (scored.length >= 2 && query.length >= 4) {` → `filteredScored.length`
- `candidates: scored.map((s) => ({` → `filteredScored.map`
- `articleSnippets = await fetchTopArticleSnippets(scored.map(...))` → `filteredScored.map`
- 마지막 return 부근의 매핑 — `filteredScored`

`scored` 변수 선언 자체는 유지 (filterSuggestionsByFilters 입력). 선언 외 사용처만 rename.

- [ ] **Step 3: typecheck**

```bash
cd apps/bff && pnpm typecheck 2>&1 | tail -5
```

Expected: 0 신규 errors (pre-existing 7 또는 0 그대로).

- [ ] **Step 4: Commit**

```bash
git add apps/bff/src/routes/chat.ts
git commit -m "feat(bff): groundedRerank 새 axis 사후 필터 (filterSuggestionsByFilters)"
```

---

## Task 6: `chat-eval-cases.json` 신규 6건 추가

**Files:**
- Modify: `apps/bff/src/jobs/chat-eval-cases.json`

- [ ] **Step 1: cases 배열 끝에 6건 append**

`apps/bff/src/jobs/chat-eval-cases.json` 의 `"cases": [` 마지막 entry 뒤에 콤마 추가 + 6 객체 삽입:

```json
    {
      "id": "intent-shift-category",
      "messages": [
        { "role": "user", "text": "이번 주말 축제 추천해줘" },
        { "role": "assistant", "text": "이번 주말 축제 추천해드릴게요." },
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
        { "role": "assistant", "text": "강남구 연인 동행 기준으로 추천드릴게요." },
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
        { "role": "assistant", "text": "부산 · 가족 · 축제 기준으로 찾아봤어요." },
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
        { "role": "assistant", "text": "강남 · 연인 · 정적 전시 기준으로 찾아봤어요." },
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
      "lastSuggestions": [
        { "eventId": "1001", "title": "전시 A", "category": "exhibition" },
        { "eventId": "1002", "title": "전시 B", "category": "exhibition" },
        { "eventId": "1003", "title": "전시 C", "category": "exhibition" },
        { "eventId": "1004", "title": "전시 D", "category": "exhibition" },
        { "eventId": "1005", "title": "전시 E", "category": "exhibition" }
      ]
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
      "lastSuggestions": [
        { "eventId": "2001", "title": "한강 전시 A", "category": "exhibition" },
        { "eventId": "2002", "title": "한강 전시 B", "category": "exhibition" },
        { "eventId": "2003", "title": "한강 전시 C", "category": "exhibition" }
      ]
    }
```

`lastSuggestions` 의 eventId 는 가짜 (실 DB 에 없을 수 있음). chat-eval 가 BFF 의 `last_suggestions` payload 로 전달 — `groundedRerank` 가 prisma 로 events 조회 후 0건이면 빈 배열 반환 (정상 동작). **본 평가는 LLM 의 `referencesLast` 추출 + `filters` 추출만 검증**, BFF rerank 결과는 무관.

- [ ] **Step 2: JSON 검증**

```bash
cd apps/bff && jq '.cases | length' src/jobs/chat-eval-cases.json
```

Expected: 36 (직전 30 + 신규 6).

```bash
cd apps/bff && jq '.cases | map(.id) | .[-6:]' src/jobs/chat-eval-cases.json
```

Expected:
```json
["intent-shift-category","intent-shift-region-gu","intent-shift-sido","intent-shift-full-reset","references-last-new-axis","references-last-where"]
```

- [ ] **Step 3: Commit**

```bash
git add apps/bff/src/jobs/chat-eval-cases.json
git commit -m "test(bff): chat-eval 다중 턴 회귀 6건 (intent shift 4 + referencesLast 2)"
```

---

## Task 7: chat-eval 36 cases 회귀 실행

**Files:** (검증만)

- [ ] **Step 1: services/llm 서버 재시작 (직전 Slice A 작업과 동일 룰)**

WSL2 uvicorn `--reload` 가 NTFS 마운트에서 inotify 미작동. **사용자가 직접 WSL 터미널에서 종료+재시작 필요** — subagent 가 못 함.

만약 서버가 이미 재시작된 상태면 (사용자가 미리 한 경우) skip:

```bash
curl -sS http://localhost:8000/health | head -3
```

응답 시간이 최근이면 OK. 의심되면 BLOCKED 보고 + 사용자 안내.

- [ ] **Step 2: chat-eval 실행**

```bash
cd apps/bff && pnpm run chat:eval 2>&1 | tee /tmp/chat-eval-slice-b.log
```

Expected: 36 cases run, ~5-7분.

- [ ] **Step 3: 결과 분석**

```bash
# 신규 6건만:
grep -E "intent-shift-|references-last-" /tmp/chat-eval-slice-b.log
# 기존 다중 턴 4건 회귀 확인:
grep -E "multi-turn-intent-change-companion|intent-negation|grounded-narrow-to-weekend|grounded-which-one" /tmp/chat-eval-slice-b.log
# summary:
grep "^summary:" /tmp/chat-eval-slice-b.log
```

Expected:
- 신규 6건 모두 PASS (LLM filters/referencesLast 추출 정확)
- 기존 4건 회귀 없음 (이전 PASS 그대로)
- 전체 ≥ 34/36 PASS (잔존 2건 — Slice A 의 서버 reload 이슈 잔존 시)

만약 신규 일부 FAIL — fewshot 학습이 충분치 않거나 SYSTEM_PROMPT 룰이 모호. case 별 실제 LLM 응답 (filters/referencesLast) 분석.

- [ ] **Step 4: (no commit — 검증만)**

---

## Task 8: 위키 메모 + 최종 점검

**Files:**
- Modify: `llm_wiki/wiki/topics/ai-enrichment.md`

- [ ] **Step 1: 위키 단락 추가**

`llm_wiki/wiki/topics/ai-enrichment.md` 의 직전 Slice A specificDate 단락 끝에 추가:

```markdown

## 다중 턴 처리 심화 (2026-05-29, Slice B)

intent shift (의도 변경) + referencesLast (직전 제안 지칭) 다양화.

- `_FEWSHOT` 신규 6건 (17 → 23): intent shift 4 (카테고리/지역구/sido/전체리셋) + referencesLast 2 (시간 표현·새 axis 동시).
- SYSTEM_PROMPT `[추출 규칙 — filters]` 룰 2 추가: 축 단위 부정 ("축제 말고 전시" → 해당 축 교체, 다른 축 union 유지) + 전체 리셋 ("다 빼고", "처음부터", "다시 보여줘" → filters 비움).
- SYSTEM_PROMPT `[referencesLast — 불리언]` 룰 2 추가: lastSuggestions 빈 입력 → false 강제 + 새 axis 동시 추출 (referencesLast=true + filters.companions 등).
- BFF `chat.ts` `groundedRerank` 에 `filterSuggestionsByFilters` helper — lastSuggestions 안에서 새 axis (eventTypes/vibes/regionHints) 사후 필터. companions 는 events 메타 무관이라 대상 외.
- chat-eval 신규 6건 회귀 — 30 → 36.

`lastSuggestions` 가짜 데이터는 chat-eval 의 기존 `Case.lastSuggestions` 필드로 직접 주입 (신규 stub 필드 불필요).
```

- [ ] **Step 2: 최종 검증**

```bash
# fewshot 카운트
cd services/llm && python -c "from openai_chain import _FEWSHOT; print(_FEWSHOT.count('- \"'))"
# 23 expected

# Python import
cd services/llm && python -c "import openai_chain; print('OK')"

# BFF typecheck
cd apps/bff && pnpm typecheck 2>&1 | tail -5

# chat-eval-cases 개수
cd apps/bff && jq '.cases | length' src/jobs/chat-eval-cases.json
# 36 expected
```

Expected: 모두 통과.

- [ ] **Step 3: 잔존 "강남구 25개" 같은 서울 한정 fewshot 없는지 grep**

```bash
grep -n "서울 25개\|서울 자치구만" services/llm/openai_chain.py
```

Expected: 0 매치.

- [ ] **Step 4: Commit (위키만)**

```bash
git add llm_wiki/wiki/topics/ai-enrichment.md
git commit -m "docs(wiki): ai-enrichment 다중 턴 처리 심화 메모 (Slice B)"
```

---

## Definition of Done

- [ ] `_FEWSHOT` 23건 (직전 17 + intent shift 4 + referencesLast 2)
- [ ] SYSTEM_PROMPT `[추출 규칙 — filters]` 2 룰 추가 (축 단위 부정 + 전체 리셋)
- [ ] SYSTEM_PROMPT `[referencesLast — 불리언]` 2 룰 추가 (빈 lastSuggestions + 새 axis)
- [ ] BFF `chat.ts` `filterSuggestionsByFilters` helper + `groundedRerank` 호출 (companions 제외 — eventTypes/vibes/regionHints 사후 필터)
- [ ] `chat-eval-cases.json` 36 cases (직전 30 + intent shift 4 + referencesLast 2)
- [ ] chat-eval 회귀 실행: 신규 6 PASS + 기존 4 다중 턴 (intent-negation/multi-turn-intent-change-companion/grounded-*) 보호
- [ ] 위키 ai-enrichment 메모
- [ ] `pnpm --filter bff typecheck` 0 신규 errors
