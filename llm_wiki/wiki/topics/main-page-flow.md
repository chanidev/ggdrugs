---
title: 메인 페이지 플로우
type: topic
created: 2026-04-17
updated: 2026-04-23
sources: [2026-04-17_ui-flow-draft, 2026-04-17_requirements-v5]
related:
  - ../sources/2026-04-17_ui-flow-draft.md
  - ../sources/2026-04-17_requirements-v5.md
  - event-detail-review-flow.md
  - filters-5-types.md
  - semantic-search.md
  - use-cases-index.md
---

# 메인 페이지 플로우

## Summary

서울시 자치구 지도를 기반으로 한 이벤트 탐색 진입점. 데스크톱과 모바일이 다른 shell 을 쓰지만 같은 state container (`AppShell`) 를 공유 — breakpoint 전환 / 회전 시에도 선택 이벤트 / chat 메시지 / 적용 필터 보존.

## Key points (요구사항 v5)

- **지도 배경**: 서울시 자치구 경계 + Kakao Maps 클러스터 마커.
- **로그인 상태**:
  - 비로그인: 탐색만 가능, 북마크·리뷰 버튼 비활성. /chat 호출은 가능 (개인화 컨텍스트만 빠짐).
  - 로그인: 사용자 nickname header, 북마크 활성, /chat 에 user_taste_profiles 기반 priorityHint 자동 주입.
- **클러스터 클릭**: 해당 자치구 이벤트 목록 (FullListPanel / 모바일 시트 목록 탭).
- **뷰 토글**: 데스크톱은 rail+overlay panel, 모바일은 풀스크린 지도 + BottomSheet (peek/full).
- **필터 해제 ("취소하기")**: 5종 필터 + 폴리곤 하이라이트 모두 초기화 → 메인 지도 복귀.

## Shell 분기 (2026-04-23 mobile ship)

`apps/web/src/layout/AppShell.tsx` 가 최상위 state container. 두 트리를 동시 렌더, CSS 로 한 쪽만 노출:

### Desktop (`md+` ≥ 768px)
- `Header`(60px) + `Sidebar` rail(236) + `OverlayPanel` (필터/목록/채팅 help) + `EventSummaryPanel`(380, selectedEventId 있을 때) + `<main>`(SeoulMap + ChatDock floating)
- z-stack: map < ChatDock(z7) < EventSummaryPanel(z10) < OverlayPanel(z20)
- 같은 `hidden md:flex` 컨테이너 내부.

### Mobile (`< md`)
- `MobileShell` — 풀스크린 지도(z0) + floating header(h-12, surface/85 + backdrop-blur, z40) + BottomSheet(z30).
- BottomSheet 3 snap: **min 10vh** (핸들만 노출, 풀스크린 지도) ↔ **peek 52vh** ↔ **full 90vh**.
- 시트 내부 탭: 목록 / 필터 / 채팅 (rail accordion 콘텐츠 재사용).
- 핀 / 카드 탭 → `selectedEventId` set + 시트가 min 이면 자동 peek 으로 → `EventSummaryContent` 인라인 렌더 (탭 콘텐츠 대체, "← 목록으로" 로 복귀).
- DESIGN.md §모바일 메인 레이아웃 정책 박제 + 코드 ship 완료.
- **비-목표** (의도적 미채택): bottom tab bar (Instagram-style), side drawer hamburger, pull-to-refresh.

## Chat 결합 (A_201)

`AppShell.handleChatSubmit` → `sendChat()` → BFF `/chat` → LLM 추출+reply+followups + Qdrant 의미 후보 → 응답이 `messages` 에 assistant 메시지로 push.

- `mapFilter` 갱신 → `SeoulMap` 재-fetch 트리거.
- `highlightRegionIds` 갱신 → 자치구 폴리곤 강조.
- assistant 메시지가 `suggestions` (kNN 후보) 동봉 → 카드 strip 노출.
- assistant 메시지가 `followups` (LLM 제안) 동봉 → 마지막 turn 만 칩 row 노출, 탭 → 그대로 다음 user 메시지 submit.
- 결과 0건이면 BFF 가 LLM `/chat/compose-retreat` 호출해 reply + 대체 followups 덮어쓰기 (semantic-search.md §Chat v3 참조).

## Open questions

- 클러스터 결과 목록의 정렬 기준 미정 (거리순 / 인기순 / 최신순) — 운영 데이터 쌓인 후 결정.
- 서울 외 지역 확장 — UX 결정 대기.
- 모바일 BottomSheet snap 의 'min' (10vh) 가 실사용자에게 너무 작은지 — telemetry 후 조정.

## References

- [2026-04-17_ui-flow-draft](../sources/2026-04-17_ui-flow-draft.md) — 초기 UX flow
- `apps/web/src/layout/AppShell.tsx` — state container
- `apps/web/src/layout/MobileShell.tsx` — 모바일 shell
- `apps/web/src/components/mobile/BottomSheet.tsx` — 시트 primitive
- `apps/web/src/components/EventSummaryPanel.tsx` — 데스크톱 패널 + `EventSummaryContent` (모바일 인라인)
- DESIGN.md §모바일 메인 레이아웃 정책
