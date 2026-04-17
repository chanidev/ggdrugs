## graphify

이 프로젝트는 `graphify-out/`에 지식 그래프가 있습니다.

규칙:
- 아키텍처나 코드베이스 관련 질문에 답하기 전에 `graphify-out/GRAPH_REPORT.md`를 먼저 읽어 god 노드와 커뮤니티 구조를 파악할 것
- `graphify-out/wiki/index.md`가 존재하면 원본 파일 대신 이 위키를 따라갈 것
- 이번 세션에서 코드 파일을 수정한 경우, 그래프를 최신 상태로 유지하기 위해 다음 명령을 실행할 것: `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"`

## gstack

설치 경로: `~/.claude/skills/gstack/`. 34개의 전문 스킬로 구성된 가상 엔지니어링 팀.

워크플로우: **Think → Plan → Build → Review → Test → Ship → Reflect**

주요 커맨드:
- **Think (기획)**: `/office-hours` (아이디에이션)
- **Plan (계획)**: `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/plan-devex-review`, `/autoplan` (전체 리뷰 자동 실행)
- **Build (구축)**: `/design-shotgun`, `/design-html`, `/design-consultation`
- **Review (리뷰)**: `/review`, `/codex` (2차 검토), `/cso` (보안), `/health`
- **Test (테스트)**: `/qa`, `/qa-only`, `/browse`, `/benchmark`, `/design-review`
- **Ship (배포)**: `/ship`, `/land-and-deploy`, `/canary`, `/document-release`
- **Debug (디버깅)**: `/investigate` (근본 원인 분석), `/checkpoint`, `/learn`
- **Safety (안전)**: `/careful`, `/freeze`, `/guard`
- **Meta**: `/gstack-upgrade`

규칙:
- 버그 리포트 / 에러가 발생하면 직접 디버깅하지 말고 `/investigate`를 호출할 것
- 아직 코드가 없는 새로운 제품 / UI 아이디어가 있으면 먼저 `/office-hours`를 호출할 것
- 코드를 랜딩하기 전에 `/review`를 실행할 것
- UI 작업은 `/design-shotgun` → `/design-html` 파이프라인을 우선 사용할 것
