import { useRef, useState } from 'react';

const ALLOWED_DOC_MIME = ['image/jpeg', 'image/png'] as const;
const MAX_DOC_BYTES = 5 * 1024 * 1024;

export type StagedDoc = {
  /** 클라이언트 전용 id — key collision 방지용. 서버 전송 안 함. */
  id: string;
  file: File;
};

/**
 * A_602 서류 다중 picker — 2~5개 필수.
 *
 * 상위 컴포넌트가 files state 를 소유하고 lib/uploads.uploadDocuments() 로
 * 실제 업로드. 이 컴포넌트는 staging + UI + 개별 파일 validation 책임.
 *
 * MIN/MAX 은 prop 으로 받지 않고 상수 — 서버 검증과 반드시 같은 값이어야 하므로
 * API 가 변경되면 이 상수도 함께 업데이트.
 */
export function DocumentsPickerField({
  files,
  onChange,
  uploading = false,
  min,
  max,
}: {
  files: StagedDoc[];
  onChange: (next: StagedDoc[]) => void;
  uploading?: boolean;
  min: number;
  max: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErr(null);
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const next: StagedDoc[] = [...files];
    for (const f of picked) {
      if (next.length >= max) {
        setErr(`최대 ${max}개`);
        break;
      }
      if (!(ALLOWED_DOC_MIME as readonly string[]).includes(f.type)) {
        setErr(`지원 형식: ${ALLOWED_DOC_MIME.join(', ')} (PDF 미지원)`);
        continue;
      }
      if (f.size > MAX_DOC_BYTES) {
        setErr(`파일당 최대 ${Math.round(MAX_DOC_BYTES / 1024 / 1024)}MB`);
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
        accept={ALLOWED_DOC_MIME.join(',')}
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
                제거
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 text-[12px] text-(--color-text-subtle)">
        현재 {files.length}개 선택됨
        {files.length < min && ` (최소 ${min}개 필요)`}
      </div>
      {uploading && (
        <div className="mt-1 text-[12px] text-(--color-text-muted)">서류 업로드 중…</div>
      )}
    </div>
  );
}
