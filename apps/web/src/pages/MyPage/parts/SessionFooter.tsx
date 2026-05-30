import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '../../../lib/auth-context';
import { ActionButton } from 'seed-design/ui/action-button';

/**
 * ADR 0004 D-3 — 세션 관리. 로그아웃 두 옵션 노출.
 * 단일 디바이스 로그아웃 (기존 동작) + 모든 디바이스 로그아웃 (전체 세션 폐기).
 * 보안 사고 의심 시 후자 사용 — admin revoke (D-6) 와 별개로 본인이 직접 cleanup.
 */
export function SessionFooter() {
  const { t } = useTranslation('mypage');
  const { logout, logoutAll } = useCurrentUser();
  const [pending, setPending] = useState<'one' | 'all' | null>(null);

  const onLogout = async () => {
    setPending('one');
    try {
      await logout();
      window.location.href = '/';
    } catch (e) {
      window.alert(t('session.logoutFailed', { message: (e as Error).message }));
      setPending(null);
    }
  };

  const onLogoutAll = async () => {
    if (!window.confirm(t('session.logoutAllConfirm'))) return;
    setPending('all');
    try {
      const r = await logoutAll();
      window.alert(t('session.logoutAllSuccess', { count: r.deleted }));
      window.location.href = '/';
    } catch (e) {
      window.alert(t('session.logoutFailed', { message: (e as Error).message }));
      setPending(null);
    }
  };

  return (
    <section className="mt-10 border-t border-(--color-border) pt-6">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
        {t('session.heading')}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ActionButton
          variant="neutralOutline"
          size="small"
          onClick={() => void onLogout()}
          loading={pending === 'one'}
          disabled={pending !== null}
        >
          {pending === 'one' ? t('session.loggingOut') : t('session.logout')}
        </ActionButton>
        <ActionButton
          variant="neutralOutline"
          size="small"
          onClick={() => void onLogoutAll()}
          loading={pending === 'all'}
          disabled={pending !== null}
        >
          {pending === 'all' ? t('session.loggingOutAll') : t('session.logoutAll')}
        </ActionButton>
      </div>
      <p className="m-0 mt-2 text-[11.5px] text-(--color-text-subtle)">
        {t('session.hint')}
      </p>
    </section>
  );
}
