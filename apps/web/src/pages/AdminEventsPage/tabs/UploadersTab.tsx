import { useCallback, useEffect, useState } from 'react';
import { UploaderDetailPanel } from '../../../components/admin/UploaderDetailPanel';
import {
  fetchAdminUploaders,
  type AdminUploaderItem,
  type UploaderApprovalStatus,
} from '../../../lib/api';

// =============================================================
// Uploaders Tab — A_700 part 2
// =============================================================

const UPLOADER_STATUS_LABEL: Record<UploaderApprovalStatus, string> = {
  pending: '대기',
  approved: '승인됨',
  revision_requested: '보완요청',
  rejected: '반려',
};

const STATUS_TONE: Record<UploaderApprovalStatus, string> = {
  pending: 'bg-(--color-warning)/10 text-(--color-warning)',
  approved: 'bg-(--color-success)/10 text-(--color-success)',
  revision_requested: 'bg-(--color-warning)/10 text-(--color-warning)',
  rejected: 'bg-(--color-error)/10 text-(--color-error)',
};

export function UploadersTab() {
  const [statusFilter, setStatusFilter] = useState<UploaderApprovalStatus | 'any'>('pending');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [items, setItems] = useState<AdminUploaderItem[]>([]);
  const [total, setTotal] = useState(0);
  const [byStatus, setByStatus] = useState<Record<UploaderApprovalStatus, number>>({
    pending: 0,
    approved: 0,
    revision_requested: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = useCallback(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchAdminUploaders({ status: statusFilter, page, limit }, ctrl.signal)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
        setByStatus(r.byStatus);
        if (selectedId && !r.items.some((u) => u.uploaderId === selectedId)) {
          setSelectedId(null);
        }
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown error');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [statusFilter, page, limit, selectedId]);

  useEffect(() => {
    return reload();
  }, [reload]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const FILTERS: { key: UploaderApprovalStatus | 'any'; label: string }[] = [
    { key: 'pending', label: `대기 ${byStatus.pending}` },
    { key: 'revision_requested', label: `보완요청 ${byStatus.revision_requested}` },
    { key: 'approved', label: `승인됨 ${byStatus.approved}` },
    { key: 'rejected', label: `반려 ${byStatus.rejected}` },
    { key: 'any', label: '전체' },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap rounded-(--radius-md) border border-(--color-border) p-0.5">
            {FILTERS.map((opt) => {
              const active = statusFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setPage(1);
                    setStatusFilter(opt.key);
                  }}
                  className={`h-8 rounded-[6px] px-3 text-[13px] font-medium transition-colors ${
                    active
                      ? 'bg-(--color-accent) text-white'
                      : 'text-(--color-text-muted) hover:text-(--color-text)'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <span className="ml-auto text-[12px] text-(--color-text-subtle)">
            {total.toLocaleString()}건
          </span>
        </div>

        {error && (
          <div className="mb-3 rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
            불러오기 실패: {error}
          </div>
        )}

        <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
          {loading && items.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">불러오는 중…</div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-(--color-text-subtle)">
              {statusFilter === 'pending' ? '대기 중인 승급 신청이 없어요.' : '결과 없음'}
            </div>
          ) : (
            <ul className="divide-y divide-(--color-border)">
              {items.map((u) => (
                <li key={u.uploaderId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(u.uploaderId)}
                    className={`flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-(--color-surface-alt) ${
                      selectedId === u.uploaderId ? 'bg-(--color-surface-alt)' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex shrink-0 items-center rounded-(--radius-sm) px-2 py-[2px] text-[11px] font-semibold tracking-[0.02em] ${
                            STATUS_TONE[u.approvalStatus]
                          }`}
                        >
                          {UPLOADER_STATUS_LABEL[u.approvalStatus]}
                        </span>
                        <span className="text-[12px] text-(--color-text-subtle)">
                          uploader_id={u.uploaderId} · {u.user.authProvider}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[15px] font-semibold tracking-[-0.01em]">
                        {u.organizationName}
                      </div>
                      <div className="mt-0.5 text-[12px] text-(--color-text-muted)">
                        {u.user.nickname} · {u.contactEmail}
                      </div>
                      <div className="mt-0.5 tabular text-[11px] text-(--color-text-subtle)">
                        신청 {u.createdAt.slice(0, 10)}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 rounded-(--radius-md) border border-(--color-border) px-3 text-[13px] disabled:opacity-40"
            >
              이전
            </button>
            <span className="text-[13px] text-(--color-text-muted)">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 rounded-(--radius-md) border border-(--color-border) px-3 text-[13px] disabled:opacity-40"
            >
              다음
            </button>
          </div>
        )}
      </section>

      <aside className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4 md:sticky md:top-4 md:h-fit">
        {selectedId ? (
          <UploaderDetailPanel
            uploaderId={selectedId}
            onDecided={() => {
              setSelectedId(null);
              reload();
            }}
          />
        ) : (
          <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">
            왼쪽에서 업로더를 선택하면 상세 정보와 결정 버튼이 나와요
          </div>
        )}
      </aside>
    </div>
  );
}
