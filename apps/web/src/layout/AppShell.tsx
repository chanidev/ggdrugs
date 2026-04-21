import { useState } from 'react';
import { Header } from './Header';
import { Sidebar, type SidebarSection } from './Sidebar';
import { MobileTabBar } from './MobileTabBar';
import { OverlayPanel } from '../components/OverlayPanel';
import { FilterSearchPanel } from '../components/FilterSearchPanel';
import { FullListPanel } from '../components/FullListPanel';
import { ChatHelpPanel } from '../components/ChatHelpPanel';
import { SeoulMap } from '../components/SeoulMap';
import { ChatDock, type ChatMessage } from '../components/ChatDock';
import { HealthBadge } from '../components/HealthBadge';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { EventSummaryPanel } from '../components/EventSummaryPanel';
import { sendChat, type ChatFilters, type EventListQuery, type EventPhase } from '../lib/api';

/** periodKey → {start, end} (YYYY-MM-DD). FilterSearchPanel 로직과 동일 의미. */
function rangeForPeriod(key: ChatFilters['periodKey']): { start: string; end: string } | null {
  if (!key) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const iso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };
  const add = (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };
  if (key === 'today') return { start: iso(today), end: iso(today) };
  if (key === 'weekend') {
    const day = today.getDay();
    const sat = add(today, (6 - day + 7) % 7);
    const sun = add(sat, 1);
    return { start: iso(sat), end: iso(sun) };
  }
  if (key === 'week') {
    const day = today.getDay() || 7;
    const mon = add(today, -(day - 1));
    const sun = add(mon, 6);
    return { start: iso(mon), end: iso(sun) };
  }
  if (key === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start: iso(start), end: iso(end) };
  }
  return null;
}

function chatFiltersToQuery(f: ChatFilters): EventListQuery | null {
  const q: EventListQuery = {};
  if (f.eventTypes.length) q.eventTypes = f.eventTypes;
  if (f.companions.length) q.companions = f.companions;
  if (f.regionIds.length) q.regionIds = f.regionIds;
  if (f.vibeIds.length) q.vibeIds = f.vibeIds;
  const r = rangeForPeriod(f.periodKey);
  if (r) {
    q.period = 'custom';
    q.periodStart = r.start;
    q.periodEnd = r.end;
  }
  const phases: EventPhase[] = ['upcoming', 'ongoing'];
  q.phases = phases; // 채팅 검색은 기본적으로 현재·미래 이벤트만.
  return Object.keys(q).length > 1 ? q : null; // phases 만으로는 '무필터'
}

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
  // 기본 시작 상태: 데스크탑 필터 패널, 모바일은 닫힘(지도). CSS breakpoint 로
  // 대체할 수 없어서 초기값만 viewport 폭으로 결정. 이후엔 사용자 state.
  const [open, setOpen] = useState<SidebarSection | null>(() => {
    if (typeof window === 'undefined') return 'filter';
    return window.matchMedia('(min-width: 768px)').matches ? 'filter' : null;
  });
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
    const userMsg: ChatMessage = { role: 'user', text };
    const history = [...messages, userMsg];
    setMessages(history);
    setChatValue('');
    if (dockCollapsed) setDockCollapsed(false);
    (async () => {
      try {
        const reply = await sendChat(history);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: reply.reply,
            ...(reply.suggestions && reply.suggestions.length > 0
              ? { suggestions: reply.suggestions }
              : {}),
          },
        ]);
        const q = chatFiltersToQuery(reply.filters);
        if (q) {
          setMapFilter(q);
          // 채팅에서 온 지역은 폴리곤 하이라이트도 켜준다.
          setHighlightRegionIds(reply.filters.regionIds);
        }
      } catch (err) {
        const msg =
          (err as Error).message === 'LLM_UNREACHABLE'
            ? 'LLM 서비스에 연결하지 못했어요. 서비스가 올라와 있는지 확인해 주세요.'
            : '응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.';
        setMessages((prev) => [...prev, { role: 'assistant', text: msg }]);
      }
    })();
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
        <MobileTabBar open={open} onSelect={setOpen} />
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
              onSuggestionClick={setSelectedEventId}
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
