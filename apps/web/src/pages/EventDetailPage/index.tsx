import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { fetchEventDetail, type BffEventDetail } from '../../lib/api';
import { Header } from '../../layout/Header';
import { Icon } from '../../components/Icon';
import { PosterHeader } from './sections/PosterHeader.js';
import { OverviewSection } from './sections/OverviewSection.js';
import { MiniMapSection } from './sections/MiniMapSection.js';
import { ArticlesSection } from './sections/ArticlesSection.js';
import { ReviewsSection } from './sections/ReviewsSection.js';
import { Provenance } from './sections/Provenance.js';

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
      <PosterHeader detail={detail} />

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

      <OverviewSection detail={detail} />

      <MiniMapSection detail={detail} />

      <ArticlesSection eventId={detail.eventId} />

      <ReviewsSection eventId={detail.eventId} phase={detail.phase} endDate={detail.endDate} />

      <Provenance detail={detail} />
    </article>
  );
}
