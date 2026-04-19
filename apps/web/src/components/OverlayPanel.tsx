import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { SidebarSection } from '../layout/Sidebar';

const META: Record<SidebarSection, { title: string }> = {
  filter: { title: '필터 검색' },
  list:   { title: '전체목록 조회' },
  chat:   { title: '채팅방 검색' },
};

/**
 * OverlayPanel — Sidebar 바로 오른쪽에 떠있는 확장 패널 (380px).
 *
 * 위치: absolute left=236px, top/bottom=0, z-20.
 * 지도 영역 위에 오버레이 (map 크기는 유지).
 * 열릴 때 slide-in 애니메이션 (keyframe 은 index.css 에서 전역 정의할 수도 있으나 여기선 inline style).
 */
export function OverlayPanel({
  open,
  onClose,
  children,
}: {
  open: SidebarSection | null;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  const meta = META[open];
  return (
    <section
      className="absolute bottom-0 left-[236px] top-0 z-20 flex w-[380px] flex-col border-r border-(--color-border) bg-(--color-surface) shadow-(--shadow-lg) motion-safe:animate-[alle-panel-in_280ms_cubic-bezier(0,0,0.2,1)]"
      aria-label={`${meta.title} 상세`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-(--color-border) px-5 pb-4 pt-5">
        <h3 className="m-0 text-[18px] font-bold tracking-[-0.015em]">{meta.title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="패널 닫기"
          className="flex h-8 w-8 items-center justify-center rounded-(--radius-md) text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}
