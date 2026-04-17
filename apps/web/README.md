# apps/web

GGdrugs 프론트엔드. React + Vite 기반. Kakao Maps로 이벤트 지도 뷰를, LLM 채팅 UI를 제공한다.

## 책임 (CLAUDE.md §4)

- 메인 페이지 (A_200), 상세 페이지 (A_400), 마이페이지 (A_500), 업로더 메인 (A_601), 이벤트 업로드 (A_602).
- 필터 5종(지역/기간/인원구성/이벤트 종류/이벤트 성향) UI.
- Kakao Maps 통합, 클러스터 마커, 지도↔리스트 토글.
- BFF REST API 호출 (직접 LLM 서비스 호출하지 않음).

## 의존 관계

- `packages/shared-types` — BFF와 공유하는 TypeScript 타입.
- 런타임 의존: BFF (`apps/bff`).

## 상태

Phase 0 — 스켈레톤만. Vite + React 스캐폴드는 Phase 1에서 생성.
