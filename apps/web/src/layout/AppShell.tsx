import { Outlet } from 'react-router';
import { Header } from './Header';
import { SeoulMap } from '../components/SeoulMap';
import { HealthBadge } from '../components/HealthBadge';

/**
 * AppShell — 모든 라우트의 공통 레이아웃.
 *
 * DESIGN.md §Layout: 60:40 map:sidebar.
 * - Sidebar(좌): <Outlet /> — 현재 라우트 컴포넌트 렌더 (IdleMenu/FilterSearchPanel/FullListPanel/ChatPanel).
 * - Map(우): 모든 라우트에서 지속 렌더 (페이지 전환에 Kakao Maps 재초기화 비용 회피).
 */
export function AppShell() {
  return (
    <div className="flex h-screen flex-col bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex min-h-0 flex-1">
        <aside
          className="flex w-[40%] min-w-[360px] max-w-[520px] flex-col border-r border-(--color-border) bg-(--color-surface)"
          aria-label="이벤트 탐색 사이드바"
        >
          <Outlet />
        </aside>
        <main className="relative min-w-0 flex-1">
          <SeoulMap />
          <HealthBadge />
        </main>
      </div>
    </div>
  );
}
