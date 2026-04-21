---
title: 관리자 플로우
type: topic
created: 2026-04-17
updated: 2026-04-21
sources: [2026-04-17_ui-flow-draft, 2026-04-17_requirements-v5]
related:
  - ../sources/2026-04-17_ui-flow-draft.md
  - ../sources/2026-04-17_requirements-v5.md
  - uploader-flow.md
  - event-state-machine.md
  - roles-and-active-role.md
  - use-cases-index.md
  - subscriptions-notifications.md
---

# 관리자 플로우

## Summary

관리자(admin) 역할이 콘텐츠를 검토·승인·라벨 부여하는 화면 동선. 요구사항정의서 v5.0에 따르면 관리자의 결정은 LLM에 위임하지 않고 사람이 직접 수행한다 (이벤트 승인, event_vibe 라벨 부여, 업로더 승급 심사).

## Key points

A_700 관리자 콘솔은 **4개 탭** 구성 (`AdminEventsPage.tsx`):

- **Events** — 이벤트 vibe 라벨 부여. 승인 대기/미라벨 필터.
- **Uploads** — 업로드 이벤트 심사. pending 이벤트 리스트 + 서류 미리보기 패널 (MinIO 5분 presigned) + 승인/반려/보완 요청 결정 + 사유 텍스트.
- **Uploaders** — 업로더 역할 승급 심사. ADR 0003 PII 마스킹 (admin.scope='full' 만 원본 노출).
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

현재는 이벤트 결정만 기록. 업로더 승급 로그는 별도 테이블이 없어 후속 ADR 대기.

## Open questions / contradictions

- ~~`event_vibe` 라벨 부여 UI 위치~~ → **해소**: A_700 Events 탭 인라인.
- ~~업로더 승급 심사 화면~~ → **해소**: A_700 Uploaders 탭 (ADR 0003 PII 마스킹 포함).
- ~~관리자 감사 로그 UI~~ → **해소** (2026-04-21): Audit 탭 ship.
- 대량 일괄 승인(bulk action) 지원 여부 미정 — 현재는 개별 승인만.
- LLM이 관리자 보조로 등장(A_700 액터에 "시스템(LLM)" 포함) — 역할 범위 확정 필요(라벨 추천? 서류 OCR? CLAUDE.md §6-4는 LLM 위임 금지).
- 관리자 전용 계정 생성 플로우 부재 (`roles-and-active-role.md` 참조). 현재는 DB 수동 insert / seed 스크립트만.
- 업로더 승급 로그 테이블 부재 — `approval_logs` 는 이벤트 결정만. 후속 ADR 대기.

## References

- [2026-04-17_ui-flow-draft](../sources/2026-04-17_ui-flow-draft.md) — 관리자 섹션
