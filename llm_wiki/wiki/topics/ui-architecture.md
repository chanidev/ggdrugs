---
title: UI 아키텍처 (현 구현본)
type: topic
created: 2026-04-17
updated: 2026-06-08
sources: [2026-04-17_requirements-v5, 2026-04-17_ui-flow-draft]
related:
  - tech-stack.md
  - main-page-flow.md
  - event-detail-review-flow.md
  - filters-5-types.md
  - adr-0002-stack-decisions.md
  - semantic-search.md
---

# UI 아키텍처 (현 구현본)

## Summary

A_200 메인 페이지 웹 UI 의 **현재 코드 상태**를 정본화. Phase 1 8 sprint 끝에 수렴한 구조: **데스크톱은 rail + overlay panel + 풀 사이즈 지도 + floating ChatDock**, **모바일은 풀스크린 지도 + floating header + BottomSheet 3 snap**. (이후 **Phase 2** 소셜 레이어 출하 — 커뮤니티/메이트 화면은 SEED Design 으로 별도 구축, ADR 0007/0008. 본 문서는 A_200 발견 화면 UI 정본.) AppShell 이 두 트리를 동시 렌더, CSS 미디어 쿼리로 한쪽만 노출. DESIGN.md 디자인 시스템을 Tailwind v4 `@theme` 블록으로 등록해 사용. 라우트는 단일 `/` (확장 패널이 페이지 전환 대신 overlay 로 동작). chat 결합은 [semantic-search.md §POST /chat/stream](semantic-search.md) 참조 — 본 문서는 UI 측 박제.

## 기술 스택 (실제 구현)

| 계층 | 라이브러리 | 버전 | 비고 |
|---|---|---|---|
| 빌드 도구 | Vite | 6.x | `envDir: '../..'` 로 모노레포 루트 `.env` 참조 |
| 프레임워크 | React | 19 | `@types/react` 19 |
| 라우팅 | react-router | 7 | 단일 `/` + `/me` `/uploader` `/admin` `/events/:id` 등 |
| 스타일 | Tailwind CSS | 4 | `@tailwindcss/vite` 플러그인, `@theme` 블록에 DESIGN.md 토큰 등록 |
| 디자인 시스템 | SEED Design | `@seed-design/css` ^1.2.12 · `@seed-design/react` ^1.2.10 · `@seed-design/vite-plugin` ^1.1.1 | Phase 2 소셜 화면(커뮤니티/메이트). ADR 0008 Option B — Alle 버밀리언·Pretendard 테마 오버라이드 |
| 아이콘 | @karrotmarket/react-monochrome-icon | ^1.17.0 | Karrot 모노크롬 아이콘 (SEED 동반) |
| i18n | i18next + react-i18next | i18next ^26.3.0 · react-i18next ^17.0.8 · -browser-languagedetector ^8.2.1 · -http-backend ^4.0.0 | 다국어 6종(한/영/베/중/일/프), ADR 0007 |
| 실시간 | socket.io-client | ^4.8.3 | 메이트 채팅방(ADR 0007). Vite `/api` 프록시 `ws:true` |
| 서체 | Pretendard Variable | 1.3.9 | jsdelivr CDN, `@font-face` 자동 로딩 |
| 지도 | react-kakao-maps-sdk + Kakao Maps JS SDK | 1.2 | `useKakaoLoader` 로 dynamic load, 클러스터러 + vermilion pulse pin, v4.3 viewport bbox refetch (300ms debounce) |
| 로깅 (dev) | `HealthBadge` | 자체 | 10초마다 `/api/health` ping |
| Streaming | `apps/web/src/lib/api/chat.ts::streamChat` | 자체 | SSE → reply_delta / meta / reply_sealed / suggestions / reply_override / done |

## 레이아웃 구조

### 데스크톱 (`md:` ≥)

```
┌─────────────────────────────────────────────────────────────┐
│ Header (h-14)                                                │
├──────────┬──────────────────────────────────────────────────┤
│ Sidebar  │ Map (flex-1, Kakao Maps + 클러스터러 + pulse pin)│
│ rail     │                                                  │
│ (236px)  │   ┌──────────────┐                               │
│          │   │ OverlayPanel │  (absolute left=236, w=380,  │
│ ▶ 필터   │   │              │   z-20, slide-in 280ms)       │
│ ▶ 전체   │   │   content    │                               │
│ ▶ 채팅   │   └──────────────┘                               │
│          │                                                  │
│          │   [ EventSummaryPanel ]  (selectedEventId 시)    │
│          │                                                  │
│ stats    │       ┌────────────── ChatDock ─────────────┐    │
│ (auto)   │       │  floating, bottom-6, w<=820, z-7    │    │
│          │       │  handle (접기/펼치기) + 메시지목록   │    │
│          │       │  + suggestion chips + input row     │    │
│          │       └─────────────────────────────────────┘    │
└──────────┴──────────────────────────────────────────────────┘
```

- **Sidebar** (`apps/web/src/layout/Sidebar.tsx`): 고정 236px aside. 3행 메뉴 (filter/list/chat) + 하단 stats 블록. `md:flex`, 모바일 `hidden`.
- **OverlayPanel** (`apps/web/src/components/OverlayPanel.tsx`): standalone component. `absolute left=236px top=0 bottom=0 w=380px z-20`. `motion-safe:animate-[alle-panel-in_280ms]`. 열린 section 만 child 렌더. AppShell 이 Sidebar 와 sibling 으로 mount.
- **EventSummaryPanel**: 이벤트 핀 클릭 시 OverlayPanel 영역에 등장. 패널 + Sidebar 동시 노출 가능 (z-index 분리).
- **ChatDock**: 지도 위 floating dock. `absolute bottom-6 left-1/2 z-[7] w-[min(820px,100%-48px)]`. handle 클릭으로 접기/펼치기 (max-height transition 280ms). 모바일에선 hidden — `BottomSheet > MobileChatTab` 으로 대체.

### 모바일 (`md:` 미만)

```
┌──────────────────────────────────────────┐
│ MobileFloatingHeader (h-12, blur-md)     │  z-40
├──────────────────────────────────────────┤
│                                          │
│      Kakao Maps (full-screen, z-0)       │
│                                          │
│                                          │
├──────────────────────────────────────────┤
│ BottomSheet (drag + tap, 3 snap)         │  z-30
│ ┌──────────────────────────────────────┐ │
│ │ snap = min   (10vh)  ←→ peek (52vh)  │ │
│ │              ←→ full (90vh)          │ │
│ │                                      │ │
│ │ ▼ Tabs: 목록 / 필터 / 채팅           │ │
│ │ ▼ 또는 SelectedEventView (요약 콘텐츠)│ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

- **MobileShell** (`apps/web/src/layout/MobileShell.tsx`): 모바일 메인 트리. `md:hidden`. AppShell 과 부모 state 공유 — breakpoint 회전 시 선택 이벤트 / chat messages / 필터 유지.
- **BottomSheet** (`apps/web/src/components/mobile/BottomSheet.tsx`): vanilla pointer drag, 3 snap (min 10vh / peek 52vh / full 90vh). 핀 탭 시 자동 peek (사용자가 풀로 펼친 상태면 그대로 둠).
- **MobileChatTab**: ChatDock 의 인라인 버전 — floating wrapper / handle / collapse 제거, 시트 본문 스크롤 위임. `TypingDots` / `RetreatMeta` / `ErrorRetryButton` 동일 sub-component 재사용 (ChatDock export).

## 컴포넌트 배치

```
apps/web/src/
├── main.tsx                            # BrowserRouter + 라우트 등록
├── layout/
│   ├── AppShell.tsx                    # state 컨테이너 (desktop + mobile 동시 트리)
│   ├── Header.tsx                      # 데스크톱 상단 바 (로고 / 탭 / 알림 / 로그인)
│   ├── Sidebar.tsx                     # rail (236px aside) + 3 row 네비
│   └── MobileShell.tsx                 # 모바일 트리 + MobileFloatingHeader + BottomSheet wrapper
├── components/
│   ├── ChatDock.tsx                    # 데스크톱 floating chat dock + 5 sub-component
│   │                                   #   ├── TypingDots         (v4-A)
│   │                                   #   ├── RetreatMeta        (v4-A)
│   │                                   #   ├── ErrorRetryButton   (v4-A)
│   │                                   #   ├── FollowupRow        (v3.x)
│   │                                   #   └── SuggestionsRow     (v3.x)
│   ├── OverlayPanel.tsx                # 사이드 패널 (380px, slide-in 280ms)
│   ├── FilterSearchPanel.tsx           # 5축 필터 pill + 적용 + 결과
│   ├── FullListPanel.tsx               # 카테고리 9버튼 (전체/8종) + 리스트
│   ├── ChatHelpPanel.tsx               # 채팅 가이드 (overlay)
│   ├── EventSummaryPanel.tsx           # 이벤트 요약 + 북마크 + 리뷰
│   ├── SeoulMap.tsx                    # Kakao Maps + 클러스터러 + pulse pin
│   ├── HealthBadge.tsx                 # dev 전용 BFF 상태 뱃지
│   ├── ErrorBoundary.tsx               # 지도/패널 격리
│   ├── PhaseBadge.tsx                  # phase enum → 색·라벨 매핑
│   ├── BookmarkButton.tsx              # 북마크 토글
│   ├── Icon.tsx                        # 24 SVG 아이콘 인라인
│   ├── EventList.tsx                   # 이벤트 카드 리스트
│   ├── Poster.tsx                      # 포스터 이미지 wrapper
│   ├── brand/Logo.tsx                  # LogoMark + LogoFull
│   ├── notifications/NotificationBell.tsx
│   ├── calendar/MonthCalendar.tsx      # 마이페이지 캘린더 (북마크 매핑)
│   ├── mobile/BottomSheet.tsx          # 모바일 3 snap 시트
│   ├── admin/      (3)                 # MembersTab / UploadReviewPanel / AuditLogsTab + AuditDashboard
│   └── uploader/   (3)                 # EventFormFields / PosterPickerField / DocumentsPickerField
├── lib/
│   ├── api/                            # BFF 호출 + streamChat (SSE 핸들러)
│   ├── auth-context.tsx                # useCurrentUser
│   └── identity-verification.ts        # KYC mock (Phase 2 prod swap 1지점)
├── styles/
│   └── index.css                       # Tailwind v4 @theme + dark mode + 모션 keyframes
└── vite-env.d.ts                       # VITE_KAKAO_MAP_JS_KEY 타입
```

## AppShell state machine

`AppShell.tsx::AppShell()` 가 단일 state 컨테이너 — 데스크톱과 모바일 트리가 같은 state 를 share.

```ts
// 핵심 state
const [open, setOpen]                 = useState<SidebarSection | null>('filter');
const [chatValue, setChatValue]       = useState('');
const [messages, setMessages]         = useState<ChatMessage[]>([]);
const [dockCollapsed, setDockCollapsed] = useState(false);
const [mapFilter, setMapFilter]       = useState<EventListQuery | null>(null);
const [highlightRegionIds, setHighlightRegionIds] = useState<string[]>([]);
const [selectedEventId, setSelectedEventId]       = useState<string | null>(null);
const chatStreamAbortRef              = useRef<AbortController | null>(null);
```

- **`open`**: 데스크톱 OverlayPanel 의 활성 section. 모바일은 자체 `tab` state 사용.
- **`messages`**: chat 풍선 배열. 각 메시지는 `ChatMessage` shape — 본 문서 §ChatMessage 참조.
- **`mapFilter`**: FilterSearchPanel 적용 결과 또는 chat meta filter → SeoulMap 재-fetch 트리거.
- **`highlightRegionIds`**: 지역 칩 클릭 즉시 폴리곤 하이라이트 (mapFilter 와 분리 — 시각 피드백만).
- **`selectedEventId`**: 핀/목록/카드 클릭 → EventSummaryPanel 또는 SelectedEventView 렌더 동기화.
- **`chatStreamAbortRef`**: 진행 중 SSE controller. 새 submit / unmount 시 abort.

## ChatMessage transient 필드 (v4-A)

`ChatDock.tsx::ChatMessage` 인터페이스 (export):

```ts
export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  suggestions?: ChatSuggestion[];      // assistant - Qdrant + rerank 결과
  followups?: string[];                // assistant - LLM 제안 다음 발화 후보
  streaming?: boolean;                 // v4-A - reply_delta 누적 중. typing dots 트리거
  overriding?: boolean;                // v4-A - sealed→override 전환 중간 (180ms fade-out)
  meta?: 'retreat';                    // v4-A - retreat 발동 인라인 메타 라인
  error?: { retryUserText: string };   // v4-A - stream 실패 + retry 재호출용 user text 보존
}
```

4 transient 필드 (`streaming` / `overriding` / `meta` / `error`) 는 SSE stream 진행 중에만 set 되고 sealed/done 후 stable state 로 정착.

## ChatDock 4 폴리시 (Sprint A — 2026-04-26)

데스크톱 ChatDock 과 모바일 MobileChatTab 양쪽이 동일 sub-component 재사용:

| 폴리시 | 컴포넌트 | 동작 | 트리거 |
|---|---|---|---|
| 타이핑 도트 | `<TypingDots />` | 마지막 글자 뒤 인라인 도트 3개. CSS `alle-typing-wave` 1.2s, stagger 0/200/400ms | `m.streaming === true` |
| retreat 메타 | `<RetreatMeta />` | 풍선 위 vermillion accent dot + "0건 — 조건을 넓혀보세요" | `m.meta === 'retreat'` |
| sealed→override fade | `.alle-fade-text` + `opacity-0/-100` | 2-step 180ms (opacity 0 → text swap → opacity 1). layout shift 0 | `m.overriding === true` (180ms 동안만) |
| error 재시도 | `<ErrorRetryButton onRetry={...} />` | vermillion outline 버튼. user 메시지 중복 push 없이 error placeholder 만 빈 placeholder 로 교체 후 streamFor 재호출 | `m.error` 존재 |

**reduced-motion** (`prefers-reduced-motion: reduce`):
- `.alle-typing-dot*` 도트 정적 (opacity 0.5, animation 0)
- `.alle-fade-text` transition 0 → 즉시 swap

## streamFor / handleRetry (AppShell)

`handleChatSubmit` 와 `handleRetry` 가 `streamFor(history, placeholderIndex)` 헬퍼를 공유.

```ts
const streamFor = (history: ChatMessage[], placeholderIndex: number) => {
  chatStreamAbortRef.current?.abort();
  const controller = new AbortController();
  chatStreamAbortRef.current = controller;

  // grounded followup — 직전 assistant 턴 suggestions 가 있으면 last_suggestions 에 첨부
  const lastRefs = (() => { /* history 역방향 스캔 */ })();

  let accumulatedReply = '';
  let replySealed = false;

  streamChat(history, {
    onReplyDelta:    (chunk) => { /* append + streaming:true */ },
    onReplySealed:   (p)     => { /* canonical text 정합화 + streaming:false (v4) */ },
    onMeta:          (meta)  => { /* setMapFilter + setHighlightRegionIds + followups */ },
    onSuggestions:   (items) => { /* setMessages 의 suggestions 부착 */ },
    onReplyOverride: (p)     => {
      // v4-A — 2-step fade
      setMessages(/* overriding: true */);
      setTimeout(() => setMessages(/* text swap + meta:'retreat' + overriding:false */), 180);
    },
  }, controller.signal, lastRefs);
};

const handleRetry = (retryUserText: string) => {
  // 마지막 error 풍선 자리에 빈 placeholder 다시 push 후 streamFor 재호출
  // history 가 예상과 다르면 handleChatSubmit fallback
};
```

서버 SSE 시퀀스: `reply_delta × N → meta → reply_sealed → suggestions → [reply_override?] → done`. v4 `reply_sealed` 는 [semantic-search.md](semantic-search.md) 참조.

## DESIGN.md 토큰 적용

`apps/web/src/styles/index.css`:

- `@import 'tailwindcss';` 로 Tailwind v4 엔진.
- `@theme { --color-*, --font-*, --text-*, --radius-*, --shadow-*, --duration-*, --ease-*-ggd }` 에 DESIGN.md 토큰 등록.
- 다크 모드: `@media (prefers-color-scheme: dark) { :root { --color-bg: ... } }` (build-time 고정인 `@theme` 블록 안에서 `@media` 재정의 불가라 일반 `:root` 변수 swap).

### 모션 keyframes (index.css)

| Keyframe / 클래스 | 용도 | 비고 |
|---|---|---|
| `@keyframes alle-panel-in` | OverlayPanel slide-in | 280ms ease-out |
| `@keyframes alle-pulse` | ChatDock handle 인디케이터 | 1.6s ease-out infinite |
| `@keyframes alle-typing-wave` | TypingDots stagger fade | 1.2s ease-inout, 0/200/400ms delay (`.alle-typing-dot{,-2,-3}`) |
| `.alle-fade-text` | sealed→override 텍스트 swap | 180ms ease-in opacity transition |
| `@media (prefers-reduced-motion: reduce)` | 접근성 fallback | typing dots 정적 (opacity 0.5) + fade transition 0 |

## 환경변수 경계

웹 번들에 인라인되는 것은 `VITE_` 접두어만:
- **`VITE_KAKAO_MAP_JS_KEY`** — 공개 키. Kakao 콘솔에서 허용 도메인 + 서비스 활성화 필수.

그 외 (`DATABASE_URL`, `OPENAI_API_KEY`, `KAKAO_REST_API_KEY`, `SESSION_SECRET`, `JWT_SECRET`, S3 credentials 등) 는 **서버 전용** — BFF `process.env` 로만 접근, 웹 번들에 절대 미포함.

BFF API 호출은 dev 에서 Vite 프록시로 `/api/*` → `localhost:3000/*`. Prod 는 동일 오리진 또는 reverse proxy.

## 라우팅

`main.tsx` 가 BrowserRouter + 다음 라우트 등록:
- `/` — AppShell (메인)
- `/me` — 마이페이지 (북마크 + 캘린더 + 추천)
- `/uploader` — 업로더 콘솔 (KYC mock 1지점만 잔존 — `identity-verification.ts`; Phase 2 prod swap)
- `/admin` — 관리자 콘솔
- `/events/:eventId` — 이벤트 상세 (직링크용. 메인에서는 Summary panel 로 대체)

확장 패널 (필터/전체목록/채팅) 은 라우트가 아닌 overlay — UX 피드백으로 라우트→인라인 accordion 전환.

## Open questions / contradictions

1. 확장 패널이 overlay 라 map 위 핀을 가림 — 패널 좌측만 덮고 지도 우측은 남아있지만, 핀이 패널 영역 뒤에 있을 수 있음. 핀 클릭 가능 지역 축소 UX 수용 범위 미확정 (대안: panel 뜰 때 지도 중심 pan 보정).
2. ~~모바일 대응~~ → **해소** (2026-04-23 `6747b88`): MobileShell + BottomSheet 3 snap + MobileChatTab. AppShell desktop+mobile 동시 렌더, 같은 state 공유.
3. ~~Kakao 클러스터러 미연결~~ → **해소**: SeoulMap 클러스터러 + 선택 핀 vermilion pulse ring 동작.
4. ~~EventList 더미 3건~~ → **해소**: /events API 연동, TourAPI/Seoul/KCISA ingest 결과 4,000+ 이벤트 렌더.
5. ~~ChatDock 단순 입력~~ → **해소** (2026-04-23 v3.x + 2026-04-26 Sprint A): SSE streaming + 4 폴리시 (typing dots / retreat fade / error retry / reduced-motion) + 5 sub-component + handleRetry 사이클.
6. ~~AppShell handleChatSubmit 단일 체인~~ → **해소** (2026-04-26 Sprint A): `streamFor(history, placeholderIndex)` 헬퍼 추출, handleRetry 가 헬퍼 재사용. 4 transient 필드 (streaming/overriding/meta/error) 로 UI 시각 효과 매핑.
7. PostGIS geom 전환 — 지도 viewport bbox / 반경 검색 도입 결정 시.
8. Streaming reconnect — 네트워크 blip 시 last reply_delta 이후부터 이어받기 (현재 error 반환만). v4 후속 후보.

## References

- [DESIGN.md](../../../DESIGN.md) — 디자인 시스템 정본
- [main-page-flow.md](main-page-flow.md) — A_200 기능 요구사항 + 모바일 shell 분기
- [tech-stack.md](tech-stack.md) — 확정 스택 레퍼런스
- [semantic-search.md](semantic-search.md) — chat 결합 (v3.x ~ v4 reply_sealed) 백엔드 정본
- [adr-0002-stack-decisions.md](adr-0002-stack-decisions.md) — MinIO/OpenAI/Qdrant 결정
- [log.md](../log.md) 2026-04-17T15:30 / T16:30 (초기 ship), 2026-04-23 sprint 4-5 (모바일 shell + Streaming SSE), 2026-04-25 ~ 2026-04-26 (v4 reply_sealed + Sprint A 폴리시)
- 코드: `apps/web/src/layout/{AppShell,Header,Sidebar,MobileShell}.tsx`, `apps/web/src/components/{ChatDock,OverlayPanel,EventSummaryPanel,SeoulMap,...}.tsx`, `apps/web/src/styles/index.css`, `apps/web/src/lib/api/chat.ts::streamChat`
