import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Header } from '../layout/Header';
import { PhaseBadge } from '../components/PhaseBadge';
import { Icon } from '../components/Icon';
import { useCurrentUser } from '../lib/auth-context';
import {
  applyUploader,
  fetchMyUploader,
  fetchMyUploaderEvents,
  setActiveRole,
  type MyUploaderProfile,
  type MyUploaderEventItem,
  type UploaderApprovalStatus,
} from '../lib/api';

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

const STATUS_LABEL: Record<UploaderApprovalStatus, string> = {
  pending: '승인 대기',
  approved: '승인됨',
  revision_requested: '보완 요청됨',
  rejected: '반려됨',
};

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
  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg) text-(--color-text)">
      <Header />
      <main className="mx-auto w-full max-w-[960px] flex-1 px-4 py-6 md:px-8 md:py-10">
        <header className="mb-6">
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
            Uploader · A_600 / A_601
          </p>
          <h1 className="m-0 mt-1 text-[24px] font-bold tracking-[-0.015em]">업로더 콘솔</h1>
        </header>
        {children}
      </main>
    </div>
  );
}

function LoadingBox() {
  return (
    <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-8 text-center text-[13px] text-(--color-text-muted)">
      불러오는 중…
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
      프로파일 조회 실패: {message}
    </div>
  );
}

function LoginGate() {
  return (
    <section className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-10 text-center">
      <h2 className="m-0 mb-2 text-[20px] font-bold tracking-[-0.015em]">로그인이 필요해요</h2>
      <p className="m-0 mb-6 text-[14px] text-(--color-text-muted)">
        업로더 역할 신청과 이벤트 등록은 로그인 후에 할 수 있어요.
      </p>
      <a
        href="/api/auth/google"
        className="inline-flex h-10 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-4 text-[14px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
      >
        Google 로그인 <Icon name="arrow" size={14} />
      </a>
    </section>
  );
}

// =============================================================
// Apply form — A_600
// =============================================================

function ApplyForm({ onSubmitted }: { onSubmitted: (p: MyUploaderProfile) => void }) {
  const [organizationName, setOrg] = useState('');
  const [contactPhone, setPhone] = useState('');
  const [contactEmail, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    organizationName.trim().length >= 2 &&
    /^[0-9+\-\s()]{7,20}$/.test(contactPhone) &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { uploader } = await applyUploader({
        organizationName: organizationName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(),
      });
      onSubmitted(uploader);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <div className="mb-5">
        <h2 className="m-0 text-[18px] font-bold tracking-[-0.01em]">업로더 역할 신청</h2>
        <p className="m-0 mt-1 text-[13px] text-(--color-text-muted)">
          이벤트를 등록하려면 업로더 역할이 필요해요. 신청 후 관리자 승인을 거치면 활성화됩니다.
        </p>
        <p className="m-0 mt-2 text-[12px] text-(--color-text-subtle)">
          ※ 이름·주민번호·증명사진·소속 서류는 다음 단계 (ADR) 에서 추가 예정. 현재는 최소 정보만 수집.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="flex flex-col gap-4 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6"
      >
        <Field label="기관/팀 이름" hint="2자 이상. 예: 서울축제기획, 성수동 로컬맛집협회">
          <input
            type="text"
            value={organizationName}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="기관·팀 이름"
            maxLength={100}
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px] outline-none transition-[border-color,box-shadow] focus:border-(--color-accent) focus:shadow-[0_0_0_4px_var(--color-accent-bg)]"
          />
        </Field>
        <Field label="연락처" hint="숫자·+·-·공백·괄호만 허용">
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="02-1234-5678"
            maxLength={20}
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px] outline-none transition-[border-color,box-shadow] focus:border-(--color-accent) focus:shadow-[0_0_0_4px_var(--color-accent-bg)]"
          />
        </Field>
        <Field label="이메일" hint="관리자 심사 결과 통보에 사용">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contact@example.com"
            maxLength={255}
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px] outline-none transition-[border-color,box-shadow] focus:border-(--color-accent) focus:shadow-[0_0_0_4px_var(--color-accent-bg)]"
          />
        </Field>

        {error && (
          <div className="rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
            신청 실패: {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-(--color-border) pt-4">
          <button
            type="submit"
            disabled={!valid || submitting}
            className="inline-flex h-10 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-5 text-[14px] font-medium text-white transition-colors hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? '제출 중…' : '신청하기'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({
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
  const canResubmit =
    profile.approvalStatus === 'rejected' || profile.approvalStatus === 'revision_requested';

  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center rounded-(--radius-sm) bg-(--color-warning)/10 px-2 py-[3px] text-[11px] font-semibold text-(--color-warning)">
            {STATUS_LABEL[profile.approvalStatus]}
          </span>
          <span className="text-[12px] text-(--color-text-subtle)">
            uploader_id={profile.uploaderId}
          </span>
        </div>
        <h2 className="m-0 text-[18px] font-bold tracking-[-0.01em]">{profile.organizationName}</h2>
        <dl className="mt-3 grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
          <dt className="text-(--color-text-subtle)">이메일</dt>
          <dd className="m-0 text-(--color-text)">{profile.contactEmail}</dd>
          <dt className="text-(--color-text-subtle)">연락처</dt>
          <dd className="tabular m-0 text-(--color-text)">{profile.contactPhone}</dd>
          <dt className="text-(--color-text-subtle)">신청</dt>
          <dd className="tabular m-0 text-(--color-text-muted)">
            {profile.createdAt.slice(0, 19).replace('T', ' ')}
          </dd>
        </dl>
        <p className="mt-4 text-[13px] text-(--color-text-muted)">
          {profile.approvalStatus === 'pending' &&
            '관리자가 검토 중이에요. 승인되면 이벤트를 등록할 수 있어요.'}
          {profile.approvalStatus === 'revision_requested' &&
            '관리자가 보완을 요청했어요. 정보를 다시 확인하고 재신청할 수 있어요.'}
          {profile.approvalStatus === 'rejected' &&
            '신청이 반려됐어요. 정보를 다시 다듬어 재신청할 수 있어요.'}
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
              재신청 작성
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

  const TABS: { key: UploaderApprovalStatus | 'any'; label: string }[] = [
    { key: 'any', label: `전체 ${total || ''}` },
    { key: 'pending', label: `대기 ${byStatus.pending}` },
    { key: 'approved', label: `승인됨 ${byStatus.approved}` },
    { key: 'revision_requested', label: `보완 ${byStatus.revision_requested}` },
    { key: 'rejected', label: `반려 ${byStatus.rejected}` },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-(--radius-sm) bg-(--color-success)/10 px-2 py-[3px] text-[11px] font-semibold text-(--color-success)">
              승인됨
            </span>
            <span className="truncate text-[14px] font-semibold text-(--color-text)">
              {profile.organizationName}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-(--color-text-subtle)">
            현재 역할:{' '}
            <span className="font-medium text-(--color-text-muted)">
              {activeRole === 'uploader' ? 'uploader' : 'user'}
            </span>
            {activeRole !== 'uploader' && ' — 업로더로 전환해야 이벤트를 등록할 수 있어요'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleRole}
          disabled={toggling}
          className={`inline-flex h-9 items-center rounded-(--radius-md) px-3 text-[13px] font-medium transition-colors disabled:opacity-40 ${
            activeRole === 'uploader'
              ? 'border border-(--color-border) bg-(--color-surface) text-(--color-text-muted) hover:text-(--color-text)'
              : 'bg-(--color-accent) text-white hover:bg-(--color-accent-hover)'
          }`}
        >
          {toggling
            ? '…'
            : activeRole === 'uploader'
              ? 'user 역할로'
              : 'uploader 역할로 전환'}
        </button>
        <Link
          to="/uploader/new"
          className="inline-flex h-9 items-center gap-1.5 rounded-(--radius-md) border border-(--color-accent) bg-(--color-accent-bg) px-3 text-[13px] font-medium text-(--color-accent) transition-colors hover:bg-(--color-accent)/15"
        >
          새 이벤트 업로드 <Icon name="arrow" size={14} />
        </Link>
      </div>

      {error && (
        <div className="rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
          {error}
        </div>
      )}

      <div className="inline-flex flex-wrap rounded-(--radius-md) border border-(--color-border) p-0.5">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`h-8 rounded-[6px] px-3 text-[13px] font-medium transition-colors ${
                active
                  ? 'bg-(--color-accent) text-white'
                  : 'text-(--color-text-muted) hover:text-(--color-text)'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
        {loading && items.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">
            불러오는 중…
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-(--color-text-subtle)">
            {tab === 'any'
              ? '아직 등록한 이벤트가 없어요. 우측 상단 ‘새 이벤트 업로드’ 에서 시작하세요.'
              : '이 상태의 이벤트가 없어요.'}
          </div>
        ) : (
          <ul className="divide-y divide-(--color-border)">
            {items.map((e) => (
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
                        {STATUS_LABEL[e.approvalStatus]}
                      </span>
                      <span className="text-[12px] text-(--color-text-subtle)">
                        {e.category.name} · {e.region.sido}
                        {e.region.sigungu ? ` ${e.region.sigungu}` : ''}
                      </span>
                    </div>
                    <div className="mt-1 text-[15px] font-medium text-(--color-text)">{e.title}</div>
                    <div className="mt-0.5 tabular text-[12px] text-(--color-text-subtle)">
                      {e.startDate} ~ {e.endDate} · 등록 {e.createdAt.slice(0, 10)}
                    </div>
                  </div>
                  {e.approvalStatus === 'approved' && (
                    <Link
                      to={`/events/${e.eventId}`}
                      className="inline-flex h-8 shrink-0 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[12px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-border-hover) hover:text-(--color-text)"
                    >
                      공개 페이지
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
