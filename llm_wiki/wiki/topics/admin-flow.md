---
title: 관리자 플로우
type: topic
created: 2026-04-17
updated: 2026-04-23
sources: [2026-04-17_ui-flow-draft, 2026-04-17_requirements-v5]
related:
  - ../sources/2026-04-17_ui-flow-draft.md
  - ../sources/2026-04-17_requirements-v5.md
  - uploader-flow.md
  - event-state-machine.md
  - roles-and-active-role.md
  - use-cases-index.md
  - subscriptions-notifications.md
  - admin-account-management.md
  - ../../docs/decisions/0005-admin-account-management.md
---

# 관리자 플로우

## Summary

관리자(admin) 역할이 콘텐츠를 검토·승인·라벨 부여하는 화면 동선. 요구사항정의서 v5.0에 따르면 관리자의 결정은 LLM에 위임하지 않고 사람이 직접 수행한다 (이벤트 승인, event_vibe 라벨 부여, 업로더 승급 심사).

## Key points

A_700 관리자 콘솔은 **5개 탭** 구성 (`AdminEventsPage.tsx`):

- **Events** — 이벤트 vibe 라벨 부여. 승인 대기/미라벨 필터.
- **Uploads** — 업로드 이벤트 심사. pending 이벤트 리스트 + 서류 미리보기 패널 (MinIO 5분 presigned) + 승인/반려/보완 요청 결정 + 사유 텍스트.
- **Uploaders** — 업로더 역할 승급 심사. ADR 0003 PII 마스킹 (admin.scope='full' 만 원본 노출). reason textarea + audit 자동 기록 (ADR 0005 E-8 — `admin_audit_logs.action='uploader_decision'`).
- **Members** *(2026-04-23 신규, ADR 0005 E-7)* — 회원/admin 통합 관리. role × status 필터 + nickname 검색 + 5 액션 (세션 폐기 / admin 승급 / scope 변경 / admin 박탈 / 계정 비활성화). 모든 액션이 `admin_audit_logs` 자동 기록. ↓ 별도 섹션.
- **Audit** — 승인 결정 히스토리 (approval_logs) 조회. ↓ 별도 섹션.

**이벤트 상태 전이**:
- `pending → approved` (승인) — 승인 시 fan-out: 구독자 알림 + 뉴스 매핑 (`subscriptions-notifications.md`, `news-article-pipeline.md`)
- `pending → rejected` (반려, 종결)
- `pending → revision_requested → pending` (수정 후 재제출, `uploader-flow.md` §A_601b)
- `approved → ended` (종료일 도래, 자동)

## Audit Logs (A_700 Audit 탭, 2026-04-21 신규)

`approval_logs` 조회 UI (`apps/web/src/components/admin/AuditLogsTab.tsx`):

- **필터**: 액션(approved/revision_requested/rejected) + eventId 직접 검색.
- **페이지네이션**: 기본 50 / 페이지, 최대 200.
- **표시**: 액션 뱃지 + 이벤트 제목(삭제된 이벤트도 타이틀 보존, eventAvailable 플래그로 상세 링크 분기) + 업로더 기관명 + 관리자 nickname + 사유(scrollable block) + 결정 시각 + 이벤트 현재 상태.
- **집계**: 액션별 카운트 배지 (필터 버튼 옆에).

BFF: `GET /admin/audit-logs?page&limit&action&eventId&adminId` — `apps/bff/src/routes/admin-audit.ts`.

현재 Audit 탭은 `approval_logs` (이벤트 심사) 만 노출. admin 측 보안·운영 액션은 `admin_audit_logs`
별도 테이블 (Members 탭의 우측 패널 §최근 처리 내역 + 회원 detail 단위 노출). 두 테이블 통합 뷰는
후속 sprint.

## Members 탭 (2026-04-23 신규, ADR 0005 E-7)

상세는 [admin-account-management.md](admin-account-management.md). 요약:

- BFF: `GET /admin/users` (목록 + 필터 + 검색) + `GET /admin/users/:id` (상세 + 활성 세션 수 + 최근 audit).
- Web: `MembersTab` (좌측 목록) + `UserDetailPanel` (우측 상세 + 5 액션 inline 폼).
- 5 액션 (모두 reason 10~500자 강제 + `admin_audit_logs` 자동 기록):
  - 세션 폐기 (D-6, scope='full'|'security')
  - admin 승급 (E-2, scope='full' only)
  - admin scope 변경 (E-4)
  - admin 박탈 (E-4)
  - 계정 비활성화 (E-5, admin 활성 user 는 차단 — E-5c gate)

Uploaders 탭 패턴 (목록 + 상세 패널 + 결정 액션) 의 미러.

## Open questions / contradictions

- ~~`event_vibe` 라벨 부여 UI 위치~~ → **해소**: A_700 Events 탭 인라인.
- ~~업로더 승급 심사 화면~~ → **해소**: A_700 Uploaders 탭 (ADR 0003 PII 마스킹 포함).
- ~~관리자 감사 로그 UI~~ → **해소** (2026-04-21): Audit 탭 ship.
- ~~관리자 전용 계정 생성 플로우 부재~~ → **해소** (2026-04-23): ADR 0005 — seed:admin (bootstrap) + Members 탭의 "admin 승급" (peer-promote) 두 경로.
- ~~업로더 승급 로그 테이블 부재~~ → **해소** (2026-04-23): ADR 0005 E-8 — `admin_audit_logs.action='uploader_decision'` 으로 `decideUploader` 호출 시 자동 기록.
- 대량 일괄 승인(bulk action) 지원 여부 미정 — 현재는 개별 승인만.
- LLM이 관리자 보조로 등장(A_700 액터에 "시스템(LLM)" 포함) — 역할 범위 확정 필요(라벨 추천? 서류 OCR? CLAUDE.md §6-4는 LLM 위임 금지).
- `admin_audit_logs` + `approval_logs` 통합 Audit 뷰 미구현 — 두 테이블 별도 노출 상태.

## References

- [2026-04-17_ui-flow-draft](../sources/2026-04-17_ui-flow-draft.md) — 관리자 섹션
