import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  deleteMyReview,
  fetchMyReviews,
  type MyReviewItem,
} from '../../../lib/api';
import { EmptyBox } from '../parts/EmptyBox.js';
import { ReviewCard } from '../parts/ReviewCard.js';
import { SkeletonList } from '../parts/SkeletonList.js';

export function ReviewsList() {
  const { t } = useTranslation('mypage');
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    items: MyReviewItem[];
    total: number;
  }>({ loading: true, error: null, items: [], total: 0 });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ loading: true, error: null, items: [], total: 0 });
    fetchMyReviews({ limit: 50 }, ctrl.signal)
      .then((r) => setState({ loading: false, error: null, items: r.items, total: r.total }))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setState({ loading: false, error: (err as Error).message, items: [], total: 0 });
      });
    return () => ctrl.abort();
  }, []);

  if (state.loading) return <SkeletonList />;
  if (state.error) return <EmptyBox label={t('review.loadError')} hint={state.error} />;
  if (state.items.length === 0)
    return (
      <EmptyBox
        label={t('review.empty')}
        hint={t('review.hint')}
      />
    );

  const handleDelete = async (reviewId: string) => {
    if (!window.confirm(t('review.deleteConfirm'))) return;
    try {
      await deleteMyReview(reviewId);
      setState((prev) => ({
        ...prev,
        items: prev.items.filter((r) => r.reviewId !== reviewId),
        total: Math.max(0, prev.total - 1),
      }));
    } catch (err) {
      window.alert(t('review.deleteFailed', { message: (err as Error).message }));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="tabular m-0 mb-1 text-[12px] text-(--color-text-subtle)">
        {t('review.totalCount', { count: state.total.toLocaleString() })}
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {state.items.map((r) => (
          <li key={r.reviewId}>
            <ReviewCard item={r} onDelete={() => void handleDelete(r.reviewId)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
