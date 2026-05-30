import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchEventReviews,
  createEventReview,
  type BffEventDetail,
  type BffReviewItem,
  type EventReviewsResponse,
} from '../../../lib/api';
import { Icon } from '../../../components/Icon';
import {
  DocumentsPickerField,
  REVIEW_PHOTO_MIME,
  type StagedDoc,
} from '../../../components/uploader/DocumentsPickerField';
import { useCurrentUser } from '../../../lib/auth-context';
import { uploadReviewPhotos } from '../../../lib/uploads';
import { LoginGateBox } from './LoginGateBox.js';

export function ReviewsSection({
  eventId,
  phase,
  endDate,
}: {
  eventId: string;
  phase: BffEventDetail['phase'];
  endDate: string;
}) {
  const { t } = useTranslation('mypage');
  const { user } = useCurrentUser();
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    data: EventReviewsResponse | null;
  }>({ loading: true, error: null, data: null });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ loading: true, error: null, data: null });
    fetchEventReviews(eventId, { limit: 20 }, ctrl.signal)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setState({ loading: false, error: (err as Error).message, data: null });
      });
    return () => ctrl.abort();
  }, [eventId]);

  const items = state.data?.items ?? [];
  const total = state.data?.total ?? 0;
  const avg = state.data?.avgRating ?? 0;

  const onCreated = (newReview: BffReviewItem) => {
    setState((prev) => {
      if (!prev.data) return prev;
      const nextItems = [newReview, ...prev.data.items];
      const nextTotal = prev.data.total + 1;
      const nextAvg =
        (prev.data.avgRating * prev.data.total + newReview.rating) / nextTotal;
      return {
        ...prev,
        data: {
          ...prev.data,
          items: nextItems,
          total: nextTotal,
          avgRating: nextAvg,
        },
      };
    });
  };

  // /events/:id#review 로 진입 시 (A_500 캘린더 팝업의 '리뷰 작성' CTA 등)
  // 리뷰 섹션으로 스크롤 + 컴포저 focus.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#review') return;
    if (state.loading) return; // 리뷰 로딩 완료 후 scroll
    const el = document.getElementById('reviews');
    if (!el) return;
    // 레이아웃 안정화 후 스크롤.
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const ta = document.getElementById('review-body');
      if (ta instanceof HTMLTextAreaElement) ta.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [state.loading]);

  return (
    <section id="reviews" className="scroll-mt-20 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-[16px] font-semibold tracking-[-0.01em]">{t('review.title')}</h2>
          {total > 0 && (
            <p className="tabular m-0 mt-1 text-[12px] text-(--color-text-muted)">
              ★ <span className="text-(--color-text)">{avg.toFixed(1)}</span> · {total.toLocaleString()}개
            </p>
          )}
        </div>
      </header>

      {user ? (
        phase === 'ended' ? (
          <ReviewComposer eventId={eventId} onCreated={onCreated} />
        ) : (
          <NotEndedNotice endDate={endDate} />
        )
      ) : (
        <LoginGateBox />
      )}

      <div className="mt-4 flex flex-col gap-3">
        {state.loading && <SkeletonReview />}
        {state.error && (
          <div className="text-[13px] text-(--color-error)">{t('review.loadError')}</div>
        )}
        {!state.loading && !state.error && items.length === 0 && <EmptyReviews />}
        {items.map((r) => (
          <ReviewCard key={r.reviewId} review={r} />
        ))}
      </div>
    </section>
  );
}

function ReviewComposer({
  eventId,
  onCreated,
}: {
  eventId: string;
  onCreated: (r: BffReviewItem) => void;
}) {
  const { t } = useTranslation('mypage');
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<StagedDoc[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [photosUploading, setPhotosUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyLen = body.trim().length;
  const canSubmit = rating >= 1 && rating <= 5 && bodyLen >= 2 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      let uploadedPhotos;
      if (photos.length > 0) {
        setPhotosUploading(true);
        try {
          uploadedPhotos = await uploadReviewPhotos(photos.map((p) => p.file));
        } finally {
          setPhotosUploading(false);
        }
      }
      const created = await createEventReview(eventId, {
        rating,
        body: body.trim(),
        ...(uploadedPhotos ? { photos: uploadedPhotos } : {}),
      });
      onCreated(created);
      setOpen(false);
      setRating(0);
      setBody('');
      setPhotos([]);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'ALREADY_REVIEWED') setError(t('evaluation.alreadyEvaluated'));
      else if (msg === 'UNAUTHENTICATED') setError(t('review.sessionExpired'));
      else if (msg.startsWith('POST /reviews/photos/upload-url')) setError(t('review.photoUploadFailed'));
      else setError(t('review.writeFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-4 py-3">
        <p className="m-0 text-[13px] text-(--color-text-muted)">
          {t('review.writeHint')}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-3 text-[13px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
        >
          {t('review.writeButton')} <Icon name="arrow" size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px] text-(--color-text-muted)">
          <span>{t('review.ratingLabel')}</span>
          <RatingInput value={rating} onChange={setRating} />
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          aria-label={t('review.closeButton')}
          className="flex h-7 w-7 items-center justify-center rounded-(--radius-md) text-(--color-text-subtle) hover:bg-(--color-surface-alt) hover:text-(--color-text)"
        >
          ×
        </button>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('review.bodyPlaceholder')}
        rows={4}
        maxLength={2000}
        className="w-full resize-y rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3 text-[13px] leading-[1.55] text-(--color-text) placeholder:text-(--color-text-subtle) focus:border-(--color-accent) focus:outline-none focus:ring-2 focus:ring-(--color-accent-bg)"
      />
      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-(--color-text-muted)">
          {t('review.photoLabel')}
        </p>
        <DocumentsPickerField
          files={photos}
          onChange={setPhotos}
          uploading={photosUploading}
          allowedMime={REVIEW_PHOTO_MIME}
          min={0}
          max={5}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="tabular text-[11px] text-(--color-text-subtle)">
          {bodyLen}/2000
        </span>
        {error && <span className="text-[12px] text-(--color-error)">{error}</span>}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="inline-flex h-8 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-3 text-[13px] font-medium text-white transition-colors hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? t('review.submitting') : t('review.submit')}
        </button>
      </div>
    </div>
  );
}

function RatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const { t } = useTranslation('mypage');
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div
      role="radiogroup"
      aria-label={t('review.ratingAria')}
      className="inline-flex items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className={`text-[18px] leading-none transition-colors ${
            shown >= n ? 'text-(--color-accent)' : 'text-(--color-border-hover)'
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function NotEndedNotice({ endDate }: { endDate: string }) {
  const { t } = useTranslation('mypage');
  return (
    <div className="rounded-(--radius-md) border border-dashed border-(--color-border) bg-(--color-surface-alt) px-4 py-3 text-[13px] text-(--color-text-muted)">
      {t('review.notEndedNotice')}
      <span className="tabular ml-1 text-(--color-text)">{endDate}</span> 이후 오픈.
    </div>
  );
}

function EmptyReviews() {
  const { t } = useTranslation('mypage');
  return (
    <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) p-6 text-center text-[13px] text-(--color-text-muted)">
      {t('review.firstReview')}
    </div>
  );
}

function SkeletonReview() {
  return (
    <div
      aria-hidden
      className="h-[84px] animate-pulse rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt)"
    />
  );
}

function ReviewCard({ review }: { review: BffReviewItem }) {
  const date = review.createdAt.slice(0, 10);
  const photos = [...review.photos].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <article className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-4">
      <header className="mb-1.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-semibold text-(--color-text)">{review.nickname}</span>
          <Stars value={review.rating} />
          <SentimentBadge sentiment={review.sentiment} />
        </div>
        <time className="tabular text-[11px] text-(--color-text-subtle)">{date}</time>
      </header>
      <p className="m-0 whitespace-pre-wrap text-[13px] leading-[1.6] text-(--color-text)">
        {review.body}
      </p>
      {photos.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
          {photos.map((p) => (
            <li key={p.url} className="aspect-square overflow-hidden rounded-(--radius-md) bg-(--color-surface-alt)">
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="리뷰 사진 원본 보기"
                className="block h-full w-full"
              >
                <img
                  src={p.url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-[180ms] hover:scale-[1.03]"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function SentimentBadge({
  sentiment,
}: {
  sentiment: BffReviewItem['sentiment'];
}) {
  const { t } = useTranslation('common');
  if (!sentiment) return null;
  const label =
    sentiment === 'positive' ? t('sentiment.positive') : sentiment === 'negative' ? t('sentiment.negative') : t('sentiment.neutral');
  const tone =
    sentiment === 'positive'
      ? 'bg-(--color-success)/10 text-(--color-success)'
      : sentiment === 'negative'
        ? 'bg-(--color-error)/10 text-(--color-error)'
        : 'bg-(--color-surface-alt) text-(--color-text-subtle)';
  return (
    <span
      title={`AI 감성 분류: ${label}`}
      className={`inline-flex items-center rounded-(--radius-sm) px-1.5 py-[1px] text-[10px] font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

function Stars({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <span
      aria-label={`별점 ${clamped} / 5`}
      className="inline-flex items-center gap-0.5 text-(--color-accent)"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} aria-hidden className={i < clamped ? '' : 'text-(--color-border)'}>
          ★
        </span>
      ))}
    </span>
  );
}
