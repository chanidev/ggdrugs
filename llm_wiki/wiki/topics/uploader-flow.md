---
title: 업로더 플로우
type: topic
created: 2026-04-17
updated: 2026-04-17
sources: [2026-04-17_ui-flow-draft, 2026-04-17_requirements-v5]
related:
  - ../sources/2026-04-17_ui-flow-draft.md
  - ../sources/2026-04-17_requirements-v5.md
  - admin-flow.md
  - roles-and-active-role.md
  - event-state-machine.md
  - use-cases-index.md
---

# 업로더 플로우

## Summary

이벤트를 등록하는 업로더 역할 사용자의 전용 화면 동선. GGdrugs는 "1계정 = 복수 역할 토글" 모델이므로, 일반 사용자가 업로더 역할을 추가로 보유하면 이 화면군에 접근할 수 있다. 업로더 메인에는 자신이 등록한 이벤트 현황이 지도/리스트로 표시되고, 신규 이벤트 등록 폼과 승인 상태별 뷰가 포함된다.

## Key points

- **업로더 작업 리스트**: 자신이 등록한 이벤트 목록, 상태별 필터 — `approval_status` 축(pending / approved / revision_requested / rejected) × `phase` 축(upcoming / ongoing / ended). 두 축의 조합(A_601 요약 카드 4종).
- **업로더 메인 페이지**: 사용자용 메인과 유사한 지도 뷰이되, 자신의 이벤트에 초점.
- **작업도 목록 후 리스트에서 꺼내기**: 완료된 작업을 리스트에서 제외하거나 보관함으로 이동하는 동작으로 추정.
- **업로드(등록) 페이지**: 신규 이벤트 정보 입력 폼. 기본 필드 + expected_companion, event_type 등 enum 선택 포함 추정.
- **역할 토글**: 일반 사용자 뷰 ↔ 업로더 뷰 전환 UI가 어딘가에 존재해야 하나 이미지상 위치 확정 불가.

## Open questions / contradictions

- ~~역할 토글 UI 위치~~ → **해소**: GG-ROLE-001 "마이페이지 우측 상단 역할 전환 버튼 상시 노출".
- ~~업로더 승급 심사 진입점~~ → **해소**: 마이페이지 역할 전환 버튼(업로더 미승인 시 "업로더 신청" 라벨) → A_600 폼.
- "작업도 목록에서 꺼내기"의 정확한 의미 판독 불가 — 이벤트 카드 드래그 / 보관 / 삭제 중 하나로 추정.
- 이벤트 수정(revision_requested → 재제출) UI가 업로드 페이지와 동일한지, 별도인지 확정 필요 (A_601 본문에 "이벤트 정보 수정" 버튼 언급만 있음).
- ~~DDL에 `active_role` 컬럼 부재~~ → **해소**: ADR 0001 #2로 `users.active_role` 추가 확정.

## References

- [2026-04-17_ui-flow-draft](../sources/2026-04-17_ui-flow-draft.md) — 섹션 7-1 ~ 7-5
