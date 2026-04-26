---
title: 역할(role)과 active_role — 1계정 복수 역할 토글
type: topic
created: 2026-04-17
updated: 2026-04-23
sources: [2026-04-17_requirements-v5, 2026-04-16_event-curation-ddl]
related:
  - ../sources/2026-04-17_requirements-v5.md
  - ../sources/2026-04-16_event-curation-ddl.md
  - terminology-glossary.md
  - uploader-flow.md
  - admin-flow.md
  - admin-account-management.md
  - ../../../docs/decisions/0003-uploader-pii-policy.md
  - ../../../docs/decisions/0005-admin-account-management.md
---

# 역할(role)과 active_role

## Summary

GGdrugs는 **"1계정 = 복수 역할 토글"** 모델을 v5.0에서 확정했다. 일반 사용자(user)가 A_600 승급 신청 + A_700 관리자 승인을 거쳐 동일 계정에 업로더(uploader) 역할을 추가한다. 현재 활성 역할은 `active_role`로 관리하며, 마이페이지 토글 버튼('GG-ROLE-001')으로 전환한다. 관리자(admin)는 별도 전용 계정이라 토글 대상이 아니다.

## Key points

### 3가지 역할
- **user** — 모든 회원 기본 보유. 탐색·북마크·리뷰 등 소비 기능.
- **uploader** — 이벤트 등록·관리. A_600 신청 → A_700 승인 후 동일 user 계정에 추가.
- **admin** — 이벤트 심사, 라벨 부여, 업로더 승급 심사. **별도 전용 계정**, 토글 불가.

### active_role (현재 활성 역할)
- 세션 + DB `active_role` 컬럼으로 관리 (용어집 명시).
- 마이페이지 우측 상단 '역할 전환' 버튼 상시 노출 (GG-ROLE-001).
  - 업로더 미승인 계정: 버튼 라벨 "업로더 신청" → 클릭 시 A_600 승급 폼.
  - 업로더 승인 계정: 버튼 라벨 "업로더로 전환" → 클릭 시 active_role 전환 + A_601로 라우팅.
- 사용자 모드 → A_500 / 업로더 모드 → A_601 (GG-ROLE-003).

### DB 표현 (ADR 0001 적용 후, Phase 1 마이그레이션)
- `users.active_role VARCHAR(20) NOT NULL DEFAULT 'user'` (ADR 0001 #2 — 원본 DDL v3에는 부재).
- `uploader_profiles` — users에 1:1 확장 (uploader_id, user_id UNIQUE). `approval_status IN (pending, approved, revision_requested, rejected)` (ADR 0001 #1 대칭 적용). PII 식별자는 `business_registration_number` (10자) 또는 `ci_hash` (88자) 둘 중 하나 (ADR 0003 — 주민등록번호 제거).
- `admin_profiles` *(신설, ADR 0001 #3)* — users에 1:1 확장. `scope IN ('full', 'content_only', 'uploader_review_only', 'security')` (← ADR 0005 E-3 에서 `security` 추가, 마이그레이션 `20260423100428_admin_scope_security`). 원본 DDL v3에는 admin 식별 수단 부재.

### 승급 플로우 (A_600 → A_700)
1. 마이페이지 우측 상단 '업로더 신청' 버튼 (`RoleToggleButton`, GG-ROLE-001) 클릭 → `/uploader` 의 ApplyForm 노출.
2. 입력: 기관명·실명·연락처·이메일 + **사업자등록번호 (10자) XOR CI 해시 (88자)** + 증빙서류 1~5장 (사업자등록증/허가서/재직증명 택1 이상). ADR 0003 으로 주민등록번호 항목은 제거됨 (개인정보보호법 §24-2).
3. uploader_profiles.approval_status = 'pending' 상태로 저장.
4. 관리자가 A_700 'Uploaders' 탭에서 검토 — `decideUploader` 핸들러 호출 시 reason textarea 입력 + `admin_audit_logs.action='uploader_decision'` 자동 기록 (ADR 0005 E-8).
5. 승인 시 uploader_profiles.approval_status = 'approved' + approved_at 타임스탬프 → 마이페이지 RoleToggleButton 라벨이 "업로더로 전환" 으로 변경.

## Open questions / contradictions

> [2026-04-17] ADR 0001로 일부 해소. [2026-04-23] ADR 0003 / ADR 0005 로 추가 해소.

1. ~~DB에 `active_role` 컬럼 부재~~ → **해소**: ADR 0001 #2 — 컬럼 추가 확정.
2. ~~DB에 admin 식별 컬럼 부재~~ → **해소**: ADR 0001 #3 — `admin_profiles` 전용 테이블 신설 확정. ADR 0005 E-3 에서 scope 도메인에 `security` 추가 (4종).
3. GG-UREG-003의 "uploader_pending" 문자열과 uploader_profiles.approval_status enum {pending, approved, rejected, revision_requested} 사이 표현 차이 — 요구사항정의서 표기 오류. 코드는 enum 으로 확정 ship.
4. ~~관리자 전용 계정 생성 플로우 미정~~ → **해소** (2026-04-23): ADR 0005 — `seed:admin` CLI (bootstrap) + Members 탭의 "admin 승급" peer-promote (`POST /admin/users/:id/promote`, scope='full' admin 만 호출 가능, audit 자동). 박탈/scope 변경/세션 폐기/계정 비활성화 모두 동일 탭.
5. ~~업로더 양방향 토글~~ → **해소** (2026-04-23): `setActiveRole(role: 'user' | 'uploader')` 양방향 ship (`apps/bff/src/routes/uploader/role.ts`). MyPage `RoleToggleButton` (`apps/web/src/pages/MyPage/parts/RoleToggleButton.tsx`) 이 5 상태 분기 (미신청/심사중/보완·반려/사용자모드/업로더모드) 모두 처리.
6. ~~rejected된 업로더 승급 신청의 재신청 쿨다운~~ → **해소** (2026-04-23): **7일 쿨다운** 적용 (rejected 만, revision_requested 는 즉시 허용 — admin 이 명시 보완 요청한 케이스). 기준 시점 `uploader_profiles.updatedAt`. BFF `/me/uploader` 응답에 `canReapply / canReapplyAt / cooldownReason` 동봉, `applyUploader` 가 cooldown active 시 429 `reapply_cooldown_active`. RoleToggleButton 이 카운트다운 disabled 버튼 ("반려 · N일 후 재신청") 으로 진입 차단. 쿨다운 정책은 단순 정책 결정이라 별도 ADR 박제 안 함 (`apps/bff/src/routes/uploader/_helpers.ts::computeReapplyGate` 참조).

## References

- [2026-04-17_requirements-v5](../sources/2026-04-17_requirements-v5.md) — Ⅴ장 3절 역할, A_500/A_600/A_700, GG-ROLE-001~003
- [2026-04-16_event-curation-ddl](../sources/2026-04-16_event-curation-ddl.md) — users, uploader_profiles
- [CLAUDE.md §1, §5-1](../../../.claude/CLAUDE.md) — 1계정 복수 역할 모델, active_role 용어
