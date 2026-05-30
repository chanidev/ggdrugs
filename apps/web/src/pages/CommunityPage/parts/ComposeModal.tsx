import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPost, updatePost, type PostCategory, type PostDetail } from '../../../lib/api/posts.js';
import { ActionButton } from 'seed-design/ui/action-button';
import { SegmentedControl, SegmentedControlItem } from 'seed-design/ui/segmented-control';
import { TextField, TextFieldInput, TextFieldTextarea } from 'seed-design/ui/text-field';
import * as Dialog from 'seed-design/ui/dialog';

const CATS: PostCategory[] = ['festival_story', 'mate_finder', 'free'];

interface ComposeModalProps {
  defaultCategory?: PostCategory;
  editPost?: PostDetail;
  onClose: () => void;
  onCreated: () => void;
}

export function ComposeModal({ defaultCategory, editPost, onClose, onCreated }: ComposeModalProps) {
  const { t } = useTranslation('community');
  const [category, setCategory] = useState<PostCategory>(
    editPost ? editPost.category : (defaultCategory ?? 'free'),
  );
  const [title, setTitle] = useState(editPost?.title ?? '');
  const [body, setBody] = useState(editPost?.body ?? '');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const titleInvalid = err !== null && title.trim().length < 2;
  const bodyInvalid = err !== null && body.trim().length < 2;

  const submit = async () => {
    const titleTrimmed = title.trim();
    const bodyTrimmed = body.trim();
    if (titleTrimmed.length < 2 || bodyTrimmed.length < 2) {
      setErr(t('compose.titleRequired'));
      return;
    }
    setPending(true);
    setErr(null);
    try {
      if (editPost) {
        await updatePost(editPost.postId, { title: titleTrimmed, body: bodyTrimmed });
      } else {
        await createPost({ category, title: titleTrimmed, body: bodyTrimmed });
      }
      onCreated();
    } catch (e) {
      const m = (e as Error).message;
      setErr(m === 'UNAUTHENTICATED' ? t('compose.loginRequired') : t('compose.submitError'));
    } finally {
      setPending(false);
    }
  };

  return (
    /* SEED Dialog.Root: open=true (ComposeModal은 항상 열린 채로 마운트됨)
       onOpenChange: false 로 바뀔 때 onClose 호출.
       Escape 닫기·포커스 트랩·스크롤 락·포털 렌더 모두 SEED Dialog 내장. */
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content className="w-[480px] max-w-[92vw]">
          {/* 모달 헤더 */}
          <Dialog.Header>
            <Dialog.Title>{editPost ? t('compose.editPost') : t('compose.newPost')}</Dialog.Title>
          </Dialog.Header>

          <div className="flex flex-col gap-4 px-5 pb-2">
            {/* 카테고리 선택 — 수정 시 숨김 */}
            {!editPost && (
              <SegmentedControl
                aria-label={t('compose.categorySelectLabel')}
                value={category}
                onValueChange={(v) => setCategory(v as PostCategory)}
              >
                {CATS.map((c) => (
                  <SegmentedControlItem key={c} value={c}>
                    {t(`category.${c}`)}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
            )}

            {/* 제목 — SEED TextField (single-line)
                [접근성] label prop → SeedField가 <label>+aria-labelledby 자동 배선
                [접근성] invalid+errorMessage 동시 전달 → SeedField.ErrorMessage가
                         aria-describedby로 input에 연결됨 */}
            <TextField
              label={t('compose.titleLabel')}
              value={title}
              onValueChange={(v) => setTitle(v.value)}
              invalid={titleInvalid}
              errorMessage={titleInvalid ? t('compose.titleRequired') : undefined}
            >
              <TextFieldInput
                placeholder={t('compose.titlePlaceholder')}
                maxLength={200}
              />
            </TextField>

            {/* 본문 — SEED TextField (multiline via TextFieldTextarea)
                [접근성] label prop → SeedField가 <label>+aria-labelledby 자동 배선
                [접근성] invalid+errorMessage 동시 전달 → SeedField.ErrorMessage가
                         aria-describedby로 textarea에 연결됨 */}
            <TextField
              label={t('compose.bodyLabel')}
              value={body}
              onValueChange={(v) => setBody(v.value)}
              invalid={bodyInvalid}
              errorMessage={bodyInvalid ? t('compose.bodyRequired') : undefined}
            >
              <TextFieldTextarea
                placeholder={t('compose.bodyPlaceholder')}
                maxLength={5000}
                autoresize={false}
              />
            </TextField>

            {/* 에러 요약 메시지 — 두 필드 모두 유효하지 않을 때 혹은 서버 오류 시 표시.
                per-field errorMessage 로 처리되지 않는 케이스(서버 오류 등) 커버. */}
            {err && !titleInvalid && !bodyInvalid && (
              <p role="alert" className="text-[13px] text-(--color-error)">
                {err}
              </p>
            )}
          </div>

          {/* SEED Dialog.Footer — dialog CTA 슬롯. 내부 패딩은 Dialog.Footer가 담당. */}
          <Dialog.Footer>
            <ActionButton
              variant="neutralOutline"
              size="medium"
              onClick={onClose}
              disabled={pending}
            >
              {t('compose.cancel')}
            </ActionButton>
            <ActionButton
              variant="brandSolid"
              size="medium"
              onClick={submit}
              loading={pending}
              disabled={pending}
            >
              {editPost ? t('compose.save') : t('compose.submit')}
            </ActionButton>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
