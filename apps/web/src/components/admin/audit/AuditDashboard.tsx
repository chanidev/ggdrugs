import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchAdminAuditSummary,
  type AdminAuditSummary,
} from '../../../lib/api';

/**
 * A_700 Audit 대시보드 — 양 source (approval_logs + admin_audit_logs) 통합 검토 요약.
 *
 * 디자인 정책 (DESIGN.md 정합):
 * - 카드 grid 의 metric 타일 패턴 회피 (편집부 검토 메모 분위기).
 * - 단일 vermillion accent — 가장 활발한 action 한 행에만. 나머지는 단색.
 * - 활자 + 여백 위주 hierarchy. 아이콘 머리글 / 글래스모피즘 / 사이드 스트라이프 없음.
 * - tabular numbers, Pretendard scale, 60-30-10 색 운용.
 */

const WINDOWS = [7, 30, 90] as const;

export function AuditDashboard() {
  const { t } = useTranslation('admin');

  function relativeTime(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return t('audit.time.justNow');
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 60) return t('audit.time.minutesAgo', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('audit.time.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t('audit.time.daysAgo', { count: days });
    return iso.slice(0, 10);
  }
  const [windowDays, setWindowDays] = useState<number>(7);
  const [data, setData] = useState<AdminAuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const EVENT_ACTION_LABEL: Record<string, string> = {
    approved:           t('audit.eventAction.approved'),
    revision_requested: t('audit.eventAction.revision_requested'),
    rejected:           t('audit.eventAction.rejected'),
  };

  const ADMIN_ACTION_LABEL: Record<string, string> = {
    uploader_decision:  t('audit.adminAction.uploader_decision'),
    admin_promote:      t('audit.adminAction.admin_promote'),
    admin_scope_change: t('audit.adminAction.admin_scope_change'),
    admin_demote:       t('audit.adminAction.admin_demote'),
    revoke_sessions:    t('audit.adminAction.revoke_sessions'),
    user_soft_delete:   t('audit.adminAction.user_soft_delete'),
  };

  const ALL_LABEL: Record<string, string> = {
    ...EVENT_ACTION_LABEL,
    ...ADMIN_ACTION_LABEL,
  };

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchAdminAuditSummary(windowDays, ctrl.signal)
      .then(setData)
      .catch((e) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [windowDays]);

  if (loading && !data) {
    return (
      <div className="py-16 text-center text-[13px] text-(--color-text-subtle)">
        {t('uploader.loading')}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
        {error ?? t('audit.loadError')}
      </div>
    );
  }

  const eventEntries: Array<{ key: string; label: string; count: number }> = (
    Object.keys(EVENT_ACTION_LABEL) as Array<keyof typeof EVENT_ACTION_LABEL>
  ).map((k) => ({
    key: k,
    label: EVENT_ACTION_LABEL[k] ?? k,
    count: data.eventActions[k as keyof AdminAuditSummary['eventActions']],
  }));
  const adminEntries: Array<{ key: string; label: string; count: number }> = (
    Object.keys(ADMIN_ACTION_LABEL) as Array<keyof typeof ADMIN_ACTION_LABEL>
  ).map((k) => ({
    key: k,
    label: ADMIN_ACTION_LABEL[k] ?? k,
    count: data.adminActions[k as keyof AdminAuditSummary['adminActions']],
  }));

  const totalAll =
    eventEntries.reduce((s, e) => s + e.count, 0) +
    adminEntries.reduce((s, e) => s + e.count, 0);

  // 단일 accent — 양 그룹 통틀어 가장 큰 카운트의 action.
  const allEntries = [...eventEntries, ...adminEntries];
  let accentKey: string | null = null;
  if (totalAll > 0 && allEntries.length > 0) {
    let max = allEntries[0]!;
    for (const e of allEntries) if (e.count > max.count) max = e;
    accentKey = max.key;
  }

  const lastTime = data.recentActivity[0]?.createdAt ?? null;

  return (
    <section className="flex flex-col gap-10">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-(--color-border) pb-4">
        <div>
          <h2 className="m-0 text-[20px] font-bold tracking-[-0.015em] text-(--color-text)">
            {t('audit.dashboardTitle')}
          </h2>
          <p className="m-0 mt-1 text-[12px] text-(--color-text-subtle)">
            <span className="tabular">{totalAll.toLocaleString()}</span>{t('audit.totalCount', { count: '' }).replace('{{count}}', '').trim()}
            {lastTime && (
              <>
                <span className="mx-1.5">·</span>
                <span>{t('audit.lastActivity')} {relativeTime(lastTime)}</span>
              </>
            )}
          </p>
        </div>
        <nav className="flex items-baseline gap-0.5" aria-label={t('audit.periodSelect')}>
          {WINDOWS.map((w) => {
            const active = w === windowDays;
            return (
              <button
                key={w}
                type="button"
                onClick={() => setWindowDays(w)}
                className={`relative px-2 py-1 text-[13px] font-medium transition-colors ${
                  active
                    ? 'text-(--color-accent)'
                    : 'text-(--color-text-muted) hover:text-(--color-text)'
                }`}
              >
                {t('audit.periodDays', { days: w })}
                {active && (
                  <span
                    aria-hidden
                    className="absolute right-2 -bottom-px left-2 h-px bg-(--color-accent)"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Counts — 2 column 비대칭 grid (이벤트 심사 0.9fr / Admin 작업 1.1fr) */}
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <CountGroup title={t('audit.eventSource')} entries={eventEntries} accentKey={accentKey} />
        <CountGroup title={t('audit.adminSource')} entries={adminEntries} accentKey={accentKey} />
      </div>

      {/* Recent activity */}
      <section>
        <h3 className="m-0 mb-4 text-[11px] font-semibold tracking-[0.1em] text-(--color-text-subtle) uppercase">
          {t('audit.recentActivity')}
        </h3>
        {data.recentActivity.length === 0 ? (
          <p className="m-0 py-8 text-center text-[13px] text-(--color-text-subtle)">
            {t('audit.noPeriodActivity', { days: windowDays })}
          </p>
        ) : (
          <ol className="m-0 flex list-none flex-col p-0">
            {data.recentActivity.map((entry) => (
              <li
                key={entry.key}
                className="grid grid-cols-[88px_minmax(0,1fr)] items-baseline gap-4 border-b border-(--color-border)/50 py-3 last:border-b-0"
              >
                <time
                  dateTime={entry.createdAt}
                  className="tabular text-[12px] text-(--color-text-subtle)"
                  title={entry.createdAt.slice(0, 19).replace('T', ' ')}
                >
                  {relativeTime(entry.createdAt)}
                </time>
                <div className="min-w-0">
                  <p className="m-0 flex flex-wrap items-baseline gap-x-1.5 text-[13.5px] leading-[1.45] text-(--color-text)">
                    <span className="text-(--color-text-muted)">{entry.adminNickname}</span>
                    <span className="text-(--color-text-subtle)">→</span>
                    <span className="font-semibold">
                      {ALL_LABEL[entry.action] ?? entry.action}
                    </span>
                    <span className="text-(--color-text-subtle)">·</span>
                    <span className="line-clamp-1 text-(--color-text-muted)">
                      {entry.label}
                    </span>
                  </p>
                  {entry.reason && (
                    <p className="m-0 mt-1 max-w-[65ch] text-[12px] leading-[1.55] text-(--color-text-muted)">
                      "{entry.reason}"
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}

function CountGroup({
  title,
  entries,
  accentKey,
}: {
  title: string;
  entries: { key: string; label: string; count: number }[];
  accentKey: string | null;
}) {
  const max = Math.max(...entries.map((e) => e.count), 1);
  return (
    <section>
      <h3 className="m-0 mb-4 text-[11px] font-semibold tracking-[0.1em] text-(--color-text-subtle) uppercase">
        {title}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {entries.map((e) => {
          const pct = e.count / max;
          const isAccent = e.key === accentKey && e.count > 0;
          const hasCount = e.count > 0;
          return (
            <li
              key={e.key}
              className="grid grid-cols-[112px_minmax(0,1fr)_44px] items-center gap-3"
            >
              <span
                className={`text-[13px] ${
                  hasCount ? 'text-(--color-text)' : 'text-(--color-text-subtle)'
                }`}
              >
                {e.label}
              </span>
              <span
                className="relative block h-1.5 overflow-hidden rounded-full bg-(--color-surface-alt)"
                aria-hidden
              >
                {hasCount && (
                  <span
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.max(2, pct * 100)}%`,
                      backgroundColor: isAccent
                        ? 'var(--color-accent)'
                        : 'var(--color-text)',
                    }}
                  />
                )}
              </span>
              <span
                className={`tabular text-right text-[14px] font-semibold ${
                  hasCount ? 'text-(--color-text)' : 'text-(--color-text-subtle)'
                }`}
              >
                {e.count.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
