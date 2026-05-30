import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { Header } from '../../layout/Header.js';
import { ActionButton } from 'seed-design/ui/action-button';
import { Avatar } from 'seed-design/ui/avatar';
import { sendMatchRequest1to1 } from '../../lib/api/match.js';

/**
 * ChatRequestPage — 채팅 신청 (와이어 9-3, A_803).
 *
 * 진입: AuthorProfileModal / MateRecommendationsPage 채팅 신청 버튼
 *       → useNavigate('/chat/request?to={userId}&nickname={nickname}')
 *
 * GG-MATCH-011: 신청 후 24h 만료 안내 + 알림에서 확인 링크
 */
export function ChatRequestPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const receiverUserId = params.get('to') ?? '';
  const nickname = params.get('nickname') ?? '상대방';

  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const handleSend = async () => {
    if (!receiverUserId) {
      setErr('올바르지 않은 접근입니다.');
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
      if (msg === 'UNAUTHENTICATED') setErr('로그인이 필요해요.');
      else if (msg === 'DUPLICATE_PENDING') setErr('이미 신청 중입니다. 상대방이 수락하기를 기다려주세요.');
      else if (msg === 'BLOCKED') setErr('차단 관계여서 신청할 수 없어요.');
      else if (msg === 'PROFILE_REQUIRED') setErr('메이트 프로필을 먼저 등록해 주세요.');
      else setErr('신청하지 못했어요. 잠시 후 다시 시도해 주세요.');
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
            돌아가기
          </button>

          <div className="flex flex-col items-center gap-6 rounded-(--radius-xl) border border-(--color-border) bg-(--color-surface) px-6 py-10 text-center">
            {/* 아바타 */}
            <Avatar
              fallback={nickname.slice(0, 1)}
              size="64"
              aria-label={`${nickname}의 프로필 아바타`}
            />

            {!sent ? (
              <>
                <div>
                  <h1 className="text-[20px] font-semibold text-(--color-text)">
                    {nickname}님에게 채팅 신청
                  </h1>
                  <p className="mt-2 text-[14px] text-(--color-text-muted)">
                    신청이 수락되면 채팅방이 열려요.
                  </p>
                  <p className="mt-1 text-[13px] text-(--color-text-subtle)">
                    신청은 <strong>24시간</strong> 동안 유효합니다.
                  </p>
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
                    신청 보내기
                  </ActionButton>
                  <ActionButton
                    variant="neutralOutline"
                    size="large"
                    onClick={() => navigate(-1)}
                    disabled={pending}
                    className="w-full"
                  >
                    취소
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
                    신청 완료!
                  </h1>
                  <p className="mt-2 text-[14px] text-(--color-text-muted)">
                    {nickname}님이 수락하면 채팅이 시작돼요.
                  </p>
                  {expiresAt && (
                    <p className="mt-1 text-[13px] text-(--color-text-subtle)">
                      유효 기간: {formatExpiry(expiresAt)}까지
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
                    <Link to="/notifications">알림에서 확인하기</Link>
                  </ActionButton>
                  <ActionButton
                    variant="neutralOutline"
                    size="large"
                    onClick={() => navigate('/community')}
                    className="w-full"
                  >
                    커뮤니티로 돌아가기
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
