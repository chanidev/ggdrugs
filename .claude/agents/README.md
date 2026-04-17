# 에이전트 인덱스

본 디렉터리는 Claude Code 팀 에이전트의 프롬프트를 관리한다. 각 에이전트는 담당 디렉터리와 책임이 명확히 분리되어 있다.

## 에이전트 목록

| 이름 | 파일 | 주요 책임 | 권한 디렉터리 |
|---|---|---|---|
| **Orchestrator** | `orchestrator.md` | 전체 조율, 문서 관리, 에이전트 간 의존성 중재 | `docs/`, `.claude/`, 최상위 문서 |
| **Backend** | `backend.md` | BFF REST API, Prisma, 인증 | `apps/bff/`, `packages/shared-types/` |
| **Frontend** | `frontend.md` | React UI, Kakao Maps, 상태 관리 | `apps/web/` |
| **LLM** | `llm.md` | LangChain 체인, 임베딩, 가드레일 | `services/llm/` |
| **Infra** | `infra.md` | Docker, DB 초기화, 오케스트레이션 | `infra/`, `docker-compose.yml` |
| **QA** | `qa.md` | 단위/통합/E2E 테스트, 시나리오 검증 | 각 앱의 `tests/`, 최상위 `tests/e2e/` |

## 호출 원칙

1. **작업 시작 전, 해당 작업이 어느 에이전트의 권한 범위에 있는지 확인한다.**
2. **여러 에이전트가 필요한 작업은 Orchestrator가 먼저 조율.**
3. **에이전트 경계를 벗어나는 수정은 금지.** 필요하면 다른 에이전트에게 위임한다.

## 의존성 매트릭스

| From \ To | Orchestrator | Backend | Frontend | LLM | Infra | QA |
|---|---|---|---|---|---|---|
| Orchestrator | - | 요구사항 전달 | 요구사항 전달 | 요구사항 전달 | 환경 요청 | 테스트 케이스 전달 |
| Backend | ADR 요청 | - | shared-types 업데이트 | 내부 API 호출 | DB 설정 요청 | 테스트 요청 |
| Frontend | ADR 요청 | API 요청/응답 타입 | - | (BFF 경유) | - | 테스트 요청 |
| LLM | ADR 요청 | 내부 API 정의 | - | - | DB/캐시 설정 | 테스트 요청 |
| Infra | 환경 결정 | DB 스키마 요청 | 빌드 설정 | 빌드 설정 | - | CI 환경 요청 |
| QA | 시나리오 협의 | 시드 데이터 | 컴포넌트 구조 | 프롬프트 스냅샷 | 테스트 환경 | - |

## 호출 예시

```
찬: "A_203 예정 이벤트 탭을 만들고 싶어"
  ↓
Orchestrator: 
  1. 요구사항 확인 (GG-UPCOMING-001~004)
  2. 의존성 파악: Backend(API) → Frontend(UI), QA(시나리오)
  3. Backend에 먼저 요청: "예정 이벤트 목록 API 엔드포인트 추가"
  4. Backend 완료 후 Frontend에 요청: "A_203 페이지 구현"
  5. QA에 요청: "A_203 E2E 시나리오 작성"
```
