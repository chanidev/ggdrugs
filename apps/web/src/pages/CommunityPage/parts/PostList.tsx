import { Link } from 'react-router';
import type { PostListItem } from '../../../lib/api/posts.js';
import { CATEGORY_LABELS } from './CommunityShell.js';

/**
 * PostList — GG-COMM-004/005 게시글 목록 + 상세 진입.
 *
 * 좋아요 표시: 목록 응답에 liked(본인 여부)가 없으므로 카운트만 표시.
 * liked 상태는 상세(PostDetail)에서만 토글 — 후속 확장 시 listPosts에 조인 필요.
 */
export function PostList({
  items,
  loading,
  error,
}: {
  items: PostListItem[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="py-12 text-center text-(--color-text-muted)">불러오는 중…</div>
    );
  }
  if (error) {
    return (
      <div className="py-12 text-center text-(--color-text-muted)">불러오지 못했어요</div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-(--color-text-muted)">아직 게시글이 없어요</div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-(--color-border) rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
      {items.map((p) => (
        <li key={p.postId}>
          {/* GG-COMM-005 게시글 상세 진입 */}
          <Link
            to={`/community/posts/${p.postId}`}
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-(--color-bg)"
          >
            <div className="min-w-0">
              <span className="mr-2 rounded-(--radius-sm) bg-(--color-bg) px-1.5 py-0.5 text-[11px] text-(--color-text-muted)">
                {CATEGORY_LABELS[p.category] ?? p.category}
              </span>
              <span className="text-[15px]">{p.title}</span>
              <div className="mt-1 truncate text-[12px] text-(--color-text-muted)">
                {p.authorNickname} · 댓글 {p.commentCount} · 하트 {p.likeCount}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
