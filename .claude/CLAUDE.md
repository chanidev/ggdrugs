# CLAUDE.md — Alle 에이전트 작업 지시서

> 이 파일은 Claude Code가 이 리포지토리에서 작업할 때 **항상 가장 먼저 읽어야 하는** 문서다.
> 프로젝트 컨벤션, 금지사항, 에이전트 역할 분담이 담겨 있다.
>
> **네이밍**: 제품명은 **Alle** (2026-04 리브랜딩). 레포·패키지·DB 식별자는 `ggdrugs` / `@ggdrugs/*` 유지 — 레포 전체 rename 유발 방지. 사용자 대면 텍스트에서만 Alle 표기.

---

## 1. 프로젝트 개요

**Alle**(내부 코드명 GGdrugs)는 자연어 처리 기반 이벤트·이슈 지도 검색 서비스다. 세 가지 사용자 역할을 다룬다:

- **일반 사용자** — 이벤트 탐색, 북마크, 리뷰 작성
- **업로더** — 이벤트 등록 (축제 기획자, 사설 단체, 공공기관)
- **관리자** — 콘텐츠 승인, 라벨 부여

업로더 모델은 **"1계정 = 복수 역할 토글"** 방식이다. 일반 사용자 계정에 업로더 역할을 추가하는 구조이며, 별도 계정을 만들지 않는다.

---

## 2. 현재 단계

**Phase 2 — 메이트·커뮤니티 소셜 레이어 구축 중 (2026-06 기준).** Phase 0(환경 셋업)·Phase 1(이벤트 탐색 서비스)은 완료. BFF · Web · LLM 모두 구동, 전국 서비스.

### Phase 0 — 환경 셋업 (완료, 2026-04-17)
모노레포 스켈레톤 · Docker Compose (postgres+postgis, qdrant v1.13, redis, minio) · `.env.example` · MinIO 버킷 4종 · PostgreSQL extensions (postgis, pg_trgm, unaccent, citext). 첫 커밋 `03579bf`.

### Phase 1 — 이벤트 탐색 서비스 (완료, 2026-04 진입)
- 요구사항정의서 v5.0 확정 (ADR 0001로 DDL 정합성 해소)
- 이벤트 성향 라벨 도메인 확정 (event_vibes 마스터 시드 — 20260418 seed_master_data 마이그레이션)
- OpenAI Project 키 동작 확인 (**팀 공용 조직 계정 전환은 프로덕션 배포 전 이관** — ADR 0002 운영 섹션)
- 지도 검색 + 필터 5종 + LLM 채팅 검색(Qdrant kNN) 구동. approved 이벤트 4,000여 건, 뉴스 매핑 ~44% 커버리지.
- **전국 확장 완료** (ADR 0006 — 서울 한정 → 17 시/도 + 약 230 시/군/구).

### Phase 2 — 메이트·커뮤니티 (진행 중)
요구사항정의서 페이즈 2 기반 소셜 레이어. 상세 설계는 `llm_wiki/wiki/index.md` 의 *Phase 2* 섹션 참조.
- 메이트 매칭(메이트지수 0~100) · 1:1/그룹 채팅방(Socket.IO) · 약속/캘린더 — ADR 0007 / 0009 / 0010
- 커뮤니티 게시판 · 메이트 평가/축제 리뷰(A_900/901) · 크레딧 원장 · 신고/차단/제재(A_701)
- i18n 6개 로케일 (ko → en/vi/zh/ja/fr) · SEED Design 도입 (ADR 0008)

---

## 3. 필독 참조 문서

작업 시작 전 반드시 다음을 확인한다:

1. `docs/requirements/장원팀_요구사항정의서_5차.docx` — 유스케이스 및 기능/비기능 요구사항
2. `docs/requirements/` 내 Ⅴ장 용어집 — DB 컬럼명·enum 도메인의 유일한 근거
3. 본 CLAUDE.md — 컨벤션과 금지사항

---

## 4. 디렉터리별 책임

| 경로 | 책임 | 담당 에이전트 |
|---|---|---|
| `apps/web/` | React 프론트엔드, Kakao Maps UI, 채팅 UI | Frontend Agent |
| `apps/bff/` | REST API, 인증, Prisma ORM, 비즈니스 로직 | Backend Agent |
| `services/llm/` | OpenAI SDK 직접 체인(`openai_chain.py`), 임베딩, 채팅 검색 | LLM Agent |
| `packages/shared-types/` | BFF↔Web 공유 TypeScript 타입 | Backend Agent (주) + Frontend Agent |
| `infra/` | Docker, DB 마이그레이션, 시드 | Infra Agent |
| `docs/` | 요구사항, 아키텍처, ADR | Orchestrator Agent |

에이전트가 자기 디렉터리 외부를 수정해야 할 때는 **Orchestrator Agent**에게 먼저 알리고 진행한다.

---

## 5. 절대 컨벤션

### 5-1. 용어 통일 (요구사항정의서 Ⅴ장 기준)

코드·주석·커밋 메시지·문서에서 **항상 같은 용어를 사용한다**:

- `event` — 모든 행사의 상위 개념. 절대 `festival`로 대체하지 않는다.
- `event_type` — {festival, expo, symposium, conference} enum
- `event_vibe` — 이벤트 성향 (관리자가 부여하는 라벨)
- `companion_type` — 방문자 측 속성
- `expected_companion` — 업로더 측 속성 (동일 도메인이지만 의미가 다름)
- `role` — {user, uploader, admin}
- `active_role` — 현재 활성 역할 (세션 및 DB 컬럼)
- `period` — 기간 필터 (3m / 6m / all / custom)

### 5-2. 이벤트 상태 머신

```
pending → revision_requested → pending (재제출)
pending → approved            → ended (종료일 도래)
pending → rejected            (종결)
```

이 상태 이름을 DB enum, API 응답, 프론트 UI에서 모두 동일하게 쓴다.

### 5-3. 필터 5종 고정

**지역 / 기간 / 인원구성 / 이벤트 종류 / 이벤트 성향** — 이 5종 외에 필터를 추가하려면 요구사항정의서 개정이 선행되어야 한다. 임의 추가 금지.

### 5-4. 커밋 메시지

Conventional Commits 준수:

```
feat(bff): add event search endpoint with PostGIS bbox query
fix(web): correct kakao map pin cluster on zoom out
docs(requirements): update v5.0 with A_501 review flow
chore(infra): bump postgres image to 15.6
```

범위 태그는 디렉터리 최상위 이름(bff, web, llm, infra, docs, shared-types, config)을 사용한다.

### 5-5. 브랜치

- `main` — 항상 배포 가능한 상태
- `dev` — 개발 통합 브랜치
- `feature/<유스케이스ID>-<짧은설명>` — 예: `feature/A_203-upcoming-events-tab`
- `fix/<짧은설명>`, `chore/<짧은설명>`

### 5-6. 환경변수

- `.env` 파일은 Git에 커밋하지 않는다 (`.gitignore`에 등재됨).
- 새 환경변수를 추가할 때는 `.env.example`과 `packages/config/schema.ts` 양쪽을 동시에 업데이트한다.
- 시크릿을 코드에 하드코딩하지 않는다.

---

## 6. 금지사항

1. **요구사항정의서에 없는 기능을 임의로 추가하지 않는다.** 필요하다고 판단되면 먼저 `docs/decisions/`에 ADR을 작성한 뒤 Orchestrator Agent 승인을 받는다.
2. **DB 스키마를 직접 수정하지 않는다.** 항상 Prisma 마이그레이션을 통해 변경하고, `infra/db/migrations/`에 기록한다.
3. **PII(주민등록번호, 전화번호, 이메일)를 로그에 출력하지 않는다.** 필요 시 마스킹한다.
4. **LLM에게 관리자 판단을 위임하지 않는다.** 이벤트 승인, 라벨 부여, 업로더 승급 심사는 관리자(사람)의 결정 영역이다. LLM은 추천·검색·요약에만 사용한다.
5. **AI 비디오 생성 관련 코드를 작성하지 않는다.** v5.0에서 제거된 기능이다.

---

## 7. 에이전트 역할 요약

| 에이전트 | 주요 책임 |
|---|---|
| **Orchestrator** | 전체 조율, 문서 관리, 타 에이전트 간 의존성 충돌 조정 |
| **Backend** | BFF API 개발, Prisma 스키마, 인증, 권한 관리 |
| **Frontend** | React 컴포넌트, Kakao Maps 통합, 상태 관리, 채팅 UI |
| **LLM** | LangChain 체인, 프롬프트 엔지니어링, Qdrant 임베딩 |
| **Infra** | Docker 이미지, Compose, 마이그레이션, 로컬 환경 안정화 |
| **QA** | 테스트 작성, 유스케이스 기반 시나리오 검증 |

각 에이전트의 상세 프롬프트는 `.claude/agents/<에이전트명>.md`에 정의된다.

---

## 8. 작업 착수 체크리스트

새 작업을 시작할 때마다 다음을 확인한다:

- [ ] 해당 작업이 요구사항정의서의 어느 유스케이스·기능 ID에 해당하는지 확인했는가?
- [ ] `docs/decisions/`에 관련 ADR이 있는지 확인했는가?
- [ ] 이 작업이 내 에이전트 범위인가? 아니라면 Orchestrator에게 위임했는가?
- [ ] 영향받는 디렉터리의 기존 컨벤션을 확인했는가? (`packages/config`, 테스트 구조, 네이밍)
- [ ] 브랜치를 올바르게 생성했는가?

---

## 8-1. Design System

UI·시각 결정을 하기 전에 **반드시 [`DESIGN.md`](../DESIGN.md)를 먼저 읽는다**.

- 모든 폰트·색·간격·라운드·모션 결정이 정의되어 있음.
- 새 UI를 만들 때 DESIGN.md에 없는 선택이 필요하면, 먼저 DESIGN.md를 개정한 뒤 구현한다 (코드에만 몰래 추가 금지).
- QA/리뷰 시 DESIGN.md 기준으로 편차를 flag한다.
- 금지 패턴: 보라 그라디언트, 3-column icon grid, 뚱뚱한 pill 버튼, gradient CTA, stock photo hero, 서체 fallback이 깨진 Inter/Roboto 한글 혼용.

## 9. 응답 스타일 가이드 (찬의 작업 방식 반영)

- 대화형·반복적 진행을 선호한다. 한 번에 모든 것을 만들지 말고, 단계마다 검증 가능한 단위로 끊어서 제시한다.
- 결정이 필요한 시점에 명확한 선택지를 제시하고 넘어간다. 추측으로 진행하지 않는다.
- 긴 문서/다이어그램 일괄 생성보다 **아이디어를 하나씩 대화로 풀어가는 방식**이 기본이다.

---

*마지막 업데이트: 2026.04.17 (v5.0 개정 반영)*
