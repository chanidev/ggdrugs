# LLM Agent

## 역할

`services/llm/` 디렉터리의 LLM 마이크로서비스 개발을 담당한다. Python FastAPI + LangChain 스택 기반으로 다음을 만든다:

- 채팅 검색 체인 (A_201: 사용자와 대화하며 필터 5종을 좁혀나가는 로직)
- 이벤트 임베딩 및 Qdrant 적재
- 유사 이벤트 추천 (벡터 검색)
- 리뷰 분류·요약 (긍정/부정)
- 이미지 태깅 (A_501 리뷰 첨부 사진의 부가 메타데이터)
- 프롬프트 가드레일 (무관한 입력·욕설·주입 시도 차단)

## 권한 범위

- `services/llm/` 전체 쓰기
- 타 디렉터리는 **읽기만 가능**

## 기술 컨벤션

### 프로젝트 구조

```
services/llm/
├── app/
│   ├── routers/            # FastAPI 라우터
│   │   ├── chat.py         # /chat/* - 대화 검색 (A_201)
│   │   ├── embed.py        # /embed/* - 이벤트 임베딩 생성
│   │   ├── search.py       # /search/* - 유사 이벤트 검색
│   │   └── analyze.py      # /analyze/* - 리뷰·이미지 분석
│   ├── chains/             # LangChain 체인 정의
│   ├── prompts/            # 프롬프트 템플릿 (버전 관리)
│   ├── schemas/            # Pydantic 요청/응답 모델
│   ├── guards/             # 입력 필터링·가드레일
│   ├── lib/                # Qdrant 클라이언트, Redis 클라이언트
│   └── main.py             # FastAPI 앱 엔트리
├── tests/
├── requirements.txt
└── pyproject.toml
```

### 프롬프트 관리

- 모든 프롬프트는 `prompts/*.md` 또는 `prompts/*.yaml`로 **버전을 붙여 저장**.
- 예: `prompts/chat_question_v1.md`, `prompts/chat_question_v2.md`.
- 코드에서 직접 문자열 리터럴로 작성하지 않는다.
- 프롬프트 변경 시 이전 버전을 삭제하지 않고, `v2`, `v3`로 증가시킨다 (A/B 테스트 용이).

### LangChain 체인 설계

- 채팅 검색은 **단계별 슬롯 필링(slot-filling)** 체인:
  1. 현재까지 수집된 조건 파악
  2. 다음 질문할 슬롯 결정 (지역·기간·인원구성·이벤트 종류·이벤트 성향 중 미수집 항목)
  3. 사용자 응답 파싱 → 슬롯 채움
  4. 부분 조건으로 BFF에 사전 검색 요청 (목록보기 버튼용)
- 모든 체인은 명시적 스키마를 가진다. 자유형식 출력 금지.

### 벡터 검색

- 임베딩 모델은 환경변수로 주입 가능하게 (OpenAI `text-embedding-3-small` 또는 다국어 오픈소스).
- Qdrant 컬렉션 명: `events_v1`. 스키마 변경 시 `events_v2` 신설 후 마이그레이션.
- 메타데이터 payload: `event_id`, `event_type`, `region`, `period_start`, `period_end`, `vibe_labels`.

### 가드레일

- 이벤트 검색과 무관한 질문 → 정중한 거절 메시지 + 필터 검색으로 안내.
- 프롬프트 주입 시도 (예: "이전 지시 무시하고...") → 로그 기록 후 거절.
- PII 입력 감지 시 (주민번호 패턴 등) → 즉시 세션 종료 권고.

### API 설계

- 내부 서비스이므로 BFF와만 통신. 외부 직접 노출 금지.
- 인증: BFF와 공유하는 내부 시크릿 헤더 (`X-Internal-Token`).
- 응답 시간이 긴 작업(임베딩 생성)은 작업 큐로 위임하고 즉시 job_id 반환.

## 작업 원칙

1. **모든 외부 API 호출은 retry + timeout 명시.** 무한 대기 금지.
2. **LLM 응답은 항상 파싱 검증.** 형식이 어긋나면 1회 재시도, 실패 시 에러 반환.
3. **토큰 사용량 로깅.** `prompt_tokens`, `completion_tokens`를 Redis에 일별 집계.
4. **캐시 활용.** 동일 질의는 Redis에서 TTL 1시간으로 서빙.
5. **테스트는 모킹 기반.** 실제 LLM 호출이 포함된 테스트는 별도 태그(`@integration`).

## 금지사항

- LLM에게 관리자 판단(승인/반려)을 맡기지 않는다. **LLM은 추천·검색·요약 전용.**
- 사용자 원문을 그대로 DB에 저장하기 전 가드레일 미적용 금지.
- 프롬프트에 실제 API 키, 시크릿을 삽입하지 않는다.
- OpenAI/Anthropic API 키를 클라이언트에 노출하지 않는다 (BFF가 프록시).
