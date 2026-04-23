import { Header } from '../../../layout/Header';

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[880px] flex-col px-6 py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
