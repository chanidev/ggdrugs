import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

/**
 * BottomSheet — 모바일 메인 페이지 하단 시트.
 *
 * DESIGN.md §모바일 메인 레이아웃 정책: 50vh peek ↔ 90vh full, 드래그 + tap-to-toggle.
 * 추가로 'min' (약 10vh — 탭바 + 핸들만 노출) 도 허용해 풀스크린 지도 가능.
 *
 * 의존성 없음. PointerEvent 만 사용 (마우스/터치 통합). transform 미사용 — content
 * 스크롤이 sheet 높이에 직접 반응하도록 height 애니메이션. (Animate height 는 브라우저
 * 부담이 있지만 sheet 단일 요소라 영향 미미. JS-driven snap 으로 60fps 유지.)
 */

export type SheetSnap = 'min' | 'peek' | 'full';

const SNAP_VH: Record<SheetSnap, number> = {
  min: 10,
  peek: 52,
  full: 90,
};

const ORDER: SheetSnap[] = ['min', 'peek', 'full'];

const TAP_THRESHOLD_PX = 6;
const RELEASE_TRANSITION = 'height 320ms cubic-bezier(0.16, 1, 0.3, 1)';

export function BottomSheet({
  snap,
  onSnapChange,
  children,
  ariaLabel,
}: {
  snap: SheetSnap;
  onSnapChange: (next: SheetSnap) => void;
  children: ReactNode;
  ariaLabel?: string;
}) {
  // 드래그 상태: 시작 좌표, 시작 높이(vh), 누적 거리, 현재 vh
  const [dragVh, setDragVh] = useState<number | null>(null);
  const dragRef = useRef<{
    startY: number;
    startVh: number;
    movedPx: number;
    pointerId: number;
  } | null>(null);

  // viewport 변동 (모바일 키보드 등) 대비 — px↔vh 환산은 매 이벤트마다 신선하게.
  const vhPerPx = useCallback(() => 100 / window.innerHeight, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startY: e.clientY,
      startVh: SNAP_VH[snap],
      movedPx: 0,
      pointerId: e.pointerId,
    };
    setDragVh(SNAP_VH[snap]);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const deltaY = e.clientY - d.startY;
    d.movedPx = Math.max(d.movedPx, Math.abs(deltaY));
    // 위로 끄는 게 sheet 확장 → 높이 증가 → deltaY 음수
    const next = d.startVh - deltaY * vhPerPx();
    const clamped = Math.max(SNAP_VH.min, Math.min(SNAP_VH.full, next));
    setDragVh(clamped);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const finalVh = dragVh ?? SNAP_VH[snap];
    dragRef.current = null;
    setDragVh(null);

    // 미세한 움직임 = tap → 다음 snap 으로 토글 (peek <-> full 우선, min 에선 peek 으로)
    if (d.movedPx < TAP_THRESHOLD_PX) {
      const nextSnap: SheetSnap =
        snap === 'min' ? 'peek' : snap === 'peek' ? 'full' : 'peek';
      onSnapChange(nextSnap);
      return;
    }

    // 가장 가까운 snap 으로 확정
    let best: SheetSnap = 'peek';
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const k of ORDER) {
      const dist = Math.abs(SNAP_VH[k] - finalVh);
      if (dist < bestDelta) {
        bestDelta = dist;
        best = k;
      }
    }
    onSnapChange(best);
  };

  // ESC 로 full 에서 한 단계 축소
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (snap === 'full') onSnapChange('peek');
      else if (snap === 'peek') onSnapChange('min');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snap, onSnapChange]);

  const heightVh = dragVh ?? SNAP_VH[snap];
  const isDragging = dragVh !== null;

  return (
    <section
      role="dialog"
      aria-label={ariaLabel ?? '이벤트 시트'}
      aria-modal="false"
      style={{
        height: `${heightVh}vh`,
        transition: isDragging ? 'none' : RELEASE_TRANSITION,
      }}
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[22px] border border-b-0 border-(--color-border) bg-(--color-surface) shadow-[0_-12px_36px_-8px_rgba(20,20,30,0.12)] md:hidden"
    >
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={
          snap === 'full'
            ? '시트 절반으로 축소'
            : snap === 'peek'
              ? '시트 전체 펼치기'
              : '시트 펼치기'
        }
        className="group flex h-7 shrink-0 cursor-grab touch-none items-center justify-center select-none active:cursor-grabbing"
      >
        <span
          aria-hidden
          className={`block h-1 w-9 rounded-full transition-colors ${
            isDragging
              ? 'bg-(--color-text-muted)'
              : 'bg-(--color-border-strong) group-hover:bg-(--color-text-subtle)'
          }`}
        />
      </button>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </section>
  );
}
