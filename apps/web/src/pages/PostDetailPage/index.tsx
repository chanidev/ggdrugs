import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ActionButton } from 'seed-design/ui/action-button';
import * as Dialog from 'seed-design/ui/dialog';
import { SegmentedControl, SegmentedControlItem } from 'seed-design/ui/segmented-control';
import { CommunityShell } from '../CommunityPage/parts/CommunityShell.js';
import { MateRecoPlaceholder } from '../CommunityPage/parts/MateRecoPlaceholder.js';
import { ComposeModal } from '../CommunityPage/parts/ComposeModal.js';
import { CommentTree } from './parts/CommentTree.js';
import { CommentComposer } from './parts/CommentComposer.js';
import { AuthorProfileModal } from './parts/AuthorProfileModal.js';
import { ReportModal } from '../../components/ReportModal.js';
import {
  fetchPostDetail,
  togglePostLike,
  deletePost,
  type PostDetail,
  type TranslateLang,
} from '../../lib/api/posts.js';
import { translatePostContent, type PostTranslationResponse } from '../../lib/api/translate.js';
import { useCurrentUser } from '../../lib/auth-context';

/**
 * GG-COMM-005, GG-POST-001~009: 게시글 상세 페이지.
 * - 본문 / 작성자 / 작성일 / 좋아요 하트 토글 / 댓글+대댓글(depth 1) / 댓글 작성.
 * - 작성자 클릭 → AuthorProfileModal (닉네임 실데이터, 메이트지수·채팅신청 placeholder).
 * - 본인 글: 수정(ComposeModal edit 모드 재사용, /edit 라우트 없음) / 삭제.
 */
export function PostDetailPage() {
  const { t } = useTranslation('community');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const [detail, setDetail] = useState<PostDetail | null>(null);
  const [error, setError] = useState<'NOT_FOUND' | 'ERROR' | null>(null);
  const [loading, setLoading] = useState(true);
  const [likeLoading, setLikeLoading] = useState(false);
  const [modalAuthor, setModalAuthor] = useState<{ nickname: string; userId: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateLang, setTranslateLang] = useState<TranslateLang>('en');
  const [translateResult, setTranslateResult] = useState<PostTranslationResponse | null>(null);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

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
      if ((e as Error).message === 'UNAUTHENTICATED') alert(t('common:error.loginRequired'));
    } finally {
      setLikeLoading(false);
    }
  };

  /** GG-POST-005: 게시글 삭제 */
  const onDeletePost = async () => {
    if (!detail || !confirm(t('post.deleteConfirm'))) return;
    try {
      await deletePost(detail.postId);
      navigate('/community');
    } catch (e) {
      if ((e as Error).message === 'FORBIDDEN') alert(t('post.deleteForbidden'));
      else alert(t('post.deleteFail'));
    }
  };

  /** GG-COMM-013: 게시글 번역 (LLM + BFF Redis 24h 캐시) */
  const onTranslate = async (lang: TranslateLang) => {
    if (!detail) return;
    setTranslateLoading(true);
    setTranslateError(null);
    setTranslateResult(null);
    try {
      const result = await translatePostContent(detail.postId, lang);
      setTranslateResult(result);
    } catch (e) {
      setTranslateError(
        (e as Error).message === 'LLM_UNAVAILABLE'
          ? t('post.translateUnavailable')
          : t('post.translateError'),
      );
    } finally {
      setTranslateLoading(false);
    }
  };

  return (
    <CommunityShell rightRail={<MateRecoPlaceholder />}>
      {/* 로딩 상태 */}
      {loading && (
        <div className="py-12 text-center text-[14px] text-(--color-text-muted)">{t('post.loading')}</div>
      )}

      {/* 오류 상태 */}
      {error === 'NOT_FOUND' && (
        <div className="py-12 text-center text-[14px] text-(--color-text-muted)">
          {t('post.notFound')}
        </div>
      )}
      {error === 'ERROR' && (
        <div className="py-12 text-center text-[14px] text-(--color-text-muted)">
          {t('post.loadError')}
        </div>
      )}

      {/* 게시글 본문 */}
      {detail && (
        <article className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-5">
          {/* 카테고리 뱃지 */}
          <span className="mb-2 inline-block rounded-(--radius-sm) bg-(--color-bg) px-2 py-0.5 text-[11px] text-(--color-text-muted)">
            {t(`category.${detail.category}`, { defaultValue: detail.category })}
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
              aria-label={detail.liked ? t('post.likeAriaPressed') : t('post.likeAriaUnpressed')}
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
                  {t('common:button.edit')}
                </ActionButton>
                {/* GG-POST-005: 삭제 */}
                <ActionButton
                  variant="neutralOutline"
                  size="small"
                  onClick={onDeletePost}
                >
                  {t('common:button.delete')}
                </ActionButton>
              </>
            )}
            {/* GG-REPORT-001: 타인 게시글 신고 */}
            {!detail.isMine && user && (
              <ActionButton
                variant="neutralOutline"
                size="small"
                onClick={() => setReportOpen(true)}
              >
                {t('common:button.report')}
              </ActionButton>
            )}
            {/* GG-COMM-013: 번역하기 */}
            <ActionButton
              variant="neutralOutline"
              size="small"
              onClick={() => {
                setTranslateResult(null);
                setTranslateError(null);
                setTranslateOpen(true);
              }}
            >
              {t('common:button.translate')}
            </ActionButton>
          </div>

          {/* 댓글 섹션 */}
          <section className="mt-6 border-t border-(--color-border) pt-4">
            <h2 className="mb-3 text-[15px] font-semibold">
              {detail.commentCount > 0
                ? t('post.commentCount', { count: detail.commentCount })
                : t('post.commentSection')}
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
              {...(user?.userId ? { currentUserId: user.userId } : {})}
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

      {/* GG-REPORT-001: 게시글 신고 모달 */}
      {detail && (
        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="post"
          targetEntityId={detail.postId}
          targetUserId={detail.authorUserId}
          onSuccess={() => setReportOpen(false)}
        />
      )}

      {/* GG-COMM-013: 번역 모달 */}
      {translateOpen && detail && (
        <Dialog.Root open onOpenChange={(open) => { if (!open) setTranslateOpen(false); }}>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content className="w-[520px] max-w-[92vw]">
              <Dialog.Header>
                <Dialog.Title>{t('post.translateTitle')}</Dialog.Title>
              </Dialog.Header>
              <div className="flex flex-col gap-4 px-5 pb-2">
                {/* 언어 선택 */}
                {!translateResult && (
                  <>
                    <p className="text-[13px] text-(--color-text-muted)">{t('post.translateSelectLang')}</p>
                    <SegmentedControl
                      value={translateLang}
                      onValueChange={(v) => setTranslateLang(v as TranslateLang)}
                    >
                      {(['en', 'vi', 'zh', 'ja', 'fr'] as TranslateLang[]).map((l) => (
                        <SegmentedControlItem key={l} value={l}>
                          {l.toUpperCase()}
                        </SegmentedControlItem>
                      ))}
                    </SegmentedControl>
                  </>
                )}
                {/* 번역 결과 */}
                {translateResult && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="mb-1 text-[11px] font-medium text-(--color-text-subtle)">{t('post.translateOriginal')}</p>
                      <p className="text-[14px] font-semibold">{detail.title}</p>
                      <p className="mt-1 text-[13px] text-(--color-text-muted)">{detail.body}</p>
                    </div>
                    <div className="border-t border-(--color-border) pt-3">
                      <p className="mb-1 text-[11px] font-medium text-(--color-text-subtle)">{t('post.translateResult')}</p>
                      {/* 제목 번역은 미지원(BFF 응답에 translatedTitle 없음) — 본문만 표시. */}
                      <p className="mt-1 whitespace-pre-wrap text-[13px] text-(--color-text-muted)">{translateResult.translatedBody}</p>
                    </div>
                  </div>
                )}
                {/* 오류 */}
                {translateError && (
                  <p role="alert" className="text-[13px] text-(--color-error)">{translateError}</p>
                )}
                {/* 로딩 */}
                {translateLoading && (
                  <p className="text-[13px] text-(--color-text-muted)">{t('post.translateLoading')}</p>
                )}
              </div>
              <Dialog.Footer>
                <ActionButton
                  variant="neutralOutline"
                  size="medium"
                  onClick={() => setTranslateOpen(false)}
                >
                  {t('post.translateClose')}
                </ActionButton>
                {translateResult ? (
                  <ActionButton
                    variant="neutralOutline"
                    size="medium"
                    onClick={() => { setTranslateResult(null); setTranslateError(null); }}
                  >
                    {t('post.translateAnother')}
                  </ActionButton>
                ) : (
                  <ActionButton
                    variant="brandSolid"
                    size="medium"
                    loading={translateLoading}
                    disabled={translateLoading}
                    onClick={() => { void onTranslate(translateLang); }}
                  >
                    {t('common:button.translate')}
                  </ActionButton>
                )}
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Dialog.Root>
      )}
    </CommunityShell>
  );
}
