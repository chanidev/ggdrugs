import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  decideAdminEvent,
  fetchAdminEventDocuments,
  type AdminEventItem,
  type AdminEventDocumentItem,
} from '../../lib/api';

/**
 * 업로드 이벤트 심사 패널 — 선택된 event 의 서류 미리보기 + 결정 버튼.
 *
 * GET /admin/events/:id/documents 로 presigned GET URL 포함한 목록 받아
 * <img> 로 직접 렌더. 일반 사용자 버킷 접근 불가 (private bucket + 5분 TTL).
 * 결정은 /admin/events/:id/decision.
 */
export function UploadReviewPanel({
  event,
  onDecided,
}: {
  event: AdminEventItem;
  onDecided: (decided: { eventId: string; nextStatus: string }) => void;
}) {
  const { t } = useTranslation('admin');
  const [docs, setDocs] = useState<AdminEventDocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<null | string>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setDocsLoading(true);
    setDocsError(null);
    fetchAdminEventDocuments(event.eventId, ctrl.signal)
      .then((r) => setDocs(r.items))
      .catch((e) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setDocsError(e instanceof Error ? e.message : 'unknown');
      })
      .finally(() => setDocsLoading(false));
    return () => ctrl.abort();
  }, [event.eventId]);

  const decide = async (action: 'approved' | 'revision_requested' | 'rejected') => {
    setPending(action);
    setErr(null);
    try {
      await decideAdminEvent(event.eventId, action, reason.trim() || undefined);
      onDecided({ eventId: event.eventId, nextStatus: action });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'decision failed');
    } finally {
      setPending(null);
    }
  };

  return (
    <div>
      <div className="mb-4 border-b border-(--color-border) pb-3">
        <div className="text-[12px] text-(--color-text-subtle)">
          event_id={event.eventId} · {event.approvalStatus}
        </div>
        <h2 className="mt-1 text-[16px] font-bold tracking-[-0.01em]">{event.title}</h2>
        <div className="mt-1 text-[12px] text-(--color-text-muted)">
          {event.category.name} · {event.region.sido}
          {event.region.sigungu ? ` ${event.region.sigungu}` : ''} · {event.startDate} ~ {event.endDate}
        </div>
        {event.aiSummary && (
          <p className="mt-2 whitespace-pre-wrap text-[12px] leading-[1.6] text-(--color-text-muted)">
            {event.aiSummary}
          </p>
        )}
      </div>

      <section className="mb-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="m-0 text-[13px] font-semibold">{t('uploadReview.documents')}</h3>
          <span className="text-[11px] text-(--color-text-subtle)">
            {t('uploadReview.docCount', { count: docs.length })}
          </span>
        </div>
        {docsLoading && (
          <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) p-4 text-center text-[12px] text-(--color-text-subtle)">
            {t('uploadReview.loading')}
          </div>
        )}
        {docsError && (
          <div className="rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[12px] text-(--color-error)">
            {docsError}
          </div>
        )}
        {!docsLoading && !docsError && docs.length === 0 && (
          <div className="rounded-(--radius-md) border border-(--color-warning)/30 bg-(--color-warning)/10 p-3 text-[12px] text-(--color-warning)">
            {t('uploadReview.noDocuments')}
          </div>
        )}
        {docs.length > 0 && (
          <ul className="flex flex-col gap-2">
            {docs.map((d) => (
              <li
                key={d.documentId}
                className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-2"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate font-medium text-(--color-text)">
                    {d.originalFilename}
                  </span>
                  <span className="shrink-0 text-(--color-text-subtle)">
                    {(d.fileSizeBytes / 1024).toFixed(0)} KB · {d.mimeType}
                  </span>
                </div>
                <a
                  href={d.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                  aria-label={t('document.openOriginal', { filename: d.originalFilename })}
                >
                  <img
                    src={d.previewUrl}
                    alt={d.originalFilename}
                    className="max-h-48 w-full rounded-(--radius-sm) bg-(--color-surface-alt) object-contain"
                    loading="lazy"
                  />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <label className="mb-1 block text-[13px] font-semibold">{t('uploadReview.reasonLabel')}</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder={t('uploadReview.reasonPlaceholder')}
          className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[13px] outline-none focus:border-(--color-accent)"
        />
        {err && (
          <div className="mt-2 text-[12px] text-(--color-error)">{err}</div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => decide('rejected')}
            disabled={pending !== null}
            className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-error)/40 bg-(--color-error)/5 px-3 text-[13px] font-medium text-(--color-error) hover:bg-(--color-error)/10 disabled:opacity-40"
          >
            {pending === 'rejected' ? '…' : t('uploadReview.reject')}
          </button>
          <button
            type="button"
            onClick={() => decide('revision_requested')}
            disabled={pending !== null}
            className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium text-(--color-text) hover:border-(--color-border-hover) disabled:opacity-40"
          >
            {pending === 'revision_requested' ? '…' : t('uploadReview.requestRevision')}
          </button>
          <button
            type="button"
            onClick={() => decide('approved')}
            disabled={pending !== null}
            className="inline-flex h-9 items-center rounded-(--radius-md) bg-(--color-accent) px-4 text-[13px] font-medium text-white hover:bg-(--color-accent-hover) disabled:opacity-40"
          >
            {pending === 'approved' ? '…' : t('uploadReview.approve')}
          </button>
        </div>
      </section>
    </div>
  );
}
