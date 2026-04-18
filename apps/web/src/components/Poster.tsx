import type { DisplayEvent } from '../lib/event-display';

/**
 * Poster — 이벤트 카드 좌측 64×80 썸네일.
 *
 * 이미지 URL 있으면 <img>, 없으면 이니셜 placeholder + fallback 색.
 */
export function Poster({ event }: { event: DisplayEvent }) {
  if (event.posterImageUrl) {
    return (
      <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-(--radius-md) bg-(--color-surface-warm)">
        <img
          src={event.posterImageUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => {
            // 이미지 깨지면 fallback 로.
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        <span className="absolute inset-x-0 bottom-0 bg-[rgba(26,26,26,0.65)] px-1 py-[2px] text-center font-mono text-[9px] tracking-[0.04em] text-white">
          {event.categoryLabel}
        </span>
      </div>
    );
  }

  const initials = event.title.replace(/[^A-Za-z가-힣]/g, '').slice(0, 2);
  return (
    <div
      className="relative h-20 w-16 shrink-0 overflow-hidden rounded-(--radius-md)"
      style={{ background: event.posterFallbackColor }}
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
        {event.categoryLabel}
      </span>
    </div>
  );
}
