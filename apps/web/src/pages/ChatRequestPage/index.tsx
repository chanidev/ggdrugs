import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Header } from '../../layout/Header.js';
import { ActionButton } from 'seed-design/ui/action-button';
import { Avatar } from 'seed-design/ui/avatar';
import { sendMatchRequest1to1 } from '../../lib/api/match.js';
import { getMateIndex } from '../../lib/api/mate.js';

/**
 * ChatRequestPage — 채팅 신청 (와이어 9-3, A_803).
 *
 * 진입: AuthorProfileModal / MateRecommendationsPage 채팅 신청 버튼
 *       → useNavigate('/chat/request?to={userId}&nickname={nickname}')
 *
 * GG-MATCH-011: 신청 후 24h 만료 안내 + 알림에서 확인 링크
 * 7-2 스펙: 상대 닉네임 + 메이트지수 표시
 */
export function ChatRequestPage() {
  const { t } = useTranslation('chat');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const receiverUserId = params.get('to') ?? '';
  const nickname = params.get('nickname') ?? '상대방';

  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  // 메이트지수: null=로딩중, number=지수, 'none'=미등록
  const [mateIndex, setMateIndex] = useState<number | 'none' | null>(null);

  useEffect(() => {
    if (!receiverUserId) return;
    let cancelled = false;
    getMateIndex(receiverUserId)
      .then((result) => {
        if (cancelled) return;
        if (result === null || result.indexValue === null) {
          setMateIndex('none');
        } else {
          setMateIndex(result.indexValue);
        }
      })
      .catch(() => {
        if (!cancelled) setMateIndex('none');
      });
    return () => { cancelled = true; };
  }, [receiverUserId]);

  const mateIndexLabel =
    mateIndex === null ? '…' : mateIndex === 'none' ? '-' : String(mateIndex);

  const handleSend = async () => {
    if (!receiverUserId) {
      setErr(t('request.invalidAccess'));
      return;
    }
    setPending(true);
    setErr(null);
    try {
      const result = await sendMatchRequest1to1(receiverUserId);
      setExpiresAt(result.expiresAt);
      setSent(true);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'UNAUTHENTICATED') setErr(t('request.loginRequired'));
      else if (msg === 'DUPLICATE_PENDING') setErr(t('request.duplicate'));
      else if (msg === 'BLOCKED') setErr(t('request.blocked'));
      else if (msg === 'PROFILE_REQUIRED') setErr(t('request.profileRequired'));
      else setErr(t('request.submitError'));
    } finally {
      setPending(false);
    }
  };

  const formatExpiry = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[480px] px-4 py-10">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-6 inline-flex items-center gap-1.5 text-[14px] text-(--color-text-muted) hover:text-(--color-text)"
          >
            <span aria-hidden>&#8592;</span>
            {t('request.goBack')}
          </button>

          <div className="flex flex-col items-center gap-6 rounded-(--radius-xl) border border-(--color-border) bg-(--color-surface) px-6 py-10 text-center">
            {/* 아바타 + 메이트지수 (7-2 스펙) */}
            <div className="flex flex-col items-center gap-2">
              <Avatar
                fallback={nickname.slice(0, 1)}
                size="64"
                aria-label={`${nickname}의 프로필 아바타`}
              />
              <div className="flex items-center gap-1.5 text-[13px]">
                <span className="text-(--color-text-muted)">{t('request.mateScore')}</span>
                <span
                  className={
                    typeof mateIndex === 'number'
                      ? 'font-semibold text-(--color-text)'
                      : 'text-(--color-text-muted)'
                  }
                  aria-label={`${t('request.mateScore')} ${mateIndexLabel}`}
                >
                  {mateIndexLabel}
                </span>
              </div>
            </div>

            {!sent ? (
              <>
                <div>
                  <h1 className="text-[20px] font-semibold text-(--color-text)">
                    {t('request.toNickname', { nickname })}
                  </h1>
                  <p className="mt-2 text-[14px] text-(--color-text-muted)">
                    {t('request.pendingInfo')}
                  </p>
                  <p
                    className="mt-1 text-[13px] text-(--color-text-subtle)"
                    dangerouslySetInnerHTML={{ __html: t('request.expiryInfo') }}
                  />
                </div>

                {err && (
                  <p role="alert" className="text-[13px] text-(--color-error)">
                    {err}
                  </p>
                )}

                <div className="flex w-full flex-col gap-3">
                  <ActionButton
                    variant="brandSolid"
                    size="large"
                    onClick={() => { void handleSend(); }}
                    loading={pending}
                    disabled={pending}
                    className="w-full"
                  >
                    {t('request.submit')}
                  </ActionButton>
                  <ActionButton
                    variant="neutralOutline"
                    size="large"
                    onClick={() => navigate(-1)}
                    disabled={pending}
                    className="w-full"
                  >
                    {t('request.cancel')}
                  </ActionButton>
                </div>
              </>
            ) : (
              /* 신청 완료 상태 */
              <>
                <div>
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-(--color-accent)/10 text-[28px]">
                    &#10003;
                  </div>
                  <h1 className="text-[20px] font-semibold text-(--color-text)">
                    {t('request.success')}
                  </h1>
                  <p className="mt-2 text-[14px] text-(--color-text-muted)">
                    {t('request.successDetail', { nickname })}
                  </p>
                  {expiresAt && (
                    <p className="mt-1 text-[13px] text-(--color-text-subtle)">
                      {t('request.expiryDetail', { expiry: formatExpiry(expiresAt) })}
                    </p>
                  )}
                </div>

                <div className="flex w-full flex-col gap-3">
                  <ActionButton
                    variant="brandSolid"
                    size="large"
                    asChild
                    className="w-full"
                  >
                    <Link to="/notifications">{t('request.checkNotifications')}</Link>
                  </ActionButton>
                  <ActionButton
                    variant="neutralOutline"
                    size="large"
                    onClick={() => navigate('/community')}
                    className="w-full"
                  >
                    {t('request.backToCommunity')}
                  </ActionButton>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
