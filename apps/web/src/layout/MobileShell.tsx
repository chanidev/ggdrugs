import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LogoMark } from '../components/brand/Logo';
import { Icon } from '../components/Icon';
import { NotificationBell } from '../components/notifications/NotificationBell';
import { useCurrentUser } from '../lib/auth-context';
import { loginUrl } from '../lib/auth-redirect';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SeoulMap } from '../components/SeoulMap';
import { HealthBadge } from '../components/HealthBadge';
import { BottomSheet, type SheetSnap } from '../components/mobile/BottomSheet';
import { FilterSearchPanel } from '../components/FilterSearchPanel';
import { FullListPanel } from '../components/FullListPanel';
import { EventSummaryContent } from '../components/EventSummaryPanel';
import { SUGGESTIONS } from '../data/mock';
import { PhaseBadge } from '../components/PhaseBadge';
import type { ChatMessage } from '../components/ChatDock';
import type { ChatSuggestion, EventListQuery } from '../lib/api';

type MobileTab = 'filter' | 'list' | 'chat';

const TAB_ORDER: { key: MobileTab; label: string; icon: 'filter' | 'list' | 'chat' }[] = [
  { key: 'list', label: '목록', icon: 'list' },
  { key: 'filter', label: '필터', icon: 'filter' },
  { key: 'chat', label: '채팅', icon: 'chat' },
];

/**
 * MobileShell — 모바일 메인 페이지 (md 미만).
 *
 * DESIGN.md §모바일 메인 레이아웃 정책 구현:
 *  - 지도 100% 풀스크린
 *  - 상단 floating header (h-12, surface/85 + backdrop-blur-md)
 *  - 하단 BottomSheet: min(10vh) ↔ peek(52vh) ↔ full(90vh) 3 snap, drag + tap
 *  - 시트 내부 탭: 목록 / 필터 / 채팅 (rail accordion 콘텐츠 재사용)
 *  - 핀 탭 → 시트 자동 peek + EventSummaryContent 렌더 (탭 콘텐츠 대체)
 *
 * Desktop 은 AppShell 의 별도 트리. 둘은 같은 부모 state 를 공유.
 */
export function MobileShell({
  mapFilter,
  setMapFilter,
  highlightRegionIds,
  setHighlightRegionIds,
  selectedEventId,
  setSelectedEventId,
  chatValue,
  setChatValue,
  messages,
  onChatSubmit,
}: {
  mapFilter: EventListQuery | null;
  setMapFilter: (q: EventListQuery | null) => void;
  highlightRegionIds: string[];
  setHighlightRegionIds: (ids: string[]) => void;
  selectedEventId: string | null;
  setSelectedEventId: (id: string | null) => void;
  chatValue: string;
  setChatValue: (v: string) => void;
  messages: ChatMessage[];
  onChatSubmit: (text: string) => void;
}) {
  const [snap, setSnap] = useState<SheetSnap>('peek');
  const [tab, setTab] = useState<MobileTab>('list');

  // 핀 탭 / 자연어 후보 클릭 → 시트가 닫혀있으면 자동 peek 으로 (사용자가 풀로 펼친
  // 상태에선 그대로 둠 — 본인 의도 존중).
  useEffect(() => {
    if (selectedEventId && snap === 'min') setSnap('peek');
  }, [selectedEventId]); // eslint-disable-line react-hooks/exhaustive-deps

  // SeoulMap.onSelectEvent 는 (id|null) — 빈 지도 탭 시 deselect.
  // FilterSearchPanel/FullListPanel/MobileChatTab 는 (string) — pin/항목 클릭만.
  const handleMapSelectEvent = (id: string | null) => setSelectedEventId(id);
  const handleSelectEvent = (id: string) => setSelectedEventId(id);
  const handleClearEvent = () => setSelectedEventId(null);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text) md:hidden">
      {/* 풀스크린 지도 — z-0. 핸들과 시트가 위에 떠있음. */}
      <div className="absolute inset-0 z-0">
        <ErrorBoundary>
          <SeoulMap
            filter={mapFilter}
            highlightRegionIds={highlightRegionIds}
            selectedEventId={selectedEventId}
            onSelectEvent={handleMapSelectEvent}
          />
        </ErrorBoundary>
        <HealthBadge />
      </div>

      <MobileFloatingHeader />

      <BottomSheet snap={snap} onSnapChange={setSnap} ariaLabel="이벤트 시트">
        {selectedEventId ? (
          <SelectedEventView
            key={selectedEventId}
            eventId={selectedEventId}
            onClear={handleClearEvent}
          />
        ) : (
          <TabbedView
            tab={tab}
            onTabChange={setTab}
            mapFilter={mapFilter}
            setMapFilter={setMapFilter}
            setHighlightRegionIds={setHighlightRegionIds}
            selectedEventId={selectedEventId}
            onSelectEvent={handleSelectEvent}
            chatValue={chatValue}
            setChatValue={setChatValue}
            messages={messages}
            onChatSubmit={onChatSubmit}
            onAfterChatPick={() => setSnap('full')}
          />
        )}
      </BottomSheet>
    </div>
  );
}

/**
 * 상단 floating header. surface/85 + backdrop-blur-md.
 * 가장자리 스트라이프 금지 (anti-AI-slop). 아래로 살짝 fade 하는 box-shadow 만.
 */
function MobileFloatingHeader() {
  const { user, loading } = useCurrentUser();

  return (
    <header
      className="absolute inset-x-0 top-0 z-40 flex h-12 items-center justify-between px-4"
      style={{
        background: 'color-mix(in oklch, var(--color-surface) 85%, transparent)',
        backdropFilter: 'blur(12px) saturate(140%)',
        WebkitBackdropFilter: 'blur(12px) saturate(140%)',
        boxShadow: '0 1px 0 0 color-mix(in oklch, var(--color-border) 40%, transparent)',
      }}
    >
      <Link to="/" aria-label="Alle 홈" className="flex h-9 items-center text-(--color-text)">
        <LogoMark size={26} />
        <span className="ml-1.5 text-[15px] font-bold tracking-[-0.02em]">Alle</span>
      </Link>

      <div className="flex items-center gap-1.5">
        {loading ? (
          <div aria-hidden className="h-8 w-16 rounded-(--radius-md) bg-(--color-surface-alt)" />
        ) : user ? (
          <>
            <NotificationBell />
            <Link
              to="/me"
              aria-label="마이페이지"
              className="inline-flex h-8 items-center gap-1.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2.5 text-[12px] font-medium text-(--color-text) transition-colors hover:border-(--color-border-hover)"
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-(--color-accent)" />
              <span className="max-w-[84px] truncate">{user.nickname}</span>
            </Link>
          </>
        ) : (
          <a
            href={loginUrl('google')}
            className="inline-flex h-8 items-center rounded-(--radius-md) bg-(--color-accent) px-3 text-[12px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
          >
            로그인
          </a>
        )}
      </div>
    </header>
  );
}

/**
 * 시트 내부 — 이벤트 미선택 상태. 탭 strip + 콘텐츠.
 */
function TabbedView({
  tab,
  onTabChange,
  mapFilter,
  setMapFilter,
  setHighlightRegionIds,
  selectedEventId,
  onSelectEvent,
  chatValue,
  setChatValue,
  messages,
  onChatSubmit,
  onAfterChatPick,
}: {
  tab: MobileTab;
  onTabChange: (t: MobileTab) => void;
  mapFilter: EventListQuery | null;
  setMapFilter: (q: EventListQuery | null) => void;
  setHighlightRegionIds: (ids: string[]) => void;
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
  chatValue: string;
  setChatValue: (v: string) => void;
  messages: ChatMessage[];
  onChatSubmit: (text: string) => void;
  onAfterChatPick: () => void;
}) {
  return (
    <>
      <nav
        aria-label="시트 탭"
        className="grid shrink-0 grid-cols-3 border-b border-(--color-border) bg-(--color-surface) px-3"
      >
        {TAB_ORDER.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(t.key)}
              className={`relative inline-flex h-11 items-center justify-center gap-1.5 text-[13px] transition-colors ${
                active
                  ? 'font-semibold text-(--color-text)'
                  : 'font-medium text-(--color-text-muted) hover:text-(--color-text)'
              }`}
            >
              <Icon name={t.icon} size={15} />
              <span>{t.label}</span>
              {active && (
                <span
                  aria-hidden
                  className="absolute -bottom-px left-1/2 h-[2px] w-10 -translate-x-1/2 rounded-full bg-(--color-accent)"
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'filter' && (
          <FilterSearchPanel
            onApplied={(q) => setMapFilter(q)}
            onReset={() => {
              setMapFilter(null);
              setHighlightRegionIds([]);
            }}
            onRegionSelectionChange={setHighlightRegionIds}
            onSelectEvent={onSelectEvent}
            activeEventId={selectedEventId}
          />
        )}
        {tab === 'list' && (
          <FullListPanel activeEventId={selectedEventId} onSelect={onSelectEvent} />
        )}
        {tab === 'chat' && (
          <MobileChatTab
            value={chatValue}
            onChange={setChatValue}
            onSubmit={(t) => {
              onChatSubmit(t);
              onAfterChatPick();
            }}
            messages={messages}
            onSuggestionClick={(eid) => {
              onSelectEvent(eid);
            }}
          />
        )}
      </div>
    </>
  );
}

/**
 * 시트 내부 — 이벤트 선택됨. 요약 콘텐츠 + 좌상단 "← 목록" 복귀 link.
 *
 * 탭 strip 대체 — 사용자가 의도적으로 이벤트를 선택한 상태이므로 탭 전환은
 * 한 단계 뒤로 (목록으로) 가서 다시 선택하는 흐름.
 */
function SelectedEventView({
  eventId,
  onClear,
}: {
  eventId: string;
  onClear: () => void;
}) {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-(--color-border) bg-(--color-surface) px-4 py-2.5">
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-8 items-center gap-1 rounded-(--radius-md) px-2 text-[13px] font-medium text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
        >
          <Icon name="arrow" size={14} className="rotate-180" />
          <span>목록으로</span>
        </button>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
          이벤트 요약
        </span>
        <span aria-hidden className="w-12" />
      </div>
      <EventSummaryContent eventId={eventId} />
    </>
  );
}

/**
 * 모바일 채팅 탭 — ChatDock 의 인라인 버전. floating wrapper / handle / collapse 제거.
 * 시트 본문이 자체 스크롤을 가지므로 메시지 영역도 그 스크롤에 맡김.
 */
function MobileChatTab({
  value,
  onChange,
  onSubmit,
  messages,
  onSuggestionClick,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  messages: ChatMessage[];
  onSuggestionClick: (eventId: string) => void;
}) {
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        const t = value.trim();
        if (t) onSubmit(t);
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-[12px] leading-[1.5] text-(--color-text-muted)">
              자연어로 질문하면 5개 필터 + AI 의미 검색 후보를 함께 드려요.
            </p>
            <ul className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => onSubmit(s)}
                    className="block w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2.5 text-left text-[13.5px] text-(--color-text) transition-colors hover:border-(--color-accent) hover:bg-(--color-accent-bg) hover:text-(--color-accent)"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((m, i) => {
            const isLastAssistant =
              m.role === 'assistant' && i === messages.length - 1;
            return (
              <div key={i} className="flex flex-col gap-1.5">
                <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <span
                    className={`inline-block max-w-[82%] rounded-(--radius-lg) px-3 py-2 text-[14px] leading-[1.5] ${
                      m.role === 'user'
                        ? 'rounded-br-[4px] bg-(--color-accent) text-white'
                        : 'rounded-bl-[4px] border border-(--color-border) bg-(--color-surface) text-(--color-text)'
                    }`}
                  >
                    {m.text}
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
        )}
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-(--color-border) bg-(--color-surface) px-3 py-2.5">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-subtle)">
            <Icon name="sparkles" size={14} />
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder='"이번 주말 가족이랑 볼만한 축제"'
            aria-label="자연어로 이벤트 검색"
            className="h-11 w-full rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) pl-9 pr-3 text-[14.5px] text-(--color-text) placeholder:text-(--color-text-subtle) transition-[border-color,box-shadow] duration-[180ms] focus:border-(--color-accent) focus:shadow-[0_0_0_4px_var(--color-accent-bg)] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={!value.trim()}
          aria-label="검색 전송"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-accent) text-white transition-colors hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="send" size={15} />
        </button>
      </div>
    </form>
  );
}

function MobileSuggestionsList({
  items,
  onClick,
}: {
  items: ChatSuggestion[];
  onClick: (eventId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="m-0 pl-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-(--color-text-subtle)">
        AI 후보 {items.length}건 · 의미 기반
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((s) => (
          <li key={s.eventId}>
            <button
              type="button"
              onClick={() => onClick(s.eventId)}
              className="flex w-full flex-col gap-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-left transition-colors hover:border-(--color-accent) hover:bg-(--color-accent-bg)"
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
              <h4 className="m-0 line-clamp-2 text-[13px] font-medium leading-[1.35] text-(--color-text)">
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
          </li>
        ))}
      </ul>
    </div>
  );
}
