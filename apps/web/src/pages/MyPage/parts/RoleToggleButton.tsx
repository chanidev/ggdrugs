import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/Icon';
import { useCurrentUser } from '../../../lib/auth-context';
import {
  fetchMyUploader,
  setActiveRole,
  type MyUploaderProfile,
} from '../../../lib/api';
import { ActionButton } from 'seed-design/ui/action-button';

/**
 * GG-ROLE-001 우측 상단 역할 전환 버튼.
 *
 * 4 상태 (uploader_profile + active_role 조합):
 *   1. uploader_profile null              → "업로더 신청"      → /uploader (ApplyForm 노출)
 *   2. status='pending'                   → "심사 중"           → /uploader (콘솔에서 진행 확인)
 *   3. status∈{revision_requested,rejected} → "보완하여 재신청" → /uploader (ApplyForm 재진입)
 *   4. status='approved' + activeRole='user'      → "업로더로 전환"     → setActiveRole('uploader') + /uploader
 *   5. status='approved' + activeRole='uploader'  → "사용자로 돌아가기" → setActiveRole('user') + 머무름
 *
 * 비로그인 호출 케이스는 부모 (MyPage) 에서 이미 user 검사 후 진입하므로 처리 안 함.
 */
export function RoleToggleButton() {
  const { t } = useTranslation('mypage');
  const { user, refresh } = useCurrentUser();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MyUploaderProfile | null | 'loading'>(
    'loading',
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMyUploader()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (profile === 'loading' || !user) {
    return (
      <span
        aria-hidden
        className="inline-block h-9 w-32 animate-pulse rounded-(--radius-md) bg-(--color-surface-alt)"
      />
    );
  }

  // 1. 미신청
  if (!profile) {
    return (
      <Link
        to="/uploader"
        className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-accent)/40 bg-(--color-accent)/5 px-3 text-[13px] font-medium text-(--color-accent) hover:bg-(--color-accent)/10"
      >
        {t('role.applyButton')} <Icon name="arrow" size={12} />
      </Link>
    );
  }

  // 2. 심사 중
  if (profile.approvalStatus === 'pending') {
    return (
      <Link
        to="/uploader"
        className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-3 text-[13px] font-medium text-(--color-text-muted) hover:border-(--color-border-hover)"
        title={t('role.pendingTitle')}
      >
        {t('role.pendingLabel')}
      </Link>
    );
  }

  // 3. 보완 / 반려 — rejected 는 7일 쿨다운 (BFF computeReapplyGate 가 결정).
  if (
    profile.approvalStatus === 'revision_requested' ||
    profile.approvalStatus === 'rejected'
  ) {
    const isRejected = profile.approvalStatus === 'rejected';
    const label = isRejected ? t('role.rejectLabel') : t('role.revisionLabel');

    // 쿨다운 active — disabled 버튼 + 카운트다운.
    if (isRejected && !profile.canReapply && profile.canReapplyAt) {
      const ms = new Date(profile.canReapplyAt).getTime() - Date.now();
      const days = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
      return (
        <span
          aria-disabled="true"
          className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-3 text-[13px] font-medium text-(--color-text-subtle)"
          title={t('role.cooldownTitle', { date: profile.canReapplyAt.slice(0, 10) })}
        >
          {t('role.cooldownDays', { days })}
        </span>
      );
    }

    return (
      <Link
        to="/uploader"
        className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-warning)/40 bg-(--color-warning)/5 px-3 text-[13px] font-medium text-(--color-warning) hover:bg-(--color-warning)/10"
        title={t('role.reapplyTitle', { label })}
      >
        {t('role.reapplyLink', { label })}
      </Link>
    );
  }

  // 4 / 5. approved → 토글
  const isUploaderMode = user.activeRole === 'uploader';
  const onToggle = async () => {
    setPending(true);
    try {
      await setActiveRole(isUploaderMode ? 'user' : 'uploader');
      await refresh();
      if (!isUploaderMode) navigate('/uploader');
    } catch (e) {
      window.alert(t('role.switchFailed', { message: (e as Error).message }));
    } finally {
      setPending(false);
    }
  };
  return (
    <ActionButton
      variant={isUploaderMode ? 'neutralOutline' : 'brandSolid'}
      size="small"
      onClick={() => void onToggle()}
      loading={pending}
      disabled={pending}
    >
      {isUploaderMode ? t('role.switchToUser') : t('role.switchToUploader')}
    </ActionButton>
  );
}
