import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ActionButton } from 'seed-design/ui/action-button';
import { CommunityShell, CATEGORY_LABELS } from '../CommunityPage/parts/CommunityShell.js';
import { MateRecoPlaceholder } from '../CommunityPage/parts/MateRecoPlaceholder.js';
import { ComposeModal } from '../CommunityPage/parts/ComposeModal.js';
import { CommentTree } from './parts/CommentTree.js';
import { CommentComposer } from './parts/CommentComposer.js';
import { AuthorProfileModal } from './parts/AuthorProfileModal.js';
import {
  fetchPostDetail,
  togglePostLike,
  deletePost,
  type PostDetail,
} from '../../lib/api/posts.js';
import { useCurrentUser } from '../../lib/auth-context';

/**
 * GG-COMM-005, GG-POST-001~009: 게시글 상세 페이지.
 * - 본문 / 작성자 / 작성일 / 좋아요 하트 토글 / 댓글+대댓글(depth 1) / 댓글 작성.
 * - 작성자 클릭 → AuthorProfileModal (닉네임 실데이터, 메이트지수·채팅신청 placeholder).
 * - 본인 글: 수정(ComposeModal edit 모드 재사용, /edit 라우트 없음) / 삭제.
 */
export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const [detail, setDetail] = useState<PostDetail | null>(null);
  const [error, setError] = useState<'NOT_FOUND' | 'ERROR' | null>(null);
  const [loading, setLoading] = useState(true);
  const [likeLoading, setLikeLoading] = useState(false);
  const [modalAuthor, setModalAuthor] = useState<{ nickname: string; userId: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const reload = useCallback(
    (signal?: AbortSignal) => {
      if (!id) return;
      fetchPostDetail(id, signal)
        .then((d) => {
          setDetail(d);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if ((e as Error).name === 'AbortError') return;
          setError((e as Error).message === 'NOT_FOUND' ? 'NOT_FOUND' : 'ERROR');
          setLoading(false);
        });
    },
    [id],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    reload(ctrl.signal);
    return () => ctrl.abort();
  }, [reload]);

  /** GG-POST-006: 좋아요 토글 */
  const onLike = async () => {
    if (!detail) return;
    setLikeLoading(true);
    try {
      const r = await togglePostLike(detail.postId);
      setDetail({ ...detail, liked: r.liked, likeCount: r.likeCount });
    } catch (e) {
      if ((e as Error).message === 'UNAUTHENTICATED') alert('로그인이 필요해요.');
    } finally {
      setLikeLoading(false);
    }
  };

  /** GG-POST-005: 게시글 삭제 */
  const onDeletePost = async () => {
    if (!detail || !confirm('게시글을 삭제할까요?')) return;
    try {
      await deletePost(detail.postId);
      navigate('/community');
    } catch (e) {
      if ((e as Error).message === 'FORBIDDEN') alert('본인 글이 아니에요.');
      else alert('삭제하지 못했어요.');
    }
  };

  return (
    <CommunityShell rightRail={<MateRecoPlaceholder />}>
      {/* 로딩 상태 */}
      {loading && (
        <div className="py-12 text-center text-[14px] text-(--color-text-muted)">불러오는 중…</div>
      )}

      {/* 오류 상태 */}
      {error === 'NOT_FOUND' && (
        <div className="py-12 text-center text-[14px] text-(--color-text-muted)">
          존재하지 않거나 만료된 게시글이에요.
        </div>
      )}
      {error === 'ERROR' && (
        <div className="py-12 text-center text-[14px] text-(--color-text-muted)">
          불러오지 못했어요.
        </div>
      )}

      {/* 게시글 본문 */}
      {detail && (
        <article className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-5">
          {/* 카테고리 뱃지 */}
          <span className="mb-2 inline-block rounded-(--radius-sm) bg-(--color-bg) px-2 py-0.5 text-[11px] text-(--color-text-muted)">
            {CATEGORY_LABELS[detail.category] ?? detail.category}
          </span>

          {/* 제목 */}
          <h1 className="mb-1 text-(length:--text-h2) font-semibold">{detail.title}</h1>

          {/* 작성자 / 작성일 — GG-POST-008: 닉네임 클릭 → 프로필 모달 */}
          <div className="mb-4 flex items-center gap-2 text-[12px] text-(--color-text-muted)">
            <button
              type="button"
              onClick={() => setModalAuthor({ nickname: detail.authorNickname, userId: detail.authorUserId })}
              className="font-medium text-(--color-text) hover:underline"
            >
              {detail.authorNickname}
            </button>
            <span>{new Date(detail.createdAt).toLocaleDateString()}</span>
          </div>

          {/* 본문 */}
          <p className="mb-5 whitespace-pre-wrap text-[15px] leading-relaxed">{detail.body}</p>

          {/* 좋아요 / 수정 / 삭제 액션 */}
          <div className="flex items-center gap-2">
            {/* GG-POST-006: 좋아요 토글 — SEED ActionButton accent when liked */}
            <ActionButton
              variant={detail.liked ? 'brandSolid' : 'neutralOutline'}
              size="small"
              onClick={onLike}
              loading={likeLoading}
              disabled={likeLoading}
              aria-label={detail.liked ? '좋아요 취소' : '좋아요'}
              aria-pressed={detail.liked}
            >
              ♥ {detail.likeCount}
            </ActionButton>

            {detail.isMine && (
              <>
                {/* GG-POST-004: 수정 — 별도 /edit 라우트 없이 ComposeModal edit 모드 재사용 (YAGNI). */}
                <ActionButton
                  variant="neutralOutline"
                  size="small"
                  onClick={() => setEditOpen(true)}
                >
                  수정
                </ActionButton>
                {/* GG-POST-005: 삭제 */}
                <ActionButton
                  variant="neutralOutline"
                  size="small"
                  onClick={onDeletePost}
                >
                  삭제
                </ActionButton>
              </>
            )}
          </div>

          {/* 댓글 섹션 */}
          <section className="mt-6 border-t border-(--color-border) pt-4">
            <h2 className="mb-3 text-[15px] font-semibold">
              댓글 {detail.commentCount > 0 ? `(${detail.commentCount})` : ''}
            </h2>

            {/* GG-POST-001: 댓글 작성 — 로그인 사용자만 */}
            {user && (
              <div className="mb-4">
                <CommentComposer postId={detail.postId} onCreated={() => reload()} />
              </div>
            )}

            {/* GG-POST-002/003: 댓글+대댓글 트리 */}
            <CommentTree
              comments={detail.comments}
              postId={detail.postId}
              onAuthorClick={(nickname, userId) => setModalAuthor({ nickname, userId })}
              onChanged={() => reload()}
            />
          </section>
        </article>
      )}

      {/* GG-POST-008: 작성자 프로필 모달 */}
      {modalAuthor && (
        <AuthorProfileModal
          nickname={modalAuthor.nickname}
          authorUserId={modalAuthor.userId}
          onClose={() => setModalAuthor(null)}
        />
      )}

      {/* GG-POST-004: 수정 모달 — ComposeModal edit 모드 */}
      {editOpen && detail && (
        <ComposeModal
          editPost={detail}
          onClose={() => setEditOpen(false)}
          onCreated={() => {
            setEditOpen(false);
            reload();
          }}
        />
      )}
    </CommunityShell>
  );
}
