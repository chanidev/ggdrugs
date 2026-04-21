import { SUGGESTIONS } from '../data/mock';
import { Icon } from './Icon';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * ChatDock — 지도 위에 떠 있는 플로팅 채팅 도크 (A_201).
 *
 * - 가로 가운데, 아래에서 24px 위. width: min(820, 100% - 48px).
 * - 상단 탭 handle: 접기/펼치기. pulse 인디케이터.
 * - Collapsible 영역: 메시지 목록 + eyebrow + 추천 suggestion chips.
 * - Input row: sparkles 아이콘 + 검색 버튼.
 *
 * 실제 LLM 연동은 services/llm 준비 후. onSubmit 은 현재 mock echo.
 */
export function ChatDock({
  value,
  onChange,
  onSubmit,
  messages,
  collapsed,
  onToggleCollapsed,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  messages: ChatMessage[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <form
      // 모바일: 하단 MobileTabBar(h-14) 위에 위치. 데스크탑: bottom-6 floating.
      className="pointer-events-auto absolute bottom-[72px] left-2 right-2 z-[7] rounded-(--radius-xl) border border-(--color-border) bg-(--color-surface) px-3 pb-3 pt-3 shadow-(--shadow-lg) md:bottom-6 md:left-1/2 md:right-auto md:w-[min(820px,calc(100%-48px))] md:-translate-x-1/2 md:px-[18px] md:pb-4 md:pt-3.5"
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
            <div className="mb-2.5 flex max-h-[160px] flex-col gap-2 overflow-y-auto rounded-(--radius-lg) bg-(--color-surface-alt) px-3.5 py-2.5">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
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
              ))}
            </div>
          )}
          <div className="mb-2 flex items-center gap-2 text-[12px] text-(--color-text-subtle)">
            {/* static dot — handle pulse 와 중복되지 않도록. DESIGN.md §Motion signature 단일 지점 규칙. */}
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-(--color-accent)" />
            <span>자연어로 질문하면 5개 필터로 자동 매핑해 드려요</span>
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
