import { Header } from './Header';
import { FilterBar } from '../components/FilterBar';
import { EventList } from '../components/EventList';
import { MapPlaceholder } from '../components/MapPlaceholder';
import { ChatDock } from '../components/ChatDock';
import { HealthBadge } from '../components/HealthBadge';

/**
 * AppShell — A_200 메인 페이지 레이아웃.
 *
 * DESIGN.md §Layout:
 * - 60:40 map : list 분할
 * - map 하단에 채팅 UI (A_201)
 * - 모바일은 list/map 토글 (미구현, Phase 2)
 */
export function AppShell() {
  return (
    <div className="flex h-screen flex-col bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex min-h-0 flex-1">
        {/* Sidebar: 필터 + 이벤트 리스트 */}
        <aside
          className="flex w-[40%] min-w-[360px] max-w-[520px] flex-col border-r border-(--color-border) bg-(--color-surface)"
          aria-label="이벤트 필터와 목록"
        >
          <FilterBar />
          <EventList />
        </aside>

        {/* Main: 지도 + 채팅 도킹 */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <MapPlaceholder />
          <ChatDock />
          <HealthBadge />
        </main>
      </div>
    </div>
  );
}
