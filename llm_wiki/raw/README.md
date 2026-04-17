# GGdrugs

**자연어 처리 기반 이벤트 및 이슈 지도 검색 서비스**

소규모 민간 축제·박람회·심포지움·컨퍼런스를 하나의 지도 위에 모으고, LLM 대화·필터·지도 인터랙션·전체 목록 네 가지 경로로 탐색할 수 있게 하는 플랫폼.

---

## 리포지토리 구조

```
ggdrugs/
├── apps/                        # 엔드유저가 접속하는 애플리케이션
│   ├── web/                     # 프론트엔드 (React 18 + TypeScript + Vite)
│   └── bff/                     # Backend For Frontend (Node.js + Express + TypeScript + Prisma)
│
├── services/                    # 백엔드 마이크로서비스
│   └── llm/                     # LLM 마이크로서비스 (Python FastAPI + LangChain)
│                                #   - 채팅 검색, 리뷰 분류, 임베딩 생성 담당
│
├── packages/                    # 여러 앱이 공유하는 코드
│   ├── shared-types/            # TypeScript 타입 정의 (BFF ↔ Web 공유)
│   └── config/                  # 공통 설정·환경변수 스키마
│
├── infra/                       # 인프라 정의
│   ├── docker/                  # 각 서비스의 Dockerfile
│   └── db/
│       ├── migrations/          # Prisma 마이그레이션
│       └── seeds/               # 로컬 개발용 시드 데이터
│
├── docs/                        # 문서
│   ├── requirements/            # 요구사항정의서 (현재: v5.0)
│   ├── architecture/            # 시스템 아키텍처, 데이터 플로우
│   └── decisions/               # ADR (Architecture Decision Records)
│
├── .claude/                     # Claude Code 팀 에이전트 설정
│   ├── agents/                  # 역할별 에이전트 프롬프트
│   └── commands/                # 반복 작업용 커스텀 명령어
│
├── .github/workflows/           # CI/CD (추후 Phase)
│
├── docker-compose.yml           # 로컬 개발 오케스트레이션
├── CLAUDE.md                    # 에이전트 전역 지시서 (필독)
└── README.md                    # 본 문서
```

---

## 기술 스택

| 레이어 | 선택 | 근거 |
|---|---|---|
| 프론트 | React 18 + TypeScript + Vite | 빠른 HMR, 생태계 성숙, Kakao Maps JS SDK 호환 |
| BFF | Node.js + Express + TypeScript + Prisma | 프론트 타입 공유 용이, Prisma의 PostgreSQL 지원 |
| LLM 서비스 | Python FastAPI + LangChain | 벡터 검색·임베딩·체인 구성 생태계가 Python 중심 |
| 메인 DB | PostgreSQL 15 + PostGIS | 이벤트-사용자-리뷰의 관계형 특성 + 지도 bbox 쿼리 네이티브 지원 |
| 벡터 DB | Qdrant | 임베딩 기반 유사 이벤트 추천 |
| 캐시·세션 | Redis | 세션 토큰, LLM 응답 캐시, 속도 제한 |
| 오케스트레이션 | Docker Compose (로컬) | 클라우드 배포는 추후 결정 |

---

## 로컬 개발 시작 (Phase 1 이후 유효)

```bash
# 필수: Docker Desktop 또는 Docker Engine + Compose v2
cp .env.example .env               # 환경변수 초기값 복사
docker compose up -d postgres qdrant redis   # 데이터 레이어만 먼저
docker compose up -d                # 전체 기동
docker compose logs -f bff          # 로그 확인
```

포트 매핑:
- Web: http://localhost:5173
- BFF: http://localhost:3000
- LLM: http://localhost:8000
- Postgres: localhost:5432
- Qdrant: localhost:6333 (HTTP), localhost:6334 (gRPC)
- Redis: localhost:6379

---

## 현재 개발 단계

- **Phase 0** (진행 중): 모노레포 스켈레톤, Docker Compose, CLAUDE.md 등재
- Phase 1: DB 스키마 설계 (요구사항정의서 v5.0 Ⅴ장 용어집 기준)
- Phase 2: API 계약 정의 (BFF ↔ Web, BFF ↔ LLM)
- Phase 3 이후: 14단계 개발 플랜

---

## 참조 문서

- `docs/requirements/` — 요구사항정의서 v5.0
- `CLAUDE.md` — 에이전트 작업 지시서
- `docs/architecture/` — 시스템 다이어그램
- `docs/decisions/` — 주요 기술 결정 기록
