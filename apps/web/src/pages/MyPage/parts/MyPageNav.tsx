import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

/**
 * A_500 마이페이지 우측 네비게이션 사이드바 (와이어 6번 우측 버튼 스택).
 * 알림 설정 · 커뮤니티 · 채팅방 이동 · 프로필 보기/수정 · 크레딧 내역.
 * NOTE: "업로더/사용자 전환"(와이어 ②)은 GG-ROLE-001(우측 상단 상시 노출)에 따라 헤더 RoleToggleButton 으로
 *       유지하고 여기서는 중복 배치하지 않는다. 채팅방 목록 전용 라우트가 없어 "채팅방 이동"은 커뮤니티로 연결.
 */
function NavBtn({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex h-11 w-full items-center justify-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px] font-medium text-(--color-text) transition-colors hover:border-(--color-border-hover) hover:bg-(--color-surface-alt)"
    >
      {children}
    </Link>
  );
}

export function MyPageNav() {
  const { t } = useTranslation('mypage');
  return (
    <nav aria-label={t('nav.heading')} className="flex flex-col gap-3">
      <NavBtn to="/notifications">{t('nav.notifications')}</NavBtn>
      <NavBtn to="/community">{t('nav.community')}</NavBtn>
      <NavBtn to="/community">{t('nav.chatRooms')}</NavBtn>
      <NavBtn to="/me/profile">{t('nav.profile')}</NavBtn>
      <NavBtn to="/credits">{t('nav.credits')}</NavBtn>
    </nav>
  );
}
