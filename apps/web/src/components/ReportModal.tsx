/**
 * ReportModal — 공통 신고 모달 (GG-REPORT-001~003)
 *
 * surface: post / comment / chat_message / mate_eval
 *
 * 사용:
 *   <ReportModal
 *     open={reportOpen}
 *     onClose={() => setReportOpen(false)}
 *     targetType="post"
 *     targetUserId={post.authorUserId}
 *     targetEntityId={post.postId}
 *     onSuccess={() => { ... }}
 *   />
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createReport, type ReportReason, type ReportTargetType } from '../lib/api/reports.js';

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetUserId: string;
  targetEntityId: string;
  onSuccess?: () => void;
}

const REASON_VALUES: { value: ReportReason; surfaces?: ReportTargetType[] }[] = [
  { value: 'spam' },
  { value: 'abuse' },
  { value: 'harassment' },
  { value: 'obscene' },
  { value: 'no_show', surfaces: ['mate_eval'] },
  { value: 'etc' },
];

export function ReportModal({
  open,
  onClose,
  targetType,
  targetUserId,
  targetEntityId,
  onSuccess,
}: ReportModalProps) {
  const { t } = useTranslation('common');
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [detail, setDetail] = useState('');
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [toast, setToast] = useState(false);

  if (!open) return null;

  const visibleOptions = REASON_VALUES.filter(
    (o) => !o.surfaces || o.surfaces.includes(targetType),
  );

  const handleSubmit = async () => {
    if (!reason) return;
    setLoading(true);
    setInlineError(null);
    try {
      const trimmedDetail = detail.trim();
      await createReport({
        targetUserId,
        targetType,
        targetEntityId,
        reason,
        ...(trimmedDetail ? { detail: trimmedDetail } : {}),
      });
      setToast(true);
      setTimeout(() => {
        setToast(false);
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'already_reported') {
        setInlineError(t('report.error.duplicate'));
      } else if (msg === 'UNAUTHENTICATED') {
        setInlineError(t('report.error.unauthenticated'));
      } else {
        setInlineError(t('report.error.generic'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    /* 오버레이 */
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('report.ariaLabel')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 패널 */}
      <div className="w-full max-w-[400px] rounded-(--radius-lg) bg-(--color-surface) p-6 shadow-lg">
        {/* 헤더 */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">{t('button.report')}</h2>
          <button
            type="button"
            aria-label={t('button.close')}
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-(--radius-sm) text-(--color-text-muted) hover:bg-(--color-surface-alt) hover:text-(--color-text)"
          >
            ✕
          </button>
        </div>

        {/* 신고 사유 라디오 */}
        <fieldset className="mb-4">
          <legend className="mb-2 text-[13px] font-medium text-(--color-text-muted)">{t('report.reasonLabel')}</legend>
          <div className="flex flex-col gap-2">
            {visibleOptions.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 rounded-(--radius-md) border border-(--color-border) px-3 py-2 text-[14px] transition-colors hover:bg-(--color-surface-alt) has-[:checked]:border-(--color-accent) has-[:checked]:bg-(--color-accent)/5"
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={o.value}
                  checked={reason === o.value}
                  onChange={() => setReason(o.value)}
                  className="accent-(--color-accent)"
                />
                {t(`report.reasons.${o.value}`)}
              </label>
            ))}
          </div>
        </fieldset>

        {/* 상세 사유 */}
        <div className="mb-4">
          <label htmlFor="report-detail" className="mb-1 block text-[13px] font-medium">
            {t('report.detailLabelFull')}
          </label>
          <textarea
            id="report-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t('report.placeholder')}
            className="w-full resize-none rounded-(--radius-md) border border-(--color-border) px-3 py-2 text-[13px] text-(--color-text) placeholder:text-(--color-text-subtle) focus:border-(--color-accent) focus:outline-none"
          />
          <p className="mt-0.5 text-right text-[11px] text-(--color-text-subtle)">{detail.length}/500</p>
        </div>

        {/* 인라인 에러 */}
        {inlineError && (
          <p role="alert" className="mb-3 text-[13px] text-(--color-danger)">{inlineError}</p>
        )}

        {/* 성공 토스트 */}
        {toast && (
          <p role="status" className="mb-3 text-[13px] font-medium text-(--color-accent)">
            {t('report.success')}
          </p>
        )}

        {/* 제출 버튼 */}
        <button
          type="button"
          disabled={!reason || loading}
          onClick={() => { void handleSubmit(); }}
          className="w-full rounded-(--radius-md) bg-(--color-accent) py-2.5 text-[14px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? t('report.submitting') : t('button.report')}
        </button>
      </div>
    </div>
  );
}
