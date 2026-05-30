import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserDetailPanel } from './UserDetailPanel';
import {
  fetchAdminUsers,
  type AdminUserListItem,
  type MemberRoleFilter,
  type MemberStatusFilter,
} from '../../lib/api';

/**
 * Members 탭 — ADR 0005 E-7 (정정).
 *
 * Uploaders 탭 패턴 미러: 좌측 목록 + 우측 상세 패널 + 상단 필터.
 * 필터: role (all/general/uploader/admin) × status (active/deleted) + nickname 검색.
 */

export function MembersTab() {
  const { t } = useTranslation('admin');
  const [roleFilter, setRoleFilter] = useState<MemberRoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>('active');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [byRole, setByRole] = useState<Record<MemberRoleFilter, number>>({
    all: 0,
    general: 0,
    uploader: 0,
    admin: 0,
  });
  const [byStatus, setByStatus] = useState<{ active: number; deleted: number }>({
    active: 0,
    deleted: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ROLE_FILTERS: { key: MemberRoleFilter; label: string }[] = [
    { key: 'all',      label: t('member.roleFilter.all') },
    { key: 'general',  label: t('member.roleFilter.general') },
    { key: 'uploader', label: t('member.roleFilter.uploader') },
    { key: 'admin',    label: t('member.roleFilter.admin') },
  ];

  const STATUS_FILTERS: { key: MemberStatusFilter; label: string }[] = [
    { key: 'active',  label: t('member.statusFilter.active') },
    { key: 'deleted', label: t('member.statusFilter.deleted') },
    { key: 'all',     label: t('member.statusFilter.all') },
  ];

  // q 디바운스 (250ms).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const reload = useCallback(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchAdminUsers(
      { role: roleFilter, status: statusFilter, q: debouncedQ, page, limit },
      ctrl.signal,
    )
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
        setByRole(r.byRole);
        setByStatus(r.byStatus);
        if (selectedId && !r.items.some((u) => u.userId === selectedId)) {
          // 선택된 user 가 새 페이지/필터에 없으면 패널은 그대로 두되 (상세 자체 fetch 로 표시),
          // 가시 목록과는 분리.
        }
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [roleFilter, statusFilter, debouncedQ, page, limit, selectedId]);

  useEffect(() => reload(), [reload]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
      <section className="min-w-0">
        {/* Filters */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap rounded-(--radius-md) border border-(--color-border) p-0.5">
            {ROLE_FILTERS.map((opt) => {
              const active = roleFilter === opt.key;
              const cnt = byRole[opt.key];
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setPage(1);
                    setRoleFilter(opt.key);
                  }}
                  className={`h-8 rounded-[6px] px-3 text-[13px] font-medium transition-colors ${
                    active
                      ? 'bg-(--color-accent) text-white'
                      : 'text-(--color-text-muted) hover:text-(--color-text)'
                  }`}
                >
                  {opt.label} {cnt.toLocaleString()}
                </button>
              );
            })}
          </div>
          <div className="inline-flex flex-wrap rounded-(--radius-md) border border-(--color-border) p-0.5">
            {STATUS_FILTERS.map((opt) => {
              const active = statusFilter === opt.key;
              const cnt = opt.key === 'all' ? byStatus.active + byStatus.deleted : byStatus[opt.key];
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
                  {opt.label} {cnt.toLocaleString()}
                </button>
              );
            })}
          </div>
          <span className="ml-auto text-[12px] text-(--color-text-subtle)">
            {t('member.total', { count: total.toLocaleString() })}
          </span>
        </div>

        {/* Search */}
        <div className="mb-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value.slice(0, 100))}
            placeholder={t('member.searchPlaceholder')}
            className="h-9 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] focus:border-(--color-border-hover) focus:outline-none"
          />
        </div>

        {error && (
          <div className="mb-3 rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
            {t('member.loadError')}: {error}
          </div>
        )}

        <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
          {loading && items.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">
              {t('uploader.loading')}
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-(--color-text-subtle)">{t('member.empty')}</div>
          ) : (
            <ul className="divide-y divide-(--color-border)">
              {items.map((u) => (
                <li key={u.userId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(u.userId)}
                    className={`flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-(--color-surface-alt) ${
                      selectedId === u.userId ? 'bg-(--color-surface-alt)' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[14px] font-semibold text-(--color-text)">
                          {u.nickname}
                        </span>
                        {u.admin?.isActive && (
                          <span className="inline-flex items-center rounded-(--radius-sm) bg-(--color-accent)/10 px-1.5 py-[1px] text-[10px] font-semibold text-(--color-accent)">
                            admin · {u.admin.scope}
                          </span>
                        )}
                        {u.uploader && (
                          <span
                            className={`inline-flex items-center rounded-(--radius-sm) px-1.5 py-[1px] text-[10px] font-semibold ${
                              u.uploader.approvalStatus === 'approved'
                                ? 'bg-(--color-success)/10 text-(--color-success)'
                                : 'bg-(--color-warning)/10 text-(--color-warning)'
                            }`}
                          >
                            uploader · {u.uploader.approvalStatus}
                          </span>
                        )}
                        {u.isDeleted && (
                          <span className="inline-flex items-center rounded-(--radius-sm) bg-(--color-error)/10 px-1.5 py-[1px] text-[10px] font-semibold text-(--color-error)">
                            {t('member.statusFilter.deleted')}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-(--color-text-subtle)">
                        {u.authProvider} · {t('member.activeRole')} {u.activeRole}
                      </div>
                      <div className="tabular mt-0.5 text-[11px] text-(--color-text-subtle)">
                        {t('member.joinLabel')} {u.createdAt.slice(0, 10)} · {t('member.lastLoginLabel')}{' '}
                        {u.lastLoggedInAt?.slice(0, 10) ?? '-'}
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
              {t('member.prev')}
            </button>
            <span className="tabular text-[12px] text-(--color-text-subtle)">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 rounded-(--radius-md) border border-(--color-border) px-3 text-[13px] disabled:opacity-40"
            >
              {t('member.next')}
            </button>
          </div>
        )}
      </section>

      {/* 우측 상세 패널 */}
      <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
        {selectedId ? (
          <UserDetailPanel userId={selectedId} onChanged={reload} />
        ) : (
          <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">
            {t('member.selectHint')}
          </div>
        )}
      </aside>
    </div>
  );
}
