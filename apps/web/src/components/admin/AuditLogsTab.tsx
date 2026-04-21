import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { fetchAdminAuditLogs, type AdminAuditLogItem } from '../../lib/api';

/**
 * A_700c 관리자 감사 로그 탭.
 *
 * approval_logs 조회 — 액션 필터, eventId 검색(선택). 페이지네이션.
 * 이벤트가 삭제되지 않은 경우 상세 링크 제공.
 */

type ActionFilter = 'any' | 'approved' | 'revision_requested' | 'rejected';

const ACTION_LABEL: Record<AdminAuditLogItem['action'], string> = {
  approved: '승인',
  revision_requested: '보완 요청',
  rejected: '반려',
};

const ACTION_TONE: Record<AdminAuditLogItem['action'], string> = {
  approved: 'bg-(--color-success)/10 text-(--color-success)',
  revision_requested: 'bg-(--color-warning)/10 text-(--color-warning)',
  rejected: 'bg-(--color-error)/10 text-(--color-error)',
};

const PAGE_SIZE = 50;

export function AuditLogsTab() {
  const [action, setAction] = useState<ActionFilter>('any');
  const [eventIdQ, setEventIdQ] = useState('');
  const [eventIdInput, setEventIdInput] = useState('');
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<AdminAuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [byAction, setByAction] = useState<{ approved: number; revision_requested: number; rejected: number }>({
    approved: 0,
    revision_requested: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const query: Parameters<typeof fetchAdminAuditLogs>[0] = {
      page,
      limit: PAGE_SIZE,
      action,
    };
    if (eventIdQ) query.eventId = eventIdQ;
    fetchAdminAuditLogs(query, ctrl.signal)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
        setByAction(r.byAction);
      })
      .catch((e) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [action, eventIdQ, page]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const FILTERS: { key: ActionFilter; label: string; count?: number }[] = [
    { key: 'any', label: '전체', count: byAction.approved + byAction.revision_requested + byAction.rejected },
    { key: 'approved', label: '승인', count: byAction.approved },
    { key: 'revision_requested', label: '보완', count: byAction.revision_requested },
    { key: 'rejected', label: '반려', count: byAction.rejected },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-(--radius-md) border border-(--color-border) p-0.5">
          {FILTERS.map((f) => {
            const active = action === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setAction(f.key);
                  setPage(1);
                }}
                className={`h-8 rounded-[6px] px-3 text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-(--color-accent) text-white'
                    : 'text-(--color-text-muted) hover:text-(--color-text)'
                }`}
              >
                {f.label}
                {typeof f.count === 'number' && (
                  <span className={`ml-1.5 tabular text-[11px] ${active ? 'text-white/80' : 'text-(--color-text-subtle)'}`}>
                    {f.count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setEventIdQ(eventIdInput.trim());
            setPage(1);
          }}
          className="inline-flex items-center gap-1.5"
        >
          <input
            type="text"
            inputMode="numeric"
            value={eventIdInput}
            onChange={(e) => setEventIdInput(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="eventId 로 필터"
            className="h-8 w-[160px] rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2.5 text-[12px] outline-none focus:border-(--color-accent)"
          />
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[12px] font-medium text-(--color-text-muted) hover:text-(--color-text)"
          >
            조회
          </button>
          {eventIdQ && (
            <button
              type="button"
              onClick={() => {
                setEventIdInput('');
                setEventIdQ('');
                setPage(1);
              }}
              className="text-[12px] text-(--color-text-subtle) hover:text-(--color-accent)"
            >
              초기화
            </button>
          )}
        </form>

        <span className="ml-auto text-[12px] text-(--color-text-subtle)">
          총 {total.toLocaleString()}건
        </span>
      </div>

      {error && (
        <div className="rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
          불러오기 실패: {error}
        </div>
      )}

      <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
        {loading && items.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-(--color-text-subtle)">불러오는 중…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-(--color-text-subtle)">
            {eventIdQ ? `eventId=${eventIdQ} 기록 없음.` : '기록이 없어요.'}
          </div>
        ) : (
          <ul className="divide-y divide-(--color-border)">
            {items.map((log) => (
              <li key={log.logId} className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={`inline-flex shrink-0 items-center rounded-(--radius-sm) px-2 py-[3px] text-[11px] font-semibold tracking-[0.02em] ${ACTION_TONE[log.action]}`}
                  >
                    {ACTION_LABEL[log.action]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      {log.eventAvailable ? (
                        <Link
                          to={`/events/${log.eventId}`}
                          className="truncate font-semibold text-(--color-text) hover:text-(--color-accent)"
                        >
                          {log.eventTitle}
                        </Link>
                      ) : (
                        <span className="truncate font-semibold text-(--color-text-muted)">
                          {log.eventTitle}
                        </span>
                      )}
                      <span className="text-(--color-text-subtle)">·</span>
                      <span className="text-(--color-text-muted)">#{log.eventId}</span>
                      {log.organizationName && (
                        <>
                          <span className="text-(--color-text-subtle)">·</span>
                          <span className="text-(--color-text-muted)">{log.organizationName}</span>
                        </>
                      )}
                    </div>
                    {log.reason && (
                      <p className="m-0 mt-1.5 whitespace-pre-wrap rounded-(--radius-sm) bg-(--color-surface-alt) p-2.5 text-[12px] text-(--color-text)">
                        {log.reason}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 tabular text-[11px] text-(--color-text-subtle)">
                      <span>by {log.adminNickname}</span>
                      <span aria-hidden>·</span>
                      <time dateTime={log.createdAt}>
                        {log.createdAt.slice(0, 19).replace('T', ' ')}
                      </time>
                      {log.eventCurrentStatus && (
                        <>
                          <span aria-hidden>·</span>
                          <span>현재 상태 {log.eventCurrentStatus}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-[13px]">
          <span className="tabular text-(--color-text-subtle)">
            {page} / {lastPage} 페이지
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex h-8 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[12px] font-medium text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-40"
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={page >= lastPage || loading}
              className="inline-flex h-8 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[12px] font-medium text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-40"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
