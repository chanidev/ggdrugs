import { useEffect, useState } from 'react';
import {
  deleteMyReview,
  fetchMyReviews,
  type MyReviewItem,
} from '../../../lib/api';
import { EmptyBox } from '../parts/EmptyBox.js';
import { ReviewCard } from '../parts/ReviewCard.js';
import { SkeletonList } from '../parts/SkeletonList.js';

export function ReviewsList() {
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
  if (state.error) return <EmptyBox label="불러오지 못했어요" hint={state.error} />;
  if (state.items.length === 0)
    return (
      <EmptyBox
        label="아직 작성한 리뷰가 없어요"
        hint="상세 페이지에서 별점과 짧은 후기를 남겨 보세요."
      />
    );

  const handleDelete = async (reviewId: string) => {
    if (!window.confirm('리뷰를 삭제할까요? 되돌릴 수 없어요.')) return;
    try {
      await deleteMyReview(reviewId);
      setState((prev) => ({
        ...prev,
        items: prev.items.filter((r) => r.reviewId !== reviewId),
        total: Math.max(0, prev.total - 1),
      }));
    } catch (err) {
      window.alert(`삭제 실패: ${(err as Error).message}`);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="tabular m-0 mb-1 text-[12px] text-(--color-text-subtle)">
        {state.total.toLocaleString()}개
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
