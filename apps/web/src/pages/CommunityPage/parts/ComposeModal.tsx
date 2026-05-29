import { useState } from 'react';
import { createPost, updatePost, type PostCategory, type PostDetail } from '../../../lib/api/posts.js';
import { ActionButton } from 'seed-design/ui/action-button';
import { SegmentedControl, SegmentedControlItem } from 'seed-design/ui/segmented-control';
import { CATEGORY_LABELS } from './CommunityShell.js';

const CATS: PostCategory[] = ['festival_story', 'mate_finder', 'free'];

interface ComposeModalProps {
  defaultCategory?: PostCategory;
  editPost?: PostDetail;
  onClose: () => void;
  onCreated: () => void;
}

export function ComposeModal({ defaultCategory, editPost, onClose, onCreated }: ComposeModalProps) {
  const [category, setCategory] = useState<PostCategory>(
    editPost ? editPost.category : (defaultCategory ?? 'free'),
  );
  const [title, setTitle] = useState(editPost?.title ?? '');
  const [body, setBody] = useState(editPost?.body ?? '');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const t = title.trim();
    const b = body.trim();
    if (t.length < 2 || b.length < 2) {
      setErr('제목과 본문을 2자 이상 입력하세요.');
      return;
    }
    setPending(true);
    setErr(null);
    try {
      if (editPost) {
        await updatePost(editPost.postId, { title: t, body: b });
      } else {
        await createPost({ category, title: t, body: b });
      }
      onCreated();
    } catch (e) {
      const m = (e as Error).message;
      setErr(m === 'UNAUTHENTICATED' ? '로그인이 필요해요.' : '저장하지 못했어요.');
    } finally {
      setPending(false);
    }
  };

  return (
    /* 배경 overlay — 클릭 시 닫기 */
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={editPost ? '게시글 수정' : '글쓰기'}
      onClick={onClose}
    >
      {/* 모달 패널 — 클릭 전파 차단 */}
      <div
        className="flex w-[480px] max-w-[92vw] flex-col gap-4 rounded-(--radius-lg) bg-(--color-surface) p-5 shadow-(--shadow-lg)"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[16px] font-semibold leading-none">
          {editPost ? '게시글 수정' : '글쓰기'}
        </h3>

        {/* 카테고리 선택 — 수정 시 고정, 신규 시 SEED SegmentedControl */}
        {!editPost && (
          <SegmentedControl
            aria-label="카테고리 선택"
            value={category}
            onValueChange={(v) => setCategory(v as PostCategory)}
          >
            {CATS.map((c) => (
              <SegmentedControlItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        )}

        {/* 제목 입력 — Alle 토큰 스타일 네이티브 input */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          maxLength={200}
          aria-label="제목"
          className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-bg) px-3 py-2 text-[14px] text-(--color-text) placeholder:text-(--color-text-subtle) focus:border-(--color-accent) focus:outline-none"
        />

        {/* 본문 입력 — multiline 네이티브 textarea */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="내용"
          rows={8}
          maxLength={5000}
          aria-label="본문"
          className="w-full resize-none rounded-(--radius-md) border border-(--color-border) bg-(--color-bg) px-3 py-2 text-[14px] text-(--color-text) placeholder:text-(--color-text-subtle) focus:border-(--color-accent) focus:outline-none"
        />

        {/* 에러 메시지 */}
        {err && (
          <p role="alert" className="text-[13px] text-(--color-accent)">
            {err}
          </p>
        )}

        {/* 액션 버튼 행 — SEED ActionButton */}
        <div className="flex justify-end gap-2">
          <ActionButton variant="neutralOutline" size="medium" onClick={onClose} disabled={pending}>
            취소
          </ActionButton>
          <ActionButton
            variant="brandSolid"
            size="medium"
            onClick={submit}
            loading={pending}
            disabled={pending}
          >
            {editPost ? '수정' : '등록'}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
