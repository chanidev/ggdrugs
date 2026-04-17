import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { SeoulMap } from '../components/SeoulMap';
import { ChatDock } from '../components/ChatDock';
import { HealthBadge } from '../components/HealthBadge';

/**
 * AppShell — A_200 메인 페이지 레이아웃.
 *
 * 좌→우 3영역(확장 시) 또는 2영역(닫힌 상태):
 * 1. Sidebar rail (좁음)
 * 2. [선택] 확장 패널 — 행 클릭 시 rail 오른쪽에 등장
 * 3. Map + 하단 ChatDock (나머지 공간)
 *
 * Sidebar 컴포넌트가 1·2를 모두 렌더 (Fragment). 확장 열림/닫힘에 따라 map 너비 자동 조정.
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
