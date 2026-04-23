import { Link } from 'react-router';
import { PhaseBadge } from '../../../components/PhaseBadge';
import { type BookmarkListItem } from '../../../lib/api';

export function BookmarkCard({ item }: { item: BookmarkListItem }) {
  const ev = item.event;
  const date =
    ev.startDate === ev.endDate ? ev.startDate : `${ev.startDate} — ${ev.endDate}`;
  const region = ev.region.sigunguName
    ? `${ev.region.sidoName} ${ev.region.sigunguName}`
    : ev.region.sidoName;
  return (
    <Link
      to={`/events/${ev.eventId}`}
      className="flex gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-3 transition-colors hover:border-(--color-border-hover) hover:bg-(--color-surface-alt)"
    >
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-(--radius-md) bg-(--color-surface-warm)">
        {ev.posterImageUrl ? (
          <img
            src={ev.posterImageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="m-0 line-clamp-2 text-[15px] font-semibold leading-[1.3]">
            {ev.title}
          </h3>
          <PhaseBadge phase={ev.phase} />
        </div>
        <p className="m-0 text-[13px] text-(--color-text-muted)">{region}</p>
        <p className="tabular m-0 text-[12px] text-(--color-text-subtle)">{date}</p>
      </div>
    </Link>
  );
}
