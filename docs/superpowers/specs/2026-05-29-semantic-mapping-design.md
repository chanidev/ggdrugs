---
title: 자연어 파싱 의미 매핑 확장 (Slice C)
created: 2026-05-29
status: draft → user-review
owner: LLM Agent (주) + Backend Agent
related:
  - docs/superpowers/specs/2026-05-28-llm-prompt-nationwide-domain-design.md
  - docs/superpowers/specs/2026-05-28-specific-date-self-check-design.md
  - docs/superpowers/specs/2026-05-29-multi-turn-intent-references-design.md
  - services/llm/openai_chain.py
  - services/llm/filters.py
---

# 자연어 파싱 의미 매핑 확장 설계서 (Slice C)

## 1. 배경

채팅 `/chat` 의 5 필터 축 (companions / eventTypes / vibes / regionHints / periodKey) 중 **vibes·eventTypes·companions** 의 trigger 어휘 사전이 좁다:

- `services/llm/openai_chain.py:327-329` SYSTEM_PROMPT `[추출 규칙 — filters]` 의 vibes 매핑 = 1줄 짧은 명시 (각 vibe 당 1-2 trigger 만)
- eventTypes 매핑은 `"팝업/마켓 → festival"` 한 줄 룰뿐. 다른 매핑은 fewshot 의존
- companions 매핑 룰 자체 없음. fewshot 학습만
- `services/llm/filters.py` VIBE_TABLE/EVENT_TYPE_TABLE/COMPANION_TABLE 는 dev/CI fallback 용 — LLM 활성 시 안 탐. SYSTEM_PROMPT 와 비동기

Slice A 의 `chat-eval` 잔존 FAIL `specific-date-this-saturday-short` 가 정확히 이 약점:
- 발화 `"이번 토요일 야외 행사"` → expected `filters.vibes=["활동적"]`, got `[]`
- LLM 이 "야외" → "활동적" 매핑 학습 안 됨 (현 SYSTEM_PROMPT 와 VIBE_TABLE 모두 "야외" 없음)

본 spec 은 3 축 (vibes·eventTypes·companions) 의 매핑 사전을 확장하고 SYSTEM_PROMPT 룰을 multi-line block 으로 명시화한다. fewshot 학습 + 사전 fallback 둘 다 보강.

## 2. 스코프

포함:

- `VIBE_TABLE` / `EVENT_TYPE_TABLE` / `COMPANION_TABLE` 어휘 확장 (각 6-15개 trigger)
- SYSTEM_PROMPT `[추출 규칙 — filters]` 의 매핑 룰 3 블록 — 1줄 → multi-line 명시
- "강연" → `education` 우선 결정 (학습 의도 — 컨퍼런스 명시 시 conference)
- 다중 매칭 명시 ("조용히 배우는" → 정적·교육형 둘 다)
- `chat-eval-cases.json` 신규 6건 (vibes·eventTypes·companions 의미 매핑 회귀)
- Slice A 잔존 FAIL `specific-date-this-saturday-short` 동시 해소 기대

제외:

- regionHints 의미 매핑 (이미 ADR 0006 으로 확장됨 — 17 sido + 257 시군구)
- periodKey 의미 매핑 (5 키 충분, 이미 PERIOD_TABLE 풍부)
- 다국어 (영어 발화) — 한국어만
- vibe 자체 추가 (6 vibes 외 신규 vibe 도메인) — 별도 ADR

## 3. 아키텍처 변경 맵

```
services/llm/openai_chain.py
  - SYSTEM_PROMPT_TEMPLATE [추출 규칙 — filters] (line 327-329 부근)
    · vibes 의미 매핑: 1줄 → 6 vibes 별 6-8 trigger multi-line block
    · eventTypes 의미 매핑: 신설 — 8 카테고리 별 변형 trigger block
    · companions 의미 매핑: 신설 — 4 동행 별 변형 trigger block
    · 다중 매칭 명시 + "강연" 결정 룰 명시

services/llm/filters.py
  - VIBE_TABLE: 각 vibe 별 4-8 → 11-12 trigger
  - EVENT_TYPE_TABLE: 야시장·강연·콘서트홀·기획전·EXPO 등 추가
  - COMPANION_TABLE: 엄마·아빠·와이프·남편·아내·동료들 등 추가
  - SYSTEM_PROMPT 와 동기화 (동일 사전 — 검증 가능)

apps/bff/src/jobs/chat-eval-cases.json
  - 신규 6건 (36 → 42):
    · vibes-outdoor-active ("야외" → 활동적)
    · vibes-quiet-relaxing ("조용히 쉬기" → 정적)
    · event-lecture-to-education ("강연" → education)
    · event-yashijang-festival ("야시장" → festival)
    · companion-mom-family ("엄마랑" → family)
    · companion-wife-couple ("와이프랑" → couple)
```

## 4. 컴포넌트 상세

### 4.1 `VIBE_TABLE` 확장

이전 (`services/llm/filters.py:46-53`):
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

각 vibe 별 4-8 → 11-12 trigger. 어휘 충돌 (예: "강연" 이 vibes 의 교육형 + eventTypes 의 education 둘 다 매칭) 은 다중 매칭으로 자연 처리.

### 4.2 `EVENT_TYPE_TABLE` 확장

이전 (`services/llm/filters.py:24-33`):
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

**핵심 결정 — "강연" → education 우선**:
- "강연" 단일 발화는 `education` 으로 매핑 (학습 의도가 일반적)
- 사용자가 "컨퍼런스" / "세미나" / "심포지엄" / "포럼" 을 명시하면 그 카테고리 우선
- 충돌 시 fallback (`_match_any`) 는 둘 다 매칭하지만, SYSTEM_PROMPT 룰이 "단일 강연 → education" 우선 명시

**eventTypes 의 "전시장" "기획전"** — 충돌 없음 (다른 카테고리 trigger 와 겹치지 않음).

### 4.3 `COMPANION_TABLE` 확장

이전 (`services/llm/filters.py:17-22`):
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

**충돌 가능성**: "신랑" 발화 — `couple` 매칭. 잔치 / 결혼식 컨텍스트가 아닌 일반 데이트 의도라 자연. 사용자가 "신랑 회사 동료들이랑" 같이 복잡 발화 → couple + friend 둘 다 매칭 (의도 union, 정상).

**다중 동행** ("친구랑 가족이랑") — `_match_any` 가 두 그룹 다 매칭 → `companions=["family","friend"]`. SYSTEM_PROMPT 룰에 명시.

### 4.4 SYSTEM_PROMPT 매핑 룰 multi-line 화

`services/llm/openai_chain.py:327-329` 부근:

이전:
```
- vibes 의미 매핑: "힐링·잔잔" → "정적", "신나는·역동" → "활동적", "직접·DIY" → "체험형",
  "보러" → "관람형", "배움" → "교육형", "사람들" → "네트워킹 중심".
- "팝업 스토어/플리마켓/마켓" 도 festival 로 분류 (현 카테고리 체계 한도).
```

수정 후 (3 매핑 블록 multi-line):
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

기존 fewshot 17건 + Slice B 추가 23건 의 학습 데이터 그대로 활용 — 매핑 룰 명시화 만으로 정확도 ↑ 기대.

### 4.5 `chat-eval-cases.json` 신규 6건

```json
{
  "id": "vibes-outdoor-active",
  "messages": [{"role":"user","text":"야외 활동 좋은 거 있어?"}],
  "expect": {
    "filters": {"vibes":["활동적"]},
    "referencesLast": false
  }
},
{
  "id": "vibes-quiet-relaxing",
  "messages": [{"role":"user","text":"조용히 쉬기 좋은 곳"}],
  "expect": {
    "filters": {"vibes":["정적"]},
    "referencesLast": false
  }
},
{
  "id": "event-lecture-to-education",
  "messages": [{"role":"user","text":"이번 주말 강연 들으러 가고 싶어"}],
  "expect": {
    "filters": {"eventTypes":["education"],"periodKey":"weekend"},
    "referencesLast": false
  }
},
{
  "id": "event-yashijang-festival",
  "messages": [{"role":"user","text":"한강 야시장 있어?"}],
  "expect": {
    "filters": {"eventTypes":["festival"]},
    "referencesLast": false
  }
},
{
  "id": "companion-mom-family",
  "messages": [{"role":"user","text":"엄마랑 갈 만한 전시"}],
  "expect": {
    "filters": {"companions":["family"],"eventTypes":["exhibition"]},
    "referencesLast": false
  }
},
{
  "id": "companion-wife-couple",
  "messages": [{"role":"user","text":"와이프랑 데이트로 가기 좋은 곳"}],
  "expect": {
    "filters": {"companions":["couple"]},
    "referencesLast": false
  }
}
```

**기대 효과**: 신규 6 PASS + Slice A 잔존 `specific-date-this-saturday-short` ("야외" → "활동적") 도 PASS 로 전환.

## 5. 데이터 흐름 (변경 없음)

```
User 발화 → BFF /chat → services/llm /chat
  → openai_chain.extract_via_openai
    → SYSTEM_PROMPT 의 [추출 규칙 — filters] 매핑 룰 multi-line + _FEWSHOT 23건
    → 응답: { filters{vibes,eventTypes,companions,regionHints,periodKey}, ... }
  → BFF chat.ts: 기존 처리 (vibes → vibeIds resolve, eventTypes → events 쿼리)
```

dev/CI fallback 경로:
```
LLM 무 → filters.extract → COMPANION_TABLE/EVENT_TYPE_TABLE/VIBE_TABLE 매칭
  → SYSTEM_PROMPT 와 동기화된 동일 어휘 → 일관 결과
```

## 6. 에러 처리

- 사용자 발화에 매핑 모호 ("강연 들으러 컨퍼런스 가고 싶어") → eventTypes union (`["education","conference"]`). BFF 가 둘 다 events 쿼리에 OR 로 적용.
- 사용자 발화에 사전에 없는 신조어 ("힙스터 모임") → vibes/companions 빈 배열. LLM 이 fewshot 학습으로 추측 가능하지만 보장 안 됨.
- 다중 매칭 ("조용히 배우는") → `vibes=["정적","교육형"]`. BFF 가 OR 로 events 쿼리.

## 7. 테스트

### 7.1 자동
- `chat-eval` 42 cases (기존 36 + 신규 6). 신규 6 PASS + Slice A 잔존 `specific-date-this-saturday-short` PASS 회복 + 기존 35 회귀 보호.

### 7.2 수동 spot
- "야외 활동 좋은 거" → vibes=["활동적"]
- "조용히 쉬기" → vibes=["정적"]
- "강연 들으러" → eventTypes=["education"]
- "엄마랑 전시" → companions=["family"], eventTypes=["exhibition"]
- "와이프랑 데이트" → companions=["couple"]
- "한강 야시장" → eventTypes=["festival"], regionHints=["서울"] 또는 자치구

### 7.3 dev/CI fallback
- `OPENAI_API_KEY` 임시 unset → `filters.extract("야외 활동")` → vibes=["활동적"]
- 사전 어휘 동기화 확인 (SYSTEM_PROMPT 와 동일 trigger)

## 8. 롤백 정책

순수 텍스트 수정 + dict 데이터 변경 + JSON 추가. `git revert` 만으로 OK. DB 마이그레이션 무관.

## 9. 비용 영향

| 항목 | 변경 |
|---|---|
| SYSTEM_PROMPT input tokens | +200~300 (3 매핑 블록 multi-line) |
| _FEWSHOT input tokens | 변동 없음 |
| 호출 당 input | ~+250 tokens |
| 비용 변동 | ~$0.00001/호출, 무관 |
| `TOKEN_BUDGET_DAILY_USD` | 영향 없음 |

## 10. 영향 받는 파일

신규:
- `docs/superpowers/specs/2026-05-29-semantic-mapping-design.md` (본 spec)

수정:
- `services/llm/openai_chain.py` — SYSTEM_PROMPT `[추출 규칙 — filters]` 3 매핑 블록
- `services/llm/filters.py` — VIBE_TABLE / EVENT_TYPE_TABLE / COMPANION_TABLE 어휘 확장
- `apps/bff/src/jobs/chat-eval-cases.json` — 신규 6건 (36 → 42)
- `llm_wiki/wiki/topics/ai-enrichment.md` — 한 단락 추가 (Slice C)

미변경:
- `_FEWSHOT` (직전 Slice B 후 23건 그대로) — 매핑 룰 명시화로 학습 보강, fewshot 신규 불필요
- `compose_retreat` / `judge_relevance` / `summarize_event` / `classify_sentiment` — 무관
- BFF `chat.ts` 라우트 — vibes/eventTypes/companions 처리 로직 변동 없음

## 11. 오픈 아이템

- **"강연" → education vs conference 결정**: education 우선 (학습 의도). SYSTEM_PROMPT 룰에 명시. 컨퍼런스 명시 시 conference.
- **다중 vibe·동행 매칭 학습**: SYSTEM_PROMPT 룰만으로 학습. fewshot 신규 추가 없음. 실측 결과 부정확 시 후속 fewshot 추가.
- **어휘 사전 동기화 검증**: `VIBE_TABLE` 의 trigger 들이 SYSTEM_PROMPT 의 vibes 블록 trigger 와 동일한지 — 구현 단계에서 grep 확인.
- **사전에 없는 신조어**: 본 spec 미커버. 추후 사용자 발화 로그 분석으로 사전 갱신 — 별도 운영 절차.
