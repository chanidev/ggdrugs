# infra/docker

Dockerfile 모음 (이미지 빌드 정의).

## 배치 예정 파일 (Phase 1)

- `web.Dockerfile` — Vite build → Nginx static serve.
- `bff.Dockerfile` — Node Alpine + Prisma 런타임.
- `llm.Dockerfile` — Python slim + FastAPI + uvicorn.

## 참조

- 루트 `docker-compose.yml` 의 주석 처리된 bff/llm/web 블록이 이 Dockerfile 들을 참조하도록 구성되어 있다 (67~114줄).

## 상태

Phase 0 — 디렉터리만. Dockerfile 작성은 각 앱의 엔트리 포인트가 준비된 뒤 Phase 1 이후.
