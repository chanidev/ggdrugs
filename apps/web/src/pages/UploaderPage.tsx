import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Header } from '../layout/Header';
import { PhaseBadge } from '../components/PhaseBadge';
import { Icon } from '../components/Icon';
import { useCurrentUser } from '../lib/auth-context';
import { loginUrl } from '../lib/auth-redirect';
import {
  requestIdentityVerification,
  KYC_PROVIDERS,
  IS_KYC_DEV_MOCK,
  type KycProvider,
} from '../lib/identity-verification';
import {
  APPROVAL_DOC_MIME,
  DocumentsPickerField,
  type StagedDoc,
} from '../components/uploader/DocumentsPickerField';
import {
  applyUploader,
  fetchMyUploader,
  fetchMyUploaderEvents,
  setActiveRole,
  type MyUploaderProfile,
  type MyUploaderEventItem,
  type UploaderApprovalStatus,
} from '../lib/api';
import { uploadUploaderSignupDocuments } from '../lib/uploads';

/**
 * /uploader — 업로더 자기 페이지 (A_600 + A_601 합본).
 *
 * 상태별 분기:
 *   - 비로그인 → 로그인 유도
 *   - 프로파일 없음 → A_600 승급 신청 폼
 *   - pending / revision_requested / rejected → 상태 안내 + (rejected/revision 은 재신청)
 *   - approved → A_601 내 이벤트 목록 + "새 이벤트 업로드" 버튼
 */

type View = 'loading' | 'anon' | 'no-profile' | 'pending' | 'needs-revision' | 'rejected' | 'approved';

export function UploaderPage() {
  const { user, loading: authLoading, refresh } = useCurrentUser();
  const [profile, setProfile] = useState<MyUploaderProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setProfileLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setProfileLoading(true);
    fetchMyUploader(ctrl.signal)
      .then((p) => setProfile(p))
      .catch((e) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setProfileError(e instanceof Error ? e.message : 'unknown');
      })
      .finally(() => setProfileLoading(false));
    return () => ctrl.abort();
  }, [authLoading, user]);

  const view: View = (() => {
    if (authLoading || profileLoading) return 'loading';
    if (!user) return 'anon';
    if (!profile) return 'no-profile';
    if (profile.approvalStatus === 'approved') return 'approved';
    if (profile.approvalStatus === 'pending') return 'pending';
    if (profile.approvalStatus === 'revision_requested') return 'needs-revision';
    return 'rejected';
  })();

  return (
    <Shell>
      {view === 'loading' && <LoadingBox />}
      {view === 'anon' && <LoginGate />}
      {profileError && (
        <ErrorBox message={profileError} />
      )}
      {view === 'no-profile' && (
        <ApplyForm
          onSubmitted={(p) => setProfile(p)}
        />
      )}
      {(view === 'pending' || view === 'rejected' || view === 'needs-revision') && profile && (
        <StatusPanel
          profile={profile}
          onResubmitted={(p) => setProfile(p)}
        />
      )}
      {view === 'approved' && profile && (
        <ApprovedBody
          profile={profile}
          activeRole={user?.activeRole ?? 'user'}
          onRoleChanged={async () => {
            await refresh();
          }}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('uploader');
  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg) text-(--color-text)">
      <Header />
      <main className="mx-auto w-full max-w-[960px] flex-1 px-4 py-6 md:px-8 md:py-10">
        <header className="mb-6">
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
            {t('page.subtitle')}
          </p>
          <h1 className="m-0 mt-1 text-[24px] font-bold tracking-[-0.015em]">{t('page.title')}</h1>
        </header>
        {children}
      </main>
    </div>
  );
}

function LoadingBox() {
  const { t } = useTranslation('uploader');
  return (
    <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-8 text-center text-[13px] text-(--color-text-muted)">
      {t('page.loading')}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  const { t } = useTranslation('uploader');
  return (
    <div className="mb-4 rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
      {t('page.profileFetchError')} {message}
    </div>
  );
}

function LoginGate() {
  const { t } = useTranslation('uploader');
  return (
    <section className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-10 text-center">
      <h2 className="m-0 mb-2 text-[20px] font-bold tracking-[-0.015em]">{t('page.loginRequired')}</h2>
      <p className="m-0 mb-6 text-[14px] text-(--color-text-muted)">
        {t('page.loginDescription')}
      </p>
      <a
        href={loginUrl('google', '/uploader')}
        className="inline-flex h-10 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-4 text-[14px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
      >
        {t('page.loginButton')} <Icon name="arrow" size={14} />
      </a>
    </section>
  );
}

// =============================================================
// Apply form — A_600
// =============================================================

type IdentityKind = 'organization' | 'individual';

function ApplyForm({ onSubmitted }: { onSubmitted: (p: MyUploaderProfile) => void }) {
  const { t } = useTranslation('uploader');
  const [organizationName, setOrg] = useState('');
  const [contactPhone, setPhone] = useState('');
  const [contactEmail, setEmail] = useState('');
  const [realName, setRealName] = useState('');
  const [identityKind, setIdentityKind] = useState<IdentityKind>('organization');
  const [bizRegNumber, setBizRegNumber] = useState('');
  const [ciHash, setCiHash] = useState<string | null>(null);
  const [ciProvider, setCiProvider] = useState<KycProvider>('pass');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [docs, setDocs] = useState<StagedDoc[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [docsUploading, setDocsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bizValid = /^[0-9]{10}$/.test(bizRegNumber.replace(/[-\s]/g, ''));
  const identityValid =
    identityKind === 'organization' ? bizValid : ciHash !== null && ciHash.length === 88;

  const valid =
    organizationName.trim().length >= 2 &&
    realName.trim().length >= 1 &&
    /^[0-9+\-\s()]{7,20}$/.test(contactPhone) &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail) &&
    identityValid &&
    docs.length >= 1 &&
    docs.length <= 5;

  const runIdentityVerification = async () => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const r = await requestIdentityVerification(ciProvider);
      setCiHash(r.ciHash);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setVerifying(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      setDocsUploading(true);
      let uploaded;
      try {
        uploaded = await uploadUploaderSignupDocuments(docs.map((d) => d.file));
      } finally {
        setDocsUploading(false);
      }
      const { uploader } = await applyUploader({
        organizationName: organizationName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(),
        realName: realName.trim(),
        businessRegistrationNumber:
          identityKind === 'organization' ? bizRegNumber.replace(/[-\s]/g, '') : null,
        ciHash: identityKind === 'individual' ? ciHash : null,
        documents: uploaded,
      });
      onSubmitted(uploader);
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'unknown';
      // REAPPLY_COOLDOWN:<ISO>:<days> → 한국어로.
      if (raw.startsWith('REAPPLY_COOLDOWN:')) {
        const [, iso, days] = raw.split(':');
        const dateLabel = iso ? iso.slice(0, 10) : '?';
        setError(t('form.cooldownMsg', { days, date: dateLabel }));
      } else {
        setError(raw);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <div className="mb-5">
        <h2 className="m-0 text-[18px] font-bold tracking-[-0.01em]">{t('page.apply')}</h2>
        <p className="m-0 mt-1 text-[13px] text-(--color-text-muted)">
          {t('page.applyDescription')}
        </p>
        <p
          className="m-0 mt-2 text-[12px] text-(--color-text-subtle)"
          dangerouslySetInnerHTML={{ __html: t('page.applyIdNote') }}
        />
      </div>

      <form
        onSubmit={submit}
        className="flex flex-col gap-4 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6"
      >
        <FormField label={t('form.orgName')} hint={t('form.orgNameHint')}>
          <input
            type="text"
            value={organizationName}
            onChange={(e) => setOrg(e.target.value)}
            placeholder={t('form.orgNamePlaceholder')}
            maxLength={100}
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px] outline-none transition-[border-color,box-shadow] focus:border-(--color-accent) focus:shadow-[0_0_0_4px_var(--color-accent-bg)]"
          />
        </FormField>
        <FormField label={t('form.realName')} hint={t('form.realNameHint')}>
          <input
            type="text"
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            placeholder={t('form.realNamePlaceholder')}
            maxLength={50}
            autoComplete="name"
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px] outline-none transition-[border-color,box-shadow] focus:border-(--color-accent) focus:shadow-[0_0_0_4px_var(--color-accent-bg)]"
          />
        </FormField>
        <FormField label={t('form.phone')} hint={t('form.phoneHint')}>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('form.phonePlaceholder')}
            maxLength={20}
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px] outline-none transition-[border-color,box-shadow] focus:border-(--color-accent) focus:shadow-[0_0_0_4px_var(--color-accent-bg)]"
          />
        </FormField>
        <FormField label={t('form.email')} hint={t('form.emailHint')}>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('form.emailPlaceholder')}
            maxLength={255}
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px] outline-none transition-[border-color,box-shadow] focus:border-(--color-accent) focus:shadow-[0_0_0_4px_var(--color-accent-bg)]"
          />
        </FormField>

        <fieldset className="flex flex-col gap-2 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) p-3">
          <legend className="px-1 text-[13px] font-semibold text-(--color-text)">{t('form.identity')}</legend>
          <div className="flex gap-2">
            <label
              className={`inline-flex flex-1 cursor-pointer items-center gap-2 rounded-(--radius-md) border px-3 py-2 text-[13px] ${
                identityKind === 'organization'
                  ? 'border-(--color-accent) bg-(--color-accent-bg) text-(--color-accent)'
                  : 'border-(--color-border) bg-(--color-surface) text-(--color-text-muted) hover:text-(--color-text)'
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                checked={identityKind === 'organization'}
                onChange={() => setIdentityKind('organization')}
              />
              {t('form.identityOrg')}
            </label>
            <label
              className={`inline-flex flex-1 cursor-pointer items-center gap-2 rounded-(--radius-md) border px-3 py-2 text-[13px] ${
                identityKind === 'individual'
                  ? 'border-(--color-accent) bg-(--color-accent-bg) text-(--color-accent)'
                  : 'border-(--color-border) bg-(--color-surface) text-(--color-text-muted) hover:text-(--color-text)'
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                checked={identityKind === 'individual'}
                onChange={() => setIdentityKind('individual')}
              />
              {t('form.identityIndividual')}
            </label>
          </div>
          {identityKind === 'organization' ? (
            <FormField label={t('form.bizRegNumber')} hint={t('form.bizRegNumberHint')}>
              <input
                type="text"
                value={bizRegNumber}
                onChange={(e) => setBizRegNumber(e.target.value)}
                placeholder={t('form.bizRegNumberPlaceholder')}
                maxLength={13}
                className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px] outline-none tabular focus:border-(--color-accent)"
              />
            </FormField>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-(--color-text)">{t('form.kycTitle')}</span>
              {ciHash ? (
                <div className="flex items-center justify-between gap-2 rounded-(--radius-md) border border-(--color-success)/40 bg-(--color-success)/5 px-3 py-2 text-[12px]">
                  <span className="text-(--color-success)">
                    {t('form.kycSuccess', { provider: t(`form.kycProvider.${ciProvider}`) })}
                    {IS_KYC_DEV_MOCK && (
                      <span className="ml-1.5 text-(--color-text-subtle)">{t('form.kycDevStub')}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCiHash(null)}
                    className="text-(--color-text-subtle) hover:text-(--color-error)"
                  >
                    {t('form.kycRedo')}
                  </button>
                </div>
              ) : (
                <>
                  <fieldset className="flex flex-wrap gap-1.5" aria-label={t('form.kycProviderLabel')}>
                    <legend className="sr-only">{t('form.kycProviderLabel')}</legend>
                    {KYC_PROVIDERS.map((p) => {
                      const active = ciProvider === p.id;
                      return (
                        <label
                          key={p.id}
                          className={`inline-flex h-9 cursor-pointer items-center rounded-(--radius-md) border px-3 text-[12.5px] font-medium transition-colors ${
                            active
                              ? 'border-(--color-accent) bg-(--color-accent)/5 text-(--color-accent)'
                              : 'border-(--color-border) bg-(--color-surface) text-(--color-text-muted) hover:border-(--color-border-hover) hover:text-(--color-text)'
                          }`}
                        >
                          <input
                            type="radio"
                            name="kyc-provider"
                            value={p.id}
                            checked={active}
                            onChange={() => setCiProvider(p.id)}
                            className="sr-only"
                          />
                          {t(`form.kycProvider.${p.id}`)}
                        </label>
                      );
                    })}
                  </fieldset>
                  <button
                    type="button"
                    onClick={() => void runIdentityVerification()}
                    disabled={verifying}
                    className="inline-flex h-10 items-center justify-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-4 text-[13px] font-medium hover:border-(--color-border-hover) disabled:opacity-40"
                  >
                    {verifying
                      ? t('form.kycVerifying')
                      : t('form.kycVerify', { provider: t(`form.kycProvider.${ciProvider}`) })}
                  </button>
                  {verifyError && (
                    <p className="m-0 rounded-(--radius-sm) bg-(--color-error)/5 p-2 text-[11.5px] text-(--color-error)">
                      {t('form.kycFail')} {verifyError}
                    </p>
                  )}
                </>
              )}
              <span className="text-[11px] text-(--color-text-subtle)">
                {IS_KYC_DEV_MOCK ? t('form.kycDevNote') : t('form.kycProdNote')}
              </span>
            </div>
          )}
        </fieldset>

        <FormField label={t('form.document')} hint={t('form.documentHint')}>
          <DocumentsPickerField
            files={docs}
            onChange={setDocs}
            uploading={docsUploading}
            allowedMime={APPROVAL_DOC_MIME}
            min={1}
            max={5}
          />
        </FormField>

        {error && (
          <div className="rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
            {t('form.applyFail')} {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-(--color-border) pt-4">
          <button
            type="submit"
            disabled={!valid || submitting}
            className="inline-flex h-10 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-5 text-[14px] font-medium text-white transition-colors hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? t('form.applySubmitting') : t('form.applySubmit')}
          </button>
        </div>
      </form>
    </section>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-(--color-text)">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-(--color-text-subtle)">{hint}</span>}
    </label>
  );
}

// =============================================================
// Status panel (pending / revision_requested / rejected)
// =============================================================

function StatusPanel({
  profile,
  onResubmitted,
}: {
  profile: MyUploaderProfile;
  onResubmitted: (p: MyUploaderProfile) => void;
}) {
  const { t } = useTranslation('uploader');
  const canResubmit =
    profile.approvalStatus === 'rejected' || profile.approvalStatus === 'revision_requested';

  const [open, setOpen] = useState(false);

  const statusBadge: Record<UploaderApprovalStatus, string> = {
    pending: t('status.pendingBadge'),
    approved: t('status.approvedBadge'),
    revision_requested: t('status.revisionBadge'),
    rejected: t('status.rejectedBadge'),
  };

  const statusMessage: Partial<Record<UploaderApprovalStatus, string>> = {
    pending: t('page.pendingMessage'),
    revision_requested: t('page.revisionMessage'),
    rejected: t('page.rejectedMessage'),
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center rounded-(--radius-sm) bg-(--color-warning)/10 px-2 py-[3px] text-[11px] font-semibold text-(--color-warning)">
            {statusBadge[profile.approvalStatus]}
          </span>
          <span className="text-[12px] text-(--color-text-subtle)">
            {t('page.uploaderId', { id: profile.uploaderId })}
          </span>
        </div>
        <h2 className="m-0 text-[18px] font-bold tracking-[-0.01em]">{profile.organizationName}</h2>
        <dl className="mt-3 grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
          <dt className="text-(--color-text-subtle)">{t('page.emailLabel')}</dt>
          <dd className="m-0 text-(--color-text)">{profile.contactEmail}</dd>
          <dt className="text-(--color-text-subtle)">{t('page.phoneLabel')}</dt>
          <dd className="tabular m-0 text-(--color-text)">{profile.contactPhone}</dd>
          <dt className="text-(--color-text-subtle)">{t('page.appliedAt')}</dt>
          <dd className="tabular m-0 text-(--color-text-muted)">
            {profile.createdAt.slice(0, 19).replace('T', ' ')}
          </dd>
        </dl>
        <p className="mt-4 text-[13px] text-(--color-text-muted)">
          {statusMessage[profile.approvalStatus] ?? ''}
        </p>
      </div>

      {canResubmit && (
        <div>
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-10 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-4 text-[13px] font-medium text-(--color-text) transition-colors hover:border-(--color-border-hover)"
            >
              {t('page.reapply')}
            </button>
          ) : (
            <ApplyForm onSubmitted={onResubmitted} />
          )}
        </div>
      )}
    </section>
  );
}

// =============================================================
// Approved body — A_601 my events + 역할 토글
// =============================================================

function ApprovedBody({
  profile,
  activeRole,
  onRoleChanged,
}: {
  profile: MyUploaderProfile;
  activeRole: string;
  onRoleChanged: () => Promise<void> | void;
}) {
  const { t } = useTranslation('uploader');
  const [tab, setTab] = useState<UploaderApprovalStatus | 'any'>('any');
  const [items, setItems] = useState<MyUploaderEventItem[]>([]);
  const [byStatus, setByStatus] = useState<Record<UploaderApprovalStatus, number>>({
    pending: 0,
    approved: 0,
    revision_requested: 0,
    rejected: 0,
  });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchMyUploaderEvents({ approvalStatus: tab, limit: 50 }, ctrl.signal)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
        setByStatus(r.byStatus);
      })
      .catch((e) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [tab]);

  const toggleRole = async () => {
    setToggling(true);
    try {
      await setActiveRole(activeRole === 'uploader' ? 'user' : 'uploader');
      await onRoleChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'toggle failed');
    } finally {
      setToggling(false);
    }
  };

  const statusLabel: Record<UploaderApprovalStatus, string> = {
    pending: t('status.pending'),
    approved: t('status.approved'),
    revision_requested: t('status.revision_requested'),
    rejected: t('status.rejected'),
  };

  const TABS: { key: UploaderApprovalStatus | 'any'; label: string }[] = [
    { key: 'any', label: t('page.tabAll', { count: total || '' }) },
    { key: 'pending', label: t('page.tabPending', { count: byStatus.pending }) },
    { key: 'approved', label: t('page.tabApproved', { count: byStatus.approved }) },
    { key: 'revision_requested', label: t('page.tabRevision', { count: byStatus.revision_requested }) },
    { key: 'rejected', label: t('page.tabRejected', { count: byStatus.rejected }) },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-(--radius-sm) bg-(--color-success)/10 px-2 py-[3px] text-[11px] font-semibold text-(--color-success)">
              {t('page.approvedBadge')}
            </span>
            <span className="truncate text-[14px] font-semibold text-(--color-text)">
              {profile.organizationName}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-(--color-text-subtle)">
            {t('page.currentRole')}{' '}
            <span className="font-medium text-(--color-text-muted)">
              {activeRole === 'uploader' ? t('page.roleUploader') : t('page.roleUser')}
            </span>
            {activeRole !== 'uploader' && ` ${t('page.needSwitchDesc')}`}
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button
            type="button"
            onClick={toggleRole}
            disabled={toggling}
            className={`inline-flex h-9 flex-1 items-center justify-center rounded-(--radius-md) px-3 text-[13px] font-medium transition-colors disabled:opacity-40 sm:flex-initial ${
              activeRole === 'uploader'
                ? 'border border-(--color-border) bg-(--color-surface) text-(--color-text-muted) hover:text-(--color-text)'
                : 'bg-(--color-accent) text-white hover:bg-(--color-accent-hover)'
            }`}
          >
            {toggling
              ? t('page.switching')
              : activeRole === 'uploader'
                ? t('page.switchToUser')
                : t('page.switchToUploader')}
          </button>
          <Link
            to="/uploader/new"
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-(--radius-md) border border-(--color-accent) bg-(--color-accent-bg) px-3 text-[13px] font-medium text-(--color-accent) transition-colors hover:bg-(--color-accent)/15 sm:flex-initial"
          >
            {t('page.newEvent')} <Icon name="arrow" size={14} />
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
          {error}
        </div>
      )}

      <div className="inline-flex flex-wrap rounded-(--radius-md) border border-(--color-border) p-0.5">
        {TABS.map((tab2) => {
          const active = tab === tab2.key;
          return (
            <button
              key={tab2.key}
              type="button"
              onClick={() => setTab(tab2.key)}
              className={`h-8 rounded-[6px] px-3 text-[13px] font-medium transition-colors ${
                active
                  ? 'bg-(--color-accent) text-white'
                  : 'text-(--color-text-muted) hover:text-(--color-text)'
              }`}
            >
              {tab2.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
        {loading && items.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">
            {t('page.loading')}
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-(--color-text-subtle)">
            {tab === 'any' ? t('page.emptyAll') : t('page.emptyStatus')}
          </div>
        ) : (
          <ul className="divide-y divide-(--color-border)">
            {items.map((e) => {
              const needsReason =
                (e.approvalStatus === 'rejected' ||
                  e.approvalStatus === 'revision_requested') &&
                e.latestDecision;
              return (
                <li key={e.eventId} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <PhaseBadge phase={e.phase} />
                        <span
                          className={`inline-flex items-center rounded-(--radius-sm) px-2 py-[2px] text-[11px] font-semibold tracking-[0.02em] ${
                            e.approvalStatus === 'approved'
                              ? 'bg-(--color-success)/10 text-(--color-success)'
                              : e.approvalStatus === 'rejected'
                                ? 'bg-(--color-error)/10 text-(--color-error)'
                                : 'bg-(--color-warning)/10 text-(--color-warning)'
                          }`}
                        >
                          {statusLabel[e.approvalStatus]}
                        </span>
                        <span className="text-[12px] text-(--color-text-subtle)">
                          {e.category.name} · {e.region.sido}
                          {e.region.sigungu ? ` ${e.region.sigungu}` : ''}
                        </span>
                      </div>
                      <div className="mt-1 text-[15px] font-medium text-(--color-text)">
                        {e.title}
                      </div>
                      <div className="mt-0.5 tabular text-[12px] text-(--color-text-subtle)">
                        {e.startDate} ~ {e.endDate} · {t('page.createdAt')} {e.createdAt.slice(0, 10)}
                      </div>
                      {needsReason && e.latestDecision && (
                        <div
                          className={`mt-2 rounded-(--radius-md) border p-2.5 text-[12px] ${
                            e.approvalStatus === 'rejected'
                              ? 'border-(--color-error)/30 bg-(--color-error)/5'
                              : 'border-(--color-warning)/30 bg-(--color-warning)/5'
                          }`}
                        >
                          <div
                            className={`mb-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${
                              e.approvalStatus === 'rejected'
                                ? 'text-(--color-error)'
                                : 'text-(--color-warning)'
                            }`}
                          >
                            {t('page.adminReason', { date: e.latestDecision.decidedAt.slice(0, 10) })}
                          </div>
                          <p className="m-0 whitespace-pre-wrap text-(--color-text)">
                            {e.latestDecision.reason ?? t('page.noReason')}
                          </p>
                        </div>
                      )}
                    </div>
                    {e.approvalStatus === 'approved' && (
                      <Link
                        to={`/events/${e.eventId}`}
                        className="inline-flex h-8 shrink-0 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[12px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-border-hover) hover:text-(--color-text)"
                      >
                        {t('page.viewPublic')}
                      </Link>
                    )}
                    {(e.approvalStatus === 'revision_requested' ||
                      e.approvalStatus === 'rejected') && (
                      <Link
                        to={`/uploader/events/${e.eventId}/edit`}
                        className="inline-flex h-8 shrink-0 items-center rounded-(--radius-md) border border-(--color-accent) bg-(--color-accent-bg) px-3 text-[12px] font-medium text-(--color-accent) transition-colors hover:bg-(--color-accent)/15"
                      >
                        {t('page.editResubmit')}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
