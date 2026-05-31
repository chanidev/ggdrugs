import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const ALLOWED_POSTER_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_POSTER_BYTES = 5 * 1024 * 1024;

/**
 * 이벤트 포스터 단일 이미지 picker. 상위 컴포넌트는 file state 를 소유하고
 * 실제 업로드는 lib/uploads.uploadPoster() 에서 돌린다 (DRY).
 */
export function PosterPickerField({
  file,
  onChange,
  uploading = false,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  uploading?: boolean;
}) {
  const { t } = useTranslation('uploader');
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErr(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      onChange(null);
      return;
    }
    if (!(ALLOWED_POSTER_MIME as readonly string[]).includes(f.type)) {
      setErr(t('picker.mimeError', { mime: ALLOWED_POSTER_MIME.join(', ') }));
      onChange(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (f.size > MAX_POSTER_BYTES) {
      setErr(t('picker.sizeError', { mb: Math.round(MAX_POSTER_BYTES / 1024 / 1024) }));
      onChange(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    onChange(f);
  };

  const clear = () => {
    onChange(null);
    setErr(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex items-start gap-3">
      {preview ? (
        <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-(--radius-md) bg-(--color-surface-alt)">
          <img src={preview} alt={t('picker.posterPreview')} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex h-32 w-24 shrink-0 items-center justify-center rounded-(--radius-md) border border-dashed border-(--color-border) bg-(--color-surface-alt) text-[11px] text-(--color-text-subtle)">
          {t('picker.posterNone')}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_POSTER_MIME.join(',')}
          onChange={onPick}
          className="block w-full text-[13px] text-(--color-text-muted) file:mr-3 file:inline-flex file:h-9 file:cursor-pointer file:items-center file:rounded-(--radius-md) file:border file:border-(--color-border) file:bg-(--color-surface) file:px-3 file:text-[13px] file:font-medium file:text-(--color-text) hover:file:border-(--color-border-hover)"
        />
        {file && (
          <div className="flex items-center justify-between gap-2 text-[12px] text-(--color-text-muted)">
            <span className="truncate">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </span>
            <button
              type="button"
              onClick={clear}
              className="shrink-0 text-(--color-text-subtle) hover:text-(--color-error)"
            >
              {t('picker.remove')}
            </button>
          </div>
        )}
        {err && <div className="text-[12px] text-(--color-error)">{err}</div>}
        {uploading && <div className="text-[12px] text-(--color-text-muted)">{t('picker.uploading')}</div>}
      </div>
    </div>
  );
}
