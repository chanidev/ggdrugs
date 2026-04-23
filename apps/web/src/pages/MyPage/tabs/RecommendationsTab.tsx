import { useEffect, useState } from 'react';
import {
  fetchMyRecommendations,
  type MyRecommendationsResponse,
} from '../../../lib/api';
import { EmptyBox } from '../parts/EmptyBox.js';
import { RecommendedCard } from '../parts/RecommendedCard.js';
import { SkeletonList } from '../parts/SkeletonList.js';

export function RecommendationsList() {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    data: MyRecommendationsResponse | null;
  }>({ loading: true, error: null, data: null });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ loading: true, error: null, data: null });
    fetchMyRecommendations({ limit: 20 }, ctrl.signal)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((e) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setState({ loading: false, error: (e as Error).message, data: null });
      });
    return () => ctrl.abort();
  }, []);

  if (state.loading) return <SkeletonList />;
  if (state.error) return <EmptyBox label="불러오지 못했어요" hint={state.error} />;
  if (!state.data) return null;

  if (state.data.reason === 'no_taste_signals') {
    return (
      <EmptyBox
        label="아직 추천을 만들 시그널이 부족해요"
        hint="이벤트를 북마크하거나 리뷰를 남기면, 매일 한 번 그 데이터로 취향을 분석해 추천을 보여드려요."
      />
    );
  }
  if (state.data.items.length === 0) {
    return (
      <EmptyBox
        label="조건에 맞는 새 이벤트가 없어요"
        hint="며칠 내로 새 이벤트가 등록되면 다시 표시됩니다."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[12px] text-(--color-text-subtle)">
        {state.data.items.length}건 · 매일 자동 갱신
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {state.data.items.map((ev) => (
          <li key={ev.eventId}>
            <RecommendedCard item={ev} />
          </li>
        ))}
      </ul>
    </div>
  );
}
