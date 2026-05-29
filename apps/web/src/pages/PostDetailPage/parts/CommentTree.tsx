import { useState } from 'react';
import { Avatar } from 'seed-design/ui/avatar';
import { ActionButton } from 'seed-design/ui/action-button';
import { TextField, TextFieldInput } from 'seed-design/ui/text-field';
import type { CommentNode } from '../../../lib/api/posts.js';
import { deleteComment, updateComment } from '../../../lib/api/posts.js';
import { CommentComposer } from './CommentComposer.js';

function CommentItem({
  node,
  postId,
  isReply,
  onAuthorClick,
  onChanged,
}: {
  node: CommentNode;
  postId: string;
  isReply: boolean;
  onAuthorClick: (nickname: string) => void;
  onChanged: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(node.body);

  const saveEdit = async () => {
    const t = editText.trim();
    if (t.length < 1) return;
    await updateComment(node.commentId, { body: t });
    setEditing(false);
    onChanged();
  };

  const remove = async () => {
    if (!confirm('삭제할까요?')) return;
    await deleteComment(node.commentId);
    onChanged();
  };

  return (
    <li className={isReply ? 'ml-6 border-l border-(--color-border) pl-3' : ''}>
      <div className="py-2">
        {/* 작성자 행 */}
        <div className="mb-1 flex items-center gap-2">
          {/* SEED Avatar — 이니셜 fallback, 작성자 클릭 → 프로필 모달 */}
          <button
            type="button"
            onClick={() => onAuthorClick(node.authorNickname)}
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
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CommentTree({
  comments,
  postId,
  onAuthorClick,
  onChanged,
}: {
  comments: CommentNode[];
  postId: string;
  onAuthorClick: (nickname: string) => void;
  onChanged: () => void;
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
        />
      ))}
    </ul>
  );
}
