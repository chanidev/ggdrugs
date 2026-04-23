import { useEffect, useState } from 'react';
import {
  deleteSubscription,
  fetchMySubscriptions,
  toggleSubscription,
  type MySubscription,
} from '../../../lib/api';
import { EmptyBox } from '../parts/EmptyBox.js';
import { SkeletonList } from '../parts/SkeletonList.js';

const COMPANION_LABELS: Record<string, string> = {
  solo: '혼자',
  couple: '연인',
  friend: '친구',
  family: '가족',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  festival: '축제',
  expo: '박람회',
  symposium: '심포지움',
  conference: '컨퍼런스',
  exhibition: '전시',
  performance: '공연',
  education: '교육',
  movie: '영화',
};

function summarizeSubscription(s: MySubscription): string {
  const parts: string[] = [];
  if (s.regionIds.length > 0) parts.push(`지역 ${s.regionIds.length}개`);
  if (s.companions.length > 0) {
    parts.push(s.companions.map((c) => COMPANION_LABELS[c] ?? c).join('·'));
  }
  if (s.eventTypes.length > 0) {
    parts.push(s.eventTypes.map((t) => EVENT_TYPE_LABELS[t] ?? t).join('·'));
  }
  if (s.vibeIds.length > 0) parts.push(`성향 ${s.vibeIds.length}개`);
  if (s.periodMonths != null) parts.push(`${s.periodMonths}개월 이내`);
  return parts.length > 0 ? parts.join(' · ') : '모든 조건 (매우 광범위)';
}

export function SubscriptionsList() {
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
      window.alert(`변경 실패: ${(e as Error).message}`);
    } finally {
      setPendingId(null);
    }
  };

  const onDelete = async (s: MySubscription) => {
    if (!window.confirm('이 구독을 삭제할까요?')) return;
    setPendingId(s.subscriptionId);
    try {
      await deleteSubscription(s.subscriptionId);
      setState((prev) => ({
        ...prev,
        items: prev.items.filter((x) => x.subscriptionId !== s.subscriptionId),
      }));
    } catch (e) {
      window.alert(`삭제 실패: ${(e as Error).message}`);
    } finally {
      setPendingId(null);
    }
  };

  if (state.loading) return <SkeletonList />;
  if (state.error) return <EmptyBox label="불러오지 못했어요" hint={state.error} />;
  if (state.items.length === 0) {
    return (
      <EmptyBox
        label="구독한 조건이 없어요"
        hint="필터 검색 패널의 '이 조건 구독' 버튼으로 만들 수 있어요."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="tabular m-0 mb-1 text-[12px] text-(--color-text-subtle)">
        {state.items.length}개 구독. 새 이벤트가 조건에 맞으면 알림으로 받아요.
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
                      {s.isActive ? '활성' : '정지'}
                    </span>
                    <span className="tabular text-[11px] text-(--color-text-subtle)">
                      등록 {s.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  <p className="m-0 mt-1 text-[14px] text-(--color-text)">
                    {summarizeSubscription(s)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => void onToggle(s)}
                    disabled={pendingId === s.subscriptionId}
                    className="inline-flex h-7 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2 text-[12px] font-medium text-(--color-text-muted) hover:border-(--color-border-hover) hover:text-(--color-text) disabled:opacity-40"
                  >
                    {s.isActive ? '정지' : '재개'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(s)}
                    disabled={pendingId === s.subscriptionId}
                    className="inline-flex h-7 items-center rounded-(--radius-md) px-2 text-[12px] font-medium text-(--color-text-subtle) hover:bg-(--color-surface-alt) hover:text-(--color-error) disabled:opacity-40"
                  >
                    삭제
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
