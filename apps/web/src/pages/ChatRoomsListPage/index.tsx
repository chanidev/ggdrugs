import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Header } from '../../layout/Header';
import { Avatar } from 'seed-design/ui/avatar';
import { ActionButton } from 'seed-design/ui/action-button';
import { useCurrentUser } from '../../lib/auth-context';
import { getMyChatRooms, type ChatRoomSummaryOut } from '../../lib/api/match.js';

/**
 * ChatRoomsListPage — 내 채팅방 목록 (A_805 진입 허브).
 * "채팅방 이동"(커뮤니티 셸 / 마이페이지 사이드바)의 목적지. getMyChatRooms() 연결.
 * 활성 방 우선, 그 안에서 최근 갱신순. 카드 클릭 → /chat/rooms/:id.
 */
export function ChatRoomsListPage() {
  const { t } = useTranslation('chat');
  const { user } = useCurrentUser();
  const [rooms, setRooms] = useState<ChatRoomSummaryOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getMyChatRooms()
      .then((r) => { if (mounted) setRooms(r); })
      .catch((e: unknown) => {
        if (mounted) {
          setError((e as Error).message === 'UNAUTHENTICATED' ? t('list.loginRequired') : t('list.loadError'));
        }
      });
    return () => { mounted = false; };
  }, [t]);

  const sorted = rooms
    ? [...rooms].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
    : [];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[640px] px-4 py-8">
          <div className="mb-6">
            <h1 className="text-(length:--text-h2) font-semibold">{t('list.title')}</h1>
            <p className="mt-1 text-[13px] text-(--color-text-muted)">{t('list.subtitle')}</p>
          </div>

          {error && (
            <div className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-8 text-center">
              <p className="text-[14px] text-(--color-text-muted)">{error}</p>
            </div>
          )}

          {!error && rooms === null && (
            <div className="flex flex-col gap-2" aria-busy="true">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[68px] animate-pulse rounded-(--radius-lg) bg-(--color-surface-alt)" />
              ))}
            </div>
          )}

          {!error && rooms !== null && sorted.length === 0 && (
            <div className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-10 text-center">
              <h2 className="mb-2 text-[16px] font-semibold">{t('list.emptyTitle')}</h2>
              <p className="mb-6 text-[13px] text-(--color-text-muted)">{t('list.emptySubtitle')}</p>
              <ActionButton variant="brandSolid" size="medium" asChild>
                <Link to="/mate/recommendations">{t('list.emptyCta')}</Link>
              </ActionButton>
            </div>
          )}

          {!error && sorted.length > 0 && (
            <ul className="flex flex-col gap-2">
              {sorted.map((room) => (
                <li key={room.chatRoomId}>
                  <RoomCard room={room} myUserId={user?.userId ?? null} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function RoomCard({ room, myUserId }: { room: ChatRoomSummaryOut; myUserId: string | null }) {
  const { t } = useTranslation('chat');
  const others = room.members.filter((m) => m.userId !== myUserId);
  const title =
    room.roomType === '1:1'
      ? others[0]?.nickname ?? t('list.unknownMate')
      : (others.map((m) => m.nickname).join(', ') || t('list.groupFallback'));
  const isEnded = room.status === 'ended';

  return (
    <Link
      to={`/chat/rooms/${room.chatRoomId}`}
      className={`flex items-center gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) px-4 py-3 transition-colors hover:border-(--color-border-hover) hover:bg-(--color-surface-alt) ${
        isEnded ? 'opacity-60' : ''
      }`}
    >
      <Avatar fallback={title.slice(0, 1)} size="42" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[15px] font-semibold text-(--color-text)">{title}</p>
          <span className="shrink-0 rounded-(--radius-sm) bg-(--color-surface-alt) px-1.5 py-0.5 text-[10px] font-semibold text-(--color-text-subtle)">
            {room.roomType === '1:1' ? t('list.oneToOne') : t('list.group')}
          </span>
          {isEnded && (
            <span className="shrink-0 rounded-(--radius-sm) bg-(--color-surface-alt) px-1.5 py-0.5 text-[10px] font-semibold text-(--color-text-subtle)">
              {t('list.ended')}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] text-(--color-text-muted)">
          {t('list.memberCount', { count: room.members.length })}
          {room.myRole === 'owner' ? ` · ${t('list.owner')}` : ''}
        </p>
      </div>
      <span aria-hidden className="text-(--color-text-subtle)">›</span>
    </Link>
  );
}
