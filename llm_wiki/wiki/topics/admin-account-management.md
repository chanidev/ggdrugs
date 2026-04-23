---
title: 관리자 계정 관리 + 작업 감사
type: topic
created: 2026-04-23
updated: 2026-04-23
sources: [2026-04-17_requirements-v5]
related:
  - admin-flow.md
  - auth-flow.md
  - uploader-flow.md
  - roles-and-active-role.md
  - ../../docs/decisions/0005-admin-account-management.md
  - ../../docs/decisions/0004-session-invalidation-policy.md
  - ../../docs/decisions/0003-uploader-pii-policy.md
---

# 관리자 계정 관리 + 작업 감사 (ADR 0005)

## Summary

`admin_profiles` 행을 런타임에 생성·박탈·scope 변경하는 5 endpoint + uploader 승급 audit 보강.
ADR 0004 가 남긴 dependency 2건 (D-1 user soft-delete 패턴, D-6 의 `scope='security'` placeholder)
+ `seed:admin` CLI only 한계를 한 번에 해소. 모든 admin 액션은 `admin_audit_logs` 단일
테이블에 JSONB payload 로 기록.

## 업로더 ↔ 관리자 분리 (재확인)

| 구분 | 업로더 | 관리자 |
|---|---|---|
| 테이블 | `uploader_profiles` | `admin_profiles` |
| `user.active_role` | `'user' ↔ 'uploader'` 토글 | **CHECK 제약상 'admin' 불가** — admin_profile 행 존재 자체가 권한 |
| 미들웨어 | `requireUploaderActive` | `requireAdmin` (admin_profile.is_active 체크) |
| 승급 경로 | A_700 part 2 — admin 이 `decideUploader` 로 승인/반려 | seed:admin CLI (bootstrap) + 본 ADR 의 `promote` API (런타임) |
| 감사 | (이전) 없음 → (E-8) `admin_audit_logs.action='uploader_decision'` | `admin_audit_logs` (action 5종) |

## 5 endpoint (ADR 0005)

전부 `requireAuth → requireAdmin` 체인. 권한 / body / 부수효과 / audit action 표:

| endpoint | 권한 | body | DB 변경 | audit action |
|---|---|---|---|---|
| `POST /admin/users/:id/promote` (E-2) | scope='full' | `{ scope, reason 10~500자 }` | `admin_profiles.upsert({userId, scope, isActive:true})` | `admin_promote` |
| `POST /admin/users/:id/demote` (E-4) | scope='full' | `{ reason }` | `admin_profiles.update isActive=false` (사전조건: isActive=true) | `admin_demote` |
| `PUT  /admin/users/:id/admin-scope` (E-4) | scope='full' | `{ scope, reason }` | `admin_profiles.update scope` (사전조건: 동일 scope 재요청 409) | `admin_scope_change` |
| `POST /admin/users/:id/soft-delete` (E-5) | scope='full' | `{ reason }` | tx: `users.update isDeleted=true,deletedAt` + `authSession.deleteMany` (ADR 0004 D-1) | `user_soft_delete` |
| `POST /admin/users/:id/revoke-sessions` (ADR 0004 D-6, ADR 0005 E-3 정정) | scope IN ('full','security') | `{ reason }` | `authSession.deleteMany` | `revoke_sessions` |

추가로 기존 endpoint 보강:

| endpoint | 변경 | audit action |
|---|---|---|
| `POST /admin/uploaders/:id/decision` (E-8) | optional `reason: string (0~2000자)` 추가 + admin_audit_logs.create 동봉 | `uploader_decision` (payload.action ∈ approved/revision_requested/rejected) |

## scope 도메인 (E-3)

기존 `full | content_only | uploader_review_only` → `+ security` 추가. CHECK 제약 rebuild
마이그레이션 (`20260423100428_admin_scope_security`).

| scope | 의미 | 통과 endpoint |
|---|---|---|
| `full` | 모든 admin 액션 | 본 ADR 5종 + 기존 admin 라우트 전체 |
| `security` | 보안 사고 대응 전용 | revoke-sessions (ADR 0004 D-6) |
| `content_only` | 이벤트 콘텐츠 라벨/심사만 — Members 탭의 admin 관리 액션은 차단 | 현재 라우트별 분기 없음 (모든 admin 라우트 통과). 활성화는 후속 sprint |
| `uploader_review_only` | 업로더 승급 심사만 — 이벤트 / Members / Audit 탭 차단 | 동일 |

**결정 박제 (2026-04-23)**: 두 scope 의 *의미* 는 위 표대로 결정. *실제 권한 분기 코드* 는
필요 시 (예: 외부 콘텐츠 모더레이터 채용, 별도 업로더 심사관 채용) 후속 sprint 에 추가.
지금은 활용 사례 미관측이라 모든 routes 가 `requireAdmin` 통과만 검증 (scope='full' 만 사실상
모든 액션 가능). `seed:admin --scope content_only` 등으로 미리 부여해도 동작은 'full' 과 동일.

## E-5 sub-rules (soft-delete 대상별)

| sub | 대상 | 정책 |
|---|---|---|
| E-5a | 일반 user | 정상 처리 |
| E-5b | uploader_profile 보유 user | 정상 처리. uploader_profile 행 그대로 (FK cascade 안 탐). isDeleted=true user 는 `requireUploaderActive` 가 차단해 uploader 활동 불가. 운영자가 명시 반려 원하면 먼저 `decideUploader` 호출. |
| E-5c | admin_profile.isActive=true 보유 user | **차단** — 409 `admin_profile_active_must_demote_first`. 먼저 demote 후 soft-delete. |

## audit_logs 표준 payload (E-6)

`admin_audit_logs` 단일 테이블, action 별 payload 표준:

```jsonc
// admin_promote
{ "scope": "full", "reason": "..." }

// admin_demote
{ "reason": "...", "before": { "scope": "full", "isActive": true }, "after": { "isActive": false } }

// admin_scope_change
{ "reason": "...", "before": { "scope": "full" }, "after": { "scope": "security" } }

// user_soft_delete
{ "reason": "...", "deletedSessionCount": 3 }   // count 는 사후 update

// uploader_decision
{ "uploaderId": "42", "action": "approved", "reason": "..." }   // reason nullable

// revoke_sessions (ADR 0004 D-6, 이미 ship)
{ "reason": "...", "count": 1 }   // count 는 사후 update
```

action enum 에 CHECK 제약은 없음 — admin_audit_logs 의 범용 정책 (ADR 0004 §결정 D-6).
새 action 추가 시 마이그레이션 비용 없음.

## bootstrap (E-1, 변경 없음)

`pnpm seed:admin` CLI 그대로. production 초기 1회 실행 후 운영 매뉴얼화.

```
pnpm seed:admin --userId 1 --scope full
pnpm seed:admin --email user@example.com --scope security
pnpm seed:admin --list
pnpm seed:admin --userId 1 --deactivate
```

런타임 admin 추가는 본 ADR 의 `promote` API 사용 권장 — audit 가 자동.

## UI (E-7 정정 — Members 탭 ship)

**원안 (폐기)**: backend-only.

**정정 (2026-04-23)**: `AdminEventsPage` 에 **Members 탭** 신설. Uploaders 탭 패턴 그대로 복제 —
좌측 목록 + 우측 상세 패널 + 인라인 액션 폼.

| 영역 | 컴포넌트 | 책임 |
|---|---|---|
| 좌측 목록 | `MembersTab` (`apps/web/src/components/admin/MembersTab.tsx`) | 필터 (role × status) + nickname 검색 + 페이지네이션. byRole / byStatus counter 노출. |
| 우측 상세 | `UserDetailPanel` (`apps/web/src/components/admin/UserDetailPanel.tsx`) | 계정/uploader/admin 프로파일 + 활성 세션 수 + 최근 admin_audit_logs 10건 (target_id 기준) |
| 액션 폼 | `ActionForm` (UserDetailPanel 내부) | scope select (필요 시) + reason textarea (10~500자) + 실행 |

신규 BFF endpoint:
- `GET /admin/users` (목록 + 필터 + 검색 + 페이지) — `byRole/byStatus` counter
- `GET /admin/users/:id` (상세 + 활성 세션 수 + 최근 audit)

5 액션 노출 규칙 (current state 별):

| 대상 | 노출되는 액션 |
|---|---|
| 일반 user (uploader/admin 없음) | 세션 폐기 / admin 승급 / 계정 비활성화 |
| uploader 보유 user | 동일 + 업로더 정보 표시 (반려는 Uploaders 탭에서 처리) |
| admin 활성 user | 세션 폐기 / scope 변경 / admin 박탈 (계정 비활성화는 disabled — E-5c) |
| 삭제된 user (is_deleted=true) | 액션 영역 자체 숨김 (recovery 는 별도 작업) |

**UX 강제**: 모든 action 의 reason 10~500자 필수 (BFF 와 동일 임계 — E-8 의 0~2000 / 강제 분리
패턴과 다름. 본 액션은 보안·삭제 영향 큰 변경이라 BFF 도 ADR 0005 본문에서 강제하므로 UX 동조).

### E-8 정정도 동일 patterm 으로 정합

`decideUploader` 호출 사이트 (`UploaderDetailPanel`) 의 reason textarea (E-8 후속) 와 본 Members
탭의 ActionForm 은 동일 UX 패턴. 차이는 검증 강도:

| 영역 | BFF reason | UX reason |
|---|---|---|
| `decideUploader` (E-8) | optional 0~2000자 | 반려/보완요청만 강제 (≥1자), 승인은 optional |
| `admin-users.ts` 5 액션 (E-2/E-4/E-5/D-6) | 필수 10~500자 | 동일 |

## ADR 0004 정정 (본 ADR 흡수)

- D-1: "본 ADR 범위 외" → "ADR 0005 E-5 에서 활성화 ship".
- D-6: "scope='full' 만 통과" → "scope IN ('full','security') 통과 — `security` 는 ADR 0005
  E-3 에서 추가".

## References

- [ADR 0005 — 관리자 계정 관리](../../docs/decisions/0005-admin-account-management.md) — 본문
- [ADR 0004 — 세션 무효화 정책](../../docs/decisions/0004-session-invalidation-policy.md) — D-1/D-6
- `apps/bff/src/routes/admin-users.ts` — 5 endpoint 본체
- `apps/bff/src/routes/admin-uploaders.ts::decideUploader` — E-8 보강 대상
- `apps/bff/src/jobs/seed-admin.ts` — bootstrap CLI (변경 없음)
- `apps/bff/prisma/migrations/20260423100428_admin_scope_security/` — chk_admin_scope rebuild
