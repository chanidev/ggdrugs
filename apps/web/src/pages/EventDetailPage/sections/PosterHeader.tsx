import type { BffEventDetail } from '../../../lib/api';
import { PhaseBadge } from '../../../components/PhaseBadge';
import { BookmarkButton } from '../../../components/BookmarkButton';

export function PosterHeader({ detail }: { detail: BffEventDetail }) {
  return (
    <div className="flex flex-col gap-4 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6 md:flex-row">
      <div className="h-56 w-full shrink-0 overflow-hidden rounded-(--radius-md) bg-(--color-surface-warm) md:h-64 md:w-64">
        {detail.posterImageUrl ? (
          <img
            src={detail.posterImageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[12px] text-(--color-text-subtle)">
            포스터 없음
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="m-0 text-[24px] font-bold leading-[1.25] tracking-[-0.015em]">
            {detail.title}
          </h1>
          <PhaseBadge phase={detail.phase} />
        </div>
        <p className="m-0 text-[14px] text-(--color-text-muted)">{detail.region.fullAddress}</p>
        <div className="mt-2 flex items-center gap-2">
          <BookmarkButton
            eventId={detail.eventId}
            initialBookmarked={detail.isBookmarked}
          />
          <span className="tabular text-[12px] text-(--color-text-subtle)">
            북마크 {detail.bookmarkCount.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
