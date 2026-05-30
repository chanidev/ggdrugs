import { useEffect, useState } from 'react';
import { Avatar } from 'seed-design/ui/avatar';
import { ActionButton } from 'seed-design/ui/action-button';
import { TextField, TextFieldInput } from 'seed-design/ui/text-field';
import type { CommentNode } from '../../../lib/api/posts.js';
import { deleteComment, updateComment } from '../../../lib/api/posts.js';
import { CommentComposer } from './CommentComposer.js';
import { ReportModal } from '../../../components/ReportModal.js';

function CommentItem({
  node,
  postId,
  isReply,
  onAuthorClick,
  onChanged,
  currentUserId,
}: {
  node: CommentNode;
  postId: string;
  isReply: boolean;
  onAuthorClick: (nickname: string, userId: string) => void;
  onChanged: () => void;
  currentUserId?: string;
}) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(node.body);
  const [reportOpen, setReportOpen] = useState(false);

  // [review fix] 서버 확정 본문이 변경됐을 때(onChanged → 부모 reload) editText 를
  // 최신 node.body 로 동기화. editing 중엔 사용자 입력을 유지하고, editing 이 false 일 때만 적용.
  useEffect(() => {
    if (!editing) setEditText(node.body);
  }, [node.body, editing]);

  const saveEdit = async () => {
    const t = editText.trim();
    if (t.length < 1) return;
    try {
      await updateComment(node.commentId, { body: t });
      setEditing(false);
      onChanged();
    } catch (e) {
      if ((e as Error).message === 'FORBIDDEN') alert('본인 댓글이 아니에요.');
      else alert('수정하지 못했어요.');
    }
  };

  const remove = async () => {
    if (!confirm('삭제할까요?')) return;
    try {
      await deleteComment(node.commentId);
      onChanged();
    } catch (e) {
      if ((e as Error).message === 'FORBIDDEN') alert('본인 댓글이 아니에요.');
      else alert('삭제하지 못했어요.');
    }
  };

  const isMyComment = currentUserId != null && node.authorUserId === currentUserId;
  const canReport = currentUserId != null && !isMyComment;

  return (
    <li className={isReply ? 'ml-6 border-l border-(--color-border) pl-3' : ''}>
      <div className="py-2">
        {/* 작성자 행 */}
        <div className="mb-1 flex items-center gap-2">
          {/* SEED Avatar — 이니셜 fallback, 작성자 클릭 → 프로필 모달 */}
          <button
            type="button"
            onClick={() => onAuthorClick(node.authorNickname, node.authorUserId)}
            className="flex items-center gap-1.5 text-[12px] font-medium text-(--color-text) hover:underline"
            aria-label={`${node.authorNickname} 프로필 보기`}
          >
            <Avatar
              fallback={node.authorNickname.slice(0, 1)}
              size="24"
              aria-hidden="true"
            />
            {node.authorNickname}
          </button>
          <span className="text-[12px] text-(--color-text-muted)">
            {new Date(node.createdAt).toLocaleDateString()}
          </span>
        </div>

        {/* 본문 — 수정 모드 토글 */}
        {editing ? (
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <TextField value={editText} onValueChange={(v) => setEditText(v.value)}>
                <TextFieldInput aria-label="댓글 수정" maxLength={1000} />
              </TextField>
            </div>
            <ActionButton variant="brandSolid" size="xsmall" onClick={saveEdit}>
              저장
            </ActionButton>
            <ActionButton
              variant="neutralOutline"
              size="xsmall"
              onClick={() => setEditing(false)}
            >
              취소
            </ActionButton>
          </div>
        ) : (
          <p className="text-[14px]">{node.body}</p>
        )}

        {/* 액션 버튼 행 */}
        <div className="mt-1 flex gap-2">
          {/* GG-POST-003: 대댓글(isReply)에는 답글 버튼 미노출 — depth 1 강제 (서버 422 와 이중 방어). */}
          {!isReply && (
            <ActionButton
              variant="neutralOutline"
              size="xsmall"
              onClick={() => setReplying((v) => !v)}
            >
              답글
            </ActionButton>
          )}
          {node.isMine && !editing && (
            <ActionButton
              variant="neutralOutline"
              size="xsmall"
              onClick={() => setEditing(true)}
            >
              수정
            </ActionButton>
          )}
          {node.isMine && (
            <ActionButton variant="neutralOutline" size="xsmall" onClick={remove}>
              삭제
            </ActionButton>
          )}
          {/* GG-REPORT-001: 타인 댓글 신고 */}
          {canReport && (
            <ActionButton
              variant="neutralOutline"
              size="xsmall"
              onClick={() => setReportOpen(true)}
            >
              신고
            </ActionButton>
          )}
        </div>

        {replying && (
          <div className="mt-2">
            <CommentComposer
              postId={postId}
              parentCommentId={node.commentId}
              onCreated={() => {
                setReplying(false);
                onChanged();
              }}
              onCancel={() => setReplying(false)}
            />
          </div>
        )}
      </div>

      {node.replies.length > 0 && (
        <ul>
          {node.replies.map((r) => (
            <CommentItem
              key={r.commentId}
              node={r}
              postId={postId}
              isReply
              onAuthorClick={onAuthorClick}
              onChanged={onChanged}
              {...(currentUserId ? { currentUserId } : {})}
            />
          ))}
        </ul>
      )}

      {/* GG-REPORT-001: 댓글 신고 모달 */}
      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="comment"
        targetEntityId={node.commentId}
        targetUserId={node.authorUserId}
        onSuccess={() => setReportOpen(false)}
      />
    </li>
  );
}

export function CommentTree({
  comments,
  postId,
  onAuthorClick,
  onChanged,
  currentUserId,
}: {
  comments: CommentNode[];
  postId: string;
  onAuthorClick: (nickname: string, userId: string) => void;
  onChanged: () => void;
  currentUserId?: string;
}) {
  if (comments.length === 0)
    return (
      <p className="py-4 text-[13px] text-(--color-text-muted)">첫 댓글을 남겨보세요.</p>
    );

  return (
    <ul className="divide-y divide-(--color-border)">
      {comments.map((c) => (
        <CommentItem
          key={c.commentId}
          node={c}
          postId={postId}
          isReply={false}
          onAuthorClick={onAuthorClick}
          onChanged={onChanged}
          {...(currentUserId ? { currentUserId } : {})}
        />
      ))}
    </ul>
  );
}
