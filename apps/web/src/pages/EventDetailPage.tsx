import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Map, MapMarker, useKakaoLoader } from 'react-kakao-maps-sdk';
import {
  fetchEventDetail,
  fetchEventReviews,
  createEventReview,
  type BffEventDetail,
  type BffReviewItem,
  type EventReviewsResponse,
} from '../lib/api';
import { Header } from '../layout/Header';
import { Icon } from '../components/Icon';
import { PhaseBadge } from '../components/PhaseBadge';
import { BookmarkButton } from '../components/BookmarkButton';
import {
  DocumentsPickerField,
  REVIEW_PHOTO_MIME,
  type StagedDoc,
} from '../components/uploader/DocumentsPickerField';
import { useCurrentUser } from '../lib/auth-context';
import { uploadReviewPhotos } from '../lib/uploads';

/**
 * EventDetailPage — A_400 이벤트 상세.
 *
 * 라우트: /events/:id
 * 구조: Header + back 내비게이션 + poster hero + 메타 + 설명 + mini map + 프로비넌스.
 * 지도 API 키 없거나 lat/lng null 이면 mini map 영역 생략.
 */
export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<BffEventDetail | null>(null);
  const [error, setError] = useState<'NOT_FOUND' | 'ERROR' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchEventDetail(id, ctrl.signal)
      .then((d) => {
        setDetail(d);
        setLoading(false);
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message === 'NOT_FOUND' ? 'NOT_FOUND' : 'ERROR');
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [id]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-6">
          <BackLink />
          {loading && <LoadingBox />}
          {error === 'NOT_FOUND' && <NotFoundBox />}
          {error === 'ERROR' && <ErrorBox />}
          {detail && <DetailBody detail={detail} />}
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] text-(--color-text-muted) transition-colors hover:text-(--color-accent)"
    >
      <span aria-hidden className="inline-block rotate-180">
        <Icon name="arrow" size={14} />
      </span>
      탐색으로 돌아가기
    </Link>
  );
}

function LoadingBox() {
  return (
    <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-8 text-center text-[13px] text-(--color-text-muted)">
      불러오는 중…
    </div>
  );
}

function NotFoundBox() {
  return (
    <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-10 text-center">
      <h1 className="m-0 mb-2 text-[20px] font-bold">이벤트를 찾을 수 없어요</h1>
      <p className="m-0 text-[14px] text-(--color-text-muted)">
        삭제됐거나 승인이 취소된 이벤트일 수 있어요.
      </p>
    </div>
  );
}

function ErrorBox() {
  return (
    <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-10 text-center text-[13px] text-(--color-error)">
      상세 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.
    </div>
  );
}

function DetailBody({ detail }: { detail: BffEventDetail }) {
  const location = detail.addressDetail ?? detail.region.fullAddress;
  const dateLabel =
    detail.startDate === detail.endDate
      ? detail.startDate
      : `${detail.startDate} — ${detail.endDate}`;

  return (
    <article className="flex flex-col gap-6">
      <Hero detail={detail} />

      <section className="grid grid-cols-1 gap-4 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6 md:grid-cols-[180px_1fr]">
        <dt className="text-[12px] font-semibold uppercase tracking-[0.04em] text-(--color-text-subtle)">
          분류
        </dt>
        <dd className="m-0 text-[14px]">{detail.category.name}</dd>
        <dt className="text-[12px] font-semibold uppercase tracking-[0.04em] text-(--color-text-subtle)">
          장소
        </dt>
        <dd className="m-0 text-[14px]">{location}</dd>
        <dt className="text-[12px] font-semibold uppercase tracking-[0.04em] text-(--color-text-subtle)">
          기간
        </dt>
        <dd className="tabular m-0 text-[14px]">{dateLabel}</dd>
        {detail.vibes.length > 0 && (
          <>
            <dt className="text-[12px] font-semibold uppercase tracking-[0.04em] text-(--color-text-subtle)">
              성향
            </dt>
            <dd className="m-0 flex flex-wrap gap-1.5">
              {detail.vibes.map((v) => (
                <span
                  key={v.vibeId}
                  className="rounded-full bg-(--color-surface-alt) px-2 py-0.5 text-[11px] text-(--color-text-muted)"
                >
                  {v.name}
                </span>
              ))}
            </dd>
          </>
        )}
      </section>

      {(detail.aiSummary || detail.description) && (
        <section className="flex flex-col gap-4 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6">
          {detail.aiSummary && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-flex h-4 items-center rounded-(--radius-sm) bg-(--color-accent-bg) px-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-(--color-accent)"
                >
                  AI
                </span>
                <h2 className="m-0 text-[14px] font-semibold tracking-[-0.01em]">요약</h2>
              </div>
              <p className="m-0 whitespace-pre-wrap text-[14px] leading-[1.6] text-(--color-text)">
                {detail.aiSummary}
              </p>
            </div>
          )}
          {detail.description && (
            <details className="group">
              <summary className="m-0 cursor-pointer list-none text-[13px] font-medium text-(--color-text-muted) hover:text-(--color-text)">
                원본 설명 보기
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.6] text-(--color-text-muted)">
                {detail.description}
              </p>
            </details>
          )}
        </section>
      )}

      <MiniMap detail={detail} />

      <ReviewsSection eventId={detail.eventId} phase={detail.phase} endDate={detail.endDate} />

      <Provenance detail={detail} />
    </article>
  );
}

function ReviewsSection({
  eventId,
  phase,
  endDate,
}: {
  eventId: string;
  phase: BffEventDetail['phase'];
  endDate: string;
}) {
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

  return (
    <section className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-[16px] font-semibold tracking-[-0.01em]">리뷰</h2>
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
        <LoginGate />
      )}

      <div className="mt-4 flex flex-col gap-3">
        {state.loading && <SkeletonReview />}
        {state.error && (
          <div className="text-[13px] text-(--color-error)">리뷰를 불러오지 못했어요.</div>
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
      if (msg === 'ALREADY_REVIEWED') setError('이미 이 이벤트에 리뷰를 남겼어요.');
      else if (msg === 'UNAUTHENTICATED') setError('세션이 만료됐어요. 다시 로그인해 주세요.');
      else if (msg.startsWith('POST /reviews/photos/upload-url')) setError('사진 업로드에 실패했어요.');
      else setError('리뷰 작성에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-4 py-3">
        <p className="m-0 text-[13px] text-(--color-text-muted)">
          후기를 남기고 다른 사람에게 도움이 되어 주세요.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-3 text-[13px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
        >
          리뷰 쓰기 <Icon name="arrow" size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px] text-(--color-text-muted)">
          <span>별점</span>
          <RatingInput value={rating} onChange={setRating} />
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          aria-label="닫기"
          className="flex h-7 w-7 items-center justify-center rounded-(--radius-md) text-(--color-text-subtle) hover:bg-(--color-surface-alt) hover:text-(--color-text)"
        >
          ×
        </button>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="다녀온 느낌을 간단히 적어 주세요 (2자 이상)"
        rows={4}
        maxLength={2000}
        className="w-full resize-y rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3 text-[13px] leading-[1.55] text-(--color-text) placeholder:text-(--color-text-subtle) focus:border-(--color-accent) focus:outline-none focus:ring-2 focus:ring-(--color-accent-bg)"
      />
      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-(--color-text-muted)">
          사진 (선택, 최대 5장)
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
          {submitting ? '등록 중…' : '등록'}
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
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div
      role="radiogroup"
      aria-label="별점 1~5"
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

function LoginGate() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-(--radius-md) border border-dashed border-(--color-border) bg-(--color-surface-alt) px-4 py-3">
      <p className="m-0 text-[13px] text-(--color-text-muted)">
        리뷰를 남기려면 로그인이 필요해요.
      </p>
      <a
        href="/api/auth/google"
        className="inline-flex h-8 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-3 text-[13px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
      >
        Google 로그인 <Icon name="arrow" size={12} />
      </a>
    </div>
  );
}

function NotEndedNotice({ endDate }: { endDate: string }) {
  return (
    <div className="rounded-(--radius-md) border border-dashed border-(--color-border) bg-(--color-surface-alt) px-4 py-3 text-[13px] text-(--color-text-muted)">
      리뷰는 이벤트가 종료된 뒤에 작성할 수 있어요.
      <span className="tabular ml-1 text-(--color-text)">{endDate}</span> 이후 오픈.
    </div>
  );
}

function EmptyReviews() {
  return (
    <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) p-6 text-center text-[13px] text-(--color-text-muted)">
      첫 리뷰의 주인공이 되어 주세요.
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
    </article>
  );
}

function SentimentBadge({
  sentiment,
}: {
  sentiment: BffReviewItem['sentiment'];
}) {
  if (!sentiment) return null;
  const label =
    sentiment === 'positive' ? '긍정' : sentiment === 'negative' ? '부정' : '보통';
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

function Hero({ detail }: { detail: BffEventDetail }) {
  return (
    <div className="flex flex-col gap-4 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6 md:flex-row">
      <div className="h-56 w-full shrink-0 overflow-hidden rounded-(--radius-md) bg-(--color-surface-warm) md:h-64 md:w-64">
        {detail.posterImageUrl ? (
          <img
            src={detail.posterImageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[12px] text-(--color-text-subtle)">
            포스터 없음
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="m-0 text-[24px] font-bold leading-[1.25] tracking-[-0.015em]">
            {detail.title}
          </h1>
          <PhaseBadge phase={detail.phase} />
        </div>
        <p className="m-0 text-[14px] text-(--color-text-muted)">{detail.region.fullAddress}</p>
        <div className="mt-2 flex items-center gap-2">
          <BookmarkButton
            eventId={detail.eventId}
            initialBookmarked={detail.isBookmarked}
          />
          <span className="tabular text-[12px] text-(--color-text-subtle)">
            북마크 {detail.bookmarkCount.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function MiniMap({ detail }: { detail: BffEventDetail }) {
  const appkey = import.meta.env.VITE_KAKAO_MAP_JS_KEY as string | undefined;
  const [loading, error] = useKakaoLoader({ appkey: appkey ?? '', libraries: ['services'] });

  if (!appkey) return null;
  if (detail.latitude === null || detail.longitude === null) return null;
  if (error) return null;
  if (loading) {
    return (
      <div className="h-72 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface-alt)" />
    );
  }
  const pos = { lat: detail.latitude, lng: detail.longitude };
  return (
    <section className="overflow-hidden rounded-(--radius-lg) border border-(--color-border)">
      <Map center={pos} level={4} style={{ width: '100%', height: '320px' }} aria-label="이벤트 위치 지도">
        <MapMarker position={pos} title={detail.title} />
      </Map>
    </section>
  );
}

function Provenance({ detail }: { detail: BffEventDetail }) {
  return (
    <section className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface-alt) p-4 text-[11px] text-(--color-text-subtle)">
      <div className="font-semibold uppercase tracking-[0.08em]">출처</div>
      <div className="mt-1 font-mono">
        {detail.source.type} · {detail.source.crawlOrigin} · id {detail.source.externalId}
      </div>
      <div className="mt-0.5 tabular font-mono">
        최초 수집 {detail.createdAt.slice(0, 10)} · 최근 업데이트 {detail.updatedAt.slice(0, 10)}
      </div>
    </section>
  );
}
