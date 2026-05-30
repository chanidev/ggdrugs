import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Header } from '../../layout/Header';
import { ActionButton } from 'seed-design/ui/action-button';
import { Avatar } from 'seed-design/ui/avatar';
import { useCurrentUser } from '../../lib/auth-context';
import { getMyMateProfileWithIndex } from '../../lib/api/mate.js';
import { updateMyProfile } from '../../lib/api/me.js';

/**
 * ProfilePage — A_807 프로필.
 *
 * GG-MY-007: 마이페이지 → 프로필 보기 (닉네임/사진/메이트지수)
 * GG-PROFILE-005: 메이트지수 표시 (수정 불가)
 *
 * 닉네임 수정 가능 (PATCH /me/profile).
 * 사진: 슬라이스 미정의 → placeholder.
 */
export function ProfilePage() {
  const { t } = useTranslation('mypage');
  const { user, refresh } = useCurrentUser();
  const navigate = useNavigate();

  const [mateIndex, setMateIndex] = useState<number | null>(null);
  const [mateLoading, setMateLoading] = useState(true);

  const [editingNickname, setEditingNickname] = useState(false);
  const [nickname, setNickname] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);

  // 로그인 미완료 처리
  useEffect(() => {
    if (!user) return;
    setNickname(user.nickname);
  }, [user]);

  // 메이트지수 조회
  useEffect(() => {
    let mounted = true;
    setMateLoading(true);
    getMyMateProfileWithIndex()
      .then((p) => {
        if (mounted) {
          setMateIndex(p ? p.mateIndex : null);
          setMateLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setMateIndex(null);
          setMateLoading(false);
        }
      });
    return () => { mounted = false; };
  }, []);

  const saveNickname = async () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setNicknameError('닉네임을 입력해 주세요.');
      return;
    }
    if (trimmed.length > 30) {
      setNicknameError('닉네임은 30자 이하로 입력해 주세요.');
      return;
    }
    setSavingNickname(true);
    setNicknameError(null);
    try {
      await updateMyProfile({ nickname: trimmed });
      await refresh();
      setEditingNickname(false);
    } catch {
      setNicknameError(t('profile.saveError'));
    } finally {
      setSavingNickname(false);
    }
  };

  if (!user) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[14px] text-(--color-text-muted)">로그인이 필요해요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[480px] px-4 py-8">
          {/* 뒤로가기 */}
          <button
            type="button"
            onClick={() => void navigate('/me')}
            className="mb-6 flex items-center gap-1.5 text-[13px] text-(--color-text-muted) hover:text-(--color-text)"
          >
            ← 마이페이지
          </button>

          <h1 className="mb-8 text-(length:--text-h2) font-semibold">{t('profile.title')}</h1>

          {/* 아바타 (사진 미지원 — 슬라이스 미정의) */}
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <Avatar
                fallback={user.nickname.slice(0, 1)}
                size="96"
                aria-label="프로필 사진"
              />
              {/* 사진 변경 placeholder — 슬라이스 미정의 */}
              <div
                className="absolute inset-0 flex cursor-not-allowed items-end justify-center rounded-full"
                title="사진 변경 — 추후 지원 예정"
                aria-label="사진 변경 준비 중"
              />
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {/* 닉네임 */}
            <section
              aria-labelledby="nickname-label"
              className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4"
            >
              <div className="mb-1 flex items-center justify-between">
                <label
                  id="nickname-label"
                  htmlFor="profile-nickname-input"
                  className="text-[12px] font-semibold uppercase tracking-[0.06em] text-(--color-text-subtle)"
                >
                  {t('profile.nickname')}
                </label>
                {!editingNickname && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNickname(true);
                      setNickname(user.nickname);
                      setNicknameError(null);
                    }}
                    className="text-[12px] text-(--color-accent) hover:underline"
                  >
                    수정
                  </button>
                )}
              </div>

              {editingNickname ? (
                <div className="flex flex-col gap-2">
                  <input
                    id="profile-nickname-input"
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={30}
                    disabled={savingNickname}
                    className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[14px] text-(--color-text) focus:border-(--color-accent) focus:outline-none disabled:opacity-50"
                    aria-describedby={nicknameError ? 'nickname-error' : undefined}
                  />
                  {nicknameError && (
                    <p id="nickname-error" role="alert" className="text-[12px] text-(--color-error)">
                      {nicknameError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <ActionButton
                      variant="neutralOutline"
                      size="small"
                      onClick={() => {
                        setEditingNickname(false);
                        setNicknameError(null);
                      }}
                      disabled={savingNickname}
                    >
                      취소
                    </ActionButton>
                    <ActionButton
                      variant="brandSolid"
                      size="small"
                      onClick={() => { void saveNickname(); }}
                      loading={savingNickname}
                      disabled={savingNickname}
                    >
                      {t('profile.save')}
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <p className="text-[16px] font-medium text-(--color-text)">{user.nickname}</p>
              )}
            </section>

            {/* 메이트지수 (GG-PROFILE-005) — 수정 불가 */}
            <section
              aria-labelledby="mate-index-label"
              className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4"
            >
              <p
                id="mate-index-label"
                className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-(--color-text-subtle)"
              >
                메이트지수
              </p>
              {mateLoading ? (
                <div className="h-7 w-12 animate-pulse rounded bg-(--color-surface-alt)" />
              ) : mateIndex !== null ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-[28px] font-bold text-(--color-accent)">{mateIndex}</span>
                  <span className="text-[13px] text-(--color-text-muted)">/ 100</span>
                </div>
              ) : (
                <p className="text-[14px] text-(--color-text-muted)">
                  메이트 매칭 정보를 입력하면 지수가 생성돼요.
                </p>
              )}
              {/* 수정 불가 안내 (GG-PROFILE-005) */}
              <p className="mt-1 text-[12px] text-(--color-text-subtle)">
                메이트지수는 활동 이력에 따라 자동으로 변경돼요.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
