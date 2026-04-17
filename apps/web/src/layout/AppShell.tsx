import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { SeoulMap } from '../components/SeoulMap';
import { ChatDock } from '../components/ChatDock';
import { HealthBadge } from '../components/HealthBadge';

/**
 * AppShell — A_200 메인 페이지 레이아웃.
 *
 * DESIGN.md §Layout:
 * - 좌: Sidebar (accordion 3행: 필터/전체목록/채팅)
 * - 우: 지도 (SeoulMap) + 하단 ChatDock (A_201 자연어 검색 입력)
 * - 사이드바는 좁게 유지하여 지도 영역을 크게.
 */
export function AppShell() {
  return (
    <div className="flex h-screen flex-col bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex min-h-0 flex-1">
        <aside
          className="flex w-[28%] min-w-[300px] max-w-[400px] flex-col border-r border-(--color-border) bg-(--color-surface)"
          aria-label="이벤트 탐색 사이드바"
        >
          <Sidebar />
        </aside>
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <SeoulMap />
            <HealthBadge />
          </div>
          <ChatDock />
        </main>
      </div>
    </div>
  );
}
