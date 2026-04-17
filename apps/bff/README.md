# apps/bff

Backend For Frontend. Node.js + Express + Prisma ORM.

## 책임 (CLAUDE.md §4)

- REST API 엔드포인트 제공 (프론트 전용 중계).
- OAuth 인증 (Google, Kakao), 세션·JWT 관리.
- Prisma 기반 PostgreSQL 접근 계층.
- 비즈니스 로직 (이벤트 검색·필터, 북마크, 리뷰, 예약 없음·북마크만).
- LLM 마이크로서비스 호출 (채팅 검색, 감성분석, 태깅).

## 의존 관계

- `packages/shared-types` — Web과 공유하는 응답 타입.
- `packages/config` — 환경변수 스키마.
- 런타임 의존: Postgres, Redis, LLM 서비스, Qdrant, **MinIO (S3 호환)**.
- 주요 SDK: `@prisma/client`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `bullmq`.

## 주요 컨벤션

- DB 스키마 변경은 항상 Prisma 마이그레이션으로. 직접 SQL 수정 금지 (CLAUDE.md §6-2).
- `infra/db/migrations/` 에 마이그레이션 산출물 기록.
- PII(주민번호·전화·이메일) 로그 출력 금지 (CLAUDE.md §6-3).

## 상태

Phase 0 — 스켈레톤. API 계약 정의는 Phase 2, 구현은 Phase 3 이후.
