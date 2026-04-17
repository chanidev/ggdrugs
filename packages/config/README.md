# packages/config

환경변수 스키마와 런타임 설정 로더.

## 책임 (CLAUDE.md §5-6)

- `.env` / 환경변수를 타입 안전하게 파싱 (zod 또는 유사 라이브러리 예정).
- 신규 환경변수 추가 시 `.env.example` 과 `packages/config/schema.ts` 를 **동시에** 업데이트.
- BFF, LLM 서비스, Web 각각에서 필요한 변수 집합을 정의.

## 참고

- 현재 `.env.example` 항목: DB, Qdrant, Redis URL, 서비스 URL, Kakao/Google/LLM 키, 세션/JWT 시크릿.
- 시크릿은 코드에 하드코딩 금지 (CLAUDE.md §5-6, §6-3).

## 상태

Phase 0 — 스켈레톤. schema.ts 작성은 Phase 2.
