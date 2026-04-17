import { useState } from 'react';

/**
 * ChatDock — 지도 하단 도킹된 채팅 검색 UI (A_201 placeholder).
 * 실제 LLM 연동은 services/llm 이 준비된 후. 지금은 입력창 + 제출 시 no-op.
 */
export function ChatDock() {
  const [value, setValue] = useState('');
  return (
    <form
      className="shrink-0 border-t border-(--color-border) bg-(--color-surface) px-6 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        // LLM 연동 전까지 no-op
      }}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder='"이번 주말 가족이랑 볼만한 축제"'
          className="h-10 flex-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-body text-(--color-text) placeholder:text-(--color-text-subtle) focus:border-(--color-accent) focus:outline-none"
          aria-label="자연어로 이벤트 검색"
        />
        <button
          type="submit"
          disabled={value.trim().length === 0}
          className="h-10 shrink-0 rounded-(--radius-md) bg-(--color-accent) px-4 text-body-sm font-medium text-white transition-colors hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
        >
          검색
        </button>
      </div>
    </form>
  );
}
