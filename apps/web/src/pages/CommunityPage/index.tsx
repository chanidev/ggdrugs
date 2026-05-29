import { useCallback, useEffect, useState } from 'react';
import { CommunityShell } from './parts/CommunityShell.js';
import { CategoryGrid, type CategoryFilter } from './parts/CategoryGrid.js';
import { PostList } from './parts/PostList.js';
import { MateRecoPlaceholder } from './parts/MateRecoPlaceholder.js';
import { ComposeModal } from './parts/ComposeModal.js';
import { fetchPosts, type PostListItem } from '../../lib/api/posts.js';
import { useCurrentUser } from '../../lib/auth-context';
import { ActionButton } from 'seed-design/ui/action-button';

/**
 * CommunityPage — A_800 커뮤니티 게시판.
 *
 * GG-COMM-001: 커뮤니티 진입 (라우트 /community)
 * GG-COMM-002: 글쓰기 — 비로그인 시 disabled + title 로그인 유도 (숨김 대신 노출, 서버는 requireAuth로 최종 차단)
 * GG-COMM-003: 카테고리 탭 전환 (SEED SegmentedControl)
 * GG-COMM-004: 게시글 목록 (카테고리 필터 + AbortController cleanup)
 * GG-COMM-005: 목록 → 상세 진입 (Link to /community/posts/:id)
 */
export function CommunityPage() {
  const { user } = useCurrentUser();
  const [cat, setCat] = useState<CategoryFilter>('all');
  const [items, setItems] = useState<PostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const load = useCallback((c: CategoryFilter, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    fetchPosts(c === 'all' ? {} : { category: c }, signal)
      .then((r) => {
        setItems(r.items);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') {
          setError('ERROR');
          setLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(cat, ctrl.signal);
    // cleanup — 카테고리 전환 시 이전 요청 취소.
    return () => ctrl.abort();
  }, [cat, load]);

  return (
    <CommunityShell rightRail={<MateRecoPlaceholder />}>
      <CategoryGrid active={cat} onSelect={setCat} />
      <div className="mb-3 flex justify-end">
        {/* GG-COMM-002 글쓰기 — 비로그인은 disabled + 로그인 유도 (숨김 대신 노출).
            <span title>로 감싸 시각적 tooltip 보장(disabled 시 브라우저 title 억제).
            aria-label은 disabled에서도 스크린리더에 노출되므로 로그인 유도 문구 유지. */}
        <span title={user ? undefined : '로그인이 필요해요'}>
          <ActionButton
            variant="brandSolid"
            size="medium"
            onClick={() => {
              if (user) setComposeOpen(true);
            }}
            disabled={!user}
            aria-label={user ? undefined : '로그인이 필요해요'}
          >
            글쓰기
          </ActionButton>
        </span>
      </div>
      <PostList items={items} loading={loading} error={error} />
      {composeOpen && (
        <ComposeModal
          defaultCategory={cat === 'all' ? 'free' : cat}
          onClose={() => setComposeOpen(false)}
          onCreated={() => {
            setComposeOpen(false);
            load(cat);
          }}
        />
      )}
    </CommunityShell>
  );
}
