import { useState } from 'react';
import { Header } from './Header';
import { Sidebar, type SidebarSection } from './Sidebar';
import { OverlayPanel } from '../components/OverlayPanel';
import { FilterSearchPanel } from '../components/FilterSearchPanel';
import { FullListPanel } from '../components/FullListPanel';
import { ChatHelpPanel } from '../components/ChatHelpPanel';
import { SeoulMap } from '../components/SeoulMap';
import { ChatDock, type ChatMessage } from '../components/ChatDock';
import { HealthBadge } from '../components/HealthBadge';

/**
 * AppShell — A_200 메인 페이지 레이아웃.
 *
 * 구조 (handoff reference/ui_kit_web.html 기준):
 *  - Header (60px)
 *  - Body (flex row):
 *    · Sidebar rail (236px)
 *    · OverlayPanel (absolute left=236, w=380, z=20) — 선택 섹션 펼침
 *    · main (map + 플로팅 ChatDock)
 *
 * State lift:
 *  - Sidebar open section (filter/list/chat/null)
 *  - ChatDock value + messages + collapsed
 *  - 채팅 예시 클릭 → overlay 닫고 dock 에 value 세팅.
 */
export function AppShell() {
  const [open, setOpen] = useState<SidebarSection | null>('filter');
  const [chatValue, setChatValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const toggleSection = (key: SidebarSection) =>
    setOpen((prev) => (prev === key ? null : key));

  const handleChatSubmit = (text: string) => {
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setChatValue('');
    if (dockCollapsed) setDockCollapsed(false);
    // mock assistant echo — services/llm 연동 전 placeholder
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `"${text}" → 종로구·강남구 일대에서 관련 이벤트 ${Math.floor(2 + Math.random() * 4)}건을 찾았어요. 지도 위 핀을 눌러 자세히 보세요.`,
        },
      ]);
    }, 600);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar open={open} onToggle={toggleSection} />
        <OverlayPanel open={open} onClose={() => setOpen(null)}>
          {open === 'filter' && <FilterSearchPanel />}
          {open === 'list' && <FullListPanel />}
          {open === 'chat' && (
            <ChatHelpPanel
              onPick={(q) => {
                setOpen(null);
                setChatValue(q);
                if (dockCollapsed) setDockCollapsed(false);
              }}
            />
          )}
        </OverlayPanel>
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <SeoulMap />
            <HealthBadge />
            <ChatDock
              value={chatValue}
              onChange={setChatValue}
              onSubmit={handleChatSubmit}
              messages={messages}
              collapsed={dockCollapsed}
              onToggleCollapsed={() => setDockCollapsed((c) => !c)}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
