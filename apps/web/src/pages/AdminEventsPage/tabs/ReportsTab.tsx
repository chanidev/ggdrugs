/**
 * ReportsTab — 관리자 신고 모더레이션 탭 (GG-REPORT-004~007, A_701)
 *
 * 좌: ReportsListPanel  — 신고 목록 + 필터 (status / targetType)
 * 우: ReportDetailPanel — 신고 상세 + 조치 결정 폼
 */

import { useCallback, useEffect, useState } from 'react';
import {
  fetchAdminReports,
  fetchAdminReport,
  actionReport,
  type ReportItem,
  type ReportDetail,
  type ReportStatus,
  type ReportAdminAction,
} from '../../../lib/api/reports.js';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const TARGET_TYPE_LABELS: Record<string, string> = {
  post: '게시글',
  comment: '댓글',
  chat_message: '채팅 메시지',
  mate_eval: '메이트 평가',
};

const REASON_LABELS: Record<string, string> = {
  spam: '스팸/광고',
  abuse: '욕설/혐오',
  harassment: '괴롭힘',
  obscene: '음란물',
  no_show: '노쇼',
  etc: '기타',
};

const REPORTED_FOR_LABELS: Record<string, string> = {
  inappropriate: '부적절한 언행',
  harassing: '괴롭힘/폭력',
  no_show: '노쇼',
  etc: '기타',
};

// ─── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status, adminAction }: { status: ReportStatus; adminAction: ReportAdminAction | null }) {
  if (status === 'pending') {
    return (
      <span className="inline-block rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
        대기
      </span>
    );
  }
  if (status === 'dismissed') {
    return (
      <span className="inline-block rounded-full bg-(--color-surface-alt) px-2 py-0.5 text-[11px] font-semibold text-(--color-text-muted)">
        기각
      </span>
    );
  }
  // reviewed
  if (adminAction === 'warned') {
    return (
      <span className="inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-700">
        경고
      </span>
    );
  }
  if (adminAction === 'suspended') {
    return (
      <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        정지
      </span>
    );
  }
  if (adminAction === 'false_report') {
    return (
      <span className="inline-block rounded-full bg-(--color-surface-alt) px-2 py-0.5 text-[11px] font-semibold text-(--color-text-muted)">
        허위신고
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-(--color-surface-alt) px-2 py-0.5 text-[11px] text-(--color-text-muted)">
      검토됨
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
          setError('신고 목록을 불러오지 못했어요.');
        })
        .finally(() => setLoading(false));
    },
    [statusFilter, targetTypeFilter, page],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, onRefreshSignal]);

  const STATUS_TABS: { key: string; label: string }[] = [
    { key: 'pending', label: `대기 (${byStatus.pending ?? 0})` },
    { key: 'reviewed', label: `검토됨 (${byStatus.reviewed ?? 0})` },
    { key: 'dismissed', label: `기각 (${byStatus.dismissed ?? 0})` },
    { key: 'any', label: '전체' },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* 상태 탭 */}
      <div className="flex flex-wrap gap-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setStatusFilter(t.key); setPage(1); }}
            className={`rounded-(--radius-sm) px-3 py-1 text-[13px] transition-colors ${
              statusFilter === t.key
                ? 'bg-(--color-accent) text-white font-semibold'
                : 'border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* targetType 필터 */}
      <select
        value={targetTypeFilter}
        onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}
        className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-[13px] text-(--color-text) focus:outline-none focus:border-(--color-accent)"
      >
        <option value="any">유형: 전체</option>
        {Object.entries(TARGET_TYPE_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>

      {/* 목록 */}
      {loading && <p className="text-[13px] text-(--color-text-muted)">불러오는 중…</p>}
      {error && <p className="text-[13px] text-(--color-danger)">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="py-6 text-center text-[13px] text-(--color-text-muted)">신고 없음</p>
      )}
      {!loading && items.length > 0 && (
        <div className="overflow-x-auto rounded-(--radius-lg) border border-(--color-border)">
          <table className="w-full text-[13px]">
            <thead className="bg-(--color-surface-alt) text-(--color-text-muted)">
              <tr>
                <th className="px-3 py-2 text-left font-medium">신고일</th>
                <th className="px-3 py-2 text-left font-medium">신고자</th>
                <th className="px-3 py-2 text-left font-medium">피신고자</th>
                <th className="px-3 py-2 text-left font-medium">유형</th>
                <th className="px-3 py-2 text-left font-medium">사유</th>
                <th className="px-3 py-2 text-left font-medium">상태</th>
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
                    {TARGET_TYPE_LABELS[r.targetType] ?? r.targetType}
                  </td>
                  <td className="px-3 py-2 text-(--color-text-muted)">
                    {REASON_LABELS[r.reason] ?? r.reason}
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
            이전
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
            다음
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
        setError('상세 정보를 불러오지 못했어요.');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [reportId]);

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
        setSubmitError('이미 처리된 신고입니다.');
      } else if (msg === 'admin_scope_full_required') {
        setSubmitError('이용정지 조치는 full 권한이 필요합니다.');
      } else if (msg === 'admin_scope_content_required') {
        setSubmitError('콘텐츠 관리 권한이 필요합니다.');
      } else {
        setSubmitError('조치 적용 중 오류가 발생했어요.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-[13px] text-(--color-text-muted)">불러오는 중…</div>;
  }
  if (error) {
    return <div className="py-8 text-center text-[13px] text-(--color-danger)">{error}</div>;
  }
  if (!detail) return null;

  return (
    <div className="flex flex-col gap-4 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-5">
      {/* 신고 기본 정보 */}
      <div>
        <h3 className="mb-3 text-[15px] font-semibold">신고 상세</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          <dt className="text-(--color-text-muted)">신고자</dt>
          <dd>{detail.reporterNickname}</dd>
          <dt className="text-(--color-text-muted)">피신고자</dt>
          <dd>
            {detail.targetUserNickname}
            {detail.targetUserSanctionStatus !== 'none' && (
              <span className="ml-2 text-[11px] text-(--color-danger)">
                [{detail.targetUserSanctionStatus}]
              </span>
            )}
          </dd>
          <dt className="text-(--color-text-muted)">유형</dt>
          <dd>{TARGET_TYPE_LABELS[detail.targetType] ?? detail.targetType}</dd>
          <dt className="text-(--color-text-muted)">사유</dt>
          <dd>{REASON_LABELS[detail.reason] ?? detail.reason}</dd>
          {detail.detail && (
            <>
              <dt className="text-(--color-text-muted)">상세</dt>
              <dd className="break-all">{detail.detail}</dd>
            </>
          )}
          <dt className="text-(--color-text-muted)">신고일</dt>
          <dd>{new Date(detail.createdAt).toLocaleString('ko-KR')}</dd>
          <dt className="text-(--color-text-muted)">상태</dt>
          <dd><StatusBadge status={detail.status} adminAction={detail.adminAction} /></dd>
        </dl>
      </div>

      {/* 신고된 콘텐츠 */}
      {detail.targetContent && (
        <div>
          <h4 className="mb-2 text-[13px] font-medium text-(--color-text-muted)">신고 콘텐츠</h4>
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
                <p>별점: {String(detail.targetContent.ratingStars ?? '')}점</p>
                {detail.targetContent.comment && (
                  <p className="mt-1">{String(detail.targetContent.comment)}</p>
                )}
                {detail.targetContent.reportedFor && (
                  <p className="mt-1 text-(--color-text-muted)">
                    신고 사유: {REPORTED_FOR_LABELS[detail.targetContent.reportedFor as string] ?? String(detail.targetContent.reportedFor)}
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
          <h4 className="mb-3 text-[14px] font-semibold">조치 결정</h4>
          <div className="flex flex-col gap-3">
            {/* 조치 선택 */}
            <select
              value={actionSelect}
              onChange={(e) => setActionSelect(e.target.value as ReportAdminAction)}
              className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-[14px] focus:outline-none focus:border-(--color-accent)"
            >
              <option value="warned">경고</option>
              <option value="suspended">이용정지</option>
              <option value="false_report">허위신고</option>
              <option value="dismissed">기각</option>
            </select>

            {/* 이용정지 일수 (suspended 선택 시) */}
            {actionSelect === 'suspended' && (
              <div className="flex items-center gap-2">
                <label htmlFor="suspend-days" className="text-[13px] text-(--color-text-muted)">
                  정지 기간
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
                <span className="text-[13px] text-(--color-text-muted)">일</span>
              </div>
            )}

            {/* 관리자 메모 */}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="관리자 메모 (선택)"
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
              {submitting ? '처리 중…' : '조치 적용'}
            </button>
          </div>
        </div>
      ) : (
        /* 이미 처리된 신고 — 읽기 전용 */
        <div>
          <h4 className="mb-2 text-[14px] font-semibold">처리 결과</h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            <dt className="text-(--color-text-muted)">처리 관리자</dt>
            <dd>{detail.adminNickname ?? '-'}</dd>
            <dt className="text-(--color-text-muted)">조치</dt>
            <dd>
              <StatusBadge status={detail.status} adminAction={detail.adminAction} />
            </dd>
            {detail.adminNote && (
              <>
                <dt className="text-(--color-text-muted)">관리자 메모</dt>
                <dd>{detail.adminNote}</dd>
              </>
            )}
            {detail.reviewedAt && (
              <>
                <dt className="text-(--color-text-muted)">처리일시</dt>
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
        <h2 className="mb-3 text-[16px] font-semibold">신고 목록</h2>
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
            <h2 className="mb-3 text-[16px] font-semibold">상세 / 조치</h2>
            <ReportDetailPanel
              key={selectedId}
              reportId={selectedId}
              onActionDone={handleActionDone}
            />
          </>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-(--radius-lg) border border-dashed border-(--color-border) text-[13px] text-(--color-text-muted)">
            목록에서 신고를 선택하세요
          </div>
        )}
      </div>
    </div>
  );
}
