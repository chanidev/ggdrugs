import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  decideAdminUploader,
  fetchAdminUploaderDetail,
  type AdminUploaderDetailResponse,
  type UploaderApprovalStatus,
} from '../../lib/api';

/**
 * 관리자 업로더 승급 심사 상세 패널.
 *
 * 왼쪽 리스트에서 uploaderId 를 받아 /admin/uploaders/:id 로 profile + 이벤트
 * 통계 + 최근 이벤트 5건을 fetch. 승인/보완/반려 결정 버튼 포함 (리스트의 인라인
 * 버튼은 2-col 구조 전환에서 이 패널로 이동).
 */

const STATUS_TONE: Record<UploaderApprovalStatus, string> = {
  pending: 'bg-(--color-warning)/10 text-(--color-warning)',
  approved: 'bg-(--color-success)/10 text-(--color-success)',
  revision_requested: 'bg-(--color-warning)/10 text-(--color-warning)',
  rejected: 'bg-(--color-error)/10 text-(--color-error)',
};

export function UploaderDetailPanel({
  uploaderId,
  onDecided,
}: {
  uploaderId: string;
  onDecided: () => void;
}) {
  const { t } = useTranslation('admin');
  const [data, setData] = useState<AdminUploaderDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | string>(null);
  // ADR 0005 E-8: reason 은 BFF 에선 모두 optional. UX 상 반려/보완요청은 강제 (audit 가치).
  const [reason, setReason] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchAdminUploaderDetail(uploaderId, ctrl.signal)
      .then((r) => setData(r))
      .catch((e) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [uploaderId]);

  const decide = async (action: 'approved' | 'revision_requested' | 'rejected') => {
    setPending(action);
    setError(null);
    try {
      await decideAdminUploader(uploaderId, action, reason);
      setReason('');
      onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'decision failed');
    } finally {
      setPending(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">{t('uploader.loading')}</div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
        {error ?? t('uploader.loadError')}
      </div>
    );
  }

  const { uploader: u, eventStats, recentEvents } = data;
  const canDecide =
    u.approvalStatus === 'pending' || u.approvalStatus === 'revision_requested';

  return (
    <div>
      <div className="mb-4 border-b border-(--color-border) pb-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-(--radius-sm) px-2 py-[2px] text-[11px] font-semibold ${
              STATUS_TONE[u.approvalStatus]
            }`}
          >
            {t(`member.uploaderStatus.${u.approvalStatus}`)}
          </span>
          <span className="text-[12px] text-(--color-text-subtle)">
            uploader_id={u.uploaderId} · user_id={u.user.userId}
          </span>
        </div>
        <h2 className="mt-1 text-[16px] font-bold tracking-[-0.01em]">{u.organizationName}</h2>
        <dl className="mt-3 grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-(--color-text-subtle)">{t('uploader.nickname')}</dt>
          <dd className="m-0 text-(--color-text)">{u.user.nickname}</dd>
          <dt className="text-(--color-text-subtle)">{t('uploader.joinMethod')}</dt>
          <dd className="m-0 text-(--color-text-muted)">{u.user.authProvider}</dd>
          <dt className="text-(--color-text-subtle)">{t('uploader.email')}</dt>
          <dd className="m-0 text-(--color-text)">{u.contactEmail}</dd>
          <dt className="text-(--color-text-subtle)">{t('uploader.contact')}</dt>
          <dd className="m-0 tabular text-(--color-text)">{u.contactPhone}</dd>
          <dt className="text-(--color-text-subtle)">{t('uploader.createdAt')}</dt>
          <dd className="m-0 tabular text-(--color-text-muted)">
            {u.user.createdAt.slice(0, 10)}
          </dd>
          <dt className="text-(--color-text-subtle)">{t('uploader.appliedAt')}</dt>
          <dd className="m-0 tabular text-(--color-text-muted)">
            {u.createdAt.slice(0, 19).replace('T', ' ')}
          </dd>
          {u.approvedAt && (
            <>
              <dt className="text-(--color-text-subtle)">{t('uploader.approvedAt')}</dt>
              <dd className="m-0 tabular text-(--color-text-muted)">
                {u.approvedAt.slice(0, 19).replace('T', ' ')}
              </dd>
            </>
          )}
        </dl>
      </div>

      <section className="mb-4">
        <h3 className="m-0 mb-2 text-[13px] font-semibold">
          {t('uploader.identity')}
          {data.adminScope !== 'full' && (
            <span className="ml-2 text-[11px] font-normal text-(--color-warning)">
              {t('uploader.maskingNote', { scope: data.adminScope })}
            </span>
          )}
        </h3>
        <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-(--color-text-subtle)">{t('uploader.realName')}</dt>
          <dd className="m-0 text-(--color-text)">{u.realName || t('uploader.notRegistered')}</dd>
          {u.businessRegistrationNumber && (
            <>
              <dt className="text-(--color-text-subtle)">{t('uploader.businessNo')}</dt>
              <dd className="m-0 tabular text-(--color-text)">{u.businessRegistrationNumber}</dd>
            </>
          )}
          {u.ciHash && (
            <>
              <dt className="text-(--color-text-subtle)">{t('uploader.idVerified')}</dt>
              <dd className="m-0 font-mono text-[11px] text-(--color-text)">{u.ciHash}</dd>
            </>
          )}
        </dl>
      </section>

      {data.documents.length > 0 && (
        <section className="mb-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="m-0 text-[13px] font-semibold">{t('uploader.documents')}</h3>
            <span className="text-[11px] text-(--color-text-subtle)">
              {t('uploader.docCount', { count: data.documents.length })}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {data.documents.map((d) => (
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
                {d.mimeType === 'application/pdf' ? (
                  <a
                    href={d.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface-alt) px-3 text-[12px] font-medium hover:border-(--color-border-hover)"
                  >
                    {t('uploader.openPdf')}
                  </a>
                ) : (
                  <a
                    href={d.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                    aria-label={`${d.originalFilename} 원본`}
                  >
                    <img
                      src={d.previewUrl}
                      alt={d.originalFilename}
                      className="max-h-48 w-full rounded-(--radius-sm) bg-(--color-surface-alt) object-contain"
                      loading="lazy"
                    />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-4">
        <h3 className="m-0 mb-2 text-[13px] font-semibold">{t('uploader.eventStats')}</h3>
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              { key: 'approved',           labelKey: 'event.approve' },
              { key: 'pending',             labelKey: 'event.status.pending' },
              { key: 'revision_requested',  labelKey: 'uploader.requestRevision' },
              { key: 'rejected',            labelKey: 'event.reject' },
            ] as const
          ).map(({ key, labelKey }) => (
            <div
              key={key}
              className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) p-2 text-center"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-(--color-text-subtle)">
                {t(labelKey)}
              </div>
              <div className="tabular mt-0.5 text-[16px] font-bold text-(--color-text)">
                {eventStats[key]}
              </div>
            </div>
          ))}
        </div>
      </section>

      {recentEvents.length > 0 && (
        <section className="mb-4">
          <h3 className="m-0 mb-2 text-[13px] font-semibold">{t('uploader.recentEvents')}</h3>
          <ul className="flex flex-col gap-1.5">
            {recentEvents.map((e) => (
              <li
                key={e.eventId}
                className="flex items-start justify-between gap-2 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-2 text-[12px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-(--color-text)">{e.title}</div>
                  <div className="mt-0.5 text-(--color-text-subtle)">
                    {e.categoryName} · {e.startDate} ~ {e.endDate}
                  </div>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded-(--radius-sm) px-1.5 py-[1px] text-[10px] font-semibold ${
                    STATUS_TONE[e.approvalStatus]
                  }`}
                >
                  {t(`member.uploaderStatus.${e.approvalStatus}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canDecide && (
        <section className="border-t border-(--color-border) pt-3">
          {/* ADR 0005 E-8: 반려/보완요청은 reason 필수 (UX 강제), 승인은 optional. */}
          <label className="block">
            <span className="m-0 mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-(--color-text-subtle)">
              {t('uploader.reasonLabel')}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 2000))}
              rows={3}
              maxLength={2000}
              placeholder={t('uploader.reasonPlaceholder')}
              className="w-full resize-y rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-2 text-[13px] text-(--color-text) placeholder:text-(--color-text-subtle) focus:border-(--color-border-hover) focus:outline-none"
            />
            <span className="tabular m-0 mt-0.5 block text-right text-[10px] text-(--color-text-subtle)">
              {reason.trim().length} / 2000
            </span>
          </label>
          <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => decide('rejected')}
              disabled={pending !== null || reason.trim().length === 0}
              title={reason.trim().length === 0 ? t('uploader.reasonRequired') : ''}
              className="inline-flex h-9 w-24 items-center justify-center rounded-(--radius-md) border border-(--color-error)/40 bg-(--color-error)/5 px-3 text-[13px] font-medium text-(--color-error) hover:bg-(--color-error)/10 disabled:opacity-40"
            >
              {pending === 'rejected' ? '…' : t('uploader.reject')}
            </button>
            <button
              type="button"
              onClick={() => decide('revision_requested')}
              disabled={pending !== null || reason.trim().length === 0}
              title={reason.trim().length === 0 ? t('uploader.reasonRequired') : ''}
              className="inline-flex h-9 w-24 items-center justify-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium text-(--color-text) hover:border-(--color-border-hover) disabled:opacity-40"
            >
              {pending === 'revision_requested' ? '…' : t('uploader.requestRevision')}
            </button>
            <button
              type="button"
              onClick={() => decide('approved')}
              disabled={pending !== null}
              className="inline-flex h-9 w-24 items-center justify-center rounded-(--radius-md) bg-(--color-accent) px-4 text-[13px] font-medium text-white hover:bg-(--color-accent-hover) disabled:opacity-40"
            >
              {pending === 'approved' ? '…' : t('uploader.approve')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
