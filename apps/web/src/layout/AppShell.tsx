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
import { ErrorBoundary } from '../components/ErrorBoundary';
import { EventSummaryPanel } from '../components/EventSummaryPanel';
import type { EventListQuery } from '../lib/api';

/**
 * AppShell — A_200 메인 페이지 레이아웃.
 *
 * 구조:
 *  - Header (60px)
 *  - Body (flex row):
 *    · Sidebar rail (236px)
 *    · OverlayPanel (absolute left=236, w=380, z=20)         — 필터/목록/채팅 help
 *    · EventSummaryPanel (absolute left=616, w=380, z=10)     — 선택 이벤트 요약 (있을 때만)
 *    · main (map + 플로팅 ChatDock)
 *
 * State lift:
 *  - open section (filter/list/chat/null)
 *  - chatValue + messages + dockCollapsed
 *  - mapFilter: FilterSearchPanel 적용 결과가 SeoulMap 재-fetch 를 트리거
 *  - selectedEventId: 핀 클릭 / 목록 클릭 → 요약 패널 + 지도 하이라이트 동기화
 */
export function AppShell() {
  const [open, setOpen] = useState<SidebarSection | null>('filter');
  const [chatValue, setChatValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [mapFilter, setMapFilter] = useState<EventListQuery | null>(null);
  // 지도 폴리곤 하이라이트는 chip 클릭에 즉시 반응 — 핀 재-fetch(mapFilter) 와 분리.
  const [highlightRegionIds, setHighlightRegionIds] = useState<string[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const toggleSection = (key: SidebarSection) =>
    setOpen((prev) => (prev === key ? null : key));

  const handleChatSubmit = (text: string) => {
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setChatValue('');
    if (dockCollapsed) setDockCollapsed(false);
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
          {open === 'filter' && (
            <FilterSearchPanel
              onApplied={(q) => setMapFilter(q)}
              onReset={() => {
                setMapFilter(null);
                setHighlightRegionIds([]);
              }}
              onRegionSelectionChange={setHighlightRegionIds}
              onSelectEvent={setSelectedEventId}
              activeEventId={selectedEventId}
            />
          )}
          {open === 'list' && (
            <FullListPanel
              activeEventId={selectedEventId}
              onSelect={setSelectedEventId}
            />
          )}
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
        {selectedEventId && (
          <EventSummaryPanel
            eventId={selectedEventId}
            onClose={() => setSelectedEventId(null)}
          />
        )}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <ErrorBoundary>
              <SeoulMap
                filter={mapFilter}
                highlightRegionIds={highlightRegionIds}
                selectedEventId={selectedEventId}
                onSelectEvent={setSelectedEventId}
              />
            </ErrorBoundary>
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
