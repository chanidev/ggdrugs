import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Header } from '../../../layout/Header';
import type { PostCategory } from '../../../lib/api/posts.js';
import { ActionButton } from 'seed-design/ui/action-button';
import { getMyCredits } from '../../../lib/api/credits.js';
import { useCurrentUser } from '../../../lib/auth-context.js';
import { LanguageToggle } from '../../../components/LanguageToggle.js';

/** GG-POST-004: 카테고리 레이블 — i18n 번들 로드 실패 시 영어 fallback (한국어 고정 제거). */
export const CATEGORY_LABELS: Record<PostCategory, string> = {
  festival_story: 'Festival Story',
  mate_finder: 'Mate Finder',
  free: 'Free Board',
};

/** i18n 적용 카테고리 레이블 훅 */
export function useCategoryLabel(category: PostCategory): string {
  const { t } = useTranslation('community');
  return t(`category.${category}`, { defaultValue: CATEGORY_LABELS[category] });
}

/**
 * CommunityShell — GG-COMM-001 커뮤니티 페이지 레이아웃.
 * - 공용 Header 재사용.
 * - 헤더줄: 크레딧(placeholder) / 언어토글(placeholder) / 채팅이동(placeholder) / 알림(실링크).
 * - 본문: 2열 (main + rightRail aside).
 */
export function CommunityShell({
  children,
  rightRail,
}: {
  children: ReactNode;
  rightRail: ReactNode;
}) {
  const { t } = useTranslation('community');
  const { user } = useCurrentUser();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    getMyCredits(1, 1)
      .then((r) => setCreditBalance(r.balance))
      .catch(() => { /* silent — 크레딧 조회 실패 시 placeholder 유지 */ });
  }, [user]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1100px] gap-6 px-6 py-6">
          <main className="min-w-0 flex-1">
            <div className="mb-5 flex items-center justify-between">
              <h1 className="text-(length:--text-h2) font-semibold">{t('shell.title')}</h1>
              <div className="flex items-center gap-2">
                {/* GG-COMM-017 크레딧 실연결 (slice5) */}
                {user ? (
                  <Link
                    to="/credits"
                    className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px] text-(--color-text-muted) hover:border-(--color-border-hover)"
                  >
                    {creditBalance !== null
                      ? t('shell.creditsLabel', { count: creditBalance.toLocaleString() })
                      : t('shell.creditsPlaceholder')}
                  </Link>
                ) : (
                  <span className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px] text-(--color-text-muted)">
                    {t('shell.creditsPlaceholder')}
                  </span>
                )}
                {/* GG-COMM-013 언어 토글 — LanguageToggle 실연결 */}
                <LanguageToggle />
                {/* GG-COMM-014/015 채팅방 이동 → 내 채팅방 목록(/chat/rooms) 실연결 */}
                <ActionButton
                  variant="neutralOutline"
                  size="small"
                  asChild
                  title={t('shell.chatRoomBtn')}
                >
                  <Link to="/chat/rooms">{t('shell.chatRoomBtn')}</Link>
                </ActionButton>
                {/* GG-COMM-016 알림 — 실연결 */}
                <Link
                  to="/notifications"
                  className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px] hover:border-(--color-border-hover)"
                >
                  {t('common:label.notifications')}
                </Link>
              </div>
            </div>
            {children}
          </main>
          <aside className="hidden w-[300px] shrink-0 md:block">{rightRail}</aside>
        </div>
      </div>
    </div>
  );
}
