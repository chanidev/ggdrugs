import { useEffect, useState } from 'react';
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

const STATUS_LABEL: Record<UploaderApprovalStatus, string> = {
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

export function UploaderDetailPanel({
  uploaderId,
  onDecided,
}: {
  uploaderId: string;
  onDecided: () => void;
}) {
  const [data, setData] = useState<AdminUploaderDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | string>(null);

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
      await decideAdminUploader(uploaderId, action);
      onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'decision failed');
    } finally {
      setPending(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">불러오는 중…</div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
        {error ?? '조회 실패'}
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
            {STATUS_LABEL[u.approvalStatus]}
          </span>
          <span className="text-[12px] text-(--color-text-subtle)">
            uploader_id={u.uploaderId} · user_id={u.user.userId}
          </span>
        </div>
        <h2 className="mt-1 text-[16px] font-bold tracking-[-0.01em]">{u.organizationName}</h2>
        <dl className="mt-3 grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-(--color-text-subtle)">닉네임</dt>
          <dd className="m-0 text-(--color-text)">{u.user.nickname}</dd>
          <dt className="text-(--color-text-subtle)">가입 경로</dt>
          <dd className="m-0 text-(--color-text-muted)">{u.user.authProvider}</dd>
          <dt className="text-(--color-text-subtle)">이메일</dt>
          <dd className="m-0 text-(--color-text)">{u.contactEmail}</dd>
          <dt className="text-(--color-text-subtle)">연락처</dt>
          <dd className="m-0 tabular text-(--color-text)">{u.contactPhone}</dd>
          <dt className="text-(--color-text-subtle)">계정 생성</dt>
          <dd className="m-0 tabular text-(--color-text-muted)">
            {u.user.createdAt.slice(0, 10)}
          </dd>
          <dt className="text-(--color-text-subtle)">신청</dt>
          <dd className="m-0 tabular text-(--color-text-muted)">
            {u.createdAt.slice(0, 19).replace('T', ' ')}
          </dd>
          {u.approvedAt && (
            <>
              <dt className="text-(--color-text-subtle)">승인</dt>
              <dd className="m-0 tabular text-(--color-text-muted)">
                {u.approvedAt.slice(0, 19).replace('T', ' ')}
              </dd>
            </>
          )}
        </dl>
      </div>

      <section className="mb-4">
        <h3 className="m-0 mb-2 text-[13px] font-semibold">등록 이벤트 현황</h3>
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              { key: 'approved', label: '승인' },
              { key: 'pending', label: '대기' },
              { key: 'revision_requested', label: '보완' },
              { key: 'rejected', label: '반려' },
            ] as const
          ).map(({ key, label }) => (
            <div
              key={key}
              className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) p-2 text-center"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-(--color-text-subtle)">
                {label}
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
          <h3 className="m-0 mb-2 text-[13px] font-semibold">최근 이벤트</h3>
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
                  {STATUS_LABEL[e.approvalStatus]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canDecide && (
        <section className="border-t border-(--color-border) pt-3">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => decide('rejected')}
              disabled={pending !== null}
              className="inline-flex h-9 w-24 items-center justify-center rounded-(--radius-md) border border-(--color-error)/40 bg-(--color-error)/5 px-3 text-[13px] font-medium text-(--color-error) hover:bg-(--color-error)/10 disabled:opacity-40"
            >
              {pending === 'rejected' ? '…' : '반려'}
            </button>
            <button
              type="button"
              onClick={() => decide('revision_requested')}
              disabled={pending !== null}
              className="inline-flex h-9 w-24 items-center justify-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium text-(--color-text) hover:border-(--color-border-hover) disabled:opacity-40"
            >
              {pending === 'revision_requested' ? '…' : '보완요청'}
            </button>
            <button
              type="button"
              onClick={() => decide('approved')}
              disabled={pending !== null}
              className="inline-flex h-9 w-24 items-center justify-center rounded-(--radius-md) bg-(--color-accent) px-4 text-[13px] font-medium text-white hover:bg-(--color-accent-hover) disabled:opacity-40"
            >
              {pending === 'approved' ? '…' : '승인'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
