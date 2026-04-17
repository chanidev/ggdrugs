import { useNavigate } from 'react-router';

/**
 * SidebarSubHeader — 서브페이지(/filter, /list, /chat)의 공통 상단 헤더.
 * ← 뒤로가기 버튼 + 타이틀. 클릭 시 '/' 로 복귀.
 */
export function SidebarSubHeader({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-(--color-border) px-2">
      <button
        type="button"
        aria-label="돌아가기"
        onClick={() => navigate('/')}
        className="flex h-9 w-9 items-center justify-center rounded-(--radius-md) text-body text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
      >
        ←
      </button>
      <h2 className="text-body font-semibold tracking-tight text-(--color-text)">
        {title}
      </h2>
    </div>
  );
}
