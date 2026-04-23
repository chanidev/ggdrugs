import { Link } from 'react-router';
import { type MyReviewItem } from '../../../lib/api';
import { Stars } from './Stars.js';

export function ReviewCard({
  item,
  onDelete,
}: {
  item: MyReviewItem;
  onDelete: () => void;
}) {
  const ev = item.event;
  const date = item.createdAt.slice(0, 10);
  return (
    <article className="flex flex-col gap-2 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4 transition-colors hover:border-(--color-border-hover)">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/events/${ev.eventId}`}
          className="m-0 line-clamp-2 text-[15px] font-semibold leading-[1.3] text-(--color-text) hover:text-(--color-accent)"
        >
          {ev.title}
        </Link>
        <Stars value={item.rating} />
      </div>
      <p className="m-0 line-clamp-3 text-[13px] leading-[1.55] text-(--color-text)">
        {item.body}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="tabular text-[11px] text-(--color-text-subtle)">{date}</span>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-7 items-center rounded-(--radius-md) px-2 text-[12px] font-medium text-(--color-text-subtle) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-error)"
        >
          삭제
        </button>
      </div>
    </article>
  );
}
