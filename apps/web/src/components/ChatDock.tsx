import { SUGGESTIONS } from '../data/mock';
import { Icon } from './Icon';
import { PhaseBadge } from './PhaseBadge';
import type { ChatSuggestion } from '../lib/api';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  /** assistant 메시지에만 실림 — Qdrant 의미 검색으로 뽑힌 이벤트 후보. */
  suggestions?: ChatSuggestion[];
  /** assistant 메시지에만 — LLM 이 제안한 다음 user 발화 후보 칩 (최대 3). */
  followups?: string[];
}

/**
 * ChatDock — 지도 위에 떠 있는 플로팅 채팅 도크 (A_201).
 *
 * - 가로 가운데, 아래에서 24px 위. width: min(820, 100% - 48px).
 * - 상단 탭 handle: 접기/펼치기. pulse 인디케이터.
 * - Collapsible 영역: 메시지 목록 + 각 assistant 메시지 아래 AI 의미 검색 후보 strip
 *   + eyebrow + 추천 suggestion chips.
 * - Input row: sparkles 아이콘 + 검색 버튼.
 *
 * 응답 shape: { reply, filters, suggestions } — AppShell 에서 setMessages 할 때
 * assistant 메시지에 suggestions 동봉, 본 컴포넌트가 클릭 시 onSuggestionClick 으로
 * eventId 전달 (→ summary panel 오픈).
 */
export function ChatDock({
  value,
  onChange,
  onSubmit,
  onSuggestionClick,
  messages,
  collapsed,
  onToggleCollapsed,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  /** 제안 이벤트 클릭 시 (AppShell 이 summary panel 을 열도록). */
  onSuggestionClick?: (eventId: string) => void;
  messages: ChatMessage[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <form
      // 데스크톱 전용 floating dock — 모바일 메인은 BottomSheet 채팅 탭 사용.
      className="pointer-events-auto absolute bottom-6 left-1/2 z-[7] w-[min(820px,calc(100%-48px))] -translate-x-1/2 rounded-(--radius-xl) border border-(--color-border) bg-(--color-surface) px-[18px] pb-4 pt-3.5 shadow-(--shadow-lg)"
      onSubmit={(e) => {
        e.preventDefault();
        const t = value.trim();
        if (t) onSubmit(t);
      }}
    >
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        className="absolute -top-px left-1/2 inline-flex h-9 -translate-x-1/2 -translate-y-full items-center gap-2 rounded-t-(--radius-lg) border border-b-0 border-(--color-border) bg-(--color-surface) px-4 pl-3.5 text-[13px] font-medium text-(--color-text) shadow-[0_-4px_12px_rgba(0,0,0,0.05)] hover:text-(--color-accent)"
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-(--color-accent) [animation:alle-pulse_1.6s_cubic-bezier(0,0,0.2,1)_infinite]"
        />
        <span>
          {collapsed ? '추천·기록 펼치기' : '추천·기록 접기'}
          {messages.length > 0 && ` · ${messages.length}`}
        </span>
        <span
          aria-hidden
          className={`text-(--color-text-subtle) transition-transform duration-[220ms] ${
            collapsed ? 'rotate-180' : ''
          }`}
        >
          <Icon name="chevronDown" size={14} />
        </span>
      </button>

      <div className="m-0 max-w-full">
        <div
          className={`overflow-hidden transition-[max-height,opacity,margin] duration-[280ms] ease-[cubic-bezier(0,0,0.2,1)] ${
            collapsed ? 'pointer-events-none !mb-0 max-h-0 opacity-0' : 'max-h-[600px] opacity-100'
          }`}
        >
          {messages.length > 0 && (
            <div className="mb-2.5 flex max-h-[260px] flex-col gap-2 overflow-y-auto rounded-(--radius-lg) bg-(--color-surface-alt) px-3.5 py-2.5">
              {messages.map((m, i) => {
                const isLastAssistant =
                  m.role === 'assistant' && i === messages.length - 1;
                return (
                  <div key={i} className="flex flex-col gap-1.5">
                    <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <span
                        className={`inline-block max-w-[80%] rounded-(--radius-lg) px-3 py-2 text-[14px] leading-[1.5] ${
                          m.role === 'user'
                            ? 'rounded-br-[4px] bg-(--color-accent) text-white'
                            : 'rounded-bl-[4px] border border-(--color-border) bg-(--color-surface) text-(--color-text)'
                        }`}
                      >
                        {m.text}
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
            </div>
          )}
          <div className="mb-2 flex items-center gap-2 text-[12px] text-(--color-text-subtle)">
            {/* static dot — handle pulse 와 중복되지 않도록. DESIGN.md §Motion signature 단일 지점 규칙. */}
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-(--color-accent)" />
            <span>자연어로 질문하면 5개 필터 + AI 의미 검색 후보를 함께 드려요</span>
          </div>
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSubmit(s)}
                className="rounded-full border border-transparent bg-(--color-surface-alt) px-2.5 py-1.5 text-[13px] text-(--color-text-muted) transition-colors hover:border-(--color-accent) hover:bg-(--color-surface) hover:text-(--color-accent)"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-(--color-text-subtle)">
              <Icon name="sparkles" size={16} />
            </span>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder='"이번 주말 가족이랑 볼만한 축제"'
              aria-label="자연어로 이벤트 검색"
              className="h-12 w-full rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) py-0 pl-11 pr-4 text-[15px] text-(--color-text) placeholder:text-(--color-text-subtle) transition-[border-color,box-shadow] duration-[180ms] focus:border-(--color-accent) focus:shadow-[0_0_0_4px_var(--color-accent-bg)] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!value.trim()}
            className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-5 text-[14px] font-medium text-white transition-colors hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="send" size={15} />
            검색
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * Followup chip row — LLM 이 제안한 다음 user 발화 후보 (2~3개).
 * 탭하면 그대로 새 user 메시지로 submit. 마지막 assistant 메시지에만 노출.
 */
function FollowupRow({ items, onPick }: { items: string[]; onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {items.slice(0, 3).map((s, i) => (
        <button
          key={`${i}-${s}`}
          type="button"
          onClick={() => onPick(s)}
          className="inline-flex items-center gap-1 rounded-full border border-(--color-border) bg-(--color-surface) px-2.5 py-1 text-[12px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-accent) hover:bg-(--color-accent-bg) hover:text-(--color-accent)"
        >
          <span aria-hidden className="text-(--color-text-subtle)">↳</span>
          {s}
        </button>
      ))}
    </div>
  );
}

/**
 * AI 답변 아래 붙는 이벤트 후보 strip — Qdrant kNN 결과 상위 N.
 * 가로 스크롤 카드. 클릭 → summary panel 오픈. matchReason 있으면 1줄 표기.
 */
function SuggestionsRow({
  items,
  onClick,
}: {
  items: ChatSuggestion[];
  onClick: (eventId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 pl-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-(--color-text-subtle)">
        AI 후보 {items.length}건 · 의미 기반
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {items.map((s) => (
          <button
            key={s.eventId}
            type="button"
            onClick={() => onClick(s.eventId)}
            className="flex w-[220px] shrink-0 flex-col gap-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2.5 py-2 text-left transition-colors hover:border-(--color-accent) hover:bg-(--color-accent-bg)"
          >
            <div className="flex items-center gap-1.5">
              <PhaseBadge phase={s.phase} />
              <span className="truncate text-[10.5px] text-(--color-text-subtle)">
                {s.category.name} · {s.region.sigunguName ?? s.region.sidoName}
              </span>
              <span className="tabular ml-auto text-[10px] text-(--color-text-subtle)">
                {(s.score * 100).toFixed(0)}%
              </span>
            </div>
            <h4 className="m-0 line-clamp-2 text-[12.5px] font-medium leading-[1.35] text-(--color-text)">
              {s.title}
            </h4>
            <span className="tabular text-[10.5px] text-(--color-text-subtle)">
              {s.startDate}
              {s.startDate !== s.endDate && ` ~ ${s.endDate}`}
            </span>
            {s.matchReason && (
              <span className="line-clamp-2 text-[10.5px] italic text-(--color-accent)/85">
                ✦ {s.matchReason}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
