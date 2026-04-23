import { useEffect, useState } from 'react';
import { createBookmark, deleteBookmark } from '../lib/api';
import { useCurrentUser } from '../lib/auth-context';
import { redirectToLogin } from '../lib/auth-redirect';
import { Icon } from './Icon';

/**
 * BookmarkButton — 이벤트 북마크 토글 (A_302).
 *
 * - 비로그인: 비활성, 클릭 시 /api/auth/google 리다이렉트 (로그인 권유).
 * - 로그인: 현재 상태에 따라 아이콘 fill 토글 + 낙관적 업데이트.
 *
 * 서버 실패 시 상태 롤백.
 */
export function BookmarkButton({
  eventId,
  initialBookmarked,
  variant = 'default',
  onChange,
}: {
  eventId: string;
  /** 서버에서 받은 초기 상태. null = 비로그인 시점에 렌더됨. */
  initialBookmarked: boolean | null;
  /** 레이아웃: default = border pill, compact = 아이콘 only */
  variant?: 'default' | 'compact';
  /** 토글 성공 시 부모에 변화 전달 (옵션). */
  onChange?: (next: boolean) => void;
}) {
  const { user } = useCurrentUser();
  const [bookmarked, setBookmarked] = useState<boolean>(Boolean(initialBookmarked));
  const [pending, setPending] = useState(false);

  // prop 바뀌면 로컬 상태도 따라감 (다른 이벤트 선택 시).
  useEffect(() => {
    setBookmarked(Boolean(initialBookmarked));
  }, [initialBookmarked, eventId]);

  const loggedIn = !!user;

  const toggle = async () => {
    if (!loggedIn) {
      // A_100 자동 복귀 — 현재 path 보존 (예: /events/123 → 인증 후 다시 돌아옴).
      redirectToLogin('google');
      return;
    }
    const next = !bookmarked;
    setBookmarked(next); // 낙관적
    setPending(true);
    try {
      if (next) await createBookmark(eventId);
      else await deleteBookmark(eventId);
      onChange?.(next);
    } catch (err) {
      // 롤백
      setBookmarked(!next);
      if ((err as Error).message === 'UNAUTHENTICATED') {
        redirectToLogin('google');
      }
    } finally {
      setPending(false);
    }
  };

  const active = bookmarked;
  const label = loggedIn ? (active ? '북마크됨' : '북마크') : '로그인 후 북마크';

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={pending}
        aria-pressed={active}
        aria-label={label}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-(--radius-md) border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          active
            ? 'border-(--color-accent) bg-(--color-accent-bg) text-(--color-accent)'
            : 'border-(--color-border) bg-(--color-surface) text-(--color-text-muted) hover:border-(--color-border-hover) hover:text-(--color-text)'
        }`}
      >
        <Icon name="bookmark" size={16} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={pending}
      aria-pressed={active}
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-(--radius-md) border px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? 'border-(--color-accent) bg-(--color-accent-bg) text-(--color-accent)'
          : 'border-(--color-border) bg-(--color-surface) text-(--color-text) hover:border-(--color-border-hover)'
      }`}
    >
      <Icon name="bookmark" size={14} />
      {label}
    </button>
  );
}
