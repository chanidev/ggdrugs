import { useState } from 'react';
import { SidebarSubHeader } from '../layout/SidebarSubHeader';

/**
 * ChatPanel — /chat 라우트. A_201 자연어 검색.
 *
 * 구조: 상단 back 헤더 + 메시지 히스토리 영역 + 하단 입력 바.
 * 실제 LLM 연동은 services/llm 준비 후 Phase 2.
 */
type Message = {
  id: number;
  sender: 'user' | 'assistant';
  body: string;
};

const SEEDED_MESSAGES: Message[] = [
  {
    id: 1,
    sender: 'assistant',
    body: '안녕하세요. 어떤 이벤트를 찾고 계세요? 지역·기간·인원구성·종류 중 하나라도 알려주시면 좁혀볼게요.',
  },
];

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>(SEEDED_MESSAGES);
  const [input, setInput] = useState('');

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = input.trim();
    if (!body) return;
    setMessages((prev) => [
      ...prev,
      { id: prev.length + 1, sender: 'user', body },
      {
        id: prev.length + 2,
        sender: 'assistant',
        body: '(LLM 연동 전 — placeholder 응답)',
      },
    ]);
    setInput('');
  };

  return (
    <div className="flex h-full flex-col">
      <SidebarSubHeader title="채팅방 검색" />

      <ul className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </ul>

      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-(--color-border) p-3"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='"이번 주말 가족이랑 볼만한 축제"'
            className="h-10 flex-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-body text-(--color-text) placeholder:text-(--color-text-subtle) focus:border-(--color-accent) focus:outline-none"
            aria-label="자연어로 이벤트 검색"
          />
          <button
            type="submit"
            disabled={input.trim().length === 0}
            className="h-10 shrink-0 rounded-(--radius-md) bg-(--color-accent) px-4 text-body-sm font-medium text-white transition-colors hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
          >
            보내기
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.sender === 'user';
  return (
    <li className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-(--radius-lg) px-3 py-2 text-body-sm ${
          isUser
            ? 'bg-(--color-accent) text-white'
            : 'bg-(--color-surface-alt) text-(--color-text)'
        }`}
      >
        {message.body}
      </div>
    </li>
  );
}
