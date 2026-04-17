---
title: 역할(role)과 active_role — 1계정 복수 역할 토글
type: topic
created: 2026-04-17
updated: 2026-04-17
sources: [2026-04-17_requirements-v5, 2026-04-16_event-curation-ddl]
related:
  - ../sources/2026-04-17_requirements-v5.md
  - ../sources/2026-04-16_event-curation-ddl.md
  - terminology-glossary.md
  - uploader-flow.md
  - admin-flow.md
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
- `uploader_profiles` — users에 1:1 확장 (uploader_id, user_id UNIQUE). `approval_status IN (pending, approved, revision_requested, rejected)` (ADR 0001 #1 대칭 적용).
- `admin_profiles` *(신설, ADR 0001 #3)* — users에 1:1 확장. `scope IN ('full', 'content_only', 'uploader_review_only')`. 원본 DDL v3에는 admin 식별 수단 부재.

### 승급 플로우 (A_600 → A_700)
1. 마이페이지 '업로더 신청' 클릭 → 폼 표시.
2. 입력: 이름, 주민등록번호, 소속, 전화번호, 이메일, 증명사진(사업자등록증/허가서/재직증명 택1 이상) + 약관 동의.
3. uploader_profiles.approval_status = 'pending' 상태로 저장 (GG-UREG-003은 "uploader_pending"으로 기록 — 네이밍 확인 필요).
4. 관리자가 A_700 '업로더 역할 승급 심사' 탭에서 검토.
5. 승인 시 uploader_profiles.approval_status = 'approved' + approved_at 타임스탬프.

## Open questions / contradictions

> [2026-04-17] ADR 0001로 일부 해소. [`docs/decisions/0001-*.md`](../../../docs/decisions/0001-ddl-v3-vs-terminology-v5-reconciliation.md)

1. ~~DB에 `active_role` 컬럼 부재~~ → **해소**: ADR 0001 #2 — 컬럼 추가 확정.
2. ~~DB에 admin 식별 컬럼 부재~~ → **해소**: ADR 0001 #3 — `admin_profiles` 전용 테이블 신설 확정 (scope 컬럼으로 권한 범위 표현: full/content_only/uploader_review_only).
3. GG-UREG-003의 "uploader_pending" 문자열과 uploader_profiles.approval_status enum {pending, approved, rejected, revision_requested} 사이 표현 차이 — 요구사항정의서 표기 오류로 보이므로 Phase 1 구현 시 용어집 기준으로 확정.
4. 관리자 전용 계정 생성 플로우 미정 — 시스템 시드? 관리자가 관리자 승격? ADR 0001 §3 후속 작업에 포함 예정.
5. 업로더 승인 후 일반 사용자 역할로 복귀 가능 여부(양방향 토글) 확정 필요. 현재 UI는 양방향을 가정하는 것으로 보임 — `active_role` 컬럼 값 전환으로 자연스럽게 지원 가능.
6. rejected된 업로더 승급 신청의 재신청 쿨다운/정책 명세 없음.

## References

- [2026-04-17_requirements-v5](../sources/2026-04-17_requirements-v5.md) — Ⅴ장 3절 역할, A_500/A_600/A_700, GG-ROLE-001~003
- [2026-04-16_event-curation-ddl](../sources/2026-04-16_event-curation-ddl.md) — users, uploader_profiles
- [CLAUDE.md §1, §5-1](../../../.claude/CLAUDE.md) — 1계정 복수 역할 모델, active_role 용어
