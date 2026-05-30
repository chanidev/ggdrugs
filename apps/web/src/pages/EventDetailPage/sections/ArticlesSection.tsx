import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchEventArticlesPage, type EventArticleItem } from '../../../lib/api';
import { Icon } from '../../../components/Icon';

/**
 * A_400 관련 기사 섹션 — event_article_mappings 에서 relevance 순 전체를 5건씩 페이징.
 * 매핑 데이터가 없으면 섹션을 아예 렌더하지 않는다 (공간 낭비 방지).
 */
export function ArticlesSection({ eventId }: { eventId: string }) {
  const { t } = useTranslation('common');
  const PAGE_SIZE = 5;
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<EventArticleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchEventArticlesPage(eventId, { limit: PAGE_SIZE, offset: page * PAGE_SIZE }, ctrl.signal)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [eventId, page]);

  // 첫 페이지 로딩 중이거나 매핑이 없으면 섹션 자체를 숨김.
  if ((loading && page === 0 && items.length === 0) || (total === 0 && !error)) return null;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, page * PAGE_SIZE + items.length);

  return (
    <section className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="m-0 text-[16px] font-semibold tracking-[-0.01em]">{t('articles.title')}</h2>
        <span className="text-[11px] text-(--color-text-subtle)">
          {total > 0 ? (
            <>
              <span className="tabular">
                {rangeStart}–{rangeEnd}
              </span>
              <span> / </span>
              <span className="tabular">{total}</span>
              <span> · {t('articles.autoMatch')}</span>
            </>
          ) : (
            t('articles.autoMatch')
          )}
        </span>
      </header>
      {error ? (
        <div className="text-[13px] text-(--color-error)">{t('articles.loadError')}</div>
      ) : (
        <>
          <ul
            className={`flex flex-col divide-y divide-(--color-border) ${loading ? 'opacity-60' : ''}`}
            aria-busy={loading}
          >
            {items.map((a) => (
              <li key={a.mappingId} className="py-3 first:pt-0 last:pb-0">
                <a
                  href={a.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col gap-1 text-(--color-text) hover:text-(--color-accent)"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-text-subtle)">
                      {a.sourceName}
                    </span>
                    {a.publishedAt && (
                      <span className="tabular text-[11px] text-(--color-text-subtle)">
                        {a.publishedAt.slice(0, 10)}
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-(--color-text-subtle) group-hover:text-(--color-accent)">
                      {t('articles.openOriginal')}
                    </span>
                  </div>
                  <h3 className="m-0 text-[15px] font-semibold tracking-[-0.01em] group-hover:underline">
                    {a.title}
                  </h3>
                  {a.summary && (
                    <p className="m-0 line-clamp-2 text-[13px] text-(--color-text-muted)">
                      {a.summary}
                    </p>
                  )}
                </a>
              </li>
            ))}
          </ul>
          {pageCount > 1 && (
            <nav
              aria-label={t('articles.ariaLabel')}
              className="mt-4 flex items-center justify-between border-t border-(--color-border) pt-3 text-[13px]"
            >
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="inline-flex h-8 items-center gap-1 rounded-(--radius-md) px-3 text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text) disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-(--color-text-muted)"
              >
                <Icon name="arrow" size={14} className="rotate-180" /> {t('articles.prev')}
              </button>
              <span className="tabular text-(--color-text-muted)">
                {page + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1 || loading}
                className="inline-flex h-8 items-center gap-1 rounded-(--radius-md) px-3 text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text) disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-(--color-text-muted)"
              >
                {t('articles.next')} <Icon name="arrow" size={14} />
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
