import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PhaseBadge } from '../../../components/PhaseBadge';
import { Stars } from './Stars.js';

export type SummaryEvent = {
  eventId: string;
  title: string;
  startDate: string;
  endDate: string;
  addressDetail: string | null;
  admissionFee: string | null;
  targetAudience: string | null;
  aiSummary: string | null;
  articleCount: number;
  region: { sidoName: string; sigunguName: string | null; fullAddress: string };
};

/**
 * A_500 캘린더 이벤트 요약 카드.
 *
 * 요구사항정의서 v5.0 A_500 §4 스펙:
 *   이벤트명 · 장소 · 기간 · 가격 · 대상 · 요약(aiSummary)
 *   + '상세 보기' (A_400) / '리뷰 작성·수정' (A_501) CTA
 *
 * 리뷰 CTA 활성 조건 (GG-REVIEW-001):
 *   phase === 'ended' 일 때만 활성. 내가 이미 리뷰 작성했으면 '수정'.
 *
 * 관련 기사 수는 스펙엔 없지만 UX 힌트로 작은 배지. articleCount > 0 일 때만.
 */
export function CalendarSummaryCard({
  event,
  phase,
  reviewedRating,
}: {
  event: SummaryEvent;
  phase: 'upcoming' | 'ongoing' | 'ended';
  reviewedRating?: number;
}) {
  const { t } = useTranslation('mypage');
  const dateLabel = event.startDate === event.endDate ? event.startDate : `${event.startDate} ~ ${event.endDate}`;
  const place =
    event.addressDetail ??
    (event.region.sigunguName
      ? `${event.region.sidoName} ${event.region.sigunguName}`
      : event.region.fullAddress);

  const canReview = phase === 'ended';
  const reviewLabel = reviewedRating !== undefined ? t('calendar.reviewEdit') : t('calendar.reviewWrite');
  const reviewHref = `/events/${event.eventId}#review`;

  return (
    <article className="flex flex-col gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4 transition-colors hover:border-(--color-border-hover)">
      <header className="flex flex-wrap items-center gap-1.5">
        <PhaseBadge phase={phase} />
        {reviewedRating !== undefined && (
          <span className="inline-flex items-center gap-1 rounded-(--radius-sm) bg-(--color-accent-bg) px-1.5 py-0.5 text-[10px] font-medium text-(--color-accent)">
            <Stars value={reviewedRating} />
          </span>
        )}
        {event.articleCount > 0 && (
          <span
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-(--color-surface-alt) px-2 py-0.5 text-[10px] font-medium text-(--color-text-muted)"
            title={t('calendar.relatedArticlesTitle', { count: event.articleCount })}
          >
            <span className="tabular text-(--color-text)">{event.articleCount}</span>
            <span>{t('calendar.relatedArticles')}</span>
          </span>
        )}
      </header>

      <h4 className="m-0 text-[15px] font-semibold leading-[1.4] tracking-[-0.01em] text-(--color-text)">
        {event.title}
      </h4>

      <dl className="grid grid-cols-[44px_1fr] gap-x-3 gap-y-1 text-[12.5px]">
        <dt className="text-(--color-text-subtle)">{t('calendar.place')}</dt>
        <dd className="m-0 truncate text-(--color-text-muted)">{place}</dd>
        <dt className="text-(--color-text-subtle)">{t('calendar.period')}</dt>
        <dd className="tabular m-0 text-(--color-text-muted)">{dateLabel}</dd>
        {event.admissionFee && (
          <>
            <dt className="text-(--color-text-subtle)">{t('calendar.price')}</dt>
            <dd className="m-0 text-(--color-text-muted)">{event.admissionFee}</dd>
          </>
        )}
        {event.targetAudience && (
          <>
            <dt className="text-(--color-text-subtle)">{t('calendar.audience')}</dt>
            <dd className="m-0 text-(--color-text-muted)">{event.targetAudience}</dd>
          </>
        )}
      </dl>

      {event.aiSummary && (
        <p className="m-0 line-clamp-3 rounded-(--radius-md) bg-(--color-surface-alt) p-2.5 text-[12px] leading-[1.55] text-(--color-text-muted)">
          {event.aiSummary}
        </p>
      )}

      <footer className="flex gap-1.5">
        <Link
          to={`/events/${event.eventId}`}
          className="inline-flex h-8 flex-1 items-center justify-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) text-[12px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-border-hover) hover:text-(--color-text)"
        >
          {t('calendar.viewDetail')}
        </Link>
        {canReview ? (
          <Link
            to={reviewHref}
            className="inline-flex h-8 flex-1 items-center justify-center rounded-(--radius-md) bg-(--color-accent) text-[12px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
          >
            {reviewLabel}
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex h-8 flex-1 cursor-not-allowed items-center justify-center rounded-(--radius-md) border border-dashed border-(--color-border) text-[11.5px] text-(--color-text-subtle)"
            title={t('calendar.reviewAfterEndTooltip')}
          >
            {phase === 'upcoming' ? t('calendar.reviewAfterEnd') : t('calendar.reviewAfterEndShort')}
          </span>
        )}
      </footer>
    </article>
  );
}
