import type { BffEventDetail } from '../../../lib/api';

export function OverviewSection({ detail }: { detail: BffEventDetail }) {
  if (!detail.aiSummary && !detail.description) return null;
  return (
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
  );
}
