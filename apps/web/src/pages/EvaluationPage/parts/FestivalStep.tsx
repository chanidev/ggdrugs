// apps/web/src/pages/EvaluationPage/parts/FestivalStep.tsx
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionButton } from 'seed-design/ui/action-button';
import { SegmentedControl, SegmentedControlItem } from 'seed-design/ui/segmented-control';
import { StarRating } from './StarRating.js';

export interface FestivalData {
  atmosphere: number; program: number; food: number; safety: number; transport: number;
  reviewRating: number;
  reviewBody: string;
  photoUrls: string[];
}

interface Props {
  onBack: () => void;
  onSubmit: (data: FestivalData) => void;
  submitting: boolean;
}

const SURVEY_KEYS = ['atmosphere', 'program', 'food', 'safety', 'transport'] as const;
type SurveyKey = (typeof SURVEY_KEYS)[number];

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function FestivalStep({ onBack, onSubmit, submitting }: Props) {
  const { t } = useTranslation('mypage');
  const [survey, setSurvey] = useState<Record<SurveyKey, number>>({
    atmosphere: 0, program: 0, food: 0, safety: 0, transport: 0,
  });
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewBody, setReviewBody] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const surveyComplete = SURVEY_KEYS.every((k) => survey[k] > 0);
  const canSubmit = surveyComplete && reviewRating > 0 && reviewBody.trim().length > 0 && !submitting && !uploading;

  // [이슈1] 실제 BFF 계약에 맞춘 업로드
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (photoUrls.length + files.length > 10) {
      alert(t('evaluation.photoMax')); return;
    }

    const BFF = (import.meta.env['VITE_BFF_URL'] as string | undefined) ?? 'http://localhost:3001';
    setUploading(true);
    const newUrls: string[] = [];

    for (const file of files) {
      // 클라이언트 사전 필터
      if (!ALLOWED_MIME.has(file.type)) {
        alert(t('evaluation.photoInvalidType', { type: file.type }));
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        alert(t('evaluation.photoTooLarge', { name: file.name }));
        continue;
      }

      try {
        // [이슈1] body: { contentType, sizeBytes } — filename 없음
        const presignRes = await fetch(`${BFF}/reviews/photos/upload-url`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
        });
        if (!presignRes.ok) {
          console.error('presign failed', presignRes.status); continue;
        }
        // [이슈1] 응답 키: publicUrl (fileUrl 없음)
        const { uploadUrl, publicUrl } = await presignRes.json() as { uploadUrl: string; publicUrl: string };
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
        if (!putRes.ok) { console.error('S3 PUT failed', putRes.status); continue; }
        newUrls.push(publicUrl);
      } catch (err) {
        console.error('upload error', err);
      }
    }

    setPhotoUrls((prev) => [...prev, ...newUrls].slice(0, 10));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-(length:--text-h3) font-semibold">{t('evaluation.festivalTitle')}</h2>
      <p className="text-[12px] text-(--color-text-muted)">{t('evaluation.surveyPrivate')}</p>

      {SURVEY_KEYS.map((key) => {
        const label = t(`evaluation.surveyItems.${key}`);
        const sVal = survey[key];
        const segProps = sVal === 0
          ? { 'aria-label': label, onValueChange: (v: string) => setSurvey((prev) => ({ ...prev, [key]: Number(v) })) }
          : { 'aria-label': label, value: String(sVal), onValueChange: (v: string) => setSurvey((prev) => ({ ...prev, [key]: Number(v) })) };
        return (
          <section key={key}>
            <p className="mb-1 text-[13px] font-medium">{label}</p>
            <SegmentedControl {...segProps}>
              {[1, 2, 3, 4, 5].map((v) => (
                <SegmentedControlItem key={v} value={String(v)}>{v}</SegmentedControlItem>
              ))}
            </SegmentedControl>
          </section>
        );
      })}

      <section>
        <p className="mb-2 text-[13px] font-medium">{t('evaluation.reviewRating')}</p>
        <StarRating value={reviewRating} onChange={setReviewRating} />
      </section>

      <section>
        <label className="mb-1 block text-[13px] font-medium" htmlFor="reviewBody">
          {t('evaluation.reviewLabel')} <span className="text-(--color-text-muted)">({t('evaluation.charCount', { count: reviewBody.length })})</span>
        </label>
        <textarea
          id="reviewBody"
          value={reviewBody}
          onChange={(e) => setReviewBody(e.target.value.slice(0, 5000))}
          rows={5}
          placeholder={t('evaluation.reviewPlaceholder')}
          className="w-full resize-y rounded-(--radius-md) border border-(--color-border) px-3 py-2 text-[14px] focus:outline-none focus:border-(--color-brand)"
        />
      </section>

      <section>
        <p className="mb-2 text-[13px] font-medium">
          {t('evaluation.photoLabel')} <span className="text-(--color-text-muted)">({t('evaluation.photoHint', { count: photoUrls.length })})</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {photoUrls.map((url, idx) => (
            <div key={url} className="relative h-16 w-16">
              <img src={url} alt={t('evaluation.photoAlt', { index: idx + 1 })} className="h-full w-full rounded-(--radius-sm) object-cover" />
              <button
                type="button"
                onClick={() => setPhotoUrls((prev) => prev.filter((_, i) => i !== idx))}
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-(--color-danger) text-[10px] text-white"
                aria-label={t('evaluation.photoDeleteAria')}
              >
                x
              </button>
            </div>
          ))}
          {photoUrls.length < 10 && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex h-16 w-16 items-center justify-center rounded-(--radius-sm) border border-dashed border-(--color-border) text-[24px] text-(--color-text-muted) disabled:opacity-50"
              aria-label={t('evaluation.photoAddAria')}
            >
              {uploading ? '...' : '+'}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </section>

      <div className="flex gap-2">
        <ActionButton variant="neutralOutline" size="medium" onClick={onBack} disabled={submitting || uploading}>
          {t('evaluation.back')}
        </ActionButton>
        <ActionButton
          variant="brandSolid"
          size="medium"
          disabled={!canSubmit}
          onClick={() => canSubmit && onSubmit({ ...survey, reviewRating, reviewBody, photoUrls })}
          className="flex-1"
        >
          {submitting ? t('evaluation.submitting') : t('evaluation.complete')}
        </ActionButton>
      </div>
    </div>
  );
}
