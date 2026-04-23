# ADR 0005 — 관리자 계정 관리 + 관리자 작업 감사 정책

**Status**: Accepted
**Date**: 2026-04-23
**Context**: ADR 0004 가 남긴 dependency 2건 (D-1 user soft-delete 패턴, D-6 의 `scope='security'`
placeholder) + `seed:admin` CLI 만 존재하는 admin 생성 경로의 한계 + `decideUploader` 의
audit 결여 (`admin_uploaders.ts:43` "uploader 승급 로그는 테이블 미정의 — 후속") 통합 결정.

## 문제

현 시점 (2026-04-23) 의 admin 관리·감사 layer 갭:

1. **admin 생성 경로 1개**: `seed:admin` CLI only. 런타임 API 부재. peer-promote (admin 이
   다른 admin 만들기) 불가.
2. **scope 도메인 부족**: `chk_admin_scope IN ('full','content_only','uploader_review_only')`.
   ADR 0004 D-6 가 `security` 를 placeholder 로 약속했으나 미반영.
3. **user soft-delete 라우트 부재**: `users.is_deleted=true` 를 set 하는 admin 라우트 자체가
   없음 → ADR 0004 D-1 의 "soft-delete 시 `authSession.deleteMany`" 패턴 미발동.
4. **uploader 승급 audit 결여**: `decideUploader` (admin_uploaders.ts:287) 가
   uploader_profiles update 만 하고 audit_logs / approval_logs 양쪽 모두에 행을 남기지 않음.
   누가 언제 어떤 reason 으로 승인/반려했는지 추적 불가.
5. **박탈/scope 변경 UI/API 부재**: admin 자격 회수 / scope 조정도 `seed:admin --deactivate`
   CLI only.

## 결정 (E-1 ~ E-8)

### E-1. Bootstrap = seed:admin CLI 유지

**채택**: 첫 admin 생성은 `seed:admin` 만 허용. production 초기 1회 실행 후 운영 매뉴얼화.

대안 (env var `BOOTSTRAP_ADMIN_EMAIL` 자동 첫 로그인 승급) 은 prod 환경 변수 누설 시 권한 탈취
경로가 됨. seed:admin 은 직접 DB 접근 가능자만 실행 가능 — 더 안전.

### E-2. 런타임 admin 생성 = peer-promote

**채택**: 기존 user 를 admin 으로 승급하는 신규 endpoint.

- `POST /admin/users/:id/promote`
- 권한: `admin_profiles.scope='full'` 만 허용.
- body: `{ scope: 'full'|'content_only'|'uploader_review_only'|'security', reason: string (10~500자) }`
- 동작: `admin_profiles.upsert({userId, scope, isActive:true})` + `admin_audit_logs.create({
  action: 'admin_promote', targetId: userId, payload: { scope, reason } })`.
- 사전조건: 대상 user 가 user 테이블에 존재하고 `is_deleted=false`.

### E-3. scope 도메인에 `security` 추가

**채택**: `chk_admin_scope IN ('full','content_only','uploader_review_only','security')` 로
확장.

- `security` scope 의 의미: 보안 사고 대응 (계정 탈취 의심 등). 우선 ADR 0004 D-6
  (`POST /admin/users/:id/revoke-sessions`) 의 통과 권한 ('full' OR 'security') 에 적용.
- 마이그레이션: `chk_admin_scope` constraint drop & recreate.
- ADR 0004 D-6 본문 정정 — "scope='full' 만 통과" → "scope IN ('full','security') 통과".

### E-4. 박탈 메커니즘 = is_active 토글 only

**채택**: `admin_profiles.is_active=false` 단일 플래그로 박탈. 별도 `deactivated_at` 컬럼
신설하지 않음.

- 박탈 endpoint: `POST /admin/users/:id/demote` (권한: scope='full', body: `{ reason }`).
  payload `{ reason, before: { scope, isActive:true }, after: { isActive:false } }`.
- scope 변경 endpoint: `PUT /admin/users/:id/admin-scope` (권한: scope='full', body:
  `{ scope, reason }`). payload `{ reason, before: { scope }, after: { scope } }`.
- 시점 기록은 `admin_audit_logs.created_at` + payload 로 충분 — 별도 컬럼은 중복.

### E-5. user soft-delete 라우트 (ADR 0004 D-1 활성화)

**채택**: `POST /admin/users/:id/soft-delete` 신설.

- 권한: scope='full' only.
- body: `{ reason: string (10~500자) }`.
- 동작 (트랜잭션):
  1. `users.update({ isDeleted: true, deletedAt: now })`
  2. `auth_sessions.deleteMany({ userId })` (ADR 0004 D-1 패턴)
  3. `admin_audit_logs.create({ action: 'user_soft_delete', targetId: userId, payload: { reason,
     deletedSessionCount } })` (count 는 사후 update — ADR 0004 D-6 의 admin_audit_logs.create
     동일 패턴)

#### E-5 sub-rules (대상 user 의 sub-type 별)

| sub | 대상 | 정책 |
|---|---|---|
| **E-5a** | 일반 user (uploader_profile 없음, admin_profile 없음) | 정상 처리 |
| **E-5b** | uploader_profile 보유 user | 정상 처리 — uploader_profile 행은 그대로 (FK cascade 안 탐). `is_deleted=true` user 가 uploader 로 활동할 수는 없음 (`requireUploaderActive` 가 차단). 운영자가 명시적으로 uploader 반려를 원하면 먼저 `decideUploader` 호출 후 soft-delete. |
| **E-5c** | admin_profile.isActive=true 보유 user | **차단** — 409 `admin_profile_active_must_demote_first`. 먼저 demote 후 soft-delete. admin 권한 활성 상태에서 user 자체를 지우는 건 audit/recovery 양쪽 어려움. |

### E-6. audit action 분류 (`admin_audit_logs.action`)

**채택**: 5종 + 기존 1종.

| action | endpoint | target_id | payload 표준 |
|---|---|---|---|
| `admin_promote` | `POST /admin/users/:id/promote` | user_id | `{ scope, reason }` |
| `admin_demote` | `POST /admin/users/:id/demote` | user_id | `{ reason, before, after }` |
| `admin_scope_change` | `PUT /admin/users/:id/admin-scope` | user_id | `{ reason, before, after }` |
| `user_soft_delete` | `POST /admin/users/:id/soft-delete` | user_id | `{ reason, deletedSessionCount }` |
| `uploader_decision` | `POST /admin/uploaders/:id/decision` | uploader.user_id | `{ uploaderId, action, reason }` (action ∈ approved/revision_requested/rejected) |
| `revoke_sessions` (ADR 0004 D-6, 이미 ship) | `POST /admin/users/:id/revoke-sessions` | user_id | `{ count, reason }` |

action enum 에 CHECK 제약은 두지 않음 (admin_audit_logs 테이블 정책과 정합) — 향후 추가 시
마이그레이션 비용 회피.

### E-7. UI 범위 — Members 탭 신설 (정정)

**원안 (폐기)**: backend-only API. UI 미포함.

**정정 채택 (2026-04-23 후속)**: 기존 admin UI 의 Uploaders 탭 패턴 (목록 + 상세 패널 + 결정
액션) 이 충분히 성숙 — 같은 패턴 복제로 디자인 review 비용 거의 없음. `AdminEventsPage` 에
**Members 탭 + 신규 BFF 조회 endpoint 2건** 추가.

신규 endpoint:
- `GET /admin/users` — 회원 목록 + 필터 (role: all/general/uploader/admin × status: all/active/deleted) + nickname q 검색 + 페이지네이션. 응답에 byRole / byStatus counters 동봉.
- `GET /admin/users/:id` — user 상세 (계정 + uploader_profile + admin_profile) + 활성 세션 수 + 최근 admin_audit_logs 10건 (target_id 기준).

신규 Web 컴포넌트:
- `apps/web/src/components/admin/MembersTab.tsx` — 좌측 목록 + 필터/검색 + 페이지네이션.
- `apps/web/src/components/admin/UserDetailPanel.tsx` — 우측 상세 패널 + 5 액션 버튼 (`ActionForm` inline 폼: scope select + reason textarea + 검증 + 실행). 액션은 user 의 current state 에 따라 동적 노출:
  - 일반 user: 세션 폐기 / admin 승급 / 계정 비활성화
  - admin 활성 user: 세션 폐기 / scope 변경 / admin 박탈 / 계정 비활성화 (단, 활성 admin 인 동안은 비활성화 disabled — E-5c)
  - 삭제된 user: 액션 영역 자체 숨김

UX 강제: 모든 action 의 reason 10~500자 필수 (BFF 와 동일 검증). E-8 패턴 — UX 강제와 BFF 검증을
같은 임계로 맞춤.

Bootstrap (E-1) 인 `seed:admin` CLI 는 그대로 유지 — 첫 admin 부재 상황 대응.

### E-8. uploader 승급 audit 추가 (decideUploader 보강)

**채택**: 기존 `decideUploader` 에 두 변경.

- body 에 optional `reason: string (0~2000자)` 추가. 빈 문자열은 null 로 저장.
- `uploader_profiles.update` 와 같은 트랜잭션으로
  `admin_audit_logs.create({ action: 'uploader_decision', targetId: uploader.userId,
   payload: { uploaderId, action, reason } })`.
- action 명은 단일 `uploader_decision` — payload 의 `action` 으로 outcome 분기. (admin_promote/
  demote/scope_change 는 별개 endpoint 라 3 actions, uploader 는 같은 endpoint 의 outcome 분기라
  1 action — `approval_logs.action` enum 패턴 동일.)
- 권한 변경 없음 (현행 requireAuth → requireAdmin 유지).

## ADR 0004 정정 (본 ADR 흡수 항목)

본 ADR ship 으로 ADR 0004 의 두 미해결 dependency 가 해소됨. ADR 0004 본문에 다음 정정:

- **D-1**: "본 ship 범위 외" → "본 ADR 범위 외 — ADR 0005 E-5 에서 활성화 ship".
- **D-6**: "scope='full' 만 통과" → "scope IN ('full','security') 통과 — `security` 는
  ADR 0005 E-3 에서 추가".

## 마이그레이션

본 ADR 가 직접 수반하는 스키마 변경은 **E-3 의 `chk_admin_scope` rebuild 1건**.

```sql
-- 20260423XXXXXX_admin_scope_security/migration.sql
ALTER TABLE admin_profiles
    DROP CONSTRAINT chk_admin_scope;
ALTER TABLE admin_profiles
    ADD CONSTRAINT chk_admin_scope
        CHECK (scope IN ('full','content_only','uploader_review_only','security'));
```

E-2 / E-4 / E-5 / E-8 은 코드만, 스키마 미변경 (`admin_audit_logs` 는 ADR 0004 ship 시
이미 신설됨).

## Phase 분리

| Phase | 항목 | 파일 |
|---|---|---|
| **PR-1 (본 ADR + 코드 ship 일괄)** | ADR 박제 + 마이그레이션 + 5 endpoint + decideUploader 보강 + ADR 0004 정정 + wiki | `docs/decisions/0005-...`, `apps/bff/prisma/migrations/20260423XXXXXX_admin_scope_security/`, `apps/bff/src/routes/admin-users.ts`, `apps/bff/src/routes/admin-uploaders.ts`, `apps/bff/src/app.ts`, `docs/decisions/0004-...` (정정), `wiki/topics/admin-account-management.md` (신규), `wiki/topics/auth-flow.md` (cross-ref), `wiki/topics/admin-flow.md` (audit 표 갱신), `wiki/index.md`, `wiki/log.md` |
| **PR-N (별도)** | UI — `/admin/users` 페이지 (DESIGN.md review 후) | TBD |
| **PR-N (별도)** | uploader 박탈 별도 audit action (필요 시) — 현 `uploader_decision` 의 `rejected/revision_requested` 가 이를 흡수 | TBD |

ADR 0003/0004 와 달리 본 ADR 은 결정·코드 같은 PR — scope 가 작고 (1 마이그레이션 + 5 endpoint
+ 1 endpoint 보강) ADR 분리 PR 의 review 비용이 ship 비용보다 높음.

## 폐기된 대안

- **E-1 alt: env var 자동 첫 로그인 승급** — prod 환경 변수 누설 시 권한 탈취.
- **E-2 alt: self-service admin 신청** — 신청 쇄도 + 심사 부하.
- **E-3 alt: 5종 풀 스펙트럼 (`audit_only` 추가)** — 실 사용처 부재, over-engineering.
- **E-4 alt: `deactivated_at` 컬럼 신설** — audit_logs 가 시점·사유 보존, 컬럼 중복.
- **E-5c alt: admin 도 soft-delete 가능 (cascade 자동 demote)** — admin 활성 상태에서 user
  지우는 건 audit/recovery 어려움. 명시적 demote 가 안전.
- **E-6 alt: action 별 별개 테이블** — admin_audit_logs JSONB payload 가 충분.
- **E-7 alt: UI 같이 ship** — DESIGN.md 정합성 review 비용 + scope 폭증.
- **E-8 alt: 별개 `uploader_approval_logs` 테이블** — admin_audit_logs 로 흡수 가능 (ADR 0004
  D-6 신설 시 의도했던 범용 패턴).
- **E-8 alt: 3 actions (approve/revision_request/reject)** — 같은 endpoint outcome 분기라
  approval_logs 패턴 (단일 action + payload.action) 이 정합.

## 참조

- ADR 0004 — 세션 무효화 정책 (D-1 / D-6 의존 해소)
- `apps/bff/src/jobs/seed-admin.ts` — bootstrap CLI (변경 없음)
- `apps/bff/src/middleware/require-admin.ts` — adminProfile.isActive 체크 (변경 없음)
- `apps/bff/src/routes/admin-uploaders.ts:287` `decideUploader` — E-8 보강 대상
- `apps/bff/src/routes/admin-users.ts` — ADR 0004 D-6 ship 시 신설, 본 ADR 에서 4 endpoint 추가
- `wiki/topics/admin-account-management.md` — 신규 topic (본 ADR mirror)
