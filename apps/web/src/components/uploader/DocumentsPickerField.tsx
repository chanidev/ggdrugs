import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// 서버 CHECK chk_doc_mime 와 동기 — 마이그레이션 20260421110000 이후 PDF 허용.
export const APPROVAL_DOC_MIME = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;
export const REVIEW_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export type StagedDoc = {
  /** 클라이언트 전용 id — key collision 방지용. 서버 전송 안 함. */
  id: string;
  file: File;
};

/**
 * 다중 파일 picker — A_602 서류, A_501 리뷰 사진 양쪽 공용.
 *
 *   files      부모가 소유하는 stage 리스트
 *   onChange   stage 리스트 갱신 callback
 *   allowedMime 허용 MIME — 서버 whitelist 와 반드시 동기
 *   minCount / maxCount  UI hint 표시 + picker disable 임계
 *   maxBytes   파일당 상한 (기본 5MB)
 *   showCounter 'min-max' 카운터 노출 여부 (min=0 이면 숨기면 깔끔)
 *
 * 실제 업로드는 lib/uploads 의 uploadDocuments / uploadReviewPhotos 에서.
 * 이 컴포넌트는 staging + UI + 개별 파일 validation 책임만.
 */
export function DocumentsPickerField({
  files,
  onChange,
  uploading = false,
  allowedMime,
  min,
  max,
  maxBytes = DEFAULT_MAX_BYTES,
}: {
  files: StagedDoc[];
  onChange: (next: StagedDoc[]) => void;
  uploading?: boolean;
  allowedMime: readonly string[];
  min: number;
  max: number;
  maxBytes?: number;
}) {
  const { t } = useTranslation('uploader');
  const inputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErr(null);
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const next: StagedDoc[] = [...files];
    for (const f of picked) {
      if (next.length >= max) {
        setErr(t('picker.maxFiles', { max }));
        break;
      }
      if (!allowedMime.includes(f.type)) {
        setErr(t('picker.mimeError', { mime: allowedMime.join(', ') }));
        continue;
      }
      if (f.size > maxBytes) {
        setErr(t('picker.sizeError', { mb: Math.round(maxBytes / 1024 / 1024) }));
        continue;
      }
      next.push({
        id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
        file: f,
      });
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = (id: string) => onChange(files.filter((d) => d.id !== id));

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={allowedMime.join(',')}
        multiple
        onChange={onPick}
        disabled={files.length >= max}
        className="block w-full text-[13px] text-(--color-text-muted) file:mr-3 file:inline-flex file:h-9 file:cursor-pointer file:items-center file:rounded-(--radius-md) file:border file:border-(--color-border) file:bg-(--color-surface) file:px-3 file:text-[13px] file:font-medium file:text-(--color-text) hover:file:border-(--color-border-hover) disabled:opacity-50"
      />
      {err && <div className="mt-1 text-[12px] text-(--color-error)">{err}</div>}
      {files.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {files.map((d, i) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-[12px]"
            >
              <span className="truncate text-(--color-text)">
                <span className="mr-2 text-(--color-text-subtle)">#{i + 1}</span>
                {d.file.name}
                <span className="ml-2 text-(--color-text-subtle)">
                  · {(d.file.size / 1024).toFixed(0)} KB
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(d.id)}
                className="shrink-0 text-(--color-text-subtle) hover:text-(--color-error)"
              >
                {t('picker.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 text-[12px] text-(--color-text-subtle)">
        {t('picker.selectedCount', { count: files.length })}
        {min > 0 && files.length < min && ` ${t('picker.minRequired', { min })}`}
        {` ${t('picker.maxAllowed', { max })}`}
      </div>
      {uploading && (
        <div className="mt-1 text-[12px] text-(--color-text-muted)">{t('picker.uploading')}</div>
      )}
    </div>
  );
}
