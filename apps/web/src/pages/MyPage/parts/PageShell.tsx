import { Header } from '../../../layout/Header';

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex-1 overflow-y-auto">
        {/* DESIGN.md: 마이페이지는 max-width 1200px (12col, gutter 24px). 880px는 규약 위반·캘린더 협소 → 1200px로 정정 */}
        <div className="mx-auto flex w-full max-w-[1200px] flex-col px-6 py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
