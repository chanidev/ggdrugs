# Chat UI 폴리시 — Sprint A 디자인

**Date**: 2026-04-25
**Status**: Approved (spec)
**Owner**: Frontend (Web)

## Context

Alle 채팅 인터페이스는 v3.5 + reply_sealed 까지 와있다 (`semantic-search.md` 참조). 기능적으로는 안정적이지만 UX 폴리시가 부족해 사용자가 다음 상황에서 답답함을 느낄 여지가 있다:

1. **sealed → override 시 텍스트 전환이 즉시 swap** — 누적되던 reply 가 retreat 안내 문구로 갑자기 사라지고 다른 텍스트가 나타나 jarring.
2. **reply_delta 누적 중 진행 시그널 부재** — 텍스트가 자랄 뿐, 사용자는 "지금 응답 생성 중인지 / 멈췄는지" 구분 어려움.
3. **retreat (0건) 시 시각 신호 없음** — reply 텍스트만 안내 문구로 바뀌어 인지 약함.
4. **error 시 액션 부재** — 텍스트 안내만, 재시도 버튼 없어 새 메시지 입력해야 함.

본 sprint 는 위 4 항목 ("A 핵심 인지 향상") 만 다룬다. 나머지 4 항목 (followups 페이드인 / suggestions 로딩 placeholder / 모바일 키보드 가림 방지 / collapsed 알림 도트) 은 별도 sprint 후보.

## 목표

- 코드 양 적절 (한 sprint), 오버엔지니어링 없음.
- DESIGN.md motion 토큰 (micro 80 / short 180 / medium 280) 준수.
- DESIGN.md anti-pattern 위반 없음 (사이드 스트라이프 X, gradient X 등).
- `prefers-reduced-motion` 정중 처리.
- chat:eval 22/22 회귀 없음 (UI만 변경).

## 디자인

### 1. retreat 0건 시각 신호 — inline 메타 라인

assistant 말풍선 **위에** 작은 한 줄을 추가. 풍선과 같은 정렬 (좌하단 라운드 풍선 위쪽 4px margin).

**렌더 조건**: `ChatMessage` 타입에 optional 필드 `meta?: 'retreat'` 추가. AppShell 의 `onReplyOverride` 핸들러가 reply text swap 시 `meta: 'retreat'` 도 함께 set.

**스타일**:
- `flex items-center gap-1.5`
- 6px vermillion accent dot: `bg-(--color-accent) rounded-full h-1.5 w-1.5`
- 텍스트: " 0건 — 조건을 넓혀보세요 " 같은 안내 (정확한 문구는 retreat reply 와 별개로 유지 — placeholder 가 retreat reply 자체를 보여주므로 메타 라인은 분류만 표시)
- `text-[11px] text-(--color-text-subtle) font-medium`
- 말풍선 위 4px margin

**예외**: groundedRerank 후 `useGrounded=true` 면 retreat 트리거 안 됨 → 메타 라인도 안 뜸 (자연 정합).

**모바일**: `MobileChatTab` 의 메시지 렌더 path 에도 동일 컴포넌트 적용.

### 2. reply_delta 타이핑 커서 — 점 3개 페이드 흐름

assistant 말풍선 텍스트의 **마지막 글자 바로 뒤**, 인라인.

**렌더 조건**: `ChatMessage` 타입에 optional 필드 `streaming?: boolean`. 첫 `onReplyDelta` 도착 시 `streaming: true` set, `onReplySealed` 또는 `onReplyOverride` 시 `false` 로 unset (이미 둘 다 sealed semantic 가짐).

**스타일** — `· · ·` 도트 3개:
- 각 도트 4px size: `bg-(--color-text-subtle) rounded-full h-1 w-1`
- 좌우 margin 1.5px (`mx-[1.5px]`)
- 부모는 `inline-flex items-center` (baseline 살림)
- 텍스트 끝 직후 6px gap

**Animation** — `@keyframes alle-typing-wave`:
- opacity 0.2 → 1 → 0.2
- duration 1200ms, `ease-inout` (`var(--ease-inout)`)
- iteration infinite
- 도트별 `animation-delay`: 0ms / 200ms / 400ms

**구현 위치**: `apps/web/src/styles/index.css` 에 `@keyframes alle-typing-wave` 정의. 컴포넌트는 `ChatDock.tsx` 내 `<TypingDots />` sub-component (export 불필요).

**Reduced motion**: `@media (prefers-reduced-motion: reduce)` 시 정적 점 3개로 표시 (animation-name: none).

### 3. sealed → override 텍스트 전환 — sequential fade

**메커니즘**:
- assistant placeholder 텍스트를 `<span>` 으로 감싸고 클래스 토글로 opacity 제어.
- `ChatMessage` 에 transient flag `overriding?: boolean` 임시 필드 (UI only — 다른 곳 사용 X).
- `onReplyOverride` 호출 시:
  1. `setMessages` 로 `overriding: true` set → span opacity 0 (180ms `ease-in`).
  2. `setTimeout(180)` 콜백에서 `setMessages` 로 텍스트·followups swap + `overriding: false` + `streaming: false` + `meta: 'retreat'` 한 번에 set → span opacity 1 (180ms `ease-out`).

**총 시간**: ~360ms.
**Layout shift**: 0 (같은 span, 같은 자리, opacity 만 변경).

**Reduced motion**: opacity transition 무시, setTimeout 0 으로 즉시 swap (transition-duration override CSS 로 처리).

**구현 단순화**: 별도 컴포넌트 불필요. AppShell 핸들러 안에서 두 단계 setState + setTimeout. ChatDock·MobileChatTab 의 메시지 렌더에 `m.overriding ? 'opacity-0' : 'opacity-100'` 클래스 + `transition-opacity duration-[180ms]`.

### 4. error 재시도 버튼 — 모든 에러 + AbortController 재사용

**구조**:
- `ChatMessage` 에 optional 필드 `error?: { message: string; retryUserText: string }`.
- AppShell 의 catch 블록에서 placeholder 메시지를 error 풍선으로 변환 (text = error message + error 필드 set).
- error 풍선 안: 메시지 텍스트 아래 6px gap → "다시 시도" 버튼.

**버튼 스타일** (DESIGN.md secondary button 토큰):
- height 28px (`h-7`)
- `bg-(--color-surface) text-(--color-accent) border border-(--color-accent)`
- hover: `bg-(--color-accent-bg)`
- text `[12px] font-medium`
- `transition-colors duration-[180ms]`
- 아이콘: 좌측 `<Icon name="refresh" size={12} />` (없으면 `arrowPath` 또는 텍스트만)

**클릭 동작** (retry path — 신규 함수 `handleRetry(retryUserText)`):
1. `chatStreamAbortRef.current?.abort()` (안전 — 진행 중 stream 있을 가능성 있음).
2. error 풍선만 messages 에서 제거 (slice). 직전 user 메시지는 그대로 보존.
3. 새 placeholder assistant 메시지 push (`role:'assistant', text:''`).
4. streamChat 호출 — `history` 는 retry 직전 messages 그대로 (마지막이 user 메시지). 이렇게 하면 user 메시지 중복 없이 LLM 호출 재시도.

`handleChatSubmit` 와 다른 점: user 메시지를 새로 push 하지 않음 (이미 보존됨).

**범위**: `LLM_UNREACHABLE` / 일반 catch 둘 다 동일 동작.

**상호작용**: 사용자가 새 메시지 submit 하면 그 자체가 abort + retry 의미를 가지므로 별도 abort 호출 불필요.

## 영향 파일

| 파일 | 변경 |
|---|---|
| `apps/web/src/components/ChatDock.tsx` | `ChatMessage` 타입 4 필드 추가 (`meta`, `streaming`, `error`, `overriding`), 메시지 렌더에 retreat dot row + typing dots + error 재시도 버튼 + override fade span. `<TypingDots />` sub-component. |
| `apps/web/src/layout/MobileShell.tsx::MobileChatTab` | 동일 — 모바일 렌더 path 에 같은 sub-component 적용. ChatMessage 타입은 ChatDock.tsx 에서 import. |
| `apps/web/src/layout/AppShell.tsx` | `onReplyDelta` 첫 호출 시 `streaming: true` set. `onReplySealed` 시 `streaming: false`. `onReplyOverride` 시 fade 2-step (overriding flag + setTimeout). catch 블록에서 error 필드 set + retryUserText 보관. retry 핸들러 (`handleRetry`). |
| `apps/web/src/styles/index.css` | `@keyframes alle-typing-wave` 추가, `prefers-reduced-motion` 분기. |

## 비-목표

- followups 칩 페이드인 (별도 sprint)
- suggestions 로딩 placeholder (도착 빠르므로 우선순위 낮음)
- 모바일 키보드 가림 방지 (visual viewport API — 별도 sprint)
- collapsed 도크 새 메시지 도트 (handle pulse 가 부분적으로 시그널)
- TypingDots 의 위치를 reply 마지막 글자가 word-wrap 으로 줄바뀜 시 재배치 — inline-flex 로 자동 처리되지만 corner-case 추가 검증은 manual 만.

## 검증

수동 (Vite dev http://localhost:5173):
1. 일반 query ("이번 주말 가족 축제") 응답 → 타이핑 도트 표시 → sealed 후 도트 사라짐.
2. retreat query ("남극 축제 있어?") → 메타 라인 + fade swap (180ms 빈 칸 → 180ms 새 텍스트).
3. LLM 종료 (port 8000 kill) 후 query → error 풍선 + "다시 시도" 버튼 → LLM 재기동 → 버튼 클릭 → 정상 응답.
4. OS reduced-motion 설정 ON → 도트 정적, fade 즉시.

자동:
- `pnpm -F bff chat:eval` → 22/22 PASS (UI만 변경, 회귀 0).
- `pnpm -F web typecheck` → 본 변경으로 인한 신규 에러 0 (사전 존재 10 외).

## Risks

1. **TypingDots inline-flex 와 한국어 word-break** — 도트가 마지막 글자에서 분리되어 다음 줄로 떨어질 가능성. 완화: `whitespace-nowrap` 을 부모 인접 wrapper 에 두는 대신 도트만 `inline-block`. manual 검증.
2. **fade 도중 사용자가 새 query submit** — overriding=true 인 풍선이 abort 되어 messages 에서 어떻게 처리될지. 완화: `setMessages` 의 placeholderIndex 가드가 이미 있고, abort 시 catch 블록이 error 필드를 set 하면 자연 처리.
3. **retry 시 같은 메시지 중복 messages 추가 위험** — handleChatSubmit 이 user 메시지를 push 하므로. 완화: handleRetry 에서 history 추출 시 마지막 user 메시지를 마지막 message 로 활용 (또는 retry-only path 신설).
4. **error 풍선이 retreat 메타 라인과 겹치면** — 둘 다 위쪽에 무언가 추가하는데 동시 발생 불가 (error 면 retreat 분기 안 탐). 자연 배제.
