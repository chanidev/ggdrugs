import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';
import { useCurrentUser } from '../../lib/auth-context';
import { loginUrl } from '../../lib/auth-redirect';
import { ActionButton } from 'seed-design/ui/action-button';
import { PageShell } from './parts/PageShell.js';
import { RoleToggleButton } from './parts/RoleToggleButton.js';
import { SessionFooter } from './parts/SessionFooter.js';
import { TabBtn } from './parts/TabBtn.js';
import { CalendarTab } from './tabs/CalendarTab.js';
import { BookmarksList } from './tabs/BookmarksTab.js';
import { ReviewsList } from './tabs/ReviewsTab.js';
import { SubscriptionsList } from './tabs/SubscriptionsTab.js';
import { RecommendationsList } from './tabs/RecommendationsTab.js';

/**
 * MyPage — A_500 마이페이지.
 *
 * 탭: 캘린더(기본) / 내 북마크 / 내 리뷰.
 * 캘린더 = 스펙상 centerpiece — 월간 grid + 저장 이벤트 배지 + 날짜 선택 시
 * 우측/하단에 해당 날짜 이벤트 리스트 (상세/리뷰 CTA 포함).
 * 인증 필요 — 비로그인 상태면 로그인 유도 박스.
 */

type Tab = 'calendar' | 'bookmarks' | 'reviews' | 'subscriptions' | 'recommendations';

export function MyPage() {
  const { t } = useTranslation('mypage');
  const { user, loading: authLoading } = useCurrentUser();
  const [tab, setTab] = useState<Tab>('calendar');

  if (authLoading) return <PageShell>{null}</PageShell>;

  if (!user) {
    return (
      <PageShell>
        <section className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-10 text-center">
          <h1 className="m-0 mb-2 text-[20px] font-bold tracking-[-0.015em]">
            {t('page.loginRequired')}
          </h1>
          <p className="m-0 mb-6 text-[14px] text-(--color-text-muted)">
            {t('page.loginHint')}
          </p>
          <ActionButton variant="brandSolid" size="medium" asChild>
            <a href={loginUrl('google', '/me')}>
              {t('page.loginButton')} <Icon name="arrow" size={14} />
            </a>
          </ActionButton>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* GG-ROLE-001: 마이페이지 우측 상단 역할 전환 버튼 상시 노출. */}
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
            {t('page.title')}
          </p>
          <h1 className="m-0 mt-1 text-[24px] font-bold tracking-[-0.015em]">
            <span className="text-(--color-accent)">•</span> {t('page.greetingUser', { nickname: user.nickname })}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* GG-MY-006 마이페이지 → 커뮤니티 진입 */}
          <Link
            to="/community"
            className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) px-3 text-[13px] font-medium hover:border-(--color-border-hover)"
          >
            {t('page.communityLink')}
          </Link>
          {/* GG-MY-007 마이페이지 → 프로필 보기 (A_807) */}
          <Link
            to="/me/profile"
            className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) px-3 text-[13px] font-medium hover:border-(--color-border-hover)"
          >
            {t('profile.title')}
          </Link>
          <RoleToggleButton />
        </div>
      </header>

      <div
        role="tablist"
        aria-label={t('page.title')}
        className="mb-4 flex border-b border-(--color-border)"
      >
        <TabBtn active={tab === 'calendar'} onClick={() => setTab('calendar')}>
          {t('tabs.calendar')}
        </TabBtn>
        <TabBtn active={tab === 'bookmarks'} onClick={() => setTab('bookmarks')}>
          {t('tabs.bookmarks')}
        </TabBtn>
        <TabBtn active={tab === 'reviews'} onClick={() => setTab('reviews')}>
          {t('tabs.reviews')}
        </TabBtn>
        <TabBtn active={tab === 'subscriptions'} onClick={() => setTab('subscriptions')}>
          {t('tabs.subscriptions')}
        </TabBtn>
        <TabBtn active={tab === 'recommendations'} onClick={() => setTab('recommendations')}>
          {t('tabs.recommendations')}
        </TabBtn>
      </div>

      {tab === 'calendar' && <CalendarTab />}
      {tab === 'bookmarks' && <BookmarksList />}
      {tab === 'reviews' && <ReviewsList />}
      {tab === 'subscriptions' && <SubscriptionsList />}
      {tab === 'recommendations' && <RecommendationsList />}

      <SessionFooter />
    </PageShell>
  );
}
