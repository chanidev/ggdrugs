import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  fetchEventDetail,
  fetchEventArticles,
  type BffEventDetail,
  type EventArticleItem,
} from '../lib/api';
import { Icon } from './Icon';
import { PhaseBadge } from './PhaseBadge';
import { BookmarkButton } from './BookmarkButton';

/**
 * EventSummaryPanel — 선택된 이벤트의 요약 카드 (A_200 중간 레이어).
 *
 * 와이어프레임 원 설계: 목록/핀 클릭 → 지도 옆 이 패널에 요약 노출 → "상세 페이지"
 * 버튼 눌렀을 때만 /events/:id 로 full page 이동.
 *
 * 레이아웃: Sidebar(236) + OverlayPanel(380) 오른쪽, w-[380], absolute left-[616].
 * z-10 (OverlayPanel z-20 보다 아래 — 필터/목록을 가리지 않게, 지도 위엔 얹힘).
 */
export function EventSummaryPanel({
  eventId,
  onClose,
}: {
  eventId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [state, setState] = useState<{
    loading: boolean;
    error: 'NOT_FOUND' | 'ERROR' | null;
    data: BffEventDetail | null;
  }>({ loading: true, error: null, data: null });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ loading: true, error: null, data: null });
    fetchEventDetail(eventId, ctrl.signal)
      .then((d) => setState({ loading: false, error: null, data: d }))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setState({
          loading: false,
          error: (err as Error).message === 'NOT_FOUND' ? 'NOT_FOUND' : 'ERROR',
          data: null,
        });
      });
    return () => ctrl.abort();
  }, [eventId]);

  return (
    <aside
      aria-label="선택된 이벤트 요약"
      className="absolute bottom-14 left-0 right-0 top-[60px] z-20 flex flex-col border-t border-(--color-border) bg-(--color-surface) shadow-(--shadow-lg) motion-safe:animate-[alle-panel-in_280ms_cubic-bezier(0,0,0.2,1)] md:bottom-0 md:left-[616px] md:right-auto md:top-0 md:z-10 md:w-[380px] md:border-r md:border-t-0"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-(--color-border) px-5 pb-4 pt-5">
        <h3 className="m-0 text-[16px] font-bold tracking-[-0.015em]">이벤트 요약</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="요약 패널 닫기"
          className="flex h-8 w-8 items-center justify-center rounded-(--radius-md) text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
        >
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {state.loading && <SummarySkeleton />}
        {state.error === 'NOT_FOUND' && (
          <EmptyBox label="이벤트를 찾을 수 없어요" hint="삭제되었거나 승인이 취소된 이벤트일 수 있어요." />
        )}
        {state.error === 'ERROR' && (
          <EmptyBox label="요약을 불러오지 못했어요" hint="잠시 후 다시 시도해 주세요." />
        )}
        {state.data && <SummaryBody detail={state.data} />}
      </div>

      {state.data && (
        <footer className="flex shrink-0 items-center gap-2 border-t border-(--color-border) px-5 py-3">
          <BookmarkButton
            eventId={eventId}
            initialBookmarked={state.data.isBookmarked}
          />
          <button
            type="button"
            onClick={() => navigate(`/events/${eventId}`)}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-3 text-[13px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
          >
            상세 페이지로 <Icon name="arrow" size={14} />
          </button>
        </footer>
      )}
    </aside>
  );
}

function SummaryBody({ detail }: { detail: BffEventDetail }) {
  const location = detail.addressDetail ?? detail.region.fullAddress;
  const dateLabel =
    detail.startDate === detail.endDate
      ? detail.startDate
      : `${detail.startDate} — ${detail.endDate}`;

  return (
    <article className="flex flex-col gap-0">
      <div className="h-48 w-full shrink-0 overflow-hidden bg-(--color-surface-warm)">
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

      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex items-start justify-between gap-2.5">
          <h2 className="m-0 text-[18px] font-bold leading-[1.3] tracking-[-0.015em]">
            {detail.title}
          </h2>
          <PhaseBadge phase={detail.phase} />
        </div>

        <dl className="grid grid-cols-[52px_1fr] gap-x-3 gap-y-2 text-[13px]">
          <dt className="text-(--color-text-subtle)">분류</dt>
          <dd className="m-0 text-(--color-text)">{detail.category.name}</dd>
          <dt className="text-(--color-text-subtle)">장소</dt>
          <dd className="m-0 text-(--color-text)">{location}</dd>
          <dt className="text-(--color-text-subtle)">기간</dt>
          <dd className="tabular m-0 text-(--color-text)">{dateLabel}</dd>
          {detail.operatingHours && (
            <>
              <dt className="text-(--color-text-subtle)">시간</dt>
              <dd className="m-0 text-(--color-text)">{detail.operatingHours}</dd>
            </>
          )}
          {detail.admissionFee && (
            <>
              <dt className="text-(--color-text-subtle)">가격</dt>
              <dd className="m-0 text-(--color-text)">{detail.admissionFee}</dd>
            </>
          )}
          {detail.targetAudience && (
            <>
              <dt className="text-(--color-text-subtle)">대상</dt>
              <dd className="m-0 text-(--color-text)">{detail.targetAudience}</dd>
            </>
          )}
        </dl>

        {(detail.vibes.length > 0 || detail.articleCount > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {detail.vibes.map((v) => (
              <span
                key={v.vibeId}
                className="rounded-full bg-(--color-surface-alt) px-2 py-0.5 text-[11px] text-(--color-text-muted)"
              >
                {v.name}
              </span>
            ))}
            {detail.articleCount > 0 && (
              <span
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-(--color-accent-bg) px-2 py-0.5 text-[11px] font-medium text-(--color-accent)"
                title={`관련 기사 ${detail.articleCount}건 — 아래 상위 3건, 전체는 상세 페이지`}
              >
                <span className="tabular">{detail.articleCount}</span>
                <span>관련 기사</span>
              </span>
            )}
          </div>
        )}

        {(detail.aiSummary || detail.description) && (
          <section className="flex flex-col gap-1.5">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
              {detail.aiSummary ? 'AI 요약' : '내용 요약'}
            </p>
            <p className="m-0 whitespace-pre-wrap rounded-(--radius-md) bg-(--color-surface-alt) p-3 text-[13px] leading-[1.6] text-(--color-text)">
              {detail.aiSummary ?? clampText(detail.description ?? '', 320)}
            </p>
          </section>
        )}

        {detail.articleCount > 0 && (
          <ArticlesMiniList eventId={detail.eventId} total={detail.articleCount} />
        )}
      </div>
    </article>
  );
}

/**
 * 요약 패널용 관련 기사 미니 리스트 — relevance 순 top-3.
 * 전체 리스트는 EventDetailPage 의 ArticlesSection.
 */
function ArticlesMiniList({ eventId, total }: { eventId: string; total: number }) {
  const [items, setItems] = useState<EventArticleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchEventArticles(eventId, 3, ctrl.signal)
      .then((r) => setItems(r))
      .catch((e) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [eventId]);

  if (loading) {
    return (
      <section className="flex flex-col gap-1.5">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
          관련 기사
        </p>
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-(--radius-md) bg-(--color-surface-alt) p-3">
              <div className="mb-1.5 h-3 w-1/3 rounded-(--radius-sm) bg-(--color-surface)" />
              <div className="h-4 w-5/6 rounded-(--radius-sm) bg-(--color-surface)" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex flex-col gap-1.5">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
          관련 기사
        </p>
        <p className="m-0 text-[12px] text-(--color-error)">기사를 불러오지 못했어요.</p>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-1.5">
      <p className="m-0 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
        <span>관련 기사</span>
        {total > items.length && (
          <span className="font-normal normal-case tracking-normal">
            상위 {items.length}건 · 총 {total}건
          </span>
        )}
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((a) => (
          <li key={a.mappingId}>
            <a
              href={a.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-1 rounded-(--radius-md) bg-(--color-surface-alt) p-3 transition-colors hover:bg-(--color-surface-warm)"
            >
              <div className="flex items-baseline gap-2 text-[11px] text-(--color-text-subtle)">
                <span className="font-semibold uppercase tracking-[0.04em]">{a.sourceName}</span>
                {a.publishedAt && <span className="tabular">{a.publishedAt.slice(0, 10)}</span>}
                <span className="ml-auto text-(--color-text-subtle) group-hover:text-(--color-accent)">
                  원문 ↗
                </span>
              </div>
              <h4 className="m-0 line-clamp-2 text-[13px] font-semibold leading-[1.35] text-(--color-text) group-hover:text-(--color-accent)">
                {a.title}
              </h4>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function clampText(s: string, n: number): string {
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s;
}

function SummarySkeleton() {
  return (
    <div className="animate-pulse px-5 py-4">
      <div className="mb-4 h-48 w-full rounded-(--radius-md) bg-(--color-surface-alt)" />
      <div className="mb-2 h-5 w-3/4 rounded-(--radius-sm) bg-(--color-surface-alt)" />
      <div className="mb-4 h-4 w-1/2 rounded-(--radius-sm) bg-(--color-surface-alt)" />
      <div className="flex flex-col gap-2">
        <div className="h-3 w-full rounded-(--radius-sm) bg-(--color-surface-alt)" />
        <div className="h-3 w-5/6 rounded-(--radius-sm) bg-(--color-surface-alt)" />
      </div>
    </div>
  );
}

function EmptyBox({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="m-0 text-[14px] font-semibold text-(--color-text)">{label}</p>
      <p className="m-0 text-[12px] text-(--color-text-muted)">{hint}</p>
    </div>
  );
}
