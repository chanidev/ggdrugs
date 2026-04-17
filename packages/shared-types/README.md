# packages/shared-types

BFF ↔ Web 공유 TypeScript 타입 정의.

## 책임

- API 요청·응답 타입.
- 도메인 enum (event_type, approval_status, role, active_role 등).
- `llm_wiki/wiki/topics/terminology-glossary.md`를 단일 근거로 따른다.

## 주의

- enum 값은 요구사항정의서 Ⅴ장 용어집과 **완전히 일치**해야 한다.
- DDL과 불일치 시 [docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md](../../docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md) 확정 대기 후 반영.
- `dist/` 를 import하는 형태(prebuild)가 아니라 TypeScript project references로 직접 참조 가능하도록 구성 예정.

## 상태

Phase 0 — 스켈레톤. 초기 enum·DTO 정의는 Phase 2 API 계약 확정 후.
