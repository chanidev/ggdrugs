import { useState } from 'react';
import { useCurrentUser } from '../../../lib/auth-context';

/**
 * ADR 0004 D-3 — 세션 관리. 로그아웃 두 옵션 노출.
 * 단일 디바이스 로그아웃 (기존 동작) + 모든 디바이스 로그아웃 (전체 세션 폐기).
 * 보안 사고 의심 시 후자 사용 — admin revoke (D-6) 와 별개로 본인이 직접 cleanup.
 */
export function SessionFooter() {
  const { logout, logoutAll } = useCurrentUser();
  const [pending, setPending] = useState<'one' | 'all' | null>(null);

  const onLogout = async () => {
    setPending('one');
    try {
      await logout();
      window.location.href = '/';
    } catch (e) {
      window.alert(`로그아웃 실패: ${(e as Error).message}`);
      setPending(null);
    }
  };

  const onLogoutAll = async () => {
    if (
      !window.confirm(
        '모든 디바이스에서 로그아웃할까요? 다른 기기·브라우저의 세션도 모두 끊겨요.',
      )
    )
      return;
    setPending('all');
    try {
      const r = await logoutAll();
      window.alert(`${r.deleted}개 세션을 끊었어요.`);
      window.location.href = '/';
    } catch (e) {
      window.alert(`로그아웃 실패: ${(e as Error).message}`);
      setPending(null);
    }
  };

  return (
    <section className="mt-10 border-t border-(--color-border) pt-6">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
        세션 관리
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onLogout()}
          disabled={pending !== null}
          className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-border-hover) hover:text-(--color-text) disabled:opacity-40"
        >
          {pending === 'one' ? '로그아웃 중…' : '이 디바이스 로그아웃'}
        </button>
        <button
          type="button"
          onClick={() => void onLogoutAll()}
          disabled={pending !== null}
          className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-error) hover:text-(--color-error) disabled:opacity-40"
        >
          {pending === 'all' ? '전체 로그아웃 중…' : '모든 디바이스 로그아웃'}
        </button>
      </div>
      <p className="m-0 mt-2 text-[11.5px] text-(--color-text-subtle)">
        분실·탈취가 의심되면 모든 디바이스 로그아웃을 사용하세요.
      </p>
    </section>
  );
}
