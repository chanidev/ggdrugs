import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Header } from '../../../layout/Header';
import type { PostCategory } from '../../../lib/api/posts.js';
import { ActionButton } from 'seed-design/ui/action-button';
import { getMyCredits } from '../../../lib/api/credits.js';
import { useCurrentUser } from '../../../lib/auth-context.js';

/** GG-POST-004: 카테고리 레이블 — ComposeModal, PostListPage, CategoryGrid 등에서 참조 */
export const CATEGORY_LABELS: Record<PostCategory, string> = {
  festival_story: '축제 이야기',
  mate_finder: '메이트 찾기',
  free: '자유게시판',
};

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
              <h1 className="text-(length:--text-h2) font-semibold">커뮤니티</h1>
              <div className="flex items-center gap-2">
                {/* GG-COMM-017 크레딧 실연결 (slice5) */}
                {user ? (
                  <Link
                    to="/credits"
                    className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px] text-(--color-text-muted) hover:border-(--color-border-hover)"
                  >
                    크레딧 {creditBalance !== null ? creditBalance.toLocaleString() : '...'}개
                  </Link>
                ) : (
                  <span className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px] text-(--color-text-muted)">
                    크레딧
                  </span>
                )}
                {/* GG-COMM-013 언어토글 placeholder — 실 i18n 미도입(슬라이스 7) */}
                <ActionButton
                  variant="neutralOutline"
                  size="small"
                  disabled
                  title="언어 변경 (준비 중)"
                >
                  한국어
                </ActionButton>
                {/* GG-COMM-014/015 채팅방 이동 placeholder — 슬라이스 5에서 실구현 */}
                <ActionButton
                  variant="neutralOutline"
                  size="small"
                  disabled
                  title="채팅방 (준비 중)"
                >
                  채팅방
                </ActionButton>
                {/* GG-COMM-016 알림 — 실연결 */}
                <Link
                  to="/notifications"
                  className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px] hover:border-(--color-border-hover)"
                >
                  알림
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
