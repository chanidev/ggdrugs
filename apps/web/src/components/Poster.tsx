import type { MockEvent } from '../data/mock';
import { TYPES } from '../data/mock';

/**
 * Poster — 이벤트 카드 좌측 64×80 소형 포스터 placeholder.
 * 실제 업로드 포스터 URL 로 교체될 때까지 이니셜 + 단색 배경.
 */
export function Poster({ event }: { event: MockEvent }) {
  const initials = event.title.replace(/[^A-Za-z가-힣]/g, '').slice(0, 2);
  const typeLabel = TYPES.find((t) => t.k === event.category)?.l ?? '';
  return (
    <div
      className="relative h-20 w-16 shrink-0 overflow-hidden rounded-(--radius-md)"
      style={{ background: event.poster }}
    >
      <svg viewBox="0 0 64 80" className="block h-full w-full">
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="Pretendard Variable, sans-serif"
          fontWeight="700"
          fontSize="22"
          fill="rgba(255,255,255,0.94)"
          letterSpacing="-1"
        >
          {initials}
        </text>
        <line x1="0" y1="62" x2="64" y2="62" stroke="rgba(255,255,255,0.2)" />
      </svg>
      <span className="absolute inset-x-0 bottom-0 bg-[rgba(26,26,26,0.65)] px-1 py-[2px] text-center font-mono text-[9px] tracking-[0.04em] text-white">
        {typeLabel}
      </span>
    </div>
  );
}
