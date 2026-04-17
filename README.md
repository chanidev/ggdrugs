# GGdrugs

자연어 처리 기반 이벤트·이슈 지도 검색 서비스. 축제·박람회·심포지움·컨퍼런스를 지도 + 필터 5종 + LLM 채팅으로 탐색한다.

## 상태

**Phase 0** — 로컬 개발 환경 셋업. 애플리케이션 코드 없음, 모노레포 스켈레톤만.

## 먼저 읽어야 할 문서

- [CLAUDE.md](CLAUDE.md) — 에이전트 작업 지시서 (컨벤션·금지사항·역할 분담)
- [llm_wiki/wiki/index.md](llm_wiki/wiki/index.md) — 요구사항·DB 설계 요약 + 용어집
- [docs/decisions/](docs/decisions/) — 아키텍처 결정 기록 (ADR)

## 디렉터리

- `apps/web` — React 프론트엔드
- `apps/bff` — Node.js + Express + Prisma
- `services/llm` — Python FastAPI + LangChain
- `packages/shared-types`, `packages/config` — 공유 타입·설정
- `infra/` — Docker, DB 마이그레이션·초기화
- `docs/` — 요구사항·결정 문서
- `llm_wiki/` — LLM 유지 위키 (Karpathy 패턴)

## 로컬 기동 (Phase 0)

```bash
docker compose up -d postgres qdrant redis
```

Docker Desktop 설치 선행. Phase 1부터는 bff/llm/web 컨테이너가 추가된다.
