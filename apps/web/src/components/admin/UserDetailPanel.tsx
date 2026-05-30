import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchAdminUser,
  promoteUserToAdmin,
  demoteUserAdmin,
  changeUserAdminScope,
  softDeleteUserAccount,
  revokeUserSessionsByAdmin,
  type AdminUserDetail,
  type AdminScope,
} from '../../lib/api';

/**
 * Members 탭 우측 상세 패널 — ADR 0005 E-7 (정정).
 *
 * 5 액션 (current state 별 노출/disable):
 *   1. 세션 폐기  (revoke-sessions)  — D-6, scope='full'|'security' 통과 (BFF 검증)
 *   2. 계정 비활성화 (soft-delete)   — E-5, scope='full' 만, admin 활성이면 차단
 *   3. admin 승급  (promote)         — E-2, scope='full' 만 (BFF 검증), 미승급 user 만 노출
 *   4. admin scope 변경 (admin-scope) — E-4, admin 보유 user 만
 *   5. admin 박탈  (demote)          — E-4, admin 활성 user 만
 *
 * 모든 액션이 reason textarea (10~500자) 강제. 성공 후 onChanged 콜백으로 좌측 목록 reload.
 */

const SCOPE_DOMAIN: AdminScope[] = ['full', 'content_only', 'uploader_review_only', 'security'];

/**
 * audit_logs.payload 를 사람 친화 한 줄 요약으로. action 별 표준 payload 키 가정 (ADR 0005 §E-6).
 * 모르는 action 이거나 payload shape 가 다르면 fallback (raw JSON 한 줄).
 */
function summarizeAuditPayload(action: string, payload: unknown): string {
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
        pending: '대기',
        approved: '승인됨',
        revision_requested: '보완요청',
        rejected: '반려',
      };
      return `결정: ${koMap[dec] ?? dec}`;
    }
    default:
      // unknown action — 1 줄 raw fallback (10000 char 위험 방지 위해 자름).
      return JSON.stringify(p).slice(0, 100);
  }
}

export function UserDetailPanel({
  userId,
  onChanged,
}: {
  userId: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation('admin');
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openAction, setOpenAction] = useState<
    null | 'revoke' | 'soft-delete' | 'promote' | 'scope' | 'demote'
  >(null);

  const load = () => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchAdminUser(userId, ctrl.signal)
      .then(setData)
      .catch((e) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  };

  useEffect(() => {
    setOpenAction(null);
    return load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (loading && !data) {
    return <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">{t('uploader.loading')}</div>;
  }
  if (error || !data) {
    return (
      <div className="rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
        {error ?? t('uploader.loadError')}
      </div>
    );
  }

  const { user, uploader, admin, activeSessionCount, recentAudits } = data;
  const isActiveAdmin = !!admin?.isActive;
  const canSoftDelete = !user.isDeleted && !isActiveAdmin;

  const onActionDone = () => {
    setOpenAction(null);
    load();
    onChanged();
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-4 border-b border-(--color-border) pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {user.isDeleted && (
            <span className="inline-flex items-center rounded-(--radius-sm) bg-(--color-error)/10 px-2 py-[2px] text-[11px] font-semibold text-(--color-error)">
              {t('member.statusFilter.deleted')}
            </span>
          )}
          {isActiveAdmin && (
            <span className="inline-flex items-center rounded-(--radius-sm) bg-(--color-accent)/10 px-2 py-[2px] text-[11px] font-semibold text-(--color-accent)">
              admin · {admin?.scope}
            </span>
          )}
          {uploader && (
            <span
              className={`inline-flex items-center rounded-(--radius-sm) px-2 py-[2px] text-[11px] font-semibold ${
                uploader.approvalStatus === 'approved'
                  ? 'bg-(--color-success)/10 text-(--color-success)'
                  : 'bg-(--color-warning)/10 text-(--color-warning)'
              }`}
            >
              업로더 · {t(`member.uploaderStatus.${uploader.approvalStatus}`)}
            </span>
          )}
        </div>
        <h2 className="mt-1 text-[16px] font-bold tracking-[-0.01em]">{user.nickname}</h2>
        <p className="m-0 mt-0.5 text-[12px] text-(--color-text-subtle)">
          {user.authProvider} · 활성 역할 {user.activeRole}
        </p>
      </div>

      {/* Identity */}
      <section className="mb-4">
        <h3 className="m-0 mb-2 text-[13px] font-semibold">계정 정보</h3>
        <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-(--color-text-subtle)">{t('uploader.joinMethod')}</dt>
          <dd className="m-0 text-(--color-text-muted)">{user.authProvider}</dd>
          <dt className="text-(--color-text-subtle)">social_uid</dt>
          <dd className="m-0 font-mono text-[11px] text-(--color-text-muted)">{user.socialUid}</dd>
          <dt className="text-(--color-text-subtle)">활성 역할</dt>
          <dd className="m-0 text-(--color-text-muted)">{user.activeRole}</dd>
          <dt className="text-(--color-text-subtle)">{t('uploader.createdAt')}</dt>
          <dd className="tabular m-0 text-(--color-text-muted)">{user.createdAt.slice(0, 10)}</dd>
          <dt className="text-(--color-text-subtle)">최근 로그인</dt>
          <dd className="tabular m-0 text-(--color-text-muted)">
            {user.lastLoggedInAt?.slice(0, 19).replace('T', ' ') ?? '없음'}
          </dd>
          <dt className="text-(--color-text-subtle)">활성 세션</dt>
          <dd className="tabular m-0 text-(--color-text)">
            {activeSessionCount.toLocaleString()}건
          </dd>
          {user.deletedAt && (
            <>
              <dt className="text-(--color-text-subtle)">삭제일</dt>
              <dd className="tabular m-0 text-(--color-error)">
                {user.deletedAt.slice(0, 19).replace('T', ' ')}
              </dd>
            </>
          )}
        </dl>
      </section>

      {/* Uploader sub-state */}
      {uploader && (
        <section className="mb-4">
          <h3 className="m-0 mb-2 text-[13px] font-semibold">업로더 프로파일</h3>
          <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-[12px]">
            <dt className="text-(--color-text-subtle)">기관명</dt>
            <dd className="m-0 text-(--color-text)">{uploader.organizationName || '(없음)'}</dd>
            <dt className="text-(--color-text-subtle)">상태</dt>
            <dd className="m-0 text-(--color-text-muted)">{t(`member.uploaderStatus.${uploader.approvalStatus}`)}</dd>
            {uploader.approvedAt && (
              <>
                <dt className="text-(--color-text-subtle)">{t('uploader.approvedAt')}</dt>
                <dd className="tabular m-0 text-(--color-text-muted)">
                  {uploader.approvedAt.slice(0, 10)}
                </dd>
              </>
            )}
          </dl>
          <p className="m-0 mt-2 text-[11px] text-(--color-text-subtle)">
            업로더 승급 심사·반려는 Uploaders 탭에서 처리.
          </p>
        </section>
      )}

      {/* Admin sub-state */}
      {admin && (
        <section className="mb-4">
          <h3 className="m-0 mb-2 text-[13px] font-semibold">Admin 프로파일</h3>
          <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-[12px]">
            <dt className="text-(--color-text-subtle)">scope</dt>
            <dd className="m-0 text-(--color-text)">{t(`member.scopeLabel.${admin.scope}`)}</dd>
            <dt className="text-(--color-text-subtle)">활성</dt>
            <dd className="m-0 text-(--color-text-muted)">{admin.isActive ? 'ACTIVE' : 'disabled'}</dd>
            <dt className="text-(--color-text-subtle)">생성일</dt>
            <dd className="tabular m-0 text-(--color-text-muted)">{admin.createdAt.slice(0, 10)}</dd>
          </dl>
        </section>
      )}

      {/* Recent audits — 사람 친화 카드. payload 는 한 줄 요약 + reason 별도 표시. */}
      <section className="mb-4">
        <h3 className="m-0 mb-2 text-[13px] font-semibold">최근 처리 내역</h3>
        {recentAudits.length === 0 ? (
          <p className="m-0 text-[12px] text-(--color-text-subtle)">기록 없음.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recentAudits.map((a) => {
              const label = t(`member.actionLabel.${a.action}`, { defaultValue: a.action });
              const summary = summarizeAuditPayload(a.action, a.payload);
              const reason =
                a.payload && typeof a.payload === 'object'
                  ? (a.payload as Record<string, unknown>).reason
                  : null;
              return (
                <li
                  key={a.auditId}
                  className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) p-2.5 text-[12px]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-(--color-text)">{label}</span>
                    {summary && (
                      <span className="text-[11.5px] text-(--color-text-muted)">{summary}</span>
                    )}
                    <span className="tabular ml-auto text-[11px] text-(--color-text-subtle)">
                      {a.createdAt.slice(0, 19).replace('T', ' ')}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-(--color-text-subtle)">
                    처리 admin {a.adminNickname ?? `#${a.adminId}`}
                  </div>
                  {typeof reason === 'string' && reason.length > 0 && (
                    <p className="m-0 mt-1.5 rounded-(--radius-sm) bg-(--color-surface) p-2 text-[11.5px] leading-[1.55] text-(--color-text)">
                      "{reason}"
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Action buttons (open inline forms) */}
      {!user.isDeleted && (
        <section className="border-t border-(--color-border) pt-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setOpenAction('revoke')}
              className="inline-flex h-8 items-center rounded-(--radius-md) border border-(--color-warning)/40 bg-(--color-warning)/5 px-3 text-[12px] font-medium text-(--color-warning) hover:bg-(--color-warning)/10"
              disabled={activeSessionCount === 0}
              title={activeSessionCount === 0 ? '활성 세션 없음' : ''}
            >
              {t('member.revokeSession')}
            </button>
            {!admin && (
              <button
                type="button"
                onClick={() => setOpenAction('promote')}
                className="inline-flex h-8 items-center rounded-(--radius-md) border border-(--color-accent)/40 bg-(--color-accent)/5 px-3 text-[12px] font-medium text-(--color-accent) hover:bg-(--color-accent)/10"
              >
                {t('member.promoteAdmin')}
              </button>
            )}
            {admin && admin.isActive && (
              <>
                <button
                  type="button"
                  onClick={() => setOpenAction('scope')}
                  className="inline-flex h-8 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[12px] font-medium text-(--color-text-muted) hover:border-(--color-border-hover) hover:text-(--color-text)"
                >
                  {t('member.changeScope')}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenAction('demote')}
                  className="inline-flex h-8 items-center rounded-(--radius-md) border border-(--color-warning)/40 bg-(--color-warning)/5 px-3 text-[12px] font-medium text-(--color-warning) hover:bg-(--color-warning)/10"
                >
                  {t('member.demoteAdmin')}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setOpenAction('soft-delete')}
              disabled={!canSoftDelete}
              title={
                !canSoftDelete
                  ? isActiveAdmin
                    ? 'admin 활성 상태 — 먼저 박탈'
                    : '이미 삭제됨'
                  : ''
              }
              className="ml-auto inline-flex h-8 items-center rounded-(--radius-md) border border-(--color-error)/40 bg-(--color-error)/5 px-3 text-[12px] font-medium text-(--color-error) hover:bg-(--color-error)/10 disabled:opacity-40"
            >
              {t('member.softDelete')}
            </button>
          </div>

          {openAction === 'revoke' && (
            <ActionForm
              title={`${t('member.revokeSession')} (D-6)`}
              hint="활성 세션 모두 끊김. scope='full' 또는 'security' admin 만 가능."
              reasonLabel={t('member.reasonLabel')}
              reasonPlaceholder={t('member.reasonPlaceholder')}
              onCancel={() => setOpenAction(null)}
              onSubmit={async (reason) => {
                const r = await revokeUserSessionsByAdmin(userId, reason);
                window.alert(`${r.deletedSessions}개 세션 폐기 (audit ${r.auditId})`);
                onActionDone();
              }}
            />
          )}
          {openAction === 'promote' && (
            <ActionForm
              title={`${t('member.promoteAdmin')} (E-2)`}
              hint="scope='full' admin 만 호출 가능. 대상 user 가 admin_profiles 행을 갖게 됨."
              withScope
              scopeLabels={{
                full: t('member.scopeLabel.full'),
                content_only: t('member.scopeLabel.content_only'),
                uploader_review_only: t('member.scopeLabel.uploader_review_only'),
                security: t('member.scopeLabel.security'),
              }}
              reasonLabel={t('member.reasonLabel')}
              reasonPlaceholder={t('member.reasonPlaceholder')}
              onCancel={() => setOpenAction(null)}
              onSubmit={async (reason, scope) => {
                const r = await promoteUserToAdmin(userId, scope!, reason);
                window.alert(`승급 완료 — adminId=${r.adminId}, scope=${r.scope} (audit ${r.auditId})`);
                onActionDone();
              }}
            />
          )}
          {openAction === 'scope' && admin && (
            <ActionForm
              title={`${t('member.changeScope')} (E-4)`}
              hint={`현재 scope='${admin.scope}'. 동일 값 재요청은 거부.`}
              withScope
              defaultScope={admin.scope}
              scopeLabels={{
                full: t('member.scopeLabel.full'),
                content_only: t('member.scopeLabel.content_only'),
                uploader_review_only: t('member.scopeLabel.uploader_review_only'),
                security: t('member.scopeLabel.security'),
              }}
              reasonLabel={t('member.reasonLabel')}
              reasonPlaceholder={t('member.reasonPlaceholder')}
              onCancel={() => setOpenAction(null)}
              onSubmit={async (reason, scope) => {
                const r = await changeUserAdminScope(userId, scope!, reason);
                window.alert(`scope=${r.scope} (audit ${r.auditId})`);
                onActionDone();
              }}
            />
          )}
          {openAction === 'demote' && (
            <ActionForm
              title={`${t('member.demoteAdmin')} (E-4)`}
              hint="is_active=false 토글. user 행 자체는 유지."
              reasonLabel={t('member.reasonLabel')}
              reasonPlaceholder={t('member.reasonPlaceholder')}
              onCancel={() => setOpenAction(null)}
              onSubmit={async (reason) => {
                const r = await demoteUserAdmin(userId, reason);
                window.alert(`박탈 완료 (audit ${r.auditId})`);
                onActionDone();
              }}
            />
          )}
          {openAction === 'soft-delete' && (
            <ActionForm
              title={`${t('member.softDelete')} (E-5)`}
              hint="users.is_deleted=true + 모든 세션 폐기. admin 활성 상태면 거부 (E-5c)."
              danger
              reasonLabel={t('member.reasonLabel')}
              reasonPlaceholder={t('member.reasonPlaceholder')}
              onCancel={() => setOpenAction(null)}
              onSubmit={async (reason) => {
                const r = await softDeleteUserAccount(userId, reason);
                window.alert(`삭제 완료 — 폐기 세션 ${r.deletedSessionCount}개 (audit ${r.auditId})`);
                onActionDone();
              }}
            />
          )}
        </section>
      )}
    </div>
  );
}

function ActionForm({
  title,
  hint,
  withScope,
  defaultScope,
  scopeLabels,
  danger,
  reasonLabel,
  reasonPlaceholder,
  onCancel,
  onSubmit,
}: {
  title: string;
  hint?: string;
  withScope?: boolean;
  defaultScope?: AdminScope;
  scopeLabels?: Record<AdminScope, string>;
  danger?: boolean;
  reasonLabel: string;
  reasonPlaceholder: string;
  onCancel: () => void;
  onSubmit: (reason: string, scope?: AdminScope) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<AdminScope>(defaultScope ?? 'full');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reasonOk = reason.trim().length >= 10 && reason.trim().length <= 500;

  return (
    <div
      className={`mt-3 rounded-(--radius-md) border p-3 ${
        danger
          ? 'border-(--color-error)/40 bg-(--color-error)/5'
          : 'border-(--color-border) bg-(--color-surface-alt)'
      }`}
    >
      <h4 className="m-0 mb-1 text-[12px] font-semibold">{title}</h4>
      {hint && <p className="m-0 mb-2 text-[11px] text-(--color-text-muted)">{hint}</p>}
      {withScope && (
        <label className="mb-2 block">
          <span className="m-0 mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-(--color-text-subtle)">
            scope
          </span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as AdminScope)}
            className="h-8 w-full rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface) px-2 text-[12px] focus:border-(--color-border-hover) focus:outline-none"
          >
            {SCOPE_DOMAIN.map((s) => (
              <option key={s} value={s}>
                {scopeLabels?.[s] ?? s}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="m-0 mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-(--color-text-subtle)">
          {reasonLabel}
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 500))}
          rows={3}
          maxLength={500}
          placeholder={reasonPlaceholder}
          className="w-full resize-y rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface) p-2 text-[12px] text-(--color-text) focus:border-(--color-border-hover) focus:outline-none"
        />
        <span className="tabular m-0 mt-0.5 block text-right text-[10px] text-(--color-text-subtle)">
          {reason.trim().length} / 500 (최소 10자)
        </span>
      </label>
      {err && (
        <p className="m-0 mt-2 rounded-(--radius-sm) bg-(--color-error)/5 p-2 text-[11px] text-(--color-error)">
          {err}
        </p>
      )}
      <div className="mt-2 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex h-8 items-center rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface) px-3 text-[12px] font-medium text-(--color-text-muted) hover:border-(--color-border-hover) disabled:opacity-40"
        >
          취소
        </button>
        <button
          type="button"
          onClick={async () => {
            setPending(true);
            setErr(null);
            try {
              await onSubmit(reason.trim(), withScope ? scope : undefined);
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'failed');
            } finally {
              setPending(false);
            }
          }}
          disabled={!reasonOk || pending}
          className={`inline-flex h-8 items-center rounded-(--radius-sm) px-3 text-[12px] font-medium text-white ${
            danger ? 'bg-(--color-error) hover:opacity-90' : 'bg-(--color-accent) hover:bg-(--color-accent-hover)'
          } disabled:opacity-40`}
        >
          {pending ? '처리 중…' : '실행'}
        </button>
      </div>
    </div>
  );
}
