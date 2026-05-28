---
title: LLM 프롬프트 전국 도메인 확장
created: 2026-05-28
status: draft → user-review
owner: LLM Agent (주) + Backend Agent
related:
  - docs/decisions/0006-nationwide-region-expansion.md
  - llm_wiki/wiki/topics/ai-enrichment.md
  - services/llm/openai_chain.py
  - services/llm/filters.py
---

# LLM 프롬프트 전국 도메인 확장 설계서

## 1. 배경

ADR 0006 (2026-05-27) 으로 데이터 도메인 (`events.region`, `regions` 테이블) · BFF (`/regions`, ingest 가드, resolver) · Web UI (FilterSearchPanel 사이도 그룹 chip, SeoulMap 폴리곤 매칭) 가 전국으로 일관 확장됐다. 그러나 `services/llm/` 의 LLM 프롬프트는 서울 가정 그대로:

- `openai_chain.py:188` SYSTEM_PROMPT_TEMPLATE: `"한국어 서울 이벤트(축제·전시·공연·박람회 등) 검색 어시스턴트 'Alle'"`
- `openai_chain.py:271` regionHints 허용 목록: `"서울 25개 구"` 하드코드
- `openai_chain.py:84` `_FEWSHOT`: 강남·성수동·홍대 등 서울 위주 예시 5건
- `openai_chain.py:891` `compose_retreat` system: `"한국어 서울 이벤트 검색 어시스턴트"` 동일 한정
- `filters.py:56,97` `SEOUL_GU` 상수 + fallback_extract 의 regionHints 매칭이 서울 25 구만

결과: 사용자가 "부산 해운대 축제" 발화해도 LLM 이 "regionHints 허용 외" 로 보고 빈 배열 반환, 또는 "강남" 같은 서울 추측. 채팅이 전국 데이터를 가리지 못함.

본 spec 은 채팅 LLM 의 시야를 전국 도메인으로 일관 확장한다. 별도 기능 추가 (LLM 추천 설명, 멀티턴 의도 처리 심화 등) 는 본 spec 범위 밖.

## 2. 스코프

포함:

- `SYSTEM_PROMPT_TEMPLATE` 도메인 문구 + regionHints 허용 표현
- `_FEWSHOT` 비-서울 케이스 교체·추가
- `compose_retreat` system 일반화
- `judge_relevance` 도메인 점검 (서울 한정 표현 있으면 일반화)
- `filters.py` SEOUL_GU 상수 + fallback_extract 의 regionHints 매칭 — sido 17 lite 매칭으로 교체
- `chat-eval-cases.json` 비-서울 회귀 4건 추가
- (Task 12 기적용) `chat-rank-bench-queries.json` 비-서울 3건 — 보존
- 위키 (`ai-enrichment.md` 갱신은 ranking 토픽 외라 본 spec 에선 prompt 영역 위주, 변경 적음)

제외:

- LLM 추천 reason 생성 (별도 spec)
- 채팅 의도 처리 심화 (specificDate 자가 점검 강화 등)
- BFF chat 라우트 (`chat.ts`) 변경 — LLM 응답 shape 유지
- `summarize_event` / `classify_sentiment` 프롬프트 (서울 한정 표현 없음)

## 3. 아키텍처 변경 맵

```
services/llm/openai_chain.py
  - SYSTEM_PROMPT_TEMPLATE (line 188)
    · 도메인 문구: "서울 이벤트" → "전국(17 시/도) 이벤트"
    · regionHints 허용 표현: 옵션 B — "17 시/도 + 각 산하 시/군/구 (예: 해운대구, 수원시 영통구, 강릉시)"
    · 예시 텍스트 ("강남" 같은 서울 한정) 일반화 / 다양화
  - _FEWSHOT (line 84) — 기존 케이스 보존 + 비-서울 신규 3건 추가 (부산 자치구 / 강릉 시 + specificDate / 수원시 영통구 합성형)
  - compose_retreat system (line 891) — "서울 이벤트" → "전국 이벤트"
  - judge_relevance system (line 1080+) — 점검 후 동일 패턴이면 일반화

services/llm/filters.py
  - SEOUL_GU 상수: 그대로 유지 (다른 곳에서 사용 가능성)
  - fallback_extract 의 regionHints 매칭: sido 17 단축형만 인식 (lite)
    → "부산 갈래" → regionHints=["부산"], "수원시 영통구 가족 행사" → regionHints=["경기"]
    → 시/군/구 미인식 (LLM fallback 정확도 양보, dev/CI 환경 한정)

apps/bff/src/jobs/chat-eval-cases.json
  - 비-서울 회귀 4건 추가 (id prefix `nationwide-`)
    · 부산 해운대 가족 축제 (sido 단축 + 자치구)
    · 경기 수원시 영통구 데이트 잔잔한 전시 (합성형)
    · 강원 강릉 커피축제 다음주 토요일 (specificDate + sido 단독)
    · 충북 청주시 흥덕구 (합성형 시군구 정확 매칭)
```

## 4. 컴포넌트 상세

### 4.1 `SYSTEM_PROMPT_TEMPLATE` 변경

도메인 첫 문장:

이전:
```
당신은 한국어 서울 이벤트(축제·전시·공연·박람회 등) 검색 어시스턴트 'Alle' 입니다.
```

수정 후:
```
당신은 한국어 전국 이벤트(축제·전시·공연·박람회 등) 검색 어시스턴트 'Alle' 입니다. 대한민국 전국 17 시/도 (서울·부산·대구·인천·광주·대전·울산·세종·경기·강원·충북·충남·전북·전남·경북·경남·제주) 의 이벤트를 다룹니다.
```

`[추출 규칙 — filters]` 의 강남 예시 문장:

이전:
```
- "강남" → "강남구" 처럼 접미어 없어도 매칭. 단 "구로구" 같이 글자 일부가 다른 구와
  겹치면 정확히 일치하는 구만.
```

수정 후:
```
- 사용자 발화의 지역어 → 가장 가까운 정식 시/군/구 표기. "강남" → "강남구", "해운대" → "해운대구", "영통" → "수원시 영통구" 처럼 자치구 있는 시는 합성형 ("<시> <구>"). "다른 구와 글자 일부가 겹치면 정확히 일치하는 것만 (예: '구로'는 '구로구'로만, '동구'는 어느 sido 의 동구인지 문맥으로).
```

`[허용 값]` 의 regionHints 줄 (옵션 B):

이전:
```
- regionHints: 서울 25개 구 (종로구, 중구, 용산구 ... 강남구, 송파구, 강동구)
```

수정 후:
```
- regionHints: 전국 17 시/도 단축형 (서울·부산·대구·인천·광주·대전·울산·세종·경기·강원·충북·충남·전북·전남·경북·경남·제주) 또는 그 산하 시/군/구. 예시 — 서울 자치구: 종로구·강남구·해운대구·유성구, 광역시 자치구: 해운대구·수성구·미추홀구·서구, 일반시·군: 수원시·고양시·강릉시·통영시·고흥군, 자치구 있는 일반시 합성형: 수원시 영통구·성남시 분당구·청주시 흥덕구·창원시 마산합포구. 모든 시/군/구 257건 중 사용자 발화에 매칭되는 것 1개 이상 추출.
```

### 4.2 `_FEWSHOT` 다양화

**기존 케이스는 모두 유지** (서울 회귀 보존). **신규 3건 추가** — 사용자 발화의 sido·자치구·합성형 다양성 확보. 최종 카운트는 기존 + 3 (구현 시 정확한 기존 갯수 grep). 서울 위주 예시 1건이 그대로 남아있으면 모델이 비-서울 케이스 학습 후에도 서울 회귀 잘 처리한다는 신호.

신규 추가 3건:

| 신규 # | 발화 | 의도 검증 포인트 |
|---|---|---|
| A | "부산 해운대 데이트 잔잔한 전시" | sido 단축 + 자치구. `regionHints=["부산","해운대구"]` 또는 `["해운대구"]` 단일. 모델이 어느 표기 우선하는지 fewshot 으로 명시 — 자치구 단독 권장. |
| B | "다음주 토요일 강릉 커피축제" | sido 단독 + specificDate 자가 점검 (다음주 토요일 = 컨텍스트 표). `regionHints=["강릉시"]`, `specificDate=YYYY-MM-DD`. |
| C | "수원시 영통구 가족 행사" | 자치구 있는 일반시 합성형. `regionHints=["수원시 영통구"]` 정확 매칭. 모델이 공백 1개로 합성형 출력하도록 명시. |

### 4.3 `compose_retreat` 변경

이전 (line 891):
```python
sys = (
    f"당신은 한국어 서울 이벤트 검색 어시스턴트 'Alle' 의 retreat 모드입니다.\n"
    ...
)
```

수정 후:
```python
sys = (
    f"당신은 한국어 전국 이벤트 검색 어시스턴트 'Alle' 의 retreat 모드입니다.\n"
    ...
)
```

`judge_relevance` 의 system prompt 도 동일 점검 후 한 줄 내외 일반화.

### 4.4 `filters.py` fallback 경량화

이전 (line 97):
```python
"regionHints": [gu for gu in SEOUL_GU if gu in t or gu[:-1] in t],
```

수정 후:
```python
# 17 시/도 단축형만 매칭. 시/군/구는 LLM 없는 dev/CI fallback 에서는 미인식.
_SIDO_KEYWORDS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
                  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]
"regionHints": [k for k in _SIDO_KEYWORDS if k in t],
```

`SEOUL_GU` 상수 자체는 삭제하지 않음 — 만약 다른 곳에서 참조하면 break 위험. grep 으로 사용 0건 확인 후 삭제 결정 (구현 단계).

### 4.5 `chat-eval-cases.json` 신규 4건

```json
{
  "id": "nationwide-busan-haeundae-family",
  "messages": [{ "role": "user", "text": "부산 해운대 가족이랑 갈만한 축제" }],
  "expect": {
    "filters": { "companions": ["family"], "eventTypes": ["festival"], "regionHints": ["해운대구"] },
    "referencesLast": false
  }
},
{
  "id": "nationwide-suwon-yeongtong-date",
  "messages": [{ "role": "user", "text": "수원시 영통구 데이트로 갈만한 잔잔한 전시" }],
  "expect": {
    "filters": { "companions": ["couple"], "eventTypes": ["exhibition"], "vibes": ["정적"], "regionHints": ["수원시 영통구"] },
    "referencesLast": false
  }
},
{
  "id": "nationwide-gangneung-coffee-nextsat",
  "messages": [{ "role": "user", "text": "다음주 토요일 강릉 커피축제" }],
  "expect": {
    "filters": { "eventTypes": ["festival"], "regionHints": ["강릉시"] },
    "specificDate": "any-string",
    "referencesLast": false
  }
},
{
  "id": "nationwide-cheongju-heungdeok-compound",
  "messages": [{ "role": "user", "text": "청주시 흥덕구 주말 전시" }],
  "expect": {
    "filters": { "eventTypes": ["exhibition"], "regionHints": ["청주시 흥덕구"], "periodKey": "weekend" },
    "referencesLast": false
  }
}
```

`specificDate` 의 "any-string" 은 기존 평가 스크립트 의 자유 매칭 표기 (실제 표기는 chat-eval.ts 에서 확인 후 정합 — 구현 시).

## 5. 데이터 흐름 (변경 없음)

```
User 발화 → BFF /chat → services/llm /chat
  → openai_chain.extract_via_openai(_stream)
    → SYSTEM_PROMPT (전국 도메인 + 17 sido 명시 + 시/군/구 자유 추출)
    → response: { filters{regionHints[]}, specificDate, reply, followups }
  → BFF chat.ts 가 regionHints 를 events 검색 쿼리에 전달
    (BFF 측 매칭 로직은 기존 그대로 — sigungu 정확명 매칭 가정)
```

regionHints 의 값 분포 (LLM 출력):
- sido 단축형: "부산", "경기" — sido 광역 row 매칭
- 자치구 단순형: "해운대구", "강남구" — events.region.sigungu 매칭
- 자치구 합성형: "수원시 영통구" — events.region.sigungu 매칭 (DB 표기와 일치)
- 일반시·군: "강릉시", "통영시", "고흥군" — events.region.sigungu 매칭

BFF `chat.ts` 의 기존 처리 (regionHints → events 쿼리 conditions) 는 그대로. 만약 LLM 이 sido 단축형 ("부산") 만 반환했을 때 BFF 가 적절히 처리하는지 구현 단계에서 점검 — 만약 strict equal 만 한다면 sido 광역 row 매칭으로 fallback 룰 추가 필요.

## 6. 에러 처리

- LLM 이 허용 표현 외 (예: 영어, 가짜 sido 이름) 반환 → BFF 가 events 쿼리에서 0 매칭 → `compose_retreat` 트리거 → 정직한 retreat reply.
- OPENAI_API_KEY 없거나 예산 초과 → `filters.py` fallback (sido 17 lite 매칭) → LLM 호출 없음 → BFF 가 sido 광역 row 로 매칭. 자치구 단위 검색 정확도는 LLM stage 가 필요.

## 7. 테스트

### 7.1 자동
- `chat-eval` 신규 4건 (§4.5) + 기존 22건 회귀: pass 율 변동.
- `chat-rank-bench` Task 12 의 3건 + 기존 12건: P50/P95 rank.

### 7.2 수동 spot check
- "부산 해운대 축제" → regionHints 에 `"해운대구"` (또는 `"부산"`) 포함, reply 자연
- "수원시 영통구 데이트 잔잔한 전시" → regionHints `["수원시 영통구"]`, vibes `["정적"]`
- "다음주 토요일 강릉 커피축제" → specificDate ISO YYYY-MM-DD, regionHints `["강릉시"]`
- "강남 데이트 잔잔한 전시" → 회귀 검증 (서울 케이스 깨지지 않음)

### 7.3 fallback path (dev)
- `OPENAI_API_KEY` 임시 unset → `fallback_extract("부산 가족 축제")` → regionHints=["부산"]
- 사용자 영향: LLM 없을 때 자치구 단위 인식 안 됨. 의도된 trade-off.

## 8. 롤백 정책

순수 텍스트 수정 + JSON 추가. `git revert` 만으로 깔끔히 되돌릴 수 있음. DB 마이그레이션 무관. 평가 케이스 4건도 추가만이라 revert 시 자동 사라짐.

## 9. 비용 영향

| 항목 | 변경 |
|---|---|
| SYSTEM_PROMPT input tokens | +60~120 (도메인 문구 1줄 + 17 sido 나열 + 시/군/구 예시 문장) |
| _FEWSHOT input tokens | +180~250 (3건 신규) |
| chat 호출 당 input | ~+250 tokens (가산) |
| 비용 변동 | $0.04 / 1M tokens (gpt-4o-mini 입력가) × 250 = $0.00001/호출 — 무관 |
| 일일 100 호출 가정 | +$0.001/일 |

`TOKEN_BUDGET_DAILY_USD` 미설정 또는 충분 시 영향 없음. 설정돼있어도 +$0.001 수준은 무관.

## 10. 영향 받는 파일

신규:
- `docs/superpowers/specs/2026-05-28-llm-prompt-nationwide-domain-design.md` (본 spec)

수정:
- `services/llm/openai_chain.py` — `SYSTEM_PROMPT_TEMPLATE`, `_FEWSHOT`, `compose_retreat`, (점검) `judge_relevance`
- `services/llm/filters.py` — `fallback_extract` regionHints 룰 (`_SIDO_KEYWORDS` 신규)
- `apps/bff/src/jobs/chat-eval-cases.json` — 4건 추가
- (선택) `llm_wiki/wiki/topics/ai-enrichment.md` — 본 변경 후속 메모

미변경 (확인):
- `summarize_event` system prompt — 서울 한정 표현 없음 (이미 일반)
- `classify_sentiment` system prompt — 서울 무관
- `rerank_candidates` system prompt — 이미 "한국어 이벤트" (일반화 완료)
- BFF `chat.ts` 라우트 — LLM 응답 shape 변동 없음 (sigungu 단위 매칭 가정 유지)
- Web FilterSearchPanel, SeoulMap — 무관

## 11. 오픈 아이템

- **BFF chat.ts 의 regionHints 처리**: LLM 이 sido 단축형 ("부산") 만 반환했을 때 events 쿼리가 sido 광역 row 매칭으로 fallback 하는지 — 구현 단계에서 점검. 안 하면 별도 fix.
- **`SEOUL_GU` 상수 잔존 사용처**: grep 으로 0 건이면 삭제 가능. 구현 단계에서 결정.
- **`chat-eval.ts` 의 specificDate 매칭 표기**: "any-string" 인지 `*` 인지 — 케이스 JSON 작성 전 확인.
- **`_FEWSHOT` 4번 케이스 ("강남 데이트")**: 서울 회귀 보존용 1건. 모델이 비-서울도 일반화 잘 처리하면 그대로 유지.
- **chat-rank-bench Task 12 의 3건 baseline 측정**: DB 에 비-서울 events 393건 (TourAPI 표본 backfill 후) 들어와있으므로 의미 있는 측정 가능. 본 spec 구현 후 baseline 기록.
