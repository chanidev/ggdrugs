import { Fragment, useState } from 'react';
import { Header } from '../../layout/Header';
import { AuditLogsTab } from '../../components/admin/AuditLogsTab';
import { MembersTab } from '../../components/admin/MembersTab';
import { useCurrentUser } from '../../lib/auth-context';
import { EventsTab } from './tabs/EventsTab.js';
import { UploadReviewsTab } from './tabs/UploadReviewsTab.js';
import { UploadersTab } from './tabs/UploadersTab.js';

/**
 * A_700 관리자 콘솔 — 탭 2종.
 *
 *  1. Events — 이벤트 vibe 라벨 부여 (기존).
 *  2. Uploaders — 업로더 승급 심사 (A_700 part 2).
 *
 * 인증: /auth/me 의 isAdmin 확인. 서버가 다시 403 하므로 이중 방어.
 */

type AdminTab = 'events' | 'upload-review' | 'uploaders' | 'members' | 'audit-logs';

export function AdminEventsPage() {
  const { user, loading: authLoading } = useCurrentUser();

  if (authLoading) return <Shell tab="events" onTabChange={() => {}}>{null}</Shell>;

  if (!user || !user.isAdmin) {
    return (
      <Shell tab="events" onTabChange={() => {}}>
        <div className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-10 text-center">
          <h1 className="m-0 mb-2 text-[20px] font-bold tracking-[-0.015em]">
            관리자 전용 페이지
          </h1>
          <p className="m-0 text-[14px] text-(--color-text-muted)">
            이 화면은 admin_profiles 에 등록된 관리자만 접근할 수 있어요.
          </p>
        </div>
      </Shell>
    );
  }

  return <AdminBody />;
}

function AdminBody() {
  const [tab, setTab] = useState<AdminTab>('events');
  return (
    <Shell tab={tab} onTabChange={setTab}>
      {tab === 'events' && <EventsTab />}
      {tab === 'upload-review' && <UploadReviewsTab />}
      {tab === 'uploaders' && <UploadersTab />}
      {tab === 'members' && <MembersTab />}
      {tab === 'audit-logs' && <AuditLogsTab />}
    </Shell>
  );
}

function Shell({
  tab,
  onTabChange,
  children,
}: {
  tab: AdminTab;
  onTabChange: (t: AdminTab) => void;
  children: React.ReactNode;
}) {
  const TABS: { key: AdminTab; label: string; subtitle: string }[] = [
    { key: 'events', label: 'Events', subtitle: 'vibe 라벨 부여' },
    { key: 'upload-review', label: 'Uploads', subtitle: '업로드 이벤트 심사' },
    { key: 'uploaders', label: 'Uploaders', subtitle: '업로더 승급 심사' },
    { key: 'members', label: 'Members', subtitle: '회원/admin 관리' },
    { key: 'audit-logs', label: 'Audit', subtitle: '승인 결정 히스토리' },
  ];
  return (
    <div className="flex min-h-screen flex-col bg-(--color-surface)">
      <Header />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 md:px-8 md:py-10">
        <header className="mb-6">
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
            Admin · A_700
          </p>
          <h1 className="m-0 mt-1 text-[24px] font-bold tracking-[-0.015em]">관리자 콘솔</h1>
          {/* Editorial middot 탭 — FullListPanel 과 같은 톤 유지. */}
          <div
            role="tablist"
            aria-label="관리자 탭"
            className="mt-3 flex flex-wrap items-center gap-y-1"
          >
            {TABS.map((t, i) => {
              const active = tab === t.key;
              return (
                <Fragment key={t.key}>
                  {i > 0 && (
                    <span aria-hidden className="select-none px-1 text-[12px] text-(--color-text-subtle)">·</span>
                  )}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onTabChange(t.key)}
                    className={`inline-flex items-center gap-1.5 rounded-(--radius-sm) px-1.5 py-0.5 text-[14px] transition-colors ${
                      active ? 'text-(--color-accent)' : 'text-(--color-text-muted) hover:text-(--color-text)'
                    }`}
                  >
                    {active && (
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-(--color-accent)" />
                    )}
                    <span className={active ? 'font-semibold' : 'font-medium'}>{t.label}</span>
                    <span className="hidden text-[12px] text-(--color-text-subtle) sm:inline">{t.subtitle}</span>
                  </button>
                </Fragment>
              );
            })}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
