import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchMyRecommendations,
  type MyRecommendationsResponse,
} from '../../../lib/api';
import { EmptyBox } from '../parts/EmptyBox.js';
import { RecommendedCard } from '../parts/RecommendedCard.js';
import { SkeletonList } from '../parts/SkeletonList.js';

export function RecommendationsList() {
  const { t } = useTranslation('mypage');
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
  if (state.error) return <EmptyBox label={t('reco.loadError')} hint={state.error} />;
  if (!state.data) return null;

  if (state.data.reason === 'no_taste_signals') {
    return (
      <EmptyBox
        label={t('reco.noSignal')}
        hint={t('reco.noSignalHint')}
      />
    );
  }
  if (state.data.items.length === 0) {
    return (
      <EmptyBox
        label={t('reco.empty')}
        hint={t('reco.emptyHint')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[12px] text-(--color-text-subtle)">
        {state.data.items.length}{t('reco.autoRefresh')}
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
