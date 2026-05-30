import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextField, TextFieldInput } from 'seed-design/ui/text-field';
import { ActionButton } from 'seed-design/ui/action-button';
import { createComment, type CommentNode } from '../../../lib/api/posts.js';

/**
 * GG-POST-001/002: 댓글 / 대댓글 작성 컴포넌트.
 * - parentCommentId 없으면 최상위 댓글, 있으면 대댓글(depth 1).
 * - REPLY_TO_REPLY_NOT_ALLOWED(서버 422) → UI 경고 (GG-POST-003 이중 방어).
 */
export function CommentComposer({
  postId,
  parentCommentId,
  onCreated,
  onCancel,
}: {
  postId: string;
  parentCommentId?: string;
  onCreated: (c: CommentNode) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation('community');
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (trimmed.length < 1) return;
    setPending(true);
    try {
      const c = await createComment(
        postId,
        parentCommentId ? { body: trimmed, parentCommentId } : { body: trimmed },
      );
      setText('');
      onCreated(c);
    } catch (e) {
      if ((e as Error).message === 'REPLY_TO_REPLY_NOT_ALLOWED')
        alert(t('comment.replyNotAllowed'));
      else if ((e as Error).message === 'UNAUTHENTICATED') alert(t('common:error.loginRequired'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-end gap-2">
      {/* SEED TextField — label 없이 사용 시 aria-label을 input에 직접 주어 접근성 유지.
          label prop 생략 → SeedField 헤더 렌더 안 함(시각적 레이블 공간 없음). */}
      <div className="min-w-0 flex-1">
        <TextField
          value={text}
          onValueChange={(v) => setText(v.value)}
        >
          <TextFieldInput
            aria-label={parentCommentId ? t('comment.replyPlaceholder') : t('comment.placeholder')}
            placeholder={parentCommentId ? t('comment.replyPlaceholder') : t('comment.placeholder')}
            maxLength={1000}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </TextField>
      </div>
      <ActionButton
        variant="brandSolid"
        size="small"
        onClick={submit}
        loading={pending}
        disabled={pending || text.trim().length < 1}
      >
        {t('comment.submit')}
      </ActionButton>
      {onCancel && (
        <ActionButton variant="neutralOutline" size="small" onClick={onCancel}>
          {t('common:button.cancel')}
        </ActionButton>
      )}
    </div>
  );
}
