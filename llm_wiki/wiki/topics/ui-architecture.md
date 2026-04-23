---
title: UI 아키텍처 (현 구현본)
type: topic
created: 2026-04-17
updated: 2026-04-17
sources: [2026-04-17_requirements-v5, 2026-04-17_ui-flow-draft]
related:
  - tech-stack.md
  - main-page-flow.md
  - event-detail-review-flow.md
  - filters-5-types.md
  - adr-0002-stack-decisions.md
---

# UI 아키텍처 (현 구현본)

## Summary

A_200 메인 페이지 웹 UI 의 **현재 코드 상태**를 정본화. Phase 1 세 번의 UI 이터레이션 끝에 수렴한 "rail + overlay panel + 풀 사이즈 지도 + 하단 ChatDock" 구조. DESIGN.md 디자인 시스템을 Tailwind v4 `@theme` 블록으로 등록해 사용. 라우트는 **단일 `/`** 로 축소(확장 패널이 페이지 전환 대신 overlay로 동작).

## 기술 스택 (실제 구현)

| 계층 | 라이브러리 | 버전 | 비고 |
|---|---|---|---|
| 빌드 도구 | Vite | 6.x | `envDir: '../..'` 로 모노레포 루트 `.env` 참조 |
| 프레임워크 | React | 19 | `@types/react` 19 |
| 라우팅 | react-router | 7 | 현재 단일 `/` 라우트, BrowserRouter |
| 스타일 | Tailwind CSS | 4 | `@tailwindcss/vite` 플러그인, `@theme` 블록에 DESIGN.md 토큰 등록 |
| 서체 | Pretendard Variable | 1.3.9 | jsdelivr CDN, `@font-face` 자동 로딩 |
| 지도 | react-kakao-maps-sdk + Kakao Maps JS SDK | 1.2 | `useKakaoLoader` 로 `dapi.kakao.com/v2/maps/sdk.js` 동적 로드 |
| 로깅(dev) | `HealthBadge` | 자체 | 10초마다 `/api/health` ping |

## 레이아웃 구조

```
┌─────────────────────────────────────────────────────────┐
│ Header (h-14)                                            │
│ [GGdrugs] [탐색] [예정 이벤트]              [로그인]     │
├──────────┬──────────────────────────────────────────────┤
│ Rail     │ Map (flex-1, Kakao Maps)                     │
│ (220px)  │                                              │
│          │  ┌──────────┐                                │
│ "이벤트  │  │ Overlay  │  (absolute, z-20, shadow-lg)  │
│  찾기"   │  │ Panel    │                                │
│          │  │ (360px)  │                                │
│ ▶ 필터   │  │          │                                │
│ ▶ 전체   │  │  content │                                │
│ ▶ 채팅   │  └──────────┘                                │
│          │                                              │
│          ├──────────────────────────────────────────────┤
│          │ ChatDock (shrink-0)                          │
│          │ [ 자연어 질문... ] [검색]                    │
└──────────┴──────────────────────────────────────────────┘
```

- **Rail**: `apps/web/src/layout/Sidebar.tsx` 의 첫 번째 `<aside>`. 고정 220px. 3행 메뉴는 `<nav><ul class="divide-y">`.
- **Overlay Panel**: Sidebar 의 두 번째 element (`<section className="absolute left-[220px] top-0 bottom-0 w-[360px] z-20 shadow-(--shadow-lg)">`). 열려있을 때만 렌더. Fragment 반환으로 rail 과 sibling.
- **Map + ChatDock**: `<main>` 은 `flex flex-col`. 상단 `<div className="flex-1">` 이 Kakao Maps 컨테이너, 하단 `<ChatDock>` 이 `shrink-0`.

## 컴포넌트 배치

```
apps/web/src/
├── main.tsx                            # BrowserRouter + 단일 / 라우트
├── layout/
│   ├── AppShell.tsx                    # Header + Sidebar + Main + HealthBadge
│   ├── Header.tsx                      # 상단 바 (로고/탭/로그인)
│   └── Sidebar.tsx                     # rail(aside) + overlay panel(section) Fragment
├── components/
│   ├── SeoulMap.tsx                    # Kakao Maps 렌더 + fallback Notices
│   ├── ChatDock.tsx                    # 지도 하단 도킹 입력
│   ├── FilterSearchPanel.tsx           # 확장 패널: 필터 5종 pill + 적용 + 결과
│   ├── FullListPanel.tsx               # 확장 패널: 카테고리 5버튼 + 리스트
│   ├── EventList.tsx                   # 이벤트 카드 목록 (더미 3건, 카테고리 필터)
│   └── HealthBadge.tsx                 # dev 전용 BFF 상태 뱃지
├── styles/
│   └── index.css                       # Tailwind v4 @theme + dark mode override
└── vite-env.d.ts                       # VITE_KAKAO_MAP_JS_KEY 타입
```

## 확장 패널(accordion) 동작

`Sidebar.tsx` 내 `useState<Section | null>(null)` 하나로 상태 관리. section 키: `'filter' | 'list' | 'chat'`.

- Rail 행 클릭 시 toggle (같은 키 눌리면 닫힘, 다른 키는 교체).
- 최대 1개만 열림 (accordion).
- 열린 패널은 `absolute` 포지셔닝으로 flex flow 밖에 있어 **지도 크기 변화 없음**.
- 패널 상단 `×` 버튼 또는 다시 rail 행 클릭으로 닫힘.
- 채팅 패널은 예시 쿼리 chip 3개만 보여주고, 실제 입력은 화면 하단 ChatDock 이 담당. 즉 사이드바 채팅 패널 ↔ 지도 하단 ChatDock 은 **중복 UI 가 아니라 역할 분리** (힌트 vs 실 입력).

## DESIGN.md 토큰 적용 방식

`apps/web/src/styles/index.css`:
- `@import 'tailwindcss';` 로 Tailwind v4 엔진 로딩.
- `@theme { --color-bg, --color-text, --color-accent, --font-sans, --text-*, --radius-*, --shadow-*, --duration-*, --ease-*-ggd }` 에 DESIGN.md 전체 토큰 등록.
- Tailwind 는 이 토큰으로 `bg-(--color-bg)`, `text-h3`, `rounded-(--radius-lg)`, `shadow-(--shadow-md)` 같은 유틸리티를 자동 생성.
- **다크 모드**: `@media (prefers-color-scheme: dark) { :root { --color-bg: #131311; ... } }` — `@theme` 블록 안에서 `@media` 재정의 불가라 일반 `:root` 로 변수 swap.
- `body { font-family: var(--font-sans); font-feature-settings: 'ss06', 'case' }` 로 Pretendard 한글 최적화.

## 환경변수 경계

웹에 주입되는 것은 `VITE_` 접두어 있는 것만. 현재 사용:
- **`VITE_KAKAO_MAP_JS_KEY`** — 공개 키. 번들에 인라인되어 브라우저로 나감. Kakao 콘솔에서 허용 도메인 + 서비스 활성화 필수.
- 그 외 (`DATABASE_URL`, `OPENAI_API_KEY`, `KAKAO_REST_API_KEY`, `SESSION_SECRET`, `JWT_SECRET`, S3 credentials 등)는 **서버 전용** — BFF `process.env` 로만 접근, 웹 번들에 절대 포함 안 됨.

BFF API 호출은 dev에서 Vite 프록시로 `/api/*` → `localhost:3000/*` 리다이렉트. Prod 에선 동일 오리진에서 서빙하거나 reverse proxy 로 해결.

## 라우팅

현재 `main.tsx` 는 단일 `/` 라우트만 등록. 계획:
- 상세 페이지 추가 시 `/events/:eventId`.
- 마이페이지 `/me`, 업로더 `/uploader`, 관리자 `/admin`.
- 필터·전체목록·채팅은 **라우트가 아님** — 확장 패널로만 존재 (라우트 기반으로 했다가 UX 피드백으로 인라인 accordion 으로 되돌림).

## Open questions / contradictions

1. 확장 패널이 overlay 라 map 위 핀을 가림 — 패널 좌측만 덮고 지도 우측은 남아있지만, 핀이 패널 영역 뒤에 있을 수 있음. 핀 클릭 가능 지역이 줄어드는 UX 수용 범위 확정 필요. (대안: panel 뜰 때 지도 중심을 패널 바깥쪽으로 pan 보정.)
2. 모바일 대응 — **메인 ship 완료** (2026-04-23 `6747b88`):
   - ✅ admin 탭 subtitle `hidden sm:inline`, uploader 툴바 `flex w-full gap-2 sm:w-auto`
   - ✅ NotificationBell / ChatDock 기본 responsive (md: 브레이크포인트 적용)
   - ✅ **메인 페이지 모바일 shell ship** — `MobileShell.tsx` (풀스크린 지도 + floating header + BottomSheet 3 snap min/peek/full + 시트 내부 탭 목록/필터/채팅) + `BottomSheet.tsx` (vanilla pointer drag, snap 정확). AppShell 은 desktop body (`hidden md:flex`) + MobileShell (`md:hidden`) 동시 렌더, 같은 state 공유. 자세한 구조는 [main-page-flow.md](main-page-flow.md) §Shell 분기.
   - 검증: `apps/web/scripts/verify-mobile-shell.mjs` Playwright iPhone 12 viewport 7 snapshot pass.
3. ~~Kakao 클러스터러 아직 연결 안 됨~~ → **해소**: SeoulMap 에 클러스터러 + 선택 핀 vermilion pulse ring 동작 중.
4. ~~EventList 는 더미 3건~~ → **해소**: /events API 연동, TourAPI/Seoul/KCISA ingest 결과로 3700+ 이벤트 렌더 중.

## References

- [DESIGN.md](../../../DESIGN.md) — 디자인 시스템 정본
- [main-page-flow.md](main-page-flow.md) — A_200 기능 요구사항
- [tech-stack.md](tech-stack.md) — 확정 스택 레퍼런스 (이 문서는 실제 구현본)
- [adr-0002-stack-decisions.md](adr-0002-stack-decisions.md) — MinIO/OpenAI/Qdrant 결정
- [log.md](../log.md) 2026-04-17T15:30, T16:30 — 구현 이력
