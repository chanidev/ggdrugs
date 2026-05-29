# 자연어 파싱 의미 매핑 확장 Implementation Plan (Slice C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** vibes·eventTypes·companions 의 trigger 어휘 사전 확장 — `filters.py` 3 테이블 + `services/llm/openai_chain.py` SYSTEM_PROMPT 매핑 룰 multi-line 화. fewshot 학습 + 사전 fallback 둘 다 보강.

**Architecture:** 두 layer 동기 — `filters.py` (dev/CI fallback 사전) + SYSTEM_PROMPT (LLM 학습용 룰). chat-eval 6건 회귀 + Slice A 잔존 1건 자동 해소 기대.

**Tech Stack:** Python (services/llm), TypeScript (apps/bff), OpenAI gpt-4o-mini.

---

## File Structure

수정:
- `services/llm/filters.py` — VIBE_TABLE/EVENT_TYPE_TABLE/COMPANION_TABLE 어휘 확장
- `services/llm/openai_chain.py` — SYSTEM_PROMPT `[추출 규칙 — filters]` 의 매핑 룰 3 블록 multi-line 교체
- `apps/bff/src/jobs/chat-eval-cases.json` — 6건 추가 (36 → 42)
- `llm_wiki/wiki/topics/ai-enrichment.md` — 단락 추가

신규: 없음.

---

## Task 1: `filters.py` 3 테이블 어휘 확장

**Files:**
- Modify: `services/llm/filters.py` (line 17~53)

- [ ] **Step 1: COMPANION_TABLE 확장**

`services/llm/filters.py:17-22`:

이전:
```python
COMPANION_TABLE: list[tuple[list[str], str]] = [
    (["가족", "부모님", "애들", "아이", "아기", "어린이", "아동", "유아", "자녀"], "family"),
    (["연인", "데이트", "커플", "여자친구", "남자친구", "여친", "남친", "썸"], "couple"),
    (["친구", "동창", "동기", "동료"], "friend"),
    (["혼자", "솔로", "나 혼자", "혼술", "혼밥", "1인"], "solo"),
]
```

수정 후:
```python
COMPANION_TABLE: list[tuple[list[str], str]] = [
    (["가족", "부모님", "애들", "아이", "아기", "어린이", "아동", "유아", "자녀",
      "엄마", "아빠", "어머니", "아버지", "할머니", "할아버지", "조카"], "family"),
    (["연인", "데이트", "커플", "여자친구", "남자친구", "여친", "남친", "썸",
      "와이프", "남편", "아내", "신랑", "신부"], "couple"),
    (["친구", "동창", "동기", "동료", "친구들", "동료들"], "friend"),
    (["혼자", "솔로", "나 혼자", "혼술", "혼밥", "1인", "혼자서"], "solo"),
]
```

- [ ] **Step 2: EVENT_TYPE_TABLE 확장**

`services/llm/filters.py:24-33`:

이전:
```python
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
```

수정 후:
```python
EVENT_TYPE_TABLE: list[tuple[list[str], str]] = [
    (["축제", "페스티벌", "마켓", "플리마켓", "장터", "팝업", "팝업스토어",
      "야시장", "축제장"], "festival"),
    (["박람회", "엑스포", "페어", "EXPO"], "expo"),
    (["심포지움", "심포지엄", "포럼"], "symposium"),
    (["컨퍼런스", "컨퍼런", "세미나", "콘퍼런스"], "conference"),
    (["전시", "전시회", "미술관", "갤러리", "박물관",
      "기획전", "전시장"], "exhibition"),
    (["공연", "뮤지컬", "연극", "콘서트", "라이브", "버스킹",
      "음악회", "콘서트홀", "오페라"], "performance"),
    (["교육", "강좌", "클래스", "워크샵", "워크숍", "원데이",
      "강의", "강연"], "education"),
    (["영화", "시네마", "상영", "영화제"], "movie"),
]
```

- [ ] **Step 3: VIBE_TABLE 확장**

`services/llm/filters.py:46-53`:

이전:
```python
VIBE_TABLE: list[tuple[list[str], str]] = [
    (["활동적", "액티브", "몸 쓰", "뛰", "신나는", "에너지", "역동", "활기"], "활동적"),
    (["정적", "차분", "조용", "힐링", "잔잔", "여유", "릴렉스", "고요"], "정적"),
    (["체험형", "체험", "참여", "만들기", "직접", "DIY", "핸즈온"], "체험형"),
    (["관람형", "관람", "보기", "구경", "감상", "보는", "보러"], "관람형"),
    (["교육형", "교육적", "배우는", "배움", "학습", "공부"], "교육형"),
    (["네트워킹", "교류", "친목", "사람들", "인맥"], "네트워킹 중심"),
]
```

수정 후:
```python
VIBE_TABLE: list[tuple[list[str], str]] = [
    (["활동적", "액티브", "몸 쓰", "뛰", "신나는", "에너지", "역동", "활기",
      "야외", "체력", "땀", "활발"], "활동적"),
    (["정적", "차분", "조용", "힐링", "잔잔", "여유", "릴렉스", "고요",
      "조용히", "한적", "마음 편", "쉬는"], "정적"),
    (["체험형", "체험", "참여", "만들기", "직접", "DIY", "핸즈온",
      "해보는", "만져", "직접 해"], "체험형"),
    (["관람형", "관람", "보기", "구경", "감상", "보는", "보러",
      "구경하는", "둘러보"], "관람형"),
    (["교육형", "교육적", "배우는", "배움", "학습", "공부",
      "강연", "강의", "지식", "배우러"], "교육형"),
    (["네트워킹", "교류", "친목", "사람들", "인맥",
      "만남", "사람 만나", "어울리"], "네트워킹 중심"),
]
```

- [ ] **Step 4: import + fallback 검증**

```bash
cd services/llm && python -c "from filters import extract; r = extract('야외 활동 좋은 거'); print('야외:', r.get('vibes'))"
```
Expected: `야외: ['활동적']`.

```bash
cd services/llm && python -c "from filters import extract; r = extract('엄마랑 갈 전시'); print('엄마:', r.get('companions'), 'event:', r.get('eventTypes'))"
```
Expected: `엄마: ['family'] event: ['exhibition']`.

```bash
cd services/llm && python -c "from filters import extract; r = extract('야시장 가고 싶어'); print('야시장:', r.get('eventTypes'))"
```
Expected: `야시장: ['festival']`.

- [ ] **Step 5: Commit**

```bash
git add services/llm/filters.py
git commit -m "feat(llm): filters 사전 어휘 확장 (vibes/eventTypes/companions)"
```

---

## Task 2: SYSTEM_PROMPT 3 매핑 블록 multi-line 화

**Files:**
- Modify: `services/llm/openai_chain.py`

- [ ] **Step 1: 기존 vibes 매핑 줄 + 팝업 줄 grep 으로 위치 확인**

```bash
grep -n "vibes 의미 매핑\|팝업 스토어/플리마켓/마켓" services/llm/openai_chain.py | head -5
```

Expected: 2 매치 (vibes 매핑 줄 + 다음 팝업 줄).

- [ ] **Step 2: 두 줄 (vibes 매핑 1줄 + 팝업 1줄) 을 3 블록으로 교체**

`services/llm/openai_chain.py` 의 SYSTEM_PROMPT_TEMPLATE 안 (`[추출 규칙 — filters]` 섹션 끝부분, periodKey 줄 다음):

이전:
```
- vibes 의미 매핑: "힐링·잔잔" → "정적", "신나는·역동" → "활동적", "직접·DIY" → "체험형",
  "보러" → "관람형", "배움" → "교육형", "사람들" → "네트워킹 중심".
- "팝업 스토어/플리마켓/마켓" 도 festival 로 분류 (현 카테고리 체계 한도).
```

수정 후:
```
- vibes 의미 매핑 — 사용자 발화의 분위기·활동성 표현 → 6 vibes 중 하나 이상:
  · "활동적": 야외·신나는·역동·에너지·뛰는·체력·몸쓰
  · "정적": 잔잔·조용·힐링·여유·차분·릴렉스·한적·고요
  · "체험형": 직접 해·DIY·만들기·참여·핸즈온·만져보는
  · "관람형": 보러·관람·구경·감상·둘러보기
  · "교육형": 배우는·강연·강의·학습·공부·지식
  · "네트워킹 중심": 사람 만나·교류·친목·어울리기·인맥
  여러 vibe 가 매칭되면 모두 포함 (예: "조용히 배우는" → 정적·교육형).
- eventTypes 의미 매핑 — 사용자 발화의 행사 종류 → 8 카테고리:
  · "festival": 축제·페스티벌·마켓·플리마켓·팝업·야시장·장터
  · "expo": 박람회·엑스포·페어·EXPO
  · "exhibition": 전시·미술관·갤러리·박물관·기획전·전시장
  · "performance": 공연·뮤지컬·연극·콘서트·콘서트홀·라이브·음악회·버스킹
  · "education": 교육·강좌·클래스·워크샵·강의·강연·원데이
  · "conference": 컨퍼런스·세미나
  · "symposium": 심포지엄·포럼
  · "movie": 영화·시네마·상영·영화제
  "강연" 단일 표현은 education 우선 (학습 의도). "컨퍼런스"·"세미나" 명시 시 conference.
- companions 의미 매핑 — 사용자 발화의 동행 표현 → 4 카테고리:
  · "family": 가족·부모님·엄마·아빠·아이·애들·자녀·조카·할머니·할아버지
  · "couple": 연인·데이트·여친·남친·와이프·남편·아내·신랑·신부
  · "friend": 친구·동기·동료·친구들·동료들·동창
  · "solo": 혼자·솔로·1인·혼술·혼밥
  여러 동행이 매칭되면 모두 포함 (예: "친구랑 가족이랑" → friend·family).
```

- [ ] **Step 3: 빌드 검증**

```bash
cd services/llm && python -c "from openai_chain import _build_system_prompt; p = _build_system_prompt(); print(f'len: {len(p)} chars')"
```

Expected: 정상 빌드. 이전 길이 (~11557) + ~600-800 = ~12200~12400.

- [ ] **Step 4: 잔존 옛 1줄 vibes 매핑 grep — 0 매치**

```bash
grep -n '"힐링·잔잔" → "정적"\|"신나는·역동" → "활동적"' services/llm/openai_chain.py
```

Expected: 0 매치 (옛 1줄 표현 사라짐).

- [ ] **Step 5: SYSTEM_PROMPT 와 filters.py 동기화 확인**

신규 vibes trigger 들이 두 파일에 모두 있는지 sanity check:
```bash
# "야외" 가 SYSTEM_PROMPT + VIBE_TABLE 둘 다 있는지
grep -nc "야외" services/llm/openai_chain.py services/llm/filters.py
```

Expected: 두 파일 각각 ≥1.

- [ ] **Step 6: Commit**

```bash
git add services/llm/openai_chain.py
git commit -m "feat(llm): SYSTEM_PROMPT 매핑 룰 3 블록 multi-line (vibes/eventTypes/companions)"
```

---

## Task 3: `chat-eval-cases.json` 신규 6건 추가

**Files:**
- Modify: `apps/bff/src/jobs/chat-eval-cases.json`

- [ ] **Step 1: cases 배열 끝에 6건 append**

`apps/bff/src/jobs/chat-eval-cases.json` 의 `"cases": [` 마지막 entry 뒤에 콤마 추가 + 다음 6 객체 삽입:

```json
    {
      "id": "vibes-outdoor-active",
      "messages": [{ "role": "user", "text": "야외 활동 좋은 거 있어?" }],
      "expect": {
        "filters": { "vibes": ["활동적"] },
        "referencesLast": false
      }
    },
    {
      "id": "vibes-quiet-relaxing",
      "messages": [{ "role": "user", "text": "조용히 쉬기 좋은 곳" }],
      "expect": {
        "filters": { "vibes": ["정적"] },
        "referencesLast": false
      }
    },
    {
      "id": "event-lecture-to-education",
      "messages": [{ "role": "user", "text": "이번 주말 강연 들으러 가고 싶어" }],
      "expect": {
        "filters": { "eventTypes": ["education"], "periodKey": "weekend" },
        "referencesLast": false
      }
    },
    {
      "id": "event-yashijang-festival",
      "messages": [{ "role": "user", "text": "한강 야시장 있어?" }],
      "expect": {
        "filters": { "eventTypes": ["festival"] },
        "referencesLast": false
      }
    },
    {
      "id": "companion-mom-family",
      "messages": [{ "role": "user", "text": "엄마랑 갈 만한 전시" }],
      "expect": {
        "filters": { "companions": ["family"], "eventTypes": ["exhibition"] },
        "referencesLast": false
      }
    },
    {
      "id": "companion-wife-couple",
      "messages": [{ "role": "user", "text": "와이프랑 데이트로 가기 좋은 곳" }],
      "expect": {
        "filters": { "companions": ["couple"] },
        "referencesLast": false
      }
    }
```

- [ ] **Step 2: JSON validity 확인**

```bash
cd apps/bff && jq '.cases | length' src/jobs/chat-eval-cases.json
```

Expected: 42 (이전 36 + 신규 6).

```bash
cd apps/bff && jq '.cases | map(.id) | .[-6:]' src/jobs/chat-eval-cases.json
```

Expected:
```json
["vibes-outdoor-active","vibes-quiet-relaxing","event-lecture-to-education","event-yashijang-festival","companion-mom-family","companion-wife-couple"]
```

- [ ] **Step 3: Commit**

```bash
git add apps/bff/src/jobs/chat-eval-cases.json
git commit -m "test(bff): chat-eval 의미 매핑 회귀 6건 (vibes 2 + eventTypes 2 + companions 2)"
```

---

## Task 4: chat-eval 42 cases 회귀 실행

**Files:** (검증만)

- [ ] **Step 1: services/llm 서버 재시작 (Slice A/B 학습 그대로)**

WSL2 uvicorn `--reload` 가 NTFS 마운트 inotify 미작동. 사용자 수동 재시작 필요할 수 있음.

PID 확인:
```bash
netstat -ano | grep ":8000.*LISTEN"
```

WSL 내부 PID 면 Windows PowerShell `Stop-Process` 실패 — 그 경우 BLOCKED 보고 + 사용자 안내.

stale 검사:
```bash
curl -sS http://localhost:8000/health | head -3
```

`stage2-openai` 응답 + 최근 시간이면 OK.

- [ ] **Step 2: chat-eval 실행**

```bash
cd apps/bff && pnpm run chat:eval 2>&1 | tee /tmp/chat-eval-slice-c.log
```

Expected: 42 cases run, ~7-9분.

- [ ] **Step 3: 결과 분석**

```bash
# 신규 6건만:
grep -E "vibes-|event-lecture|event-yashijang|companion-mom|companion-wife" /tmp/chat-eval-slice-c.log
# Slice A 잔존 (야외 → 활동적):
grep "specific-date-this-saturday-short" /tmp/chat-eval-slice-c.log
# summary:
grep "^summary:" /tmp/chat-eval-slice-c.log
```

Expected:
- 신규 6건 모두 PASS
- `specific-date-this-saturday-short` 이제 PASS (vibes "활동적" 추출 — 야외 매핑 학습)
- 전체 ≥ 40/42 PASS (Slice A 잔존 specific-date-after-next-saturday / specific-date-coming-sunday 만 FAIL 가능)

만약 신규 일부 FAIL — 매핑 룰이 학습 안 됨. 실 LLM 응답 분석 후 fewshot 추가 또는 룰 보강.

- [ ] **Step 4: (no commit — 검증만)**

---

## Task 5: 위키 메모 + 최종 점검

**Files:**
- Modify: `llm_wiki/wiki/topics/ai-enrichment.md`

- [ ] **Step 1: 위키 단락 추가**

`llm_wiki/wiki/topics/ai-enrichment.md` 의 직전 Slice B 단락 끝에 추가:

```markdown

## 자연어 파싱 의미 매핑 확장 (2026-05-29, Slice C)

vibes·eventTypes·companions 의 trigger 어휘 사전 확장 + SYSTEM_PROMPT 매핑 룰 multi-line 화.

- `VIBE_TABLE` / `EVENT_TYPE_TABLE` / `COMPANION_TABLE` 각 4-8 → 11-15 trigger. 신규: "야외"(활동적), "조용히"(정적), "야시장"(festival), "엄마/아빠"(family), "와이프/남편"(couple) 등.
- SYSTEM_PROMPT `[추출 규칙 — filters]` 의 1줄 vibes 매핑 + 1줄 팝업 룰 → 3 매핑 블록 multi-line (vibes 6 · eventTypes 8 · companions 4). "강연" → education 우선 결정 명시. 다중 매칭 명시 ("조용히 배우는" → 정적·교육형).
- `filters.py` 사전 + SYSTEM_PROMPT 동기화 — dev/CI fallback (LLM 무) 도 일관 결과.
- chat-eval 신규 6건 회귀 (36 → 42). vibes 2 + eventTypes 2 + companions 2. Slice A 잔존 `specific-date-this-saturday-short` ("야외" → "활동적") 동시 해소.
```

- [ ] **Step 2: 최종 검증**

```bash
# Python import
cd services/llm && python -c "import openai_chain, filters; print('OK')"

# fallback 동작 — 야외/조용히/야시장/엄마/와이프 모두 정확 매핑
cd services/llm && python <<'EOF'
from filters import extract
tests = [
    ("야외 활동", "vibes", ["활동적"]),
    ("조용히 쉬기", "vibes", ["정적"]),
    ("야시장 가자", "eventTypes", ["festival"]),
    ("엄마랑 전시", "companions", ["family"]),
    ("와이프랑 데이트", "companions", ["couple"]),
    ("강연 들으러", "eventTypes", ["education"]),
]
for text, key, expected in tests:
    r = extract(text)
    got = r.get(key, [])
    status = "PASS" if expected[0] in got else "FAIL"
    print(f"  {status}  {text!r:30} {key}={got}")
EOF
```

Expected: 6/6 PASS.

```bash
# BFF typecheck (변경 없지만 sanity)
cd apps/bff && pnpm typecheck 2>&1 | tail -3

# chat-eval-cases 개수
cd apps/bff && jq '.cases | length' src/jobs/chat-eval-cases.json
# 42 expected
```

- [ ] **Step 3: Commit (위키만)**

```bash
git add llm_wiki/wiki/topics/ai-enrichment.md
git commit -m "docs(wiki): ai-enrichment 의미 매핑 확장 메모 (Slice C)"
```

---

## Definition of Done

- [ ] `filters.py` 3 테이블 어휘 확장 (COMPANION/EVENT_TYPE/VIBE)
- [ ] SYSTEM_PROMPT `[추출 규칙 — filters]` 3 매핑 블록 multi-line (vibes 6 + eventTypes 8 + companions 4)
- [ ] `chat-eval-cases.json` 42 cases (36 + 6 신규)
- [ ] chat-eval 회귀 — 신규 6 PASS + Slice A 잔존 `specific-date-this-saturday-short` PASS 복귀 + 기존 35 회귀 보호
- [ ] 위키 ai-enrichment Slice C 단락
- [ ] `python filters.extract(...)` 사전 동작 6/6 PASS (야외/조용히/야시장/엄마/와이프/강연)
- [ ] `pnpm --filter bff typecheck` 0 신규 errors
- [ ] grep 옛 1줄 vibes 매핑 표현 0 매치
