import { useRef } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ActionButton } from 'seed-design/ui/action-button';
import type { BookmarkListItem } from '../../../lib/api';

/**
 * A_500 마이페이지 "북마크 기록" 캐러셀 (와이어 6번 하단 ④⑤⑥).
 * 포스터 카드 가로 스크롤 + 상세 보기. 캘린더 아래에 표시.
 */
export function BookmarkCarousel({ items }: { items: BookmarkListItem[] }) {
  const { t } = useTranslation('mypage');
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: -1 | 1) => {
    trackRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  return (
    <section aria-label={t('calendar.bookmarkSection')} className="mt-6">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="m-0 text-[16px] font-bold tracking-[-0.01em]">{t('calendar.bookmarkSection')}</h3>
        {items.length > 0 && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => scroll(-1)}
              aria-label={t('calendar.carouselPrev')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-(--radius-md) text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              aria-label={t('calendar.carouselNext')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-(--radius-md) text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
            >
              ›
            </button>
          </div>
        )}
      </header>

      {items.length === 0 ? (
        <p className="m-0 rounded-(--radius-md) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-6 text-center text-[13px] text-(--color-text-subtle)">
          {t('bookmark.empty')}
        </p>
      ) : (
        <div ref={trackRef} className="flex gap-3 overflow-x-auto pb-2">
          {items.map((b) => (
            <article key={b.bookmarkId} className="flex w-[180px] shrink-0 flex-col gap-2">
              <div className="aspect-[3/4] overflow-hidden rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt)">
                {b.event.posterImageUrl ? (
                  <img
                    src={b.event.posterImageUrl}
                    alt={b.event.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-3 text-center text-[12px] text-(--color-text-subtle)">
                    {b.event.title}
                  </div>
                )}
              </div>
              <p className="m-0 line-clamp-2 text-[13px] font-medium text-(--color-text)">{b.event.title}</p>
              <ActionButton variant="neutralOutline" size="small" asChild>
                <Link to={`/events/${b.event.eventId}`}>{t('calendar.viewDetail')}</Link>
              </ActionButton>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
