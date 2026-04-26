# Chat UI 폴리시 Sprint A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle 채팅 UI에 4 항목 폴리시 — retreat 메타 라인 / 타이핑 도트 / sealed→override sequential fade / error 재시도 버튼 — 을 추가해 사용자 인지 향상.

**Architecture:** UI-only 변경. `ChatMessage` 타입에 4 transient 필드 추가, AppShell 의 streamChat 핸들러 5 종 (delta/sealed/meta/suggestions/override) 과 catch 블록을 확장. ChatDock(데스크톱) + MobileChatTab(모바일) 양쪽 메시지 렌더 path 에 동일 시각 효과. `@keyframes alle-typing-wave` 1.2s 도트 페이드 흐름 + `prefers-reduced-motion` CSS 분기.

**Tech Stack:** React 19, Vite 6, Tailwind 4 (CSS variables: `--color-accent`, `--color-text-subtle`, `--ease-in`, `--ease-out`), TypeScript 5.6 strict.

**Spec reference:** `docs/superpowers/specs/2026-04-25-chat-ui-polish-sprint-a-design.md`.

**Note on commits:** 사용자 요청에 따라 plan 실행 중 git commit 단계는 생략. typecheck + manual 시나리오 + chat:eval 회귀로 검증만.

---

## File Structure

| 파일 | 역할 |
|---|---|
| `apps/web/src/components/ChatDock.tsx` | `ChatMessage` 타입 정의 (4 필드 추가). 데스크톱 메시지 렌더 — retreat 메타 라인 / 타이핑 도트 / override fade span / error 재시도 버튼. `<TypingDots />` sub-component. |
| `apps/web/src/layout/MobileShell.tsx` | `MobileChatTab` 의 메시지 렌더 path — ChatDock 과 동일 4 폴리시 적용 (sub-component import). |
| `apps/web/src/layout/AppShell.tsx` | streamChat 핸들러 5 종 + catch 블록 확장 — streaming flag, override fade 2-step (setTimeout 180ms), error 필드 set, `handleRetry` 신규. |
| `apps/web/src/styles/index.css` | `@keyframes alle-typing-wave` 추가 + `prefers-reduced-motion` 분기. 기존 `alle-pulse` 인접 (line 128 부근). |

---

## Task 1: ChatMessage 타입 확장 + 공유 sub-components

**Files:**
- Modify: `apps/web/src/components/ChatDock.tsx:6-13` (`ChatMessage` interface)
- Modify: `apps/web/src/components/ChatDock.tsx` (파일 끝 — `<TypingDots />`, `<RetreatMeta />`, `<ErrorRetryButton />` 신규 export)

- [ ] **Step 1: ChatMessage 타입에 4 transient 필드 추가**

`apps/web/src/components/ChatDock.tsx` L6-13 에서 기존 인터페이스 갱신:

```tsx
export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  /** assistant 메시지에만 실림 — Qdrant 의미 검색으로 뽑힌 이벤트 후보. */
  suggestions?: ChatSuggestion[];
  /** assistant 메시지에만 — LLM 이 제안한 다음 user 발화 후보 칩 (최대 3). */
  followups?: string[];
  /** v4-A — reply_delta 누적 중. sealed/override 시 해제. typing dots 렌더 트리거. */
  streaming?: boolean;
  /** v4-A — sealed→override 전환 중간(180ms fade-out 단계). opacity 0 으로 토글. */
  overriding?: boolean;
  /** v4-A — retreat 발동 메타 (현재 유일 값 'retreat'). assistant 풍선 위 inline 라인. */
  meta?: 'retreat';
  /** v4-A — stream 실패 정보. retry 버튼 클릭 시 재호출용 user text 보존. */
  error?: { retryUserText: string };
}
```

- [ ] **Step 2: `<TypingDots />` sub-component 추가 (파일 끝)**

기존 `SuggestionsRow` 함수 다음 (파일 끝, L237 이후) 추가:

```tsx
/**
 * v4-A — reply_delta 누적 중에 마지막 글자 뒤에 인라인으로 표시. CSS keyframe
 * `alle-typing-wave` 가 도트 3개를 stagger fade 흐름으로 깜빡인다 (1.2s, ease-inout).
 * `prefers-reduced-motion` 시 정적 도트로 fallback.
 */
function TypingDots() {
  return (
    <span
      aria-hidden
      className="ml-1.5 inline-flex items-center align-baseline"
      data-testid="typing-dots"
    >
      <span className="alle-typing-dot mx-[1.5px] h-1 w-1 rounded-full bg-(--color-text-subtle)" />
      <span className="alle-typing-dot alle-typing-dot-2 mx-[1.5px] h-1 w-1 rounded-full bg-(--color-text-subtle)" />
      <span className="alle-typing-dot alle-typing-dot-3 mx-[1.5px] h-1 w-1 rounded-full bg-(--color-text-subtle)" />
    </span>
  );
}
```

- [ ] **Step 3: `<RetreatMeta />` sub-component 추가**

```tsx
/**
 * v4-A — retreat (suggestions 0건) 발동 시 assistant 풍선 위에 표시되는 한 줄.
 * vermillion accent dot + muted 안내 텍스트. 모바일·데스크톱 동일 사용.
 */
function RetreatMeta() {
  return (
    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-(--color-text-subtle)">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-(--color-accent)" />
      <span>0건 — 조건을 넓혀보세요</span>
    </div>
  );
}
```

- [ ] **Step 4: `<ErrorRetryButton />` sub-component 추가**

```tsx
/**
 * v4-A — stream 실패 풍선 안에 렌더되는 재시도 버튼. DESIGN.md secondary button 토큰
 * (vermillion 텍스트·테두리, surface bg). 클릭 시 caller(AppShell) 의 retry 핸들러 호출.
 */
function ErrorRetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="mt-1.5 inline-flex h-7 items-center gap-1 rounded-(--radius-md) border border-(--color-accent) bg-(--color-surface) px-2.5 text-[12px] font-medium text-(--color-accent) transition-colors duration-[180ms] hover:bg-(--color-accent-bg)"
    >
      <Icon name="sparkles" size={12} />
      다시 시도
    </button>
  );
}
```

> **Note:** Icon 으로는 기존 import 된 `Icon` 의 `sparkles` 또는 `send` 사용 — 추가 아이콘 도입 회피. 만약 `Icon` 이 `refresh`/`arrowPath` 를 노출하지 않으면 `sparkles` 로 둘 것 (한 sprint 안에서 아이콘 라이브러리 확장 X).

- [ ] **Step 5: 컴포넌트 export 추가**

위 3 sub-component 모두 `export function ...` 으로 선언 (다른 파일에서 import 가능하게). `TypingDots`, `RetreatMeta`, `ErrorRetryButton` 세 이름 export.

- [ ] **Step 6: typecheck**

```bash
pnpm -F web typecheck
```

Expected: 본 변경으로 인한 신규 에러 0 (사전 존재 10 외).

---

## Task 2: `@keyframes alle-typing-wave` + reduced-motion CSS

**Files:**
- Modify: `apps/web/src/styles/index.css` (line ~136 — `@keyframes alle-pulse` 직후)

- [ ] **Step 1: keyframe 추가**

`apps/web/src/styles/index.css` 의 `@keyframes alle-pulse {...}` 블록 (line 133-136) 직후 (line 137 위치) 에 추가:

```css
/* v4-A — TypingDots: 마지막 글자 뒤 도트 3개 stagger fade. 1.2s, ease-inout. */
@keyframes alle-typing-wave {
  0%, 80%, 100% { opacity: 0.2; }
  40%           { opacity: 1; }
}
.alle-typing-dot {
  animation: alle-typing-wave 1.2s var(--ease-inout, cubic-bezier(0.4, 0, 0.2, 1)) infinite;
}
.alle-typing-dot-2 { animation-delay: 200ms; }
.alle-typing-dot-3 { animation-delay: 400ms; }

/* prefers-reduced-motion — 정적 도트 (opacity 0.5 고정) 로 fallback. */
@media (prefers-reduced-motion: reduce) {
  .alle-typing-dot,
  .alle-typing-dot-2,
  .alle-typing-dot-3 {
    animation: none;
    opacity: 0.5;
  }
  /* override fade transition 도 즉시 swap. */
  .alle-fade-text {
    transition: none !important;
  }
}

/* v4-A — sealed→override sequential fade. opacity 토글로 layout shift 0. */
.alle-fade-text {
  transition: opacity 180ms var(--ease-in, cubic-bezier(0.4, 0, 1, 1));
}
```

- [ ] **Step 2: 빌드/dev 서버 확인**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
```

Expected: 200. Vite HMR 이 CSS 변경 자동 반영.

---

## Task 3: ChatDock 메시지 렌더에 4 폴리시 통합

**Files:**
- Modify: `apps/web/src/components/ChatDock.tsx` L88-115 (메시지 map 블록)

- [ ] **Step 1: 메시지 렌더 블록 교체**

`ChatDock.tsx` 의 `messages.map((m, i) => { ... })` 블록 (line 88-115 영역) 을 다음으로 교체:

```tsx
{messages.map((m, i) => {
  const isLastAssistant =
    m.role === 'assistant' && i === messages.length - 1;
  const isError = m.role === 'assistant' && m.error;
  return (
    <div key={i} className="flex flex-col gap-1.5">
      {/* v4-A — retreat 메타 라인 (assistant 풍선 위). */}
      {m.role === 'assistant' && m.meta === 'retreat' && <RetreatMeta />}
      <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        <span
          className={`inline-block max-w-[80%] rounded-(--radius-lg) px-3 py-2 text-[14px] leading-[1.5] ${
            m.role === 'user'
              ? 'rounded-br-[4px] bg-(--color-accent) text-white'
              : 'rounded-bl-[4px] border border-(--color-border) bg-(--color-surface) text-(--color-text)'
          }`}
        >
          {/* v4-A — sealed→override fade 중에는 opacity 0. text 자체는 그대로. */}
          <span className={`alle-fade-text ${m.overriding ? 'opacity-0' : 'opacity-100'}`}>
            {m.text}
          </span>
          {/* v4-A — reply_delta 누적 중에 마지막 글자 뒤 도트. */}
          {m.role === 'assistant' && m.streaming && <TypingDots />}
          {/* v4-A — error 풍선이면 재시도 버튼. (caller 가 onRetry 콜백 주입) */}
          {isError && m.error && (
            <ErrorRetryButton onRetry={() => onRetry?.(m.error!.retryUserText)} />
          )}
        </span>
      </div>
      {m.role === 'assistant' && m.suggestions && m.suggestions.length > 0 && (
        <SuggestionsRow
          items={m.suggestions}
          onClick={(eid) => onSuggestionClick?.(eid)}
        />
      )}
      {isLastAssistant && m.followups && m.followups.length > 0 && (
        <FollowupRow items={m.followups} onPick={(s) => onSubmit(s)} />
      )}
    </div>
  );
})}
```

- [ ] **Step 2: ChatDock props 에 `onRetry` 추가**

L28-45 의 `ChatDock({...})` 시그니처:

```tsx
export function ChatDock({
  value,
  onChange,
  onSubmit,
  onSuggestionClick,
  onRetry,
  messages,
  collapsed,
  onToggleCollapsed,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  onSuggestionClick?: (eventId: string) => void;
  /** v4-A — error 풍선의 "다시 시도" 클릭 콜백. caller (AppShell) 가 retry 로직 주입. */
  onRetry?: (retryUserText: string) => void;
  messages: ChatMessage[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
```

- [ ] **Step 3: typecheck**

```bash
pnpm -F web typecheck
```

Expected: 본 변경으로 인한 신규 에러 0.

---

## Task 4: MobileChatTab 에 동일 4 폴리시 통합

**Files:**
- Modify: `apps/web/src/layout/MobileShell.tsx` L310-322 (`MobileChatTab` props), L362-398 (메시지 map 블록)

- [ ] **Step 1: import 추가 (파일 상단)**

기존 `import type { ChatMessage } from '../components/ChatDock';` 라인을 다음으로 교체 (L17 부근):

```tsx
import {
  ErrorRetryButton,
  RetreatMeta,
  TypingDots,
  type ChatMessage,
} from '../components/ChatDock';
```

- [ ] **Step 2: MobileChatTab props 에 onRetry 추가**

L310-322 의 함수 시그니처:

```tsx
function MobileChatTab({
  value,
  onChange,
  onSubmit,
  messages,
  onSuggestionClick,
  onRetry,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  messages: ChatMessage[];
  onSuggestionClick: (eventId: string) => void;
  /** v4-A — error 풍선의 "다시 시도" 클릭 콜백. */
  onRetry?: (retryUserText: string) => void;
}) {
```

- [ ] **Step 3: 메시지 렌더 블록 교체**

L363-398 의 `messages.map(...)` 블록을 다음으로 교체:

```tsx
messages.map((m, i) => {
  const isLastAssistant =
    m.role === 'assistant' && i === messages.length - 1;
  const isError = m.role === 'assistant' && m.error;
  return (
    <div key={i} className="flex flex-col gap-1.5">
      {/* v4-A — retreat 메타 라인. */}
      {m.role === 'assistant' && m.meta === 'retreat' && <RetreatMeta />}
      <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        <span
          className={`inline-block max-w-[82%] rounded-(--radius-lg) px-3 py-2 text-[14px] leading-[1.5] ${
            m.role === 'user'
              ? 'rounded-br-[4px] bg-(--color-accent) text-white'
              : 'rounded-bl-[4px] border border-(--color-border) bg-(--color-surface) text-(--color-text)'
          }`}
        >
          <span className={`alle-fade-text ${m.overriding ? 'opacity-0' : 'opacity-100'}`}>
            {m.text}
          </span>
          {m.role === 'assistant' && m.streaming && <TypingDots />}
          {isError && m.error && (
            <ErrorRetryButton onRetry={() => onRetry?.(m.error!.retryUserText)} />
          )}
        </span>
      </div>
      {m.role === 'assistant' && m.suggestions && m.suggestions.length > 0 && (
        <MobileSuggestionsList items={m.suggestions} onClick={onSuggestionClick} />
      )}
      {isLastAssistant && m.followups && m.followups.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {m.followups.slice(0, 3).map((s, k) => (
            <button
              key={`${k}-${s}`}
              type="button"
              onClick={() => onSubmit(s)}
              className="inline-flex items-center gap-1 rounded-full border border-(--color-border) bg-(--color-surface) px-2.5 py-1 text-[12px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-accent) hover:bg-(--color-accent-bg) hover:text-(--color-accent)"
            >
              <span aria-hidden className="text-(--color-text-subtle)">↳</span>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
})
```

- [ ] **Step 4: MobileChatTab caller (MobileShell.tsx 안의 사용 지점) 에 onRetry prop 전달 자리 비워두기**

caller 측은 Task 5 에서 AppShell 이 `handleRetry` 함수를 만든 뒤 prop chain 으로 내려보냄. 현재 단계에선 MobileChatTab 호출처에 `onRetry={undefined}` 또는 그냥 prop 생략 (optional 이라 OK). typecheck 만 통과시키고 다음 task 로.

- [ ] **Step 5: typecheck**

```bash
pnpm -F web typecheck
```

Expected: 본 변경으로 인한 신규 에러 0.

---

## Task 5: AppShell 핸들러 통합 — streaming flag, override fade, handleRetry

**Files:**
- Modify: `apps/web/src/layout/AppShell.tsx` L124-251 (handleChatSubmit 함수 + 신규 handleRetry)
- Modify: `apps/web/src/layout/AppShell.tsx` (ChatDock·MobileShell 호출 부분에 onRetry prop 추가)

- [ ] **Step 1: handleChatSubmit 추출 — `streamFor(history, placeholderIndex)` 헬퍼**

L124-251 의 `handleChatSubmit` 본체에서 streamChat 호출 + 콜백 + catch 블록을 별도 헬퍼로 추출. 이렇게 해야 retry 가 user 메시지 push 없이 같은 stream 로직을 재사용 가능.

`handleChatSubmit` 직후 (L251 이후, return 이전) 에 다음 헬퍼 추가:

```tsx
/**
 * stream + 콜백 처리 본체. handleChatSubmit / handleRetry 양쪽이 공유.
 * placeholderIndex 는 이미 messages 에 push 된 placeholder assistant 메시지의 index.
 */
const streamFor = (history: ChatMessage[], placeholderIndex: number) => {
  chatStreamAbortRef.current?.abort();
  const controller = new AbortController();
  chatStreamAbortRef.current = controller;

  const lastRefs: LastSuggestionRef[] = (() => {
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      if (!m || m.role !== 'assistant') continue;
      if (!m.suggestions || m.suggestions.length === 0) continue;
      return m.suggestions.map(toLastSuggestionRef);
    }
    return [];
  })();

  let accumulatedReply = '';
  let replySealed = false;

  (async () => {
    try {
      await streamChat(
        history,
        {
          onReplyDelta: (chunk) => {
            if (replySealed) return;
            accumulatedReply += chunk;
            setMessages((prev) => {
              if (placeholderIndex >= prev.length) return prev;
              const next = prev.slice();
              next[placeholderIndex] = {
                ...next[placeholderIndex],
                text: accumulatedReply,
                streaming: true,
              };
              return next;
            });
          },
          onReplySealed: (p) => {
            replySealed = true;
            setMessages((prev) => {
              if (placeholderIndex >= prev.length) return prev;
              const next = prev.slice();
              const canonical = p.text && p.text !== accumulatedReply ? p.text : accumulatedReply;
              if (p.text && p.text !== accumulatedReply) accumulatedReply = p.text;
              next[placeholderIndex] = {
                ...next[placeholderIndex],
                text: canonical,
                streaming: false,
              };
              return next;
            });
          },
          onMeta: (meta) => {
            const q = chatFiltersToQuery(meta.filters);
            if (q) {
              setMapFilter(q);
              setHighlightRegionIds(meta.filters.regionIds);
            }
            if (meta.followups.length > 0) {
              setMessages((prev) => {
                if (placeholderIndex >= prev.length) return prev;
                const next = prev.slice();
                next[placeholderIndex] = {
                  ...next[placeholderIndex],
                  followups: meta.followups,
                };
                return next;
              });
            }
          },
          onSuggestions: (items) => {
            if (items.length === 0) return;
            setMessages((prev) => {
              if (placeholderIndex >= prev.length) return prev;
              const next = prev.slice();
              next[placeholderIndex] = { ...next[placeholderIndex], suggestions: items };
              return next;
            });
          },
          onReplyOverride: (p) => {
            replySealed = true;
            // v4-A — 2-step fade. step 1: opacity 0 (overriding=true).
            setMessages((prev) => {
              if (placeholderIndex >= prev.length) return prev;
              const next = prev.slice();
              next[placeholderIndex] = { ...next[placeholderIndex], overriding: true };
              return next;
            });
            // step 2: 180ms 후 텍스트 swap + opacity 1 + retreat 메타.
            setTimeout(() => {
              accumulatedReply = p.text;
              setMessages((prev) => {
                if (placeholderIndex >= prev.length) return prev;
                const next = prev.slice();
                next[placeholderIndex] = {
                  ...next[placeholderIndex],
                  text: p.text,
                  followups: p.followups.length > 0 ? p.followups : next[placeholderIndex].followups,
                  streaming: false,
                  overriding: false,
                  meta: 'retreat',
                };
                return next;
              });
            }, 180);
          },
        },
        controller.signal,
        lastRefs.length > 0 ? lastRefs : undefined,
      );
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      const msg =
        (err as Error).message === 'LLM_UNREACHABLE'
          ? 'LLM 서비스에 연결하지 못했어요. 서비스가 올라와 있는지 확인해 주세요.'
          : '응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.';
      // 직전 user 메시지 텍스트 추출 — retry 버튼이 같은 메시지로 재시도.
      const lastUser = [...history].reverse().find((m) => m.role === 'user');
      const retryUserText = lastUser?.text ?? '';
      setMessages((prev) => {
        if (placeholderIndex >= prev.length) return prev;
        const next = prev.slice();
        next[placeholderIndex] = {
          role: 'assistant',
          text: msg,
          streaming: false,
          overriding: false,
          error: { retryUserText },
        };
        return next;
      });
    } finally {
      if (chatStreamAbortRef.current === controller) {
        chatStreamAbortRef.current = null;
      }
    }
  })();
};
```

- [ ] **Step 2: handleChatSubmit 본체 → streamFor 호출**

기존 `handleChatSubmit` (L124-251) 내부의 streamChat 호출 + 콜백 + catch 블록 전체 (즉, `let accumulatedReply = ''` 부터 `})()` 까지) 를 다음으로 교체:

```tsx
const handleChatSubmit = (text: string) => {
  const userMsg: ChatMessage = { role: 'user', text };
  const history = [...messages, userMsg];
  setMessages(history);
  setChatValue('');
  if (dockCollapsed) setDockCollapsed(false);

  // placeholder assistant 메시지 — streamChat 델타를 이 텍스트에 누적.
  const placeholderIndex = history.length;
  setMessages((prev) => [...prev, { role: 'assistant', text: '', streaming: true }]);

  streamFor([...history], placeholderIndex);
};
```

(streaming: true 는 placeholder 풍선이 처음 보일 때부터 타이핑 도트 노출 — 첫 토큰 도착 전 빈 풍선 + 도트 만 보임.)

- [ ] **Step 3: handleRetry 신규 함수**

`streamFor` 헬퍼 직후 (또는 handleChatSubmit 바로 위) 추가:

```tsx
/**
 * v4-A — error 풍선의 "다시 시도" 클릭. user 메시지를 새로 push 하지 않고
 * 직전 error placeholder 만 새 빈 placeholder 로 교체 후 streamFor 재호출.
 */
const handleRetry = (retryUserText: string) => {
  // error 풍선 (마지막 assistant 메시지) 을 빈 placeholder 로 교체.
  // history 는 messages 에서 마지막 assistant (= error 풍선) 를 제외한 슬라이스.
  const errorIdx = messages.length - 1;
  if (errorIdx < 0 || messages[errorIdx]?.role !== 'assistant') return;
  const history = messages.slice(0, errorIdx);
  // history 마지막은 user 메시지여야 함 (정상 흐름).
  const lastUser = history[history.length - 1];
  if (!lastUser || lastUser.role !== 'user' || lastUser.text !== retryUserText) {
    // 안전장치 — history 가 예상과 다르면 새 user 메시지로 fallback.
    handleChatSubmit(retryUserText);
    return;
  }
  const placeholderIndex = history.length;
  setMessages([...history, { role: 'assistant', text: '', streaming: true }]);
  streamFor([...history], placeholderIndex);
};
```

- [ ] **Step 4: ChatDock 호출에 onRetry prop 전달**

기존 `<ChatDock ... />` JSX (대략 L260-280 사이) 에 prop 추가:

```tsx
<ChatDock
  value={chatValue}
  onChange={setChatValue}
  onSubmit={handleChatSubmit}
  onSuggestionClick={setSelectedEventId}
  onRetry={handleRetry}
  messages={messages}
  collapsed={dockCollapsed}
  onToggleCollapsed={() => setDockCollapsed((c) => !c)}
/>
```

- [ ] **Step 5: MobileShell 호출에 onRetry prop 전달**

`<MobileShell ... />` 또는 `<MobileChatTab ... />` 호출 지점 (AppShell 이 모바일 path 로 분기하는 곳) 에 동일 `onRetry={handleRetry}` 추가. (MobileShell 자체에 prop 추가가 필요하면 그 컴포넌트도 동일하게 forward.)

- [ ] **Step 6: typecheck**

```bash
pnpm -F web typecheck
```

Expected: 본 변경으로 인한 신규 에러 0.

---

## Task 6: 검증 — chat:eval + manual 시나리오

**Files:** (변경 없음, 검증만)

- [ ] **Step 1: chat:eval 회귀**

```bash
cd C:/Users/user/Desktop/real_Project && pnpm -F bff chat:eval
```

Expected: `summary: 22/22 passed, 0 failed`. UI 만 변경했으므로 BFF/LLM 응답 회귀 없음.

- [ ] **Step 2: manual 시나리오 1 — 일반 응답 + 타이핑 도트**

브라우저로 http://localhost:5173 접속. 채팅창에 "이번 주말 가족 축제" 입력 → submit.

확인:
- placeholder 풍선이 나타나면서 빈 텍스트 + 도트 3개 wave (1.2s 주기 깜빡임).
- 토큰 도착하며 텍스트가 자라는 동안 도트가 마지막 글자 뒤에 인라인 유지.
- sealed 시점 (~1-2초 후) 도트 사라짐.
- suggestions 도착 후 followups 칩 표시.

- [ ] **Step 3: manual 시나리오 2 — retreat (0건) 메타 라인 + sequential fade**

채팅창에 "남극에서 진행하는 축제 있어?" 입력 → submit.

확인:
- 일반 응답처럼 토큰이 누적된 후, 0건 retreat 트리거.
- 누적된 텍스트 fade-out (180ms) → 빈 칸 → 새 안내 텍스트 fade-in (180ms).
- 새 텍스트 위에 "● 0건 — 조건을 넓혀보세요" 메타 라인 표시.
- followups 칩이 retreat reply 가 준 새 칩으로 갱신.

- [ ] **Step 4: manual 시나리오 3 — error + 재시도**

LLM 서비스 종료:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

채팅창에 "이번 주말 공연" 입력 → submit.

확인:
- 풍선에 "LLM 서비스에 연결하지 못했어요..." 텍스트 + "다시 시도" 버튼.
- LLM 재기동:
  ```bash
  cd C:/Users/user/Desktop/real_Project/services/llm && python -m uvicorn app:app --host 0.0.0.0 --port 8000
  ```
  (백그라운드 또는 별도 터미널)
- "다시 시도" 클릭 → error 풍선이 빈 placeholder 로 교체 + 도트 → 토큰 누적 → 정상 응답.
- user 메시지 ("이번 주말 공연") 가 messages 에 한 번만 존재 (중복 X).

- [ ] **Step 5: manual 시나리오 4 — reduced motion**

OS 접근성 설정에서 "동작 줄이기" / "Reduce Motion" 활성화 (Windows: 설정 > 접근성 > 시각 효과 > 애니메이션 효과 끔).

채팅창에 일반 query 입력.

확인:
- 도트 3개가 정적으로 표시 (애니메이션 없음, opacity 0.5).
- retreat query → fade transition 없이 즉시 swap.

- [ ] **Step 6: BFF + Web typecheck 최종**

```bash
cd C:/Users/user/Desktop/real_Project
pnpm -F bff typecheck
pnpm -F web typecheck
```

Expected: BFF PASS, Web 본 변경 신규 에러 0.

- [ ] **Step 7: 전체 health check**

```bash
echo "LLM: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/health)"
echo "BFF: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/health)"
echo "Web: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/)"
```

Expected: 모두 200.

---

## Spec coverage check

| Spec 요구사항 | 구현 task |
|---|---|
| §1 retreat 메타 라인 (8px dot + 11px subtle text) | Task 1 step 3, Task 3, Task 4 |
| §2 타이핑 도트 (4px × 3, 1.2s wave, stagger 0/200/400ms) | Task 1 step 2, Task 2, Task 3, Task 4 |
| §3 sealed→override sequential fade (180+180ms) | Task 2 (`.alle-fade-text`), Task 3, Task 4, Task 5 step 1 onReplyOverride |
| §4 error 재시도 버튼 + AbortController 재사용 | Task 1 step 4, Task 3, Task 4, Task 5 step 3 (handleRetry) |
| `prefers-reduced-motion` 처리 | Task 2 (`@media reduce` 블록) |
| chat:eval 22/22 회귀 없음 | Task 6 step 1 |
| Web typecheck 신규 에러 0 | Task 1/3/4/5/6 각 step |
| ChatMessage 4 transient 필드 (streaming, overriding, meta, error) | Task 1 step 1 |
| handleRetry 가 user 메시지 중복 안 만듦 | Task 5 step 3 |
| TypingDots / RetreatMeta / ErrorRetryButton 재사용 (모바일·데스크톱) | Task 1 step 5 export, Task 4 step 1 import |

---

## Risks & mitigations (spec §Risks 재정의)

1. **TypingDots word-wrap 분리** — 도트가 마지막 글자에서 줄바뀜으로 떨어질 가능성. 완화: Task 1 step 2 의 `align-baseline` + `inline-flex` 패턴으로 baseline 유지. Task 6 step 2 manual 시나리오에서 긴 응답 대상으로 확인.

2. **fade 중 새 submit** — overriding=true 풍선에 새 setTimeout 콜백이 도착하기 전 controller.abort() → 새 placeholder 가 push 됨. 기존 풍선의 setTimeout 은 200ms 안에 발화되어 placeholderIndex 가 messages 길이 미만이라 setMessages 가드 ('return prev') 가 처리. 완화 추가 작업 불필요.

3. **handleRetry 가 마지막 user 메시지가 아닐 때** — Task 5 step 3 의 안전장치 (`lastUser.text !== retryUserText`) 가 fallback 으로 handleChatSubmit 호출.

4. **Icon 아이콘 부재** — `Icon` 컴포넌트가 'sparkles'/'send'/'chevronDown' 만 export 한다면 ErrorRetryButton 의 아이콘은 sparkles 로 두면 됨. Task 1 step 4 의 Note 참조.

---

## Self-review notes (작성자)

- spec §Risks 4 항목 모두 plan 안에서 처리되거나 manual 시나리오로 검증됨.
- 각 step 에 실제 코드 블록 또는 정확한 명령. 플레이스홀더 0.
- TypingDots / RetreatMeta / ErrorRetryButton 의 시그니처 — Task 1 정의 ↔ Task 3/4 사용 일치 확인 (`onRetry={() => onRetry?.(m.error!.retryUserText)}` 형태로 일관).
- chat:eval 은 BFF /chat 엔드포인트 검증이므로 Web UI 변경의 영향 없음 — Task 6 step 1 은 안전망 회귀 확인.
- commit step 생략 (사용자 명시 거부).
- spec 의 검증 시나리오 4건 (일반 / retreat / error / reduced-motion) 이 Task 6 step 2-5 에 1:1 대응.
