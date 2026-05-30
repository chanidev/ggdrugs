/**
 * ReportsTab — 관리자 신고 모더레이션 탭 (GG-REPORT-004~007, A_701)
 *
 * 좌: ReportsListPanel  — 신고 목록 + 필터 (status / targetType)
 * 우: ReportDetailPanel — 신고 상세 + 조치 결정 폼
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchAdminReports,
  fetchAdminReport,
  actionReport,
  type ReportItem,
  type ReportDetail,
  type ReportStatus,
  type ReportAdminAction,
} from '../../../lib/api/reports.js';

// ─── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status, adminAction }: { status: ReportStatus; adminAction: ReportAdminAction | null }) {
  const { t } = useTranslation('admin');
  if (status === 'pending') {
    return (
      <span className="inline-block rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
        {t('event.status.pending')}
      </span>
    );
  }
  if (status === 'dismissed') {
    return (
      <span className="inline-block rounded-full bg-(--color-surface-alt) px-2 py-0.5 text-[11px] font-semibold text-(--color-text-muted)">
        {t('report.dismiss')}
      </span>
    );
  }
  // reviewed
  if (adminAction === 'warned') {
    return (
      <span className="inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-700">
        {t('report.warn')}
      </span>
    );
  }
  if (adminAction === 'suspended') {
    return (
      <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        {t('report.suspend')}
      </span>
    );
  }
  if (adminAction === 'false_report') {
    return (
      <span className="inline-block rounded-full bg-(--color-surface-alt) px-2 py-0.5 text-[11px] font-semibold text-(--color-text-muted)">
        {t('report.falseReport')}
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-(--color-surface-alt) px-2 py-0.5 text-[11px] text-(--color-text-muted)">
      {t('report.reviewed')}
    </span>
  );
}

// ─── ReportsListPanel ──────────────────────────────────────────────────────────

function ReportsListPanel({
  selectedId,
  onSelect,
  onRefreshSignal,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefreshSignal: number;
}) {
  const { t } = useTranslation('admin');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>('any');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [total, setTotal] = useState(0);
  const [byStatus, setByStatus] = useState<Record<string, number>>({ pending: 0, reviewed: 0, dismissed: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const LIMIT = 20;

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      fetchAdminReports(
        { status: statusFilter, targetType: targetTypeFilter, page, limit: LIMIT },
        signal,
      )
        .then((res) => {
          setItems(res.items);
          setTotal(res.total);
          setByStatus(res.byStatus as unknown as Record<string, number>);
        })
        .catch((e: unknown) => {
          if ((e as Error).name === 'AbortError') return;
          setError(t('report.loadError'));
        })
        .finally(() => setLoading(false));
    },
    [statusFilter, targetTypeFilter, page, t],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, onRefreshSignal]);

  const STATUS_TABS: { key: string; label: string }[] = [
    { key: 'pending',   label: `${t('event.status.pending')} (${byStatus.pending ?? 0})` },
    { key: 'reviewed',  label: `${t('report.reviewed')} (${byStatus.reviewed ?? 0})` },
    { key: 'dismissed', label: `${t('report.dismiss')} (${byStatus.dismissed ?? 0})` },
    { key: 'any',       label: t('audit.eventAction.any') },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* 상태 탭 */}
      <div className="flex flex-wrap gap-1">
        {STATUS_TABS.map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            onClick={() => { setStatusFilter(tabItem.key); setPage(1); }}
            className={`rounded-(--radius-sm) px-3 py-1 text-[13px] transition-colors ${
              statusFilter === tabItem.key
                ? 'bg-(--color-accent) text-white font-semibold'
                : 'border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* targetType 필터 */}
      <select
        value={targetTypeFilter}
        onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}
        className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-[13px] text-(--color-text) focus:outline-none focus:border-(--color-accent)"
      >
        <option value="any">{t('report.typeAll')}</option>
        {(Object.keys({ post: '', comment: '', chat_message: '', mate_eval: '' }) as string[]).map((k) => (
          <option key={k} value={k}>{t(`report.targetType.${k}`)}</option>
        ))}
      </select>

      {/* 목록 */}
      {loading && <p className="text-[13px] text-(--color-text-muted)">{t('uploader.loading')}</p>}
      {error && <p className="text-[13px] text-(--color-danger)">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="py-6 text-center text-[13px] text-(--color-text-muted)">{t('report.empty')}</p>
      )}
      {!loading && items.length > 0 && (
        <div className="overflow-x-auto rounded-(--radius-lg) border border-(--color-border)">
          <table className="w-full text-[13px]">
            <thead className="bg-(--color-surface-alt) text-(--color-text-muted)">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('report.reportedAt')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('report.reporter')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('report.accused')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('report.type')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('report.reason')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('report.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {items.map((r) => (
                <tr
                  key={r.reportId}
                  onClick={() => onSelect(r.reportId)}
                  className={`cursor-pointer hover:bg-(--color-bg) ${
                    selectedId === r.reportId ? 'bg-(--color-bg)' : ''
                  }`}
                >
                  <td className="px-3 py-2 text-(--color-text-muted)">
                    {new Date(r.createdAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-3 py-2">{r.reporterNickname}</td>
                  <td className="px-3 py-2">{r.targetUserNickname}</td>
                  <td className="px-3 py-2 text-(--color-text-muted)">
                    {t(`report.targetType.${r.targetType}`, { defaultValue: r.targetType })}
                  </td>
                  <td className="px-3 py-2 text-(--color-text-muted)">
                    {t(`report.reasonLabel.${r.reason}`, { defaultValue: r.reason })}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} adminAction={r.adminAction} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 페이지네이션 */}
      {total > LIMIT && (
        <div className="flex items-center gap-2 text-[13px]">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-(--radius-sm) border border-(--color-border) px-2 py-1 disabled:opacity-40"
          >
            {t('report.prev')}
          </button>
          <span className="text-(--color-text-muted)">
            {page} / {Math.ceil(total / LIMIT)}
          </span>
          <button
            type="button"
            disabled={page >= Math.ceil(total / LIMIT)}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-(--radius-sm) border border-(--color-border) px-2 py-1 disabled:opacity-40"
          >
            {t('report.next')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ReportDetailPanel ─────────────────────────────────────────────────────────

function ReportDetailPanel({
  reportId,
  onActionDone,
}: {
  reportId: string;
  onActionDone: () => void;
}) {
  const { t } = useTranslation('admin');
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [actionSelect, setActionSelect] = useState<ReportAdminAction>('warned');
  const [suspendDays, setSuspendDays] = useState(7);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setDetail(null);
    fetchAdminReport(reportId, ctrl.signal)
      .then((d) => setDetail(d))
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        setError(t('report.detailLoadError'));
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [reportId, t]);

  const handleAction = async () => {
    if (!detail) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const trimmedNote = note.trim();
      await actionReport(reportId, {
        action: actionSelect,
        ...(trimmedNote ? { note: trimmedNote } : {}),
        ...(actionSelect === 'suspended' ? { suspendDays } : {}),
      });
      setNote('');
      onActionDone();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'ALREADY_REVIEWED' || msg === 'already_reviewed') {
        setSubmitError(t('report.alreadyReviewed'));
      } else if (msg === 'admin_scope_full_required') {
        setSubmitError(t('report.scopeFullRequired'));
      } else if (msg === 'admin_scope_content_required') {
        setSubmitError(t('report.scopeContentRequired'));
      } else {
        setSubmitError(t('report.actionError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-[13px] text-(--color-text-muted)">{t('uploader.loading')}</div>;
  }
  if (error) {
    return <div className="py-8 text-center text-[13px] text-(--color-danger)">{error}</div>;
  }
  if (!detail) return null;

  return (
    <div className="flex flex-col gap-4 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-5">
      {/* 신고 기본 정보 */}
      <div>
        <h3 className="mb-3 text-[15px] font-semibold">{t('report.detail')}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          <dt className="text-(--color-text-muted)">{t('report.reporter')}</dt>
          <dd>{detail.reporterNickname}</dd>
          <dt className="text-(--color-text-muted)">{t('report.accused')}</dt>
          <dd>
            {detail.targetUserNickname}
            {detail.targetUserSanctionStatus !== 'none' && (
              <span className="ml-2 text-[11px] text-(--color-danger)">
                [{detail.targetUserSanctionStatus}]
              </span>
            )}
          </dd>
          <dt className="text-(--color-text-muted)">{t('report.type')}</dt>
          <dd>{t(`report.targetType.${detail.targetType}`, { defaultValue: detail.targetType })}</dd>
          <dt className="text-(--color-text-muted)">{t('report.reason')}</dt>
          <dd>{t(`report.reasonLabel.${detail.reason}`, { defaultValue: detail.reason })}</dd>
          {detail.detail && (
            <>
              <dt className="text-(--color-text-muted)">{t('report.detail_label')}</dt>
              <dd className="break-all">{detail.detail}</dd>
            </>
          )}
          <dt className="text-(--color-text-muted)">{t('report.reportedAt')}</dt>
          <dd>{new Date(detail.createdAt).toLocaleString('ko-KR')}</dd>
          <dt className="text-(--color-text-muted)">{t('report.status')}</dt>
          <dd><StatusBadge status={detail.status} adminAction={detail.adminAction} /></dd>
        </dl>
      </div>

      {/* 신고된 콘텐츠 */}
      {detail.targetContent && (
        <div>
          <h4 className="mb-2 text-[13px] font-medium text-(--color-text-muted)">{t('report.content')}</h4>
          <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-bg) p-3 text-[13px]">
            {detail.targetType === 'post' && (
              <>
                <p className="font-medium">{String(detail.targetContent.title ?? '')}</p>
                <p className="mt-1 text-(--color-text-muted)">
                  {String(detail.targetContent.body ?? '').slice(0, 200)}
                  {String(detail.targetContent.body ?? '').length > 200 ? '…' : ''}
                </p>
              </>
            )}
            {detail.targetType === 'comment' && (
              <p>{String(detail.targetContent.body ?? '')}</p>
            )}
            {detail.targetType === 'chat_message' && (
              <>
                <p className="text-[11px] text-(--color-text-subtle) mb-1">
                  [{detail.targetContent.messageType as string}]
                </p>
                <p>{String(detail.targetContent.body ?? '')}</p>
              </>
            )}
            {detail.targetType === 'mate_eval' && (
              <>
                <p>{t('report.ratingLabel')}: {String(detail.targetContent.ratingStars ?? '')}점</p>
                {detail.targetContent.comment && (
                  <p className="mt-1">{String(detail.targetContent.comment)}</p>
                )}
                {detail.targetContent.reportedFor && (
                  <p className="mt-1 text-(--color-text-muted)">
                    {t('report.reportedForLabel')}: {t(`report.mateEvalReason.${detail.targetContent.reportedFor as string}`, { defaultValue: String(detail.targetContent.reportedFor) })}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 조치 결정 폼 (pending 상태만) */}
      {detail.status === 'pending' ? (
        <div>
          <h4 className="mb-3 text-[14px] font-semibold">{t('report.action')}</h4>
          <div className="flex flex-col gap-3">
            {/* 조치 선택 */}
            <select
              value={actionSelect}
              onChange={(e) => setActionSelect(e.target.value as ReportAdminAction)}
              className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-[14px] focus:outline-none focus:border-(--color-accent)"
            >
              <option value="warned">{t('report.warn')}</option>
              <option value="suspended">{t('report.suspend')}</option>
              <option value="false_report">{t('report.falseReport')}</option>
              <option value="dismissed">{t('report.dismiss')}</option>
            </select>

            {/* 이용정지 일수 (suspended 선택 시) */}
            {actionSelect === 'suspended' && (
              <div className="flex items-center gap-2">
                <label htmlFor="suspend-days" className="text-[13px] text-(--color-text-muted)">
                  {t('report.suspendDays')}
                </label>
                <input
                  id="suspend-days"
                  type="number"
                  min={1}
                  max={365}
                  value={suspendDays}
                  onChange={(e) => setSuspendDays(Math.min(365, Math.max(1, Number(e.target.value))))}
                  className="w-20 rounded-(--radius-md) border border-(--color-border) px-2 py-1 text-[14px] text-center focus:outline-none focus:border-(--color-accent)"
                />
                <span className="text-[13px] text-(--color-text-muted)">{t('report.suspendUnit')}</span>
              </div>
            )}

            {/* 관리자 메모 */}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('report.adminNotePlaceholder')}
              rows={2}
              className="resize-none rounded-(--radius-md) border border-(--color-border) px-3 py-2 text-[13px] placeholder:text-(--color-text-subtle) focus:outline-none focus:border-(--color-accent)"
            />

            {submitError && (
              <p role="alert" className="text-[12px] text-(--color-danger)">{submitError}</p>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={() => { void handleAction(); }}
              className="rounded-(--radius-md) bg-(--color-accent) py-2 text-[14px] font-semibold text-white disabled:opacity-40"
            >
              {submitting ? t('report.applying') : t('report.applyAction')}
            </button>
          </div>
        </div>
      ) : (
        /* 이미 처리된 신고 — 읽기 전용 */
        <div>
          <h4 className="mb-2 text-[14px] font-semibold">{t('report.result')}</h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            <dt className="text-(--color-text-muted)">{t('report.handledBy')}</dt>
            <dd>{detail.adminNickname ?? '-'}</dd>
            <dt className="text-(--color-text-muted)">{t('report.action')}</dt>
            <dd>
              <StatusBadge status={detail.status} adminAction={detail.adminAction} />
            </dd>
            {detail.adminNote && (
              <>
                <dt className="text-(--color-text-muted)">{t('report.adminNote')}</dt>
                <dd>{detail.adminNote}</dd>
              </>
            )}
            {detail.reviewedAt && (
              <>
                <dt className="text-(--color-text-muted)">{t('report.handledAt')}</dt>
                <dd>{new Date(detail.reviewedAt).toLocaleString('ko-KR')}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

// ─── ReportsTab ────────────────────────────────────────────────────────────────

export function ReportsTab() {
  const { t } = useTranslation('admin');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const handleActionDone = () => {
    setSelectedId(null);
    setRefreshSignal((s) => s + 1);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
      {/* 좌: 신고 목록 */}
      <div>
        <h2 className="mb-3 text-[16px] font-semibold">{t('tabs.reports')}</h2>
        <ReportsListPanel
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRefreshSignal={refreshSignal}
        />
      </div>

      {/* 우: 신고 상세 */}
      <div>
        {selectedId ? (
          <>
            <h2 className="mb-3 text-[16px] font-semibold">{t('report.detail')} / {t('report.action')}</h2>
            <ReportDetailPanel
              key={selectedId}
              reportId={selectedId}
              onActionDone={handleActionDone}
            />
          </>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-(--radius-lg) border border-dashed border-(--color-border) text-[13px] text-(--color-text-muted)">
            {t('report.selectHint')}
          </div>
        )}
      </div>
    </div>
  );
}
