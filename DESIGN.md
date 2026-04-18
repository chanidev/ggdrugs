# Design System — Alle

> 모든 UI/시각 결정은 이 문서를 **유일한 근거**로 삼는다. 이 문서에 없는 결정이 필요하면 먼저 여기에 추가한 뒤 구현한다. (CLAUDE.md §9 참조 — 찬의 대화형 진행 방식과 정합.)

## Product Context

- **What**: 자연어 처리 기반 이벤트·이슈 지도 검색 서비스. 축제·박람회·심포지움·컨퍼런스 탐색.
- **Who**: 서울 거주·방문 일반 사용자(기본 액터) + 업로더(축제 기획·기관) + 관리자(큐레이터).
- **Space**: civic/cultural discovery. 이벤트는 **상거래 대상이 아닌 도시 이벤트 맵**으로 표현 (v5.0에서 예약·결제 기능 제거 — `llm_wiki/wiki/topics/event-detail-review-flow.md` 참조).
- **Project type**: hybrid web app — 지도 중심 discovery + 채팅 검색(A_201) + 개인 캘린더/리뷰(A_500/A_501) + 업로더/관리자 대시보드.

## Brand

- **서비스명**: Alle
- **부제 (lockup)**: SEOUL
- **보이스**: 에디토리얼, 여행 가이드의 종이 지도 감성 + 한국 편집부 감성.
- **태그라인**: 서울의 축제·박람회·심포지움·컨퍼런스를 지도 위에서.

### Logo — Line Monogram

- 정사각 액자 + A 획 + **버밀리언 크로스바**의 3요소 구조.
- **획만 사용** — fill 없음. 레이아웃 어디에 놓여도 배경을 먹지 않음.
- 마크 viewBox `84×84`, 프레임 `rect 3/3 78 78 rx 2`, A `M22 64 L42 22 L62 64`, crossbar `30,48 → 54,48`.
- 액자·A는 `currentColor` (다크모드에서 자동 반전), 크로스바는 **항상 `var(--color-accent)`**.
- 최소 사용 크기 **24px**. 그 이하에서는 획이 뭉개지므로 색 원(버밀리언 dot)으로 대체 가능.

### 사용 규칙

- **Don't**: 액자 제거하고 A만 쓰기, fill 채우기, 기울이기, 회전, 두 번째 액센트 색 얹기, 그림자.
- **Do**: `currentColor` 기반 색 상속, dark surface에서는 `--color-text: #F0EFEA` 로 자동 반전, 배경 `--color-surface` 또는 `--color-bg` 위에 얹기.
- 파비콘은 stroke-width를 2→3, 2.5→3.5로 늘린 전용 variant 사용.

### Wordmark

- **워드마크**: `Alle` — Pretendard Variable 700, tracking `-0.015em` (text-h3 기준).
- **서브**: `SEOUL` — JetBrains Mono 500, tracking `0.2em`, 크기 12px, 색 `--color-text-subtle`, 마크 오른쪽 8px 갭 + 워드마크 오른쪽 8px 갭.
- 표기 순서: `[마크] [Alle] [SEOUL]`. 모바일에서 `SEOUL`은 `hidden sm:inline`로 드롭 가능.

### 구현 참조

- React 컴포넌트: `apps/web/src/components/brand/Logo.tsx` (`<LogoMark />`, `<LogoLockup />`).
- 원본 에셋: `apps/web/public/{logo-mark,favicon,logo-lockup}.svg`.
- 핸드오프 원문: `llm_wiki/raw/design_handoff_alle_brand/README.md`.

## Aesthetic Direction

- **Direction**: 지도 유틸리티 극대화 + editorial 한 드롭
- **Decoration level**: minimal — 서체와 여백이 대부분을 해낸다. 장식 요소는 accent 1색 외 거의 없음.
- **Mood**: 여행 가이드의 종이 지도 감성 + 한국 편집부(잡지) 감성. **쇼핑몰 아님**, **클럽 티켓 앱 아님**.
- **References (구조/톤)**:
  - Airbnb — 지도·리스트 분할 구조 (layout 기준)
  - Luma — 절제된 미니멀, 여백 운용 (tone 기준)
  - 당근 동네생활 — 한국 유저에게 익숙한 지역 톤 (UX language 기준)
  - Apple Maps — 지도 위 카드의 계층 감각
- **안 할 것**: 보라 그라디언트, 3-column icon grid, 뚱뚱한 pill 버튼, stock photo hero, gradient CTA, 둥글둥글한 유아적 bubbly 스타일

## Typography

단일 패밀리 전략. 한국어 서비스에서 Inter/Roboto는 Noto Sans KR fallback이 weight·spacing을 깨므로 **Pretendard 단일 패밀리**로 통합.

| 역할 | 폰트 | weight / spec |
|---|---|---|
| Display / Hero | **Pretendard Variable** | 700, tracking **-0.02em** (editorial 감성) |
| Body | **Pretendard** | 400 기본, 500 강조 |
| UI Labels | Pretendard | 500 |
| Data / Numbers | Pretendard | 500 + `font-feature-settings: "tnum"` (날짜·별점·가격·건수) |
| Code (드묾) | JetBrains Mono | 400 |

**로딩 전략**: `<link rel="preconnect" href="https://cdn.jsdelivr.net" />` + jsdelivr의 Pretendard 번들. 자체호스팅 고려는 Phase 3 이후 성능 프로파일링 결과에 따라.

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
/>
```

**Modular scale** (8px base, 1.250 Major Third):

| 레벨 | px | rem | 용도 |
|---|---|---|---|
| display | 40 | 2.5 | 메인 Hero 타이틀 (`이벤트를 찾는 서울의 방법`) |
| h1 | 32 | 2.0 | 페이지 제목 |
| h2 | 24 | 1.5 | 섹션 제목 |
| h3 | 20 | 1.25 | 카드·팝업 제목 |
| body-lg | 18 | 1.125 | 이벤트 상세 본문 |
| body | 16 | 1.0 | 기본 본문 |
| body-sm | 14 | 0.875 | 보조 설명·메타 |
| caption | 12 | 0.75 | 날짜·태그·작은 레이블 |

**Line-height**: Display 1.15, Heading 1.25, Body 1.6, Caption 1.4 (한국어는 서양보다 약간 넉넉하게).

## Color

**접근**: 뉴트럴 팔레트 + **단일 액센트 버밀리언**. 핀·CTA·활성 상태에만 등장하고 UI 대부분은 뉴트럴로 숨 쉬게.

### Light mode (기본)

```css
--bg:            #FAFAF7;  /* warm off-white, 장시간 노출 피로도↓ */
--surface:      #FFFFFF;
--surface-alt:  #F5F5F0;  /* 지도 카드 배경·호버 상태 */
--text:         #1A1A1A;  /* soft off-black, 순검 #000 회피 */
--text-muted:   #666666;
--text-subtle:  #999999;
--border:       #EAEAEA;
--border-hover: #D4D4D4;

--accent:       #E8562D;  /* 버밀리언 — 단청·주홍 현대화 */
--accent-hover: #D44A22;
--accent-bg:    #FCEEE8;  /* 선택 상태 배경 */

--success:      #2C8A4A;
--warning:      #D79B00;
--error:        #B8362A;
--info:         #3A6EA5;
```

### Dark mode

**전략**: redesign surfaces (단순히 색 반전 X). 채도 10~20% 낮춤.

```css
--bg:            #131311;
--surface:      #1C1C1A;
--surface-alt:  #242422;
--text:         #F0EFEA;
--text-muted:   #A3A29C;
--text-subtle:  #6B6A65;
--border:       #2E2E2B;
--border-hover: #3D3D3A;

--accent:       #F27147;  /* 약간 채도 up (dark bg 상에서 동일 지각 강도) */
--accent-hover: #E8562D;
--accent-bg:    #3A1F15;

--success:      #4CAE6C;
--warning:      #E6B23D;
--error:        #D15547;
--info:         #6090C0;
```

### Usage rules

- **Accent는 "빨간 핀" 언어로만 사용**: 지도 핀 활성, 기본 CTA 버튼, 북마크 활성, 현재 선택된 필터 칩. 무심코 link/info 용도로 쓰지 않음.
- **Semantic 색 은 상태 UI 전용**: `approval_status` 배지, 폼 validation, 알림. 일반 텍스트에 success 초록을 쓰지 않음.
- **Gradient 금지**: 모든 표면은 flat. 깊이는 shadow로만 표현.

## Spacing

8px base, comfortable density (지도+리스트 병렬이라 답답하면 안 되지만 너무 벌어지면 정보 밀도↓).

| Token | px | 용도 예 |
|---|---|---|
| `2xs` | 2 | 밀도 높은 칩 내부 padding |
| `xs` | 4 | icon ↔ text 간격 |
| `sm` | 8 | 버튼 내부 vertical padding |
| `md` | 16 | 카드 내부 padding, 리스트 아이템 간격 |
| `lg` | 24 | 섹션 간격, 카드 ↔ 카드 |
| `xl` | 32 | 큰 섹션 분리 |
| `2xl` | 48 | 페이지 블록 분리 |
| `3xl` | 64 | Hero 상하 여백 |

## Layout

**Hybrid**:
- **메인 지도 페이지 (A_200)**: creative-editorial — map 60% + sidebar list 40%. Airbnb의 50/50과 의도적 차별 (A_201 채팅 UI가 지도 하단에 붙어 map viewport 더 필요).
- **상세 / 마이페이지 / 업로더 / 관리자**: grid-disciplined — 12 col grid, max-width 1200px, gutter 24px.
- **모바일(≤640px)**: list/map 토글 전환 (동시 표시 X).

### Breakpoints

| 이름 | min-width |
|---|---|
| sm | 640px |
| md | 768px |
| lg | 1024px |
| xl | 1280px |
| 2xl | 1536px |

### Border radius

하이브리드 — 용도별로 다름 (uniform bubbly 안 함):

| Token | px | 대상 |
|---|---|---|
| `sm` | 4 | input, 작은 badge |
| `md` | 8 | 버튼, 폼 요소 |
| `lg` | 12 | 카드, 팝업, 이벤트 포스터 |
| `xl` | 16 | 대형 모달 |
| `full` | 9999 | 칩·태그·pill (태그스러움) |

### Shadow

지도 위 "놓여있는" 느낌 — 테두리 없는 부드러운 깊이:

```css
--shadow-sm:   0 1px 2px rgba(0,0,0,0.04);
--shadow-md:   0 4px 20px rgba(0,0,0,0.08);  /* 카드 기본 */
--shadow-lg:   0 12px 40px rgba(0,0,0,0.12); /* 모달·팝오버 */
--shadow-pin:  0 2px 8px rgba(232,86,45,0.35); /* 지도 핀 — 버밀리언 aura */
```

## Motion

**Minimal-functional + 1 signature moment**.

### Easing

```css
--ease-out:    cubic-bezier(0.0, 0.0, 0.2, 1);   /* enter */
--ease-in:     cubic-bezier(0.4, 0.0, 1, 1);     /* exit */
--ease-inout:  cubic-bezier(0.4, 0.0, 0.2, 1);   /* move */
```

### Duration

| Token | ms | 용도 |
|---|---|---|
| `micro` | 80 | 호버, 포커스 ring |
| `short` | 180 | 버튼 press, 체크박스 |
| `medium` | 280 | 팝업 열림, 페이지 전환 |
| `long` | 500 | 모달, 대형 레이아웃 변화 |

### Signature moment

**지도 핀 클러스터 분해 애니메이션**. 사용자가 줌인하거나 자치구를 클릭해 클러스터가 나뉠 때, 핀들이 현재 위치에서 최종 위치로 퍼지면서 stagger **50ms 간격**, duration 280ms, `ease-out`. 이 앱에서 "지도가 살아있다"고 느끼는 단 하나의 순간. 다른 곳에 이 패턴 재사용 금지 — 남발하면 의미 잃음.

## Component Tokens

### Button

| 변형 | BG | Text | Border | Hover BG |
|---|---|---|---|---|
| Primary | `--accent` | `#FFFFFF` | none | `--accent-hover` |
| Secondary | `--surface` | `--text` | `--border` | `--surface-alt` |
| Ghost | transparent | `--text` | none | `--surface-alt` |
| Danger | `--error` | `#FFFFFF` | none | darker variant |

- Height: 40px (md), 32px (sm), 48px (lg)
- Radius: `md` (8px)
- Padding: 0 16px (md)
- Font weight: 500

### Card

- BG: `--surface`
- Radius: `lg` (12px)
- Shadow: `--shadow-md`
- Border: none (shadow가 경계)
- Padding: 16px (밀집 리스트) 또는 24px (단독 표시)

### Chip (필터·태그)

- Height: 32px
- Radius: `full`
- Padding: 0 12px
- Default: BG `--surface-alt`, Text `--text-muted`
- Active: BG `--accent-bg`, Text `--accent`, border `--accent`
- Transition: `short` ease-out on BG, Text, border

### Map pin

- Default cluster: 지름 40px 원, BG `--accent`, Text `#FFFFFF`, font weight 600, shadow `--shadow-pin`
- 개별 이벤트: 물방울 shape, tip 아래 향함, BG `--accent`
- 선택 상태: scale 1.1, shadow 강화

### Form input

- Height: 40px (md), 48px (lg)
- BG: `--surface`
- Border: 1px solid `--border`
- Radius: `md`
- Focus: border `--accent`, outline 2px `--accent-bg`
- Padding: 0 12px

### Status badge (이벤트 상태)

| approval_status | 색 | 라벨 |
|---|---|---|
| `pending` | `--warning` bg tinted | 대기 |
| `approved` | `--success` bg tinted | 승인 |
| `revision_requested` | `--warning` | 보완요청 |
| `rejected` | `--error` | 반려 |

| phase | 색 | 라벨 |
|---|---|---|
| `upcoming` | `--info` | 예정 |
| `ongoing` | `--accent` | 진행중 |
| `ended` | `--text-subtle` | 종료 |

## Accessibility

- Text ↔ BG 대비비 **AA 기준 이상** (Body 4.5:1, 대형 텍스트 3:1). 위 팔레트는 모두 AA 통과.
- `--accent`(#E8562D) + `#FFFFFF` 조합은 4.56:1 — AA pass.
- Focus ring: 모든 인터랙티브 요소에 `outline: 2px solid var(--accent); outline-offset: 2px;` 일관 적용.
- 색상 only로 정보 전달 금지 — status badge는 색 + 라벨 같이.

## 기술적 구현 (Phase 1~)

- **Tailwind v4** 사용 — `@theme` 블록에 위 CSS 변수들을 등록.
- **CSS 변수 사용** (light/dark mode 스위칭 용이). Tailwind의 `dark:` variant 결합.
- Font loading은 `<head>` preconnect + stylesheet.
- Accent 색 버튼은 `bg-accent text-white hover:bg-accent-hover`.

## Decisions Log

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-04-17 | 초기 디자인 시스템 생성 | `/design-consultation` 세션. 프로덕트 맥락 (civic/cultural discovery), map-first utility 방향, Pretendard de facto, 단일 버밀리언 accent 결정. |
| 2026-04-17 | 예약/결제 관련 UI 패턴 제외 | v5.0 요구사항에 부재. "쇼핑몰" 언어 대신 "도시 지도" 언어 채택. |
| 2026-04-17 | Accent는 보라·그라디언트 대신 버밀리언 단색 | AI slop 회피 + 한국 전통 색 현대화 + "빨간 핀 앱" 기억성. |
