import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchMyBookmarks,
  type BookmarkListItem,
} from '../../../lib/api';
import { BookmarkCard } from '../parts/BookmarkCard.js';
import { EmptyBox } from '../parts/EmptyBox.js';
import { SkeletonList } from '../parts/SkeletonList.js';

export function BookmarksList() {
  const { t } = useTranslation('mypage');
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    items: BookmarkListItem[];
    total: number;
  }>({ loading: true, error: null, items: [], total: 0 });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ loading: true, error: null, items: [], total: 0 });
    fetchMyBookmarks({ limit: 50 }, ctrl.signal)
      .then((r) => setState({ loading: false, error: null, items: r.items, total: r.total }))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setState({ loading: false, error: (err as Error).message, items: [], total: 0 });
      });
    return () => ctrl.abort();
  }, []);

  if (state.loading) return <SkeletonList />;
  if (state.error) return <EmptyBox label={t('bookmark.loadError')} hint={state.error} />;
  if (state.items.length === 0)
    return <EmptyBox label={t('bookmark.empty')} hint="지도에서 마음에 드는 이벤트를 북마크해 보세요." />;

  return (
    <div className="flex flex-col gap-2">
      <p className="tabular m-0 mb-1 text-[12px] text-(--color-text-subtle)">
        {state.total.toLocaleString()}개
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {state.items.map((b) => (
          <li key={b.bookmarkId}>
            <BookmarkCard item={b} />
          </li>
        ))}
      </ul>
    </div>
  );
}
