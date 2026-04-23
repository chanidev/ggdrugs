import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  fetchAdminAuditLogs,
  fetchAdminAuditAdminLogs,
  type AdminAuditLogItem,
  type AdminAuditAdminLogItem,
  type AdminAuditAdminAction,
} from '../../lib/api';
import { AuditDashboard } from './audit/AuditDashboard';

/**
 * A_700 Audit 탭 — 두 source 통합 노출.
 *
 *   source='event' → approval_logs (이벤트 심사) — 기존 동작
 *   source='admin' → admin_audit_logs (admin 보안·운영 액션) — ADR 0005 후속
 *
 * 두 source 가 스키마 다르므로 각자 row 렌더 + 별도 action 필터. 페이지네이션도 분리.
 */

type Source = 'overview' | 'event' | 'admin';
type EventAction = 'any' | 'approved' | 'revision_requested' | 'rejected';

const EVENT_ACTION_LABEL: Record<AdminAuditLogItem['action'], string> = {
  approved: '승인',
  revision_requested: '보완 요청',
  rejected: '반려',
};

const EVENT_ACTION_TONE: Record<AdminAuditLogItem['action'], string> = {
  approved: 'bg-(--color-success)/10 text-(--color-success)',
  revision_requested: 'bg-(--color-warning)/10 text-(--color-warning)',
  rejected: 'bg-(--color-error)/10 text-(--color-error)',
};

const ADMIN_ACTION_LABEL: Record<AdminAuditAdminAction, string> = {
  revoke_sessions: '세션 폐기',
  admin_promote: 'admin 승급',
  admin_demote: 'admin 박탈',
  admin_scope_change: 'scope 변경',
  user_soft_delete: '계정 비활성화',
  uploader_decision: '업로더 심사',
};

const ADMIN_ACTION_TONE: Record<AdminAuditAdminAction, string> = {
  revoke_sessions: 'bg-(--color-warning)/10 text-(--color-warning)',
  admin_promote: 'bg-(--color-accent)/10 text-(--color-accent)',
  admin_demote: 'bg-(--color-warning)/10 text-(--color-warning)',
  admin_scope_change: 'bg-(--color-accent)/10 text-(--color-accent)',
  user_soft_delete: 'bg-(--color-error)/10 text-(--color-error)',
  uploader_decision: 'bg-(--color-accent)/10 text-(--color-accent)',
};

const PAGE_SIZE = 50;

/**
 * admin payload → 한 줄 요약. UserDetailPanel 의 summarizeAuditPayload 와 동일 스펙.
 */
function summarizeAdminPayload(action: AdminAuditAdminAction, payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const p = payload as Record<string, unknown>;
  switch (action) {
    case 'revoke_sessions':
      return `세션 ${p.count ?? '?'}개 폐기`;
    case 'admin_promote':
      return `scope=${p.scope ?? '?'}`;
    case 'admin_demote': {
      const before = p.before as Record<string, unknown> | undefined;
      return `이전 scope=${before?.scope ?? '?'} → 비활성`;
    }
    case 'admin_scope_change': {
      const before = p.before as Record<string, unknown> | undefined;
      const after = p.after as Record<string, unknown> | undefined;
      return `${before?.scope ?? '?'} → ${after?.scope ?? '?'}`;
    }
    case 'user_soft_delete':
      return `세션 ${p.deletedSessionCount ?? '?'}개 같이 폐기`;
    case 'uploader_decision': {
      const dec = String(p.action ?? '?');
      const koMap: Record<string, string> = {
        approved: '승인됨',
        revision_requested: '보완요청',
        rejected: '반려',
      };
      return `결정: ${koMap[dec] ?? dec}`;
    }
    default:
      return '';
  }
}

export function AuditLogsTab() {
  // 기본은 대시보드 — 운영자가 들어왔을 때 한 화면에 요약 보여주는 게 자연스러움.
  const [source, setSource] = useState<Source>('overview');

  return (
    <section className="flex flex-col gap-6">
      {/* Source toggle (3종) — 활자 위주, 라운드 박스 회피 */}
      <nav
        className="flex items-baseline gap-1 border-b border-(--color-border)"
        aria-label="감사 로그 보기"
      >
        <SourceTab active={source === 'overview'} onClick={() => setSource('overview')}>
          대시보드
        </SourceTab>
        <SourceTab active={source === 'event'} onClick={() => setSource('event')}>
          이벤트 심사
        </SourceTab>
        <SourceTab active={source === 'admin'} onClick={() => setSource('admin')}>
          Admin 작업
        </SourceTab>
      </nav>

      {source === 'overview' && <AuditDashboard />}
      {source === 'event' && <EventAuditPanel />}
      {source === 'admin' && <AdminAuditPanel />}
    </section>
  );
}

function SourceTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative -mb-px inline-flex h-10 items-center border-b-2 px-3 text-[14px] font-medium transition-colors ${
        active
          ? 'border-(--color-accent) text-(--color-accent)'
          : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'
      }`}
    >
      {children}
    </button>
  );
}

// =============================================================
// 이벤트 심사 (approval_logs) — 기존 패턴 유지
// =============================================================

function EventAuditPanel() {
  const [action, setAction] = useState<EventAction>('any');
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

  const FILTERS: { key: EventAction; label: string; count?: number }[] = [
    { key: 'any', label: '전체', count: byAction.approved + byAction.revision_requested + byAction.rejected },
    { key: 'approved', label: '승인', count: byAction.approved },
    { key: 'revision_requested', label: '보완', count: byAction.revision_requested },
    { key: 'rejected', label: '반려', count: byAction.rejected },
  ];

  return (
    <div className="flex flex-col gap-4">
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
                  active ? 'bg-(--color-accent) text-white' : 'text-(--color-text-muted) hover:text-(--color-text)'
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

        <span className="ml-auto text-[12px] text-(--color-text-subtle)">총 {total.toLocaleString()}건</span>
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
                    className={`inline-flex shrink-0 items-center rounded-(--radius-sm) px-2 py-[3px] text-[11px] font-semibold tracking-[0.02em] ${EVENT_ACTION_TONE[log.action]}`}
                  >
                    {EVENT_ACTION_LABEL[log.action]}
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
                        <span className="truncate font-semibold text-(--color-text-muted)">{log.eventTitle}</span>
                      )}
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
                      <time dateTime={log.createdAt}>{log.createdAt.slice(0, 19).replace('T', ' ')}</time>
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

      <Pager page={page} lastPage={lastPage} total={total} loading={loading} onChange={setPage} />
    </div>
  );
}

// =============================================================
// Admin 작업 (admin_audit_logs) — ADR 0005 후속
// =============================================================

function AdminAuditPanel() {
  const [action, setAction] = useState<'any' | AdminAuditAdminAction>('any');
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<AdminAuditAdminLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [byAction, setByAction] = useState<Record<AdminAuditAdminAction, number>>({
    revoke_sessions: 0,
    admin_promote: 0,
    admin_demote: 0,
    admin_scope_change: 0,
    user_soft_delete: 0,
    uploader_decision: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchAdminAuditAdminLogs({ page, limit: PAGE_SIZE, action }, ctrl.signal)
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
  }, [action, page]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allCount = Object.values(byAction).reduce((s, n) => s + n, 0);

  const FILTERS: { key: 'any' | AdminAuditAdminAction; label: string; count: number }[] = [
    { key: 'any', label: '전체', count: allCount },
    { key: 'uploader_decision', label: ADMIN_ACTION_LABEL.uploader_decision, count: byAction.uploader_decision },
    { key: 'admin_promote', label: ADMIN_ACTION_LABEL.admin_promote, count: byAction.admin_promote },
    { key: 'admin_demote', label: ADMIN_ACTION_LABEL.admin_demote, count: byAction.admin_demote },
    { key: 'admin_scope_change', label: ADMIN_ACTION_LABEL.admin_scope_change, count: byAction.admin_scope_change },
    { key: 'revoke_sessions', label: ADMIN_ACTION_LABEL.revoke_sessions, count: byAction.revoke_sessions },
    { key: 'user_soft_delete', label: ADMIN_ACTION_LABEL.user_soft_delete, count: byAction.user_soft_delete },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-(--radius-md) border border-(--color-border) p-0.5">
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
                  active ? 'bg-(--color-accent) text-white' : 'text-(--color-text-muted) hover:text-(--color-text)'
                }`}
              >
                {f.label}
                <span className={`ml-1.5 tabular text-[11px] ${active ? 'text-white/80' : 'text-(--color-text-subtle)'}`}>
                  {f.count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-[12px] text-(--color-text-subtle)">총 {total.toLocaleString()}건</span>
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
          <div className="p-10 text-center text-[13px] text-(--color-text-subtle)">기록이 없어요.</div>
        ) : (
          <ul className="divide-y divide-(--color-border)">
            {items.map((log) => {
              const summary = summarizeAdminPayload(log.action, log.payload);
              const reason =
                log.payload && typeof log.payload === 'object'
                  ? ((log.payload as Record<string, unknown>).reason as string | null | undefined)
                  : null;
              return (
                <li key={log.auditId} className="p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      className={`inline-flex shrink-0 items-center rounded-(--radius-sm) px-2 py-[3px] text-[11px] font-semibold tracking-[0.02em] ${ADMIN_ACTION_TONE[log.action]}`}
                    >
                      {ADMIN_ACTION_LABEL[log.action]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2 text-[13px]">
                        {log.targetNickname ? (
                          <span
                            className={`font-semibold ${
                              log.targetDeleted ? 'text-(--color-text-muted) line-through' : 'text-(--color-text)'
                            }`}
                          >
                            {log.targetNickname}
                          </span>
                        ) : (
                          <span className="text-(--color-text-subtle)">(대상 없음)</span>
                        )}
                        {summary && (
                          <span className="text-[12px] text-(--color-text-muted)">{summary}</span>
                        )}
                      </div>
                      {typeof reason === 'string' && reason.length > 0 && (
                        <p className="m-0 mt-1.5 whitespace-pre-wrap rounded-(--radius-sm) bg-(--color-surface-alt) p-2.5 text-[12px] text-(--color-text)">
                          “{reason}”
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 tabular text-[11px] text-(--color-text-subtle)">
                        <span>by {log.adminNickname}</span>
                        <span aria-hidden>·</span>
                        <time dateTime={log.createdAt}>{log.createdAt.slice(0, 19).replace('T', ' ')}</time>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Pager page={page} lastPage={lastPage} total={total} loading={loading} onChange={setPage} />
    </div>
  );
}

function Pager({
  page,
  lastPage,
  total,
  loading,
  onChange,
}: {
  page: number;
  lastPage: number;
  total: number;
  loading: boolean;
  onChange: (next: number) => void;
}) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="tabular text-(--color-text-subtle)">
        {page} / {lastPage} 페이지
      </span>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1 || loading}
          className="inline-flex h-8 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[12px] font-medium text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-40"
        >
          이전
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(lastPage, page + 1))}
          disabled={page >= lastPage || loading}
          className="inline-flex h-8 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[12px] font-medium text-(--color-text-muted) hover:text-(--color-text) disabled:opacity-40"
        >
          다음
        </button>
      </div>
    </div>
  );
}
