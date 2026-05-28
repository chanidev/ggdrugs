# LLM 프롬프트 전국 도메인 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** services/llm 의 채팅 프롬프트 + filters.py fallback + BFF chat.ts regionHints 처리를 ADR 0006 전국 도메인에 일관 맞춤.

**Architecture:** SYSTEM_PROMPT 도메인 문구 + regionHints 허용 표현 (옵션 B) + _FEWSHOT 비-서울 3건 추가 + compose_retreat 일반화 + filters.py SEOUL_GU 제거 + BFF chat.ts 의 sido 단축형 expand 룰. chat-eval-cases 4건 회귀 추가.

**Tech Stack:** Python (services/llm), TypeScript (apps/bff), Prisma, OpenAI gpt-4o-mini.

---

## Plan Deviations from Spec

Plan 작성 중 코드 grep 으로 확인된 정정:

1. **`_FEWSHOT` 실제 카운트 11건** (spec §4.2 의 "5건" 추정 정정). 신규 3건 추가 후 14건.
2. **`judge_relevance` 변경 불필요** — line 1098 `"한국어 이벤트 추천 평가자(judge)"` 이미 일반화. spec §3 의 점검 항목 → 변경 없음 확정.
3. **`SEOUL_GU` 삭제** — 사용처 grep 결과: `filters.py:56,97`, `openai_chain.py:32,44`. 모두 본 plan 에서 교체 가능. spec §4.4 의 "유지 가능성" 부정. 삭제 진행.
4. **`_ALLOWED_REGIONS` 동시 손봐야** — `openai_chain.py:44 _ALLOWED_REGIONS = SEOUL_GU` → spec 의 옵션 B 표기는 동적 리스트 불필요. 정적 문자열 상수 (`_REGION_HINTS_DESCRIPTION`) 로 교체.
5. **BFF `chat.ts` regionHints 처리 보강 필요** — spec §11 open item 해소. 3개 위치 (`line 349, 1220, 1356`) 가 `sigunguName: { in: hints }` 정확 매칭만 → sido 단축형 ("부산") 반환 시 0건. sido 매핑 + sigungu 합집합 expand 룰 추가. spec scope 확장이지만 "전국 도메인 일관성" 목표 달성에 필수.
6. **`chat-eval-cases.json` `specificDateExact` 동적 케이스 제외** — `chat-eval.ts:209` 가 정확 매칭. 강릉 케이스는 specificDate 검증 생략.

---

## File Structure

수정:
- `services/llm/openai_chain.py` — 4 사이트 (`SYSTEM_PROMPT_TEMPLATE`, `_FEWSHOT`, `compose_retreat`, `_ALLOWED_REGIONS`)
- `services/llm/filters.py` — fallback regionHints 룰 교체 + `SEOUL_GU` 삭제
- `apps/bff/src/routes/chat.ts` — `resolveRegionHintsToIds` 헬퍼 추가, 3 호출 위치 통합
- `apps/bff/src/jobs/chat-eval-cases.json` — 4 case 추가
- `docs/superpowers/specs/2026-05-28-llm-prompt-nationwide-domain-design.md` — 카운트 정정 (5→11, judge_relevance 변경 없음 확정)
- `llm_wiki/wiki/topics/ai-enrichment.md` — 한 단락 추가 (전국 도메인 일관성, 본 작업 영향)

---

## Task 1: spec 카운트 정정 (5건 → 11건)

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-llm-prompt-nationwide-domain-design.md`

- [ ] **Step 1: spec 본문에서 fewshot 카운트 정정**

`§3 아키텍처 변경 맵` 안:

이전 텍스트:
```
  - _FEWSHOT (line 84) — 기존 케이스 보존 + 비-서울 신규 3건 추가 (부산 자치구 / 강릉 시 + specificDate / 수원시 영통구 합성형)
```

수정 후 (그대로 — 카운트 명시 없음, OK).

`§4.2` 안 첫 단락 끝 "구현 시 정확한 기존 갯수 grep" → "기존 11건 + 신규 3건 = 14건" 으로 확정.

이전:
```
**기존 케이스는 모두 유지** (서울 회귀 보존). **신규 3건 추가** — 사용자 발화의 sido·자치구·합성형 다양성 확보. 최종 카운트는 기존 + 3 (구현 시 정확한 기존 갯수 grep).
```

수정 후:
```
**기존 케이스 11건 모두 유지** (서울 회귀 보존). **신규 3건 추가** — 사용자 발화의 sido·자치구·합성형 다양성 확보. 최종 14건.
```

`§11 오픈 아이템` 안:

이전:
```
- **`SEOUL_GU` 상수 잔존 사용처**: grep 으로 0 건이면 삭제 가능. 구현 단계에서 결정.
```

수정 후:
```
- **`SEOUL_GU` 상수 잔존 사용처** → Plan 에서 확인됨: `filters.py:56,97`, `openai_chain.py:32,44` 4 사용처 모두 본 작업으로 교체. SEOUL_GU 정의 자체 삭제.
```

`§11 오픈 아이템` 안:

이전:
```
- **BFF chat.ts 의 regionHints 처리**: LLM 이 sido 단축형 ("부산") 만 반환했을 때 events 쿼리가 sido 광역 row 매칭으로 fallback 하는지 — 구현 단계에서 점검. 안 하면 별도 fix.
```

수정 후:
```
- **BFF chat.ts 의 regionHints 처리** → Plan 에서 확인됨: `sigunguName: { in: hints }` 정확 매칭만 (line 349, 1220, 1356). sido 단축형은 0건 매칭이라 expand 룰 (`resolveRegionHintsToIds` 헬퍼) 본 plan 에 포함.
```

`§10 영향 받는 파일` 의 "미변경 (확인)" 항목에서 `judge_relevance` 라인 그대로 (이미 일반화 명시), `chat.ts` 라인은 "변경 (sido expand 룰 추가)" 로 이동:

이전:
```
미변경 (확인):
...
- BFF `chat.ts` 라우트 — LLM 응답 shape 변동 없음 (sigungu 단위 매칭 가정 유지)
```

수정 후:
```
미변경 (확인):
...
- BFF `chat.ts` 라우트 의 LLM 응답 shape — 변동 없음

추가 변경 (Plan 결정):
- `apps/bff/src/routes/chat.ts` — `resolveRegionHintsToIds` 헬퍼 (sido 단축형 expand) 3 사용처 통합
```

- [ ] **Step 2: commit**

```bash
git add docs/superpowers/specs/2026-05-28-llm-prompt-nationwide-domain-design.md
git commit -m "docs(specs): LLM prompt spec — fewshot 11건 정정 + open item 해소"
```

---

## Task 2: `_ALLOWED_REGIONS` 교체 + SYSTEM_PROMPT 도메인 일반화

**Files:**
- Modify: `services/llm/openai_chain.py` (line 32, 44, 188~)

- [ ] **Step 1: SEOUL_GU import 제거 (line 32)**

`services/llm/openai_chain.py` 의 line 27-34 import 블록 전체:

이전:
```python
from filters import (  # noqa: F401 — ALLOW 값 참조
    COMPANION_TABLE,
    PERIOD_TABLE,
    SEOUL_GU,
    EVENT_TYPE_TABLE,
    VIBE_TABLE,
    fallback_extract,
)
```

수정 후:
```python
from filters import (  # noqa: F401 — ALLOW 값 참조
    COMPANION_TABLE,
    PERIOD_TABLE,
    EVENT_TYPE_TABLE,
    VIBE_TABLE,
    fallback_extract,
)
```

- [ ] **Step 2: `_ALLOWED_REGIONS` 상수 교체 (line 44)**

이전 (line 44):
```python
_ALLOWED_REGIONS = SEOUL_GU
```

수정 후:
```python
# ADR 0006 — 전국 17 시/도 단축형. LLM 에 sido 또는 산하 시/군/구 자유 추출 허용.
# 옵션 B (spec §2): sido 17 명시 + 시/군/구 예시. 시/군/구 257건 전체 list 미인라인.
_REGION_HINTS_DESCRIPTION = (
    "전국 17 시/도 단축형 (서울·부산·대구·인천·광주·대전·울산·세종·"
    "경기·강원·충북·충남·전북·전남·경북·경남·제주) 또는 그 산하 시/군/구. "
    "예시 — 서울 자치구: 종로구·강남구, 광역시 자치구: 해운대구·수성구·미추홀구, "
    "일반시·군: 수원시·강릉시·통영시·고흥군, 자치구 있는 일반시 합성형: "
    "수원시 영통구·성남시 분당구·청주시 흥덕구·창원시 마산합포구. "
    "모든 시/군/구 257건 중 사용자 발화에 매칭되는 것 1개 이상 추출. "
    "사용자가 sido 만 (예: '부산') 언급했고 자치구가 불명확하면 sido 단축형 "
    "그대로 반환 ('부산'). BFF 가 sido → 산하 자치구 합집합으로 expand 함."
)
```

- [ ] **Step 3: SYSTEM_PROMPT_TEMPLATE 도메인 문장 교체 (line 188)**

이전:
```python
SYSTEM_PROMPT_TEMPLATE = f"""당신은 한국어 서울 이벤트(축제·전시·공연·박람회 등) 검색 어시스턴트 'Alle' 입니다.
```

수정 후:
```python
SYSTEM_PROMPT_TEMPLATE = f"""당신은 한국어 전국 이벤트(축제·전시·공연·박람회 등) 검색 어시스턴트 'Alle' 입니다. 대한민국 전국 17 시/도 (서울·부산·대구·인천·광주·대전·울산·세종·경기·강원·충북·충남·전북·전남·경북·경남·제주) 의 이벤트를 다룹니다.
```

- [ ] **Step 4: SYSTEM_PROMPT_TEMPLATE 추출 규칙 의 지역어 예시 교체 (line 200~201)**

이전:
```python
- "강남" → "강남구" 처럼 접미어 없어도 매칭. 단 "구로구" 같이 글자 일부가 다른 구와
  겹치면 정확히 일치하는 구만.
```

수정 후:
```python
- 사용자 발화의 지역어 → 가장 가까운 정식 시/군/구 표기. "강남" → "강남구", "해운대" → "해운대구", "영통" → "수원시 영통구" (자치구 있는 일반시는 합성형 "<시명> <자치구>", 공백 1개).
- 글자 일부가 다른 구와 겹치면 정확 일치하는 것만 (예: "구로" → "구로구"만, "동구"는 sido 가 명시되면 그 sido 의 동구로).
- sido 만 언급되고 자치구가 불명확하면 sido 단축형 반환 ("부산"). BFF 가 사후 expand 처리.
```

- [ ] **Step 5: SYSTEM_PROMPT_TEMPLATE 의 [허용 값] regionHints 줄 교체 (line 271)**

이전:
```python
- regionHints: 서울 25개 구 ({", ".join(_ALLOWED_REGIONS[:5])} ... {", ".join(_ALLOWED_REGIONS[-3:])})
```

수정 후:
```python
- regionHints: {_REGION_HINTS_DESCRIPTION}
```

- [ ] **Step 6: typecheck (Python 은 runtime — import 검증만)**

```bash
cd services/llm && python -c "import openai_chain; print('OK')"
```

Expected: `OK`. import 단계에서 SEOUL_GU 참조 없으면 통과.

- [ ] **Step 7: 자가 검증 — 프롬프트 길이 비교**

```bash
cd services/llm && python -c "from openai_chain import SYSTEM_PROMPT_TEMPLATE, _build_system_prompt; p = _build_system_prompt(); print(f'len: {len(p)} chars, tokens_est: {len(p)/3:.0f}')"
```

Expected: 길이 출력, 정상 빌드.

- [ ] **Step 8: Commit**

```bash
git add services/llm/openai_chain.py
git commit -m "feat(llm): SYSTEM_PROMPT 전국 도메인 + regionHints 옵션 B (ADR 0006)"
```

---

## Task 3: `_FEWSHOT` 비-서울 3건 추가

**Files:**
- Modify: `services/llm/openai_chain.py` (line 84~)

- [ ] **Step 1: `_FEWSHOT` 끝에 3건 append (line 184 직전, `"""` 닫기 직전)**

`services/llm/openai_chain.py` 의 `_FEWSHOT = """예시:` 블록 마지막 사례 ("다음주 토요일 야외 페스티벌") 뒤, `"""` 닫는 라인 직전에 다음 3건을 그대로 삽입:

```python
- "부산 해운대 데이트 잔잔한 전시":
  {
    filters: {regionHints:["해운대구"], companions:["couple"], eventTypes:["exhibition"], vibes:["정적"]},
    specificDate: null,
    referencesLast: false,
    reply: "부산 해운대구 · 연인 동행 · 전시 · 정적 분위기로 좁혔어요. 마음에 드는 것 있는지 확인해 보세요.",
    followups: ["야간 운영 위주", "공연도 같이", "다른 지역도 보기"]
  }

- "다음주 토요일 강릉 커피축제" (구체 날짜 — specificDate 사용, [오늘 컨텍스트] 의 "'다음주 토'=YYYY-MM-DD" 복사):
  ※ 가정: [오늘 컨텍스트] 가 "'다음주 토'=2026-06-06" 라고 명시한 경우.
  {
    filters: {regionHints:["강릉시"], eventTypes:["festival"]},
    specificDate: "2026-06-06",
    referencesLast: false,
    reply: "다음 주 토요일(6/6) 강릉시 축제 기준으로 찾아봤어요. 커피 관련 일정이 있는지 결과에서 확인해 주세요.",
    followups: ["일요일도 보기", "전시도 함께", "이번 주말로"]
  }

- "수원시 영통구 가족 행사":
  {
    filters: {regionHints:["수원시 영통구"], companions:["family"]},
    specificDate: null,
    referencesLast: false,
    reply: "수원시 영통구 · 가족 동행 기준으로 찾아봤어요. 종류(축제·전시·교육 등)를 알려주시면 더 정확히 좁혀드려요.",
    followups: ["축제만", "체험 위주", "이번 주말로"]
  }

```

(마지막 빈 줄 1개 유지 — 기존 패턴 일관성)

- [ ] **Step 2: import + 빌드 검증**

```bash
cd services/llm && python -c "from openai_chain import _FEWSHOT; print(_FEWSHOT.count('- \"'))"
```

Expected: `14` (기존 11 + 신규 3).

- [ ] **Step 3: Commit**

```bash
git add services/llm/openai_chain.py
git commit -m "feat(llm): _FEWSHOT 비-서울 3건 추가 (부산·강릉·수원시 영통구)"
```

---

## Task 4: `compose_retreat` 도메인 일반화

**Files:**
- Modify: `services/llm/openai_chain.py` (line 891)

- [ ] **Step 1: compose_retreat system prompt 첫 줄 교체**

`services/llm/openai_chain.py` 의 `compose_retreat` 함수 안:

이전 (line 891):
```python
    sys = (
        f"당신은 한국어 서울 이벤트 검색 어시스턴트 'Alle' 의 retreat 모드입니다.\n"
        f"{_today_context()}\n\n"
```

수정 후:
```python
    sys = (
        f"당신은 한국어 전국 이벤트 검색 어시스턴트 'Alle' 의 retreat 모드입니다.\n"
        f"{_today_context()}\n\n"
```

- [ ] **Step 2: import 검증**

```bash
cd services/llm && python -c "import openai_chain; print('OK')"
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add services/llm/openai_chain.py
git commit -m "feat(llm): compose_retreat 전국 도메인 일반화"
```

---

## Task 5: `filters.py` fallback sido 17 lite + `SEOUL_GU` 삭제

**Files:**
- Modify: `services/llm/filters.py` (line 56, 97)

- [ ] **Step 1: `SEOUL_GU` 상수 정의 삭제 (line 56~)**

`services/llm/filters.py` 의 `SEOUL_GU = [ ... ]` 블록 전체를 삭제.

먼저 정확한 라인 범위를 Read tool 로 line 50~95 확인 (목록 25개 + 닫는 `]` + 빈 줄). 보통 `SEOUL_GU = [` 부터 `]` 까지. 통째로 제거. 직전·직후 빈 줄도 1개만 남도록 정리.

- [ ] **Step 2: `fallback_extract` 의 regionHints 룰 교체 (line 97)**

함수 본문에서:

이전:
```python
        "regionHints": [gu for gu in SEOUL_GU if gu in t or gu[:-1] in t],
```

수정 후:
```python
        "regionHints": [k for k in _SIDO_KEYWORDS if k in t],
```

`_SIDO_KEYWORDS` 상수를 파일 상단 (다른 상수들과 같은 위치, `SEOUL_GU` 가 있던 자리) 에 추가:

```python
# ADR 0006 — LLM 없는 dev/CI fallback. sido 17 단축형만 매칭. 자치구·시·군 미인식.
# 정확도 우선순위 낮음 (LLM stage 가 정상 작동하면 이 경로는 거의 안 탐).
_SIDO_KEYWORDS = [
    "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
    "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
]
```

- [ ] **Step 3: import 검증**

```bash
cd services/llm && python -c "from filters import fallback_extract; r = fallback_extract([{'role':'user','text':'부산 가족 축제'}]); print(r['filters']['regionHints'])"
```

Expected: `['부산']` (sido 단축형 1개 추출).

- [ ] **Step 4: regression — 서울 발화 검증**

```bash
cd services/llm && python -c "from filters import fallback_extract; r = fallback_extract([{'role':'user','text':'강남 데이트'}]); print(r['filters']['regionHints'])"
```

Expected: `[]` (자치구는 lite fallback 에서 미인식 — 의도된 양보. LLM 활성 시 정확히 추출).

- [ ] **Step 5: Commit**

```bash
git add services/llm/filters.py
git commit -m "feat(llm): filters fallback sido 17 lite + SEOUL_GU 삭제 (ADR 0006)"
```

---

## Task 6: BFF `chat.ts` sido 단축형 expand 헬퍼

**Files:**
- Modify: `apps/bff/src/routes/chat.ts` (line 349, 1220, 1356)

LLM 이 `regionHints` 에 sido 단축형 ("부산") 을 반환하면, 현재는 `sigunguName: { in: hints }` 매칭으로 0건. 새 헬퍼 `resolveRegionHintsToIds` 가 sido 단축형을 그 sido 의 모든 sigungu 합집합으로 expand. 자치구/합성형은 그대로 sigungu 매칭.

- [ ] **Step 1: 헬퍼 `resolveRegionHintsToIds` 작성**

`apps/bff/src/routes/chat.ts` 파일 상단의 imports 다음 (`import { prisma } ...` 다음 적당 위치) 에 추가:

```ts
const SIDO_NAMES = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
] as const;

/**
 * LLM 이 반환한 regionHints 를 regionId 목록으로 resolve. ADR 0006 전국 도메인.
 *
 * 룰:
 *  - sido 단축형 (예: "부산") → 그 sido 산하 모든 sigungu row 의 regionId 합집합
 *  - 자치구·시·군 표기 ("해운대구", "강릉시", "수원시 영통구") → sigungu_name 정확 매칭
 *  - 둘이 섞이면 합집합
 *
 * 빈 hints → 빈 배열. dongName IS NULL 행만 (동 단위 제외).
 */
async function resolveRegionHintsToIds(hints: string[]): Promise<string[]> {
  if (hints.length === 0) return [];
  const sidos = hints.filter((h) => (SIDO_NAMES as readonly string[]).includes(h));
  const sigungus = hints.filter((h) => !(SIDO_NAMES as readonly string[]).includes(h));
  const rows = await prisma.region.findMany({
    where: {
      OR: [
        ...(sigungus.length > 0
          ? [{ sigunguName: { in: sigungus }, dongName: null }]
          : []),
        ...(sidos.length > 0
          ? [{ sidoName: { in: sidos }, sigunguName: { not: null }, dongName: null }]
          : []),
      ],
    },
    select: { regionId: true },
  });
  return rows.map((r) => r.regionId.toString());
}
```

- [ ] **Step 2: 첫 호출 위치 (line 349~358) 교체**

이전:
```ts
  const hints = data.filters?.regionHints ?? [];
  const vibeNames = data.filters?.vibes ?? [];

  let regionIds: string[] = [];
  if (hints.length > 0) {
    const rows = await prisma.region.findMany({
      where: { sigunguName: { in: hints }, dongName: null },
      select: { regionId: true, sigunguName: true },
    });
    regionIds = rows.map((r) => r.regionId.toString());
  }
```

수정 후:
```ts
  const hints = data.filters?.regionHints ?? [];
  const vibeNames = data.filters?.vibes ?? [];

  const regionIds = await resolveRegionHintsToIds(hints);
```

- [ ] **Step 3: 두 번째 호출 위치 (line 1220 부근) 교체**

`grep -n "metaPayload.filters.regionHints" apps/bff/src/routes/chat.ts` 로 정확한 라인 확인 후, 그 블록도 동일 패턴으로:

이전 (예):
```ts
  const hints = metaPayload.filters.regionHints ?? [];
  ... (regionIds 계산 블록) ...
```

수정 후:
```ts
  const hints = metaPayload.filters.regionHints ?? [];
  const regionIds = await resolveRegionHintsToIds(hints);
```

(만약 기존 블록이 `prisma.region.findMany({ where: { sigunguName: { in: hints } ... } })` 패턴 이면 통째 교체.)

- [ ] **Step 4: 세 번째 호출 위치 (line 1356 부근) 동일하게 교체**

`grep -n "data.filters?.regionHints" apps/bff/src/routes/chat.ts | tail -1` 로 line 1356 부근 블록 위치 재확인. 같은 패턴 (`sigunguName: { in: hints }` 형태의 prisma.region.findMany) 이면 동일 교체.

**중요**: 만약 블록이 다른 컨텍스트 — 예: groundedRerank 내부에서 사용자 발화에서 직접 hint 추출 + 다른 필드 사용 — 면 헬퍼 적용 부적합. 그 경우 BLOCK 상태로 보고 (단순 교체 아닌 별도 분석 필요).

- [ ] **Step 5: typecheck**

```bash
cd apps/bff && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 6: 자가 검증 (DB 가 살아있어야)**

```bash
cd apps/bff && pnpm exec dotenv -e ../../.env -- tsx -e "import('./src/prisma.js').then(async ({prisma}) => { const rows = await prisma.region.findMany({ where: { sidoName: '부산', sigunguName: { not: null }, dongName: null }, select: { regionId: true, sigunguName: true } }); console.log('부산 sigungu rows:', rows.length); await prisma.\$disconnect(); })"
```

Expected: `부산 sigungu rows: 17` (16 자치구 + 기장군). 만약 다르면 시드 점검.

(주의: `tsx -e` 가 top-level await 안 됨 — `.then()` 패턴 또는 별도 파일. 위 명령은 `.then()` 사용.)

- [ ] **Step 7: Commit**

```bash
git add apps/bff/src/routes/chat.ts
git commit -m "feat(bff): chat regionHints sido 단축형 expand 헬퍼 (ADR 0006)"
```

---

## Task 7: `chat-eval-cases.json` 비-서울 회귀 4건 추가

**Files:**
- Modify: `apps/bff/src/jobs/chat-eval-cases.json`

- [ ] **Step 1: cases 배열 끝에 4건 append**

`apps/bff/src/jobs/chat-eval-cases.json` 의 `"cases": [` 배열 마지막 entry 뒤에 (이전 마지막 entry 뒤 콤마 추가 후) 다음 4건 삽입:

```json
    {
      "id": "nationwide-busan-haeundae-couple-quiet",
      "messages": [{ "role": "user", "text": "부산 해운대 데이트로 갈만한 잔잔한 전시" }],
      "expect": {
        "filters": {
          "companions": ["couple"],
          "eventTypes": ["exhibition"],
          "vibes": ["정적"],
          "regionHints": ["해운대구"]
        },
        "referencesLast": false
      }
    },
    {
      "id": "nationwide-suwon-yeongtong-family",
      "messages": [{ "role": "user", "text": "수원시 영통구 가족이랑 갈만한 행사" }],
      "expect": {
        "filters": {
          "companions": ["family"],
          "regionHints": ["수원시 영통구"]
        },
        "referencesLast": false
      }
    },
    {
      "id": "nationwide-gangneung-festival",
      "messages": [{ "role": "user", "text": "강릉 축제 가보고 싶어" }],
      "expect": {
        "filters": {
          "eventTypes": ["festival"],
          "regionHints": ["강릉시"]
        },
        "referencesLast": false
      }
    },
    {
      "id": "nationwide-cheongju-heungdeok-weekend",
      "messages": [{ "role": "user", "text": "청주시 흥덕구 이번주 주말 전시" }],
      "expect": {
        "filters": {
          "eventTypes": ["exhibition"],
          "periodKey": "weekend",
          "regionHints": ["청주시 흥덕구"]
        },
        "referencesLast": false
      }
    }
```

(`specificDateExact` 는 4건 모두에서 생략 — 동적 날짜 또는 비고정 케이스라 검증 skip.)

- [ ] **Step 2: JSON validity 검증**

```bash
cd apps/bff && jq '.cases | length' src/jobs/chat-eval-cases.json
```

Expected: 기존 + 4. (확인용으로 grep `grep -c '"id":' src/jobs/chat-eval-cases.json` 도 가능.)

- [ ] **Step 3: 마지막 4건 id 매핑 확인**

```bash
cd apps/bff && jq '.cases | map(.id) | .[-4:]' src/jobs/chat-eval-cases.json
```

Expected:
```json
[
  "nationwide-busan-haeundae-couple-quiet",
  "nationwide-suwon-yeongtong-family",
  "nationwide-gangneung-festival",
  "nationwide-cheongju-heungdeok-weekend"
]
```

- [ ] **Step 4: Commit**

```bash
git add apps/bff/src/jobs/chat-eval-cases.json
git commit -m "test(bff): chat-eval 비-서울 회귀 4건 (해운대/영통/강릉/흥덕)"
```

---

## Task 8: chat-eval 실행 — 회귀 검증

**Files:** (변경 없음, 검증만)

- [ ] **Step 1: services/llm 서버 + BFF 서버 띄우기 (수동, background)**

BFF dev 가 services/llm 자식 프로세스로 spawn 하는 구조 — 통합 실행:

```bash
cd apps/bff && pnpm dev
```

다른 터미널에서 services/llm 별도 띄움 (BFF 가 자동 띄우지 않으면):

```bash
cd services/llm && pip install -r requirements.txt -q && uvicorn app:app --port 8001 --reload
```

(포트/실행 방식은 `services/llm/app.py` 또는 README 확인 — 일반적 패턴 따름. dev 환경에서 이미 작동 중이면 생략.)

- [ ] **Step 2: chat-eval 실행**

```bash
cd apps/bff && pnpm run chat:eval
```

Expected: 26 cases (기존 22 + 신규 4) 모두 run, summary 출력 (pass/fail per case).

- [ ] **Step 3: 결과 기록**

신규 4건 (id prefix `nationwide-`) 의 pass/fail 기록. fail 시 어느 필드 (regionHints? referencesLast?) 가 어긋났는지 메모.

기존 22건 회귀 — pass/fail 변동 없음 확인. 변동 있으면 fewshot 추가가 서울 케이스에 영향 — 재검토.

- [ ] **Step 4: (no commit — 별도 task 에서 결과 박제)**

---

## Task 9: 위키 `ai-enrichment.md` 메모 추가

**Files:**
- Modify: `llm_wiki/wiki/topics/ai-enrichment.md`

- [ ] **Step 1: 파일 끝 (References 직전) 에 단락 추가**

`llm_wiki/wiki/topics/ai-enrichment.md` 의 `## References` 섹션 직전에:

```markdown
## 채팅 프롬프트 전국 도메인 (2026-05-28, ADR 0006 follow-up)

ADR 0006 으로 데이터·BFF·Web 가 전국으로 확장된 후 services/llm 프롬프트도 일관화.
- `SYSTEM_PROMPT_TEMPLATE` 도메인: "서울 이벤트" → "전국 이벤트 (17 시/도)"
- `regionHints` 허용 표현: 옵션 B — sido 17 단축형 + 시/군/구 예시 (full 257 list 미인라인, 토큰 절약)
- `_FEWSHOT` 신규 3건: 부산 해운대 데이트, 강릉 specificDate, 수원시 영통구 합성형
- `compose_retreat` "서울" 제거
- `filters.py` SEOUL_GU 삭제, fallback 은 sido 17 lite 매칭 (LLM 없는 dev/CI 한정 자치구 미인식 양보)
- BFF `chat.ts` `resolveRegionHintsToIds` 헬퍼 — LLM 이 sido 단축형 ("부산") 반환 시 그 sido 산하 sigungu 합집합 expand
- chat-eval-cases 비-서울 회귀 4건 (해운대·영통·강릉·흥덕)

`judge_relevance` system prompt 는 이미 일반화돼있어 변경 불필요.
```

- [ ] **Step 2: Commit**

```bash
git add llm_wiki/wiki/topics/ai-enrichment.md
git commit -m "docs(wiki): ai-enrichment 채팅 프롬프트 전국 도메인 메모"
```

---

## Task 10: 최종 점검

**Files:** (검증만)

- [ ] **Step 1: 잔존 "서울 이벤트" 표현 grep**

```bash
cd "C:/Users/user/Desktop/_프로젝트/real_Project" && grep -rn "서울 이벤트\|SEOUL_GU" services/llm/ apps/bff/src/ 2>&1
```

Expected: 0 매치 (또는 주석/문자열의 historical 언급만).

- [ ] **Step 2: typecheck + Python import**

```bash
cd "C:/Users/user/Desktop/_프로젝트/real_Project" && pnpm --filter bff typecheck 2>&1 | tail -5
cd services/llm && python -c "import openai_chain, filters; print('LLM OK')"
```

Expected: BFF typecheck 0 errors (pre-existing 7 외), LLM `LLM OK`.

- [ ] **Step 3: graphify 재구축 (CLAUDE.md 규정)**

```bash
cd "C:/Users/user/Desktop/_프로젝트/real_Project" && python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))" 2>&1 | tail -5
```

Expected: 그래프 갱신 (python3 또는 graphify 모듈 없으면 skip — fail 아님).

- [ ] **Step 4: 최종 commit log 요약 확인**

```bash
git log --oneline 79c2ea5..HEAD
```

Expected: Task 1~9 commit 9건 (Task 8/10 은 검증만이라 무 commit).

- [ ] **Step 5: (별도 commit 없음 — 검증만)**

---

## Definition of Done

- [ ] spec (`§4.2` 카운트, `§11` open item) 정정 commit
- [ ] `services/llm/openai_chain.py` — SYSTEM_PROMPT 도메인, _REGION_HINTS_DESCRIPTION, _FEWSHOT 3건 추가, compose_retreat 일반화
- [ ] `services/llm/filters.py` — SEOUL_GU 삭제, _SIDO_KEYWORDS 추가, fallback regionHints 룰 교체
- [ ] `apps/bff/src/routes/chat.ts` — resolveRegionHintsToIds 헬퍼 + 3 호출 위치 통합
- [ ] `apps/bff/src/jobs/chat-eval-cases.json` — 4건 추가
- [ ] `llm_wiki/wiki/topics/ai-enrichment.md` — 채팅 도메인 메모
- [ ] `chat-eval` 26건 모두 run, 신규 4건 결과 기록, 기존 22건 회귀 없음
- [ ] `grep "서울 이벤트\|SEOUL_GU" services/llm/ apps/bff/src/` 0건
- [ ] `pnpm --filter bff typecheck` 0 신규 errors
