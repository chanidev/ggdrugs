import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { SeoulMap } from '../components/SeoulMap';
import { ChatDock } from '../components/ChatDock';
import { HealthBadge } from '../components/HealthBadge';

/**
 * AppShell — A_200 메인 페이지 레이아웃.
 *
 * DESIGN.md §Layout: 60:40 map:sidebar (map 우측, sidebar 좌측).
 * - Sidebar: A_202 필터 검색 OR A_300 전체목록 조회 (모드 전환)
 * - Map: Kakao Maps 기반, 서울 전역
 * - ChatDock: 지도 하단 도킹, A_201 자연어 검색
 */
export function AppShell() {
  return (
    <div className="flex h-screen flex-col bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
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
