import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PhaseBadge } from '../../../components/PhaseBadge';
import { UploadReviewPanel } from '../../../components/admin/UploadReviewPanel';
import { fetchAdminEvents, type AdminEventItem } from '../../../lib/api';

// =============================================================
// Upload Review Tab — 업로드 이벤트 심사 (pending + source_type=uploaded)
// =============================================================

export function UploadReviewsTab() {
  const { t } = useTranslation('admin');
  const [events, setEvents] = useState<AdminEventItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = useCallback(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchAdminEvents(
      {
        approvalStatus: 'pending',
        sourceType: 'uploaded',
        hasVibes: 'any',
        limit: 50,
      },
      ctrl.signal,
    )
      .then((r) => {
        setEvents(r.items);
        setTotal(r.total);
        // 선택된 게 결과에 없으면 선택 해제
        if (selectedId && !r.items.some((e) => e.eventId === selectedId)) {
          setSelectedId(null);
        }
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown error');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [selectedId]);

  useEffect(() => {
    return reload();
  }, [reload]);

  const selected = useMemo(
    () => events.find((e) => e.eventId === selectedId) ?? null,
    [events, selectedId],
  );

  const onDecided = () => {
    // 결정된 이벤트는 pending 리스트에서 빠진다. 즉시 리로드.
    setSelectedId(null);
    reload();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
      <section className="min-w-0">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="m-0 text-[14px] font-semibold">{t('tabs.uploadReviews')}</h2>
          <span className="text-[12px] text-(--color-text-subtle)">{t('uploadReview.total', { count: total })}</span>
        </div>
        {error && (
          <div className="mb-3 rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
            {error}
          </div>
        )}
        <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
          {loading && events.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">
              {t('uploader.loading')}
            </div>
          ) : events.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-(--color-text-subtle)">
              {t('uploader.empty')}
            </div>
          ) : (
            <ul className="divide-y divide-(--color-border)">
              {events.map((ev) => (
                <li key={ev.eventId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(ev.eventId)}
                    className={`flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-(--color-surface-alt) ${
                      selectedId === ev.eventId ? 'bg-(--color-surface-alt)' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-(--radius-sm) bg-(--color-warning)/10 px-2 py-[2px] text-[11px] font-semibold text-(--color-warning)">
                          {t('event.status.pending')}
                        </span>
                        <PhaseBadge phase={ev.phase} />
                        <span className="text-[12px] text-(--color-text-subtle)">
                          {ev.category.name} · {ev.region.sido}
                          {ev.region.sigungu ? ` ${ev.region.sigungu}` : ''}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[14px] font-medium text-(--color-text)">
                        {ev.title}
                      </div>
                      <div className="mt-0.5 tabular text-[12px] text-(--color-text-subtle)">
                        {ev.startDate} ~ {ev.endDate}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <aside className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4 md:sticky md:top-4 md:h-fit">
        {selected ? (
          <UploadReviewPanel event={selected} onDecided={onDecided} />
        ) : (
          <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">
            {t('uploadReview.selectHint')}
          </div>
        )}
      </aside>
    </div>
  );
}
