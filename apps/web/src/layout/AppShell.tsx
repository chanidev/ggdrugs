import { useState } from 'react';
import { Header } from './Header';
import { Sidebar, type SidebarSection } from './Sidebar';
import { MobileShell } from './MobileShell';
import { OverlayPanel } from '../components/OverlayPanel';
import { FilterSearchPanel } from '../components/FilterSearchPanel';
import { FullListPanel } from '../components/FullListPanel';
import { ChatHelpPanel } from '../components/ChatHelpPanel';
import { SeoulMap } from '../components/SeoulMap';
import { ChatDock, type ChatMessage } from '../components/ChatDock';
import { HealthBadge } from '../components/HealthBadge';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { EventSummaryPanel } from '../components/EventSummaryPanel';
import { streamChat, type ChatFilters, type EventListQuery, type EventPhase } from '../lib/api';

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
  if (key === 'tomorrow') {
    const tmr = add(today, 1);
    return { start: iso(tmr), end: iso(tmr) };
  }
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
 * AppShell — A_200 메인 페이지 state 컨테이너.
 *
 * 데스크톱 / 모바일 두 트리를 동시 렌더, CSS 로 한 쪽만 노출:
 *  - 데스크톱: 본 파일 내 `<DesktopBody>` (Header + Sidebar rail + OverlayPanel + map + ChatDock).
 *    `hidden md:flex`.
 *  - 모바일:   `<MobileShell>` (full-screen map + floating header + BottomSheet).
 *    내부적으로 `md:hidden`.
 *
 * 둘은 같은 부모 state 를 공유 — 회전 / breakpoint 전환 시에도 선택된 이벤트, chat
 * 메시지, 적용된 필터가 유지됨.
 *
 * State lift:
 *  - open section (filter/list/chat/null) — 데스크톱 OverlayPanel 만 사용
 *  - chatValue + messages + dockCollapsed
 *  - mapFilter: FilterSearchPanel 적용 결과가 SeoulMap 재-fetch 를 트리거
 *  - highlightRegionIds: chip 클릭 즉시 폴리곤 하이라이트 (mapFilter 와 분리)
 *  - selectedEventId: 핀/목록 클릭 → 요약 패널/시트 + 지도 하이라이트 동기화
 */
export function AppShell() {
  // 데스크톱 기본 상태 — 모바일은 자체 tab state 사용 (open 비참조).
  const [open, setOpen] = useState<SidebarSection | null>('filter');
  const [chatValue, setChatValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [mapFilter, setMapFilter] = useState<EventListQuery | null>(null);
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
    // placeholder assistant 메시지 — streamChat 델타를 이 텍스트에 누적.
    const placeholderIndex = history.length; // user 메시지 바로 뒤
    setMessages((prev) => [...prev, { role: 'assistant', text: '' }]);

    let accumulatedReply = '';
    let retreatApplied = false;

    (async () => {
      try {
        await streamChat(history, {
          onReplyDelta: (chunk) => {
            if (retreatApplied) return; // retreat 후 오는 델타 무시 (stream 종료 순서 보장 안됨)
            accumulatedReply += chunk;
            setMessages((prev) => {
              if (placeholderIndex >= prev.length) return prev;
              const next = prev.slice();
              next[placeholderIndex] = { ...next[placeholderIndex], text: accumulatedReply };
              return next;
            });
          },
          onMeta: (meta) => {
            // filters 확정 즉시 지도 갱신.
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
            retreatApplied = true;
            accumulatedReply = p.text;
            setMessages((prev) => {
              if (placeholderIndex >= prev.length) return prev;
              const next = prev.slice();
              next[placeholderIndex] = {
                ...next[placeholderIndex],
                text: p.text,
                followups: p.followups.length > 0 ? p.followups : next[placeholderIndex].followups,
              };
              return next;
            });
          },
        });
      } catch (err) {
        const msg =
          (err as Error).message === 'LLM_UNREACHABLE'
            ? 'LLM 서비스에 연결하지 못했어요. 서비스가 올라와 있는지 확인해 주세요.'
            : '응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.';
        setMessages((prev) => {
          if (placeholderIndex >= prev.length) return [...prev, { role: 'assistant', text: msg }];
          const next = prev.slice();
          next[placeholderIndex] = { role: 'assistant', text: msg };
          return next;
        });
      }
    })();
  };

  return (
    <>
      {/* 데스크톱 트리 (md+) */}
      <div className="hidden h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text) md:flex">
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
                onSuggestionClick={setSelectedEventId}
                messages={messages}
                collapsed={dockCollapsed}
                onToggleCollapsed={() => setDockCollapsed((c) => !c)}
              />
            </div>
          </main>
        </div>
      </div>

      {/* 모바일 트리 (< md) — 내부적으로 md:hidden */}
      <MobileShell
        mapFilter={mapFilter}
        setMapFilter={setMapFilter}
        highlightRegionIds={highlightRegionIds}
        setHighlightRegionIds={setHighlightRegionIds}
        selectedEventId={selectedEventId}
        setSelectedEventId={setSelectedEventId}
        chatValue={chatValue}
        setChatValue={setChatValue}
        messages={messages}
        onChatSubmit={handleChatSubmit}
      />
    </>
  );
}
