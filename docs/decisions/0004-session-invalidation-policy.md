# ADR 0004 — 세션 무효화 정책

**Status**: Accepted
**Date**: 2026-04-23
**Context**: 04-22 lint-report 의 "미착수 4행" 중 세션 무효화 정책 — 역할 토글 / 로그아웃 후
기존 세션 처리 / 관리자 강제 폐기 / 만료 정리 통합 결정.

## 문제

`apps/bff/src/routes/auth.ts` + `auth_sessions` 테이블 + `requireAuth`/`resolveAuth` 미들웨어로
구성된 현 세션 레이어는 다음 5 영역에서 정책이 비어있다.

1. **Soft-delete 와 세션 동기화** — `users.is_deleted=true` 플래그는 `requireAuth`/`resolveAuth`
   매 요청 검사로 차단되지만, 행이 안 지워지므로 `ON DELETE CASCADE` 가 안 탄다 — `auth_sessions`
   행이 `expires_at` 까지 남아 DB·인덱스 부담.
2. **로그아웃 범위** — `POST /auth/logout` 은 호출 디바이스의 단일 sid 행만 삭제. 분실·탈취 의심
   시 사용자 본인이 다른 디바이스의 세션을 끊을 경로가 없음.
3. **만료 정책** — `expires_at` 은 발급 시 +7d 고정. `last_seen_at` 은 갱신되지만 `expires_at`
   은 안 갱신 → 활성 사용자도 7일 주기로 재로그인 강제. 동시에 absolute cap 도 없음.
4. **만료 행 정리** — lazy 401 만 함. 만료된 `auth_sessions` 행이 누적, `(expires_at)` 인덱스
   비대화.
5. **Admin 강제 폐기 도구** — 보안 사고 (계정 탈취 의심) 대응 시 admin 이 즉시 끊을 API 가 없음.

추가로 04-22 lint-report 본문이 "JWT revoke" 로 표기했으나 **현 시스템은 JWT 가 아니라 opaque
random + DB lookup 방식 server-side session** — 명명을 정정한다.

## 결정 (D-1 ~ D-6)

### D-1. Soft-delete 시 세션 명시 삭제

**채택 (활성화 — ADR 0005 E-5 ship)**: admin 이 user 를 soft-delete 하는 트랜잭션에
`prisma.authSession.deleteMany({ where: { userId } })` + `admin_audit_logs` 기록을
동봉한다.

ship: ADR 0005 E-5 가 `POST /admin/users/:id/soft-delete` 신설 + 본 패턴 적용 (트랜잭션:
`users.update isDeleted=true` + `authSession.deleteMany` + `admin_audit_logs.create
action='user_soft_delete'`). `requireAuth`/`resolveAuth` 의 isDeleted 즉시 401 안전망은
그대로 유지 — D-1 실패 케이스에도 user 차단 보장.

### D-2. 역할 토글 시 세션 처리

**채택 (현행 유지)**: 역할 토글은 `users.active_role` 만 변경, 세션은 그대로 둔다.

근거:
- `requireAuth`/`resolveAuth` 가 매 요청에 `user.activeRole` join 조회 → **다음 요청부터 즉시
  반영**.
- user → uploader 토글은 권한 상승이 아니라 UX 모드 전환이므로 reauth 강제는 사용자 마찰만 늘림.
- session 행에 `activeRole` 캐시를 두지 않는 현 설계가 이 정책의 enabler.

**예외 (Phase 1 후반)**: uploader → admin 권한 상승은 권한 모델 변화이므로 D-1 패턴으로 명시
invalidation. 현재는 admin 부여 경로 자체가 `seed:admin` 스크립트 only 라 적용 케이스 없음 —
admin 런타임 승급 ADR (별도) 에서 재고려.

### D-3. 로그아웃 범위 — 단일 + 전체 두 옵션

**채택**: 기존 `POST /auth/logout` 은 단일 디바이스로 유지, **신규 `POST /auth/logout-all`**
추가.

- `logout-all` 동작: 본인의 모든 `auth_sessions` 행 deleteMany + 현 쿠키 만료.
- UI: `/me` 페이지의 로그아웃 영역에 "이 디바이스" / "모든 디바이스" 두 버튼.
- audit_logs **기록 안 함** (본인 행위 — admin 강제와 구분).

### D-4. 만료 정책 — Hybrid (sliding 7d + absolute cap 30d)

**채택**:
- 발급 시 `expires_at = now() + 7d`, `created_at = now()`.
- 매 요청에 `last_seen_at` 갱신 + `expires_at = MIN(now() + 7d, created_at + 30d)` 로 갱신
  (sliding 하되 absolute cap 30d).
- 30d 도달 후엔 next request 가 expires_at <= now() 으로 401 → 재로그인.

근거:
- 활성 사용자는 7d idle 까지는 끊김 없음.
- absolute cap 30d 는 보안 audit 표준 (계정 탈취 시 최대 노출 기간 한계).
- `auth_sessions.created_at` 컬럼은 `20260419200000_add_auth_sessions` 마이그레이션이 처음부터
  포함하고 있어 **추가 마이그레이션 불필요** (schema.prisma:552 `AuthSession.createdAt`).
  로직만 코드에 추가.

성능: `expires_at` 갱신은 `last_seen_at` 갱신과 **같은 update statement** 로 묶어 추가 IO 없음.
fire-and-forget 유지.

### D-5. 만료 행 정리 cron

**채택**: `scheduler.ts::runAll()` 의 후속 파이프라인 마지막 단계로
**`runSessionSweep()`** 추가.

- 동작: `DELETE FROM auth_sessions WHERE expires_at < now() - INTERVAL '7 days'`.
- 7d grace: 만료 직후 즉시 삭제하면 디버깅 시 "세션이 왜 사라졌나" 추적 어려움.
- `(expires_at)` 인덱스가 이미 존재 — DELETE 효율 OK.
- D-5 가 실패해도 lazy 401 안전망은 유지되므로 try/catch + warn 로그.

### D-6. Admin revoke API

**채택**: **`POST /admin/users/:id/revoke-sessions`** 신설.

- 권한: `admin_profiles.scope IN ('full','security')` 통과. `security` scope 는
  ADR 0005 E-3 에서 `chk_admin_scope` 도메인에 추가되어 보안 사고 대응 전용 권한 분리.
- 동작: `deleteMany({ where: { userId } })` + `admin_audit_logs` 에 `revoke_sessions { userId,
  count, reason }` 기록.
- request body: `{ reason: string (10~500자, audit 추적용 필수) }`.
- 사용자 통보: 별도 메일/푸시 미구현 (보안 사고 시 audit 만으로 충분 — 통보는 case-by-case).

**전제 테이블 신설 (D-6 의 dependency)**: `admin_audit_logs` 가 현 스키마에 없음 — `approval_logs`
는 event-scoped 라 재사용 불가. 본 ADR ship 의 일부로 minimal 테이블을 신설하고, 향후 admin
user 관리 ADR (D-1 활성화 시점) 에서 컬럼·인덱스 확장 가능한 형태로 둔다.

```sql
-- 20260423XXXXXX_admin_audit_logs/migration.sql
CREATE TABLE admin_audit_logs (
  audit_id   BIGSERIAL    PRIMARY KEY,
  admin_id   BIGINT       NOT NULL REFERENCES users(user_id),
  action     VARCHAR(50)  NOT NULL,        -- 'revoke_sessions' (현재). 추가 action 추가 가능.
  target_id  BIGINT,                       -- action 마다 의미 다름. revoke_sessions → user_id.
  payload    JSONB        NOT NULL DEFAULT '{}'::jsonb, -- { count, reason, ... }
  created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_admin_audit_action_created ON admin_audit_logs(action, created_at DESC);
CREATE INDEX idx_admin_audit_admin_created  ON admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_admin_audit_target         ON admin_audit_logs(target_id) WHERE target_id IS NOT NULL;
```

target_id 가 nullable + payload 가 JSONB 라 향후 user soft-delete (D-1), 권한 변경, 콘텐츠 강제
삭제 등 어떤 admin action 도 동일 테이블에 기록 가능. enum CHECK 제약은 두지 않음 — 추가 시
마이그레이션 비용 회피.

## 명명 정정 (cross-doc)

- `wiki/topics/auth-flow.md` §Open questions 의 "Session revocation" 항목 — 본 ADR 로 해소
  표기 + ADR 링크.
- `wiki/lint-report.md` 의 "JWT revoke" 표현 — sweep 시점에 자연 정리됨 (이번 04-23 sweep 에서
  미착수 4행 중 본 항목 ✅).
- 신규 wiki §Session invalidation 정책 섹션을 `auth-flow.md` 에 추가.

## 마이그레이션

본 ADR 가 직접 수반하는 스키마 변경은 **D-6 의 `admin_audit_logs` 테이블 신설 1건**.

(D-4 의 `auth_sessions.created_at` 은 이미 `20260419200000_add_auth_sessions` 에 포함되어
있어 추가 마이그레이션 불필요 — 위 §결정 D-4 참조.)

D-3 / D-5 는 코드만, 스키마 미변경.

D-1 은 본 ADR ship 범위 외 — admin user 관리 ADR 시점에 패턴만 적용.

## Phase 분리

| Phase | 항목 | 파일 |
|---|---|---|
| **PR-1 (ADR 박제 + 본문 정정)** | 본 ADR + auth-flow wiki 갱신 + lint-report sweep | `docs/decisions/0004-...`, `wiki/topics/auth-flow.md`, `wiki/log.md`, `wiki/index.md` |
| **PR-2 (코드 ship — 본 ADR 범위)** | D-3 logout-all, D-4 sliding+cap, D-5 sweep cron, D-6 admin endpoint + admin_audit_logs 마이그레이션 | `apps/bff/prisma/migrations/20260423XXXXXX_admin_audit_logs/`, `apps/bff/prisma/schema.prisma` (`AdminAuditLog` 모델), `apps/bff/src/routes/auth.ts`, `apps/bff/src/routes/admin-users.ts` (신규), `apps/bff/src/middleware/require-auth.ts`, `apps/bff/src/jobs/session-sweep.ts` (신규), `apps/bff/src/jobs/scheduler.ts`, `apps/bff/src/app.ts` (라우팅), `apps/web/src/lib/api.ts` (logoutAll), `apps/web/src/pages/MePage.tsx` (UI 버튼) |
| **PR-N (별도 ADR)** | D-1 — admin user 관리 라우트 신설 시 패턴 적용 | TBD |

ADR 0003 패턴 — 결정과 구현을 별도 PR 로 분리해 결정 자체의 review 를 가볍게 한다.

## 폐기된 대안

- **D-2 alt: 토글 시 무조건 무효화** — 현 join 조회로 즉시 반영되므로 reauth 강제는 마찰만 추가.
- **D-3 alt: 항상 전체 디바이스 로그아웃** — 일상 로그아웃을 무겁게 만들고, 다중 디바이스
  사용자에게 의외성을 줌.
- **D-4 alt-A: absolute 7d 유지 (현행)** — 활성 사용자에게 7일 주기 재로그인 강제, UX 마찰.
- **D-4 alt-B: pure sliding (cap 없음)** — 토큰 탈취 시 무한 연장 가능, 보안 audit 위반.
- **D-5 alt: lazy 만 유지 (현행)** — 만료 행 누적, `(expires_at)` 인덱스 비대화.
- **D-6 alt: API 없음** — 보안 사고 즉시 대응 경로 부재.
- **JWT 전환** — opaque session 의 단점 (매 요청 DB lookup) 보다 stateless JWT 의 단점 (revoke
  불가, denylist 운영 필요) 이 더 큼. ADR 0002 의 "단순 단일 결정" 정책과도 정합.

## 참조

- `apps/bff/src/routes/auth.ts` — 현 세션 발급/검증 핸들러
- `apps/bff/src/middleware/require-auth.ts` — requireAuth / resolveAuth 분기
- `apps/bff/prisma/migrations/20260419200000_add_auth_sessions/` — auth_sessions 초기 스키마
- ADR 0003 — PII 정책 (실명·식별자 마스킹은 본 ADR 의 audit_logs `reason` 필드에도 적용)
- 요구사항 v5.0 A_100 / A_101 — 인증 유스케이스 (revocation 정책 부재 영역)
- `wiki/topics/auth-flow.md` — Phase 1 구현본 + 본 ADR 결정 반영본
