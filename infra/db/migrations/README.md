# infra/db/migrations

Prisma 마이그레이션 산출물 배치 디렉터리.

## 규칙 (CLAUDE.md §6-2)

- DB 스키마 변경은 **항상 Prisma 마이그레이션을 통해** 한다. 직접 SQL 수정 금지.
- `pnpm --filter bff prisma migrate dev --name <description>` 실행 시 이 디렉터리에 타임스탬프 폴더로 기록된다.

## 참고

- 컨테이너 최초 기동 시 1회 실행되는 초기화 스크립트는 `../init/` 에 있다 (예: `01-postgis.sql`).
- Phase 1 전 DDL v3 → v4 마이그레이션은 [docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md](../../../docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md) 승인 후 작성.

## 상태

Phase 0 — 비어있음.
