---
title: 관리자 플로우
type: topic
created: 2026-04-17
updated: 2026-04-17
sources: [2026-04-17_ui-flow-draft, 2026-04-17_requirements-v5]
related:
  - ../sources/2026-04-17_ui-flow-draft.md
  - ../sources/2026-04-17_requirements-v5.md
  - uploader-flow.md
  - event-state-machine.md
  - roles-and-active-role.md
  - use-cases-index.md
---

# 관리자 플로우

## Summary

관리자(admin) 역할이 콘텐츠를 검토·승인·라벨 부여하는 화면 동선. 요구사항정의서 v5.0에 따르면 관리자의 결정은 LLM에 위임하지 않고 사람이 직접 수행한다 (이벤트 승인, event_vibe 라벨 부여, 업로더 승급 심사).

## Key points

- **이벤트 승인 대기열**: 업로더가 제출한 pending 상태 이벤트 리스트.
- **상세 검토 화면**: 이벤트 전체 정보 열람 후 승인 / 반려 / 수정요청 액션.
- **상태 전이**:
  - `pending → approved` (승인)
  - `pending → rejected` (반려, 종결)
  - `pending → revision_requested → pending` (수정 후 재제출)
  - `approved → ended` (종료일 도래, 자동)

## Open questions / contradictions

- ~~`event_vibe` 라벨 부여 UI 위치~~ → **해소**: A_700 본문 "관리자는 서류 검토 후 이벤트 성향 라벨을 직접 부여한다" — 승인 플로우 내 인라인.
- ~~업로더 승급 심사 화면~~ → **해소**: A_700이 두 탭(이벤트 업로드 심사 / 업로더 역할 승급 심사)으로 구성됨.
- 관리자 감사 로그 UI 미확인 — DB상 `approval_logs` 테이블은 존재하나 관리자 화면에 조회 UI가 있는지 명세 없음.
- 대량 일괄 승인(bulk action) 지원 여부 미정.
- LLM이 관리자 보조로 등장(A_700 액터에 "시스템(LLM)" 포함) — 역할 범위 확정 필요(라벨 추천? 서류 OCR? CLAUDE.md §6-4는 LLM 위임 금지).
- 관리자 전용 계정 생성 플로우 부재 (`roles-and-active-role.md` 참조).

## References

- [2026-04-17_ui-flow-draft](../sources/2026-04-17_ui-flow-draft.md) — 관리자 섹션
