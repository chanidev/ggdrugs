import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ReportModal } from '../../../components/ReportModal.js';
import type { PostListItem } from '../../../lib/api/posts.js';
import { CATEGORY_LABELS } from './CommunityShell.js';

/**
 * PostList — GG-COMM-004/005 게시글 목록 + 상세 진입.
 *
 * 좋아요 표시: 목록 응답에 liked(본인 여부)가 없으므로 카운트만 표시.
 * liked 상태는 상세(PostDetail)에서만 토글 — 후속 확장 시 listPosts에 조인 필요.
 *
 * GG-REPORT-001: 각 게시글 우측 3-dot 메뉴에 "신고" 옵션 추가 (본인 글 제외).
 */
export function PostList({
  items,
  loading,
  error,
  currentUserId,
}: {
  items: PostListItem[];
  loading: boolean;
  error: string | null;
  /** 현재 로그인 유저 ID (없으면 신고 미노출) */
  currentUserId?: string;
}) {
  const { t } = useTranslation('community');
  const [reportTarget, setReportTarget] = useState<{
    postId: string;
    authorUserId: string;
  } | null>(null);

  if (loading) {
    return (
      <div className="py-12 text-center text-(--color-text-muted)">{t('postList.loadError')}</div>
    );
  }
  if (error) {
    return (
      <div className="py-12 text-center text-(--color-text-muted)">{t('postList.loadError')}</div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-(--color-text-muted)">{t('postList.empty')}</div>
    );
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-(--color-border) rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
        {items.map((p) => {
          const isMyPost = currentUserId != null && p.authorUserId === currentUserId;
          return (
            <li key={p.postId} className="relative">
              {/* GG-COMM-005 게시글 상세 진입 */}
              <Link
                to={`/community/posts/${p.postId}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-(--color-bg) pr-10"
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

              {/* GG-REPORT-001: 3-dot 신고 버튼 (타인 글 + 로그인 시만) */}
              {currentUserId && !isMyPost && (
                <button
                  type="button"
                  aria-label={`${p.title} 게시글 신고`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setReportTarget({ postId: p.postId, authorUserId: p.authorUserId });
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-(--radius-sm) text-[16px] text-(--color-text-subtle) hover:bg-(--color-surface-alt) hover:text-(--color-text-muted)"
                  title="신고"
                >
                  ⋯
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* GG-REPORT-001: 신고 모달 */}
      {reportTarget && (
        <ReportModal
          open
          onClose={() => setReportTarget(null)}
          targetType="post"
          targetEntityId={reportTarget.postId}
          targetUserId={reportTarget.authorUserId}
          onSuccess={() => setReportTarget(null)}
        />
      )}
    </>
  );
}
