import { Link } from 'react-router';
import { PhaseBadge } from '../../../components/PhaseBadge';
import { type RecommendedEventItem } from '../../../lib/api';

const DIM_LABEL: Record<string, string> = {
  category: '관심 종류',
  region: '관심 지역',
  vibe: '관심 성향',
  semantic: 'AI 추천', // Qdrant personalized — mean vector kNN
};

export function RecommendedCard({ item }: { item: RecommendedEventItem }) {
  const date =
    item.startDate === item.endDate ? item.startDate : `${item.startDate} — ${item.endDate}`;
  const region = item.region.sigunguName
    ? `${item.region.sidoName} ${item.region.sigunguName}`
    : item.region.sidoName;
  return (
    <Link
      to={`/events/${item.eventId}`}
      className="flex gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-3 transition-colors hover:border-(--color-border-hover) hover:bg-(--color-surface-alt)"
    >
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-(--radius-md) bg-(--color-surface-warm)">
        {item.posterImageUrl ? (
          <img
            src={item.posterImageUrl}
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
            {item.title}
          </h3>
          <PhaseBadge phase={item.phase} />
        </div>
        <p className="m-0 text-[13px] text-(--color-text-muted)">
          {item.categoryName} · {region}
        </p>
        <p className="tabular m-0 text-[12px] text-(--color-text-subtle)">{date}</p>
        {item.matchedDimensions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.matchedDimensions.map((d) => (
              <span
                key={d}
                className="inline-flex items-center rounded-(--radius-sm) bg-(--color-accent)/10 px-1.5 py-[1px] text-[10px] font-medium text-(--color-accent)"
                title={`${DIM_LABEL[d] ?? d} 매칭`}
              >
                ✦ {DIM_LABEL[d] ?? d}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
