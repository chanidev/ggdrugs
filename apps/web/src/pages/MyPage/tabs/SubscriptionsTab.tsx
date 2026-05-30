import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  deleteSubscription,
  fetchMySubscriptions,
  toggleSubscription,
  type MySubscription,
} from '../../../lib/api';
import { EmptyBox } from '../parts/EmptyBox.js';
import { SkeletonList } from '../parts/SkeletonList.js';

function useSummarizeSubscription() {
  const { t } = useTranslation('mypage');

  return function summarizeSubscription(s: MySubscription): string {
    const parts: string[] = [];
    if (s.regionIds.length > 0) parts.push(t('subscription.regionCount', { count: s.regionIds.length }));
    if (s.companions.length > 0) {
      parts.push(s.companions.map((c) => t(`subscription.companionType.${c}`, { defaultValue: c })).join('·'));
    }
    if (s.eventTypes.length > 0) {
      parts.push(s.eventTypes.map((et) => t(`subscription.eventType.${et}`, { defaultValue: et })).join('·'));
    }
    if (s.vibeIds.length > 0) parts.push(t('subscription.vibeCount', { count: s.vibeIds.length }));
    if (s.periodMonths != null) parts.push(t('subscription.periodMonths', { count: s.periodMonths }));
    return parts.length > 0 ? parts.join(' · ') : t('subscription.allConditions');
  };
}

export function SubscriptionsList() {
  const { t } = useTranslation('mypage');
  const summarize = useSummarizeSubscription();
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    items: MySubscription[];
  }>({ loading: true, error: null, items: [] });
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ loading: true, error: null, items: [] });
    fetchMySubscriptions(ctrl.signal)
      .then((items) => setState({ loading: false, error: null, items }))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setState({ loading: false, error: (err as Error).message, items: [] });
      });
    return () => ctrl.abort();
  }, []);

  const onToggle = async (s: MySubscription) => {
    setPendingId(s.subscriptionId);
    try {
      const next = await toggleSubscription(s.subscriptionId, !s.isActive);
      setState((prev) => ({
        ...prev,
        items: prev.items.map((x) => (x.subscriptionId === s.subscriptionId ? next : x)),
      }));
    } catch (e) {
      window.alert(t('subscription.toggleFailed', { message: (e as Error).message }));
    } finally {
      setPendingId(null);
    }
  };

  const onDelete = async (s: MySubscription) => {
    if (!window.confirm(t('subscription.deleteConfirm'))) return;
    setPendingId(s.subscriptionId);
    try {
      await deleteSubscription(s.subscriptionId);
      setState((prev) => ({
        ...prev,
        items: prev.items.filter((x) => x.subscriptionId !== s.subscriptionId),
      }));
    } catch (e) {
      window.alert(t('subscription.deleteFailed', { message: (e as Error).message }));
    } finally {
      setPendingId(null);
    }
  };

  if (state.loading) return <SkeletonList />;
  if (state.error) return <EmptyBox label={t('subscription.loadError')} hint={state.error} />;
  if (state.items.length === 0) {
    return (
      <EmptyBox
        label={t('subscription.noCondition')}
        hint={t('subscription.noConditionHint')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="tabular m-0 mb-1 text-[12px] text-(--color-text-subtle)">
        {t('subscription.count', { count: state.items.length })}
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {state.items.map((s) => (
          <li key={s.subscriptionId}>
            <article
              className={`flex flex-col gap-2 rounded-(--radius-lg) border bg-(--color-surface) p-4 transition-colors ${
                s.isActive ? 'border-(--color-border)' : 'border-(--color-border) opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-(--radius-sm) px-2 py-[2px] text-[11px] font-semibold ${
                        s.isActive
                          ? 'bg-(--color-success)/10 text-(--color-success)'
                          : 'bg-(--color-surface-alt) text-(--color-text-subtle)'
                      }`}
                    >
                      {s.isActive ? t('subscription.active') : t('subscription.inactive')}
                    </span>
                    <span className="tabular text-[11px] text-(--color-text-subtle)">
                      {t('subscription.registered')} {s.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  <p className="m-0 mt-1 text-[14px] text-(--color-text)">
                    {summarize(s)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => void onToggle(s)}
                    disabled={pendingId === s.subscriptionId}
                    className="inline-flex h-7 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2 text-[12px] font-medium text-(--color-text-muted) hover:border-(--color-border-hover) hover:text-(--color-text) disabled:opacity-40"
                  >
                    {s.isActive ? t('subscription.pause') : t('subscription.resume')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(s)}
                    disabled={pendingId === s.subscriptionId}
                    className="inline-flex h-7 items-center rounded-(--radius-md) px-2 text-[12px] font-medium text-(--color-text-subtle) hover:bg-(--color-surface-alt) hover:text-(--color-error) disabled:opacity-40"
                  >
                    {t('subscription.deleteButton')}
                  </button>
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
