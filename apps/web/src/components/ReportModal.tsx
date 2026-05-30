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
import { createReport, type ReportReason, type ReportTargetType } from '../lib/api/reports.js';

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetUserId: string;
  targetEntityId: string;
  onSuccess?: () => void;
}

const REASON_OPTIONS: { value: ReportReason; label: string; surfaces?: ReportTargetType[] }[] = [
  { value: 'spam',       label: '스팸/광고' },
  { value: 'abuse',      label: '욕설/혐오' },
  { value: 'harassment', label: '괴롭힘' },
  { value: 'obscene',    label: '음란물' },
  { value: 'no_show',    label: '노쇼', surfaces: ['mate_eval'] },
  { value: 'etc',        label: '기타' },
];

export function ReportModal({
  open,
  onClose,
  targetType,
  targetUserId,
  targetEntityId,
  onSuccess,
}: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [detail, setDetail] = useState('');
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [toast, setToast] = useState(false);

  if (!open) return null;

  const visibleOptions = REASON_OPTIONS.filter(
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
        setInlineError('이미 신고한 내용입니다.');
      } else if (msg === 'UNAUTHENTICATED') {
        setInlineError('로그인이 필요합니다.');
      } else {
        setInlineError('신고 접수 중 오류가 발생했어요. 다시 시도해 주세요.');
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
      aria-label="신고하기"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 패널 */}
      <div className="w-full max-w-[400px] rounded-(--radius-lg) bg-(--color-surface) p-6 shadow-lg">
        {/* 헤더 */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">신고하기</h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-(--radius-sm) text-(--color-text-muted) hover:bg-(--color-surface-alt) hover:text-(--color-text)"
          >
            ✕
          </button>
        </div>

        {/* 신고 사유 라디오 */}
        <fieldset className="mb-4">
          <legend className="mb-2 text-[13px] font-medium text-(--color-text-muted)">신고 사유</legend>
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
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* 상세 사유 */}
        <div className="mb-4">
          <label htmlFor="report-detail" className="mb-1 block text-[13px] font-medium">
            상세 사유 <span className="text-(--color-text-muted)">(선택, 최대 500자)</span>
          </label>
          <textarea
            id="report-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="구체적인 내용을 입력하면 처리에 도움이 됩니다."
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
            신고가 접수되었습니다.
          </p>
        )}

        {/* 제출 버튼 */}
        <button
          type="button"
          disabled={!reason || loading}
          onClick={() => { void handleSubmit(); }}
          className="w-full rounded-(--radius-md) bg-(--color-accent) py-2.5 text-[14px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? '신고 중…' : '신고 접수'}
        </button>
      </div>
    </div>
  );
}
