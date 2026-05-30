import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Header } from '../../layout/Header';
import { ActionButton } from 'seed-design/ui/action-button';
import { Avatar } from 'seed-design/ui/avatar';
import { getRecommendations, type RecommendationsResponse, type RecommendationItem } from '../../lib/api/mate.js';

/**
 * MateRecommendationsPage — A_801 메이트 추천 목록 (GG-COMM-007/008).
 *
 * 상태 분기:
 *   blind  — 프로필 미입력 또는 미동의 (GG-COMM-007/008): 블라인드 + 「메이트 추천 받기」버튼
 *   list   — 추천 카드 목록 (avatar + 닉네임 + 메이트지수)
 *
 * 슬라이스2 경계: blind/list 2상태.
 * 슬라이스3~5 placeholder: 채팅중·약속·사용후 상태는 추후 구현 예정.
 */
export function MateRecommendationsPage() {
  const { t } = useTranslation('mate');
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    getRecommendations()
      .then((r) => {
        if (mounted) {
          setData(r);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setError(t('reco.loadError'));
          setLoading(false);
        }
      });
    return () => { mounted = false; };
  }, [t]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[640px] px-4 py-8">
          <div className="mb-6">
            <h1 className="text-(length:--text-h2) font-semibold">{t('reco.title')}</h1>
            <p className="mt-1 text-[13px] text-(--color-text-muted)">
              {t('reco.subtitle')}
            </p>
          </div>

          {loading && <LoadingSkeleton ariaLabel={t('reco.loadingAriaLabel')} />}

          {!loading && error && (
            <div className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-8 text-center">
              <p className="text-[14px] text-(--color-text-muted)">{error}</p>
              <ActionButton
                variant="neutralOutline"
                size="small"
                onClick={() => window.location.reload()}
                className="mt-4"
              >
                {t('reco.retry')}
              </ActionButton>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {data.state === 'blind' && <BlindState />}
              {data.state === 'list' && <RecoList items={data.items} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 블라인드 상태 (GG-COMM-007/008) ──

function BlindState() {
  const { t } = useTranslation('mate');
  return (
    <div className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-10 text-center">
      {/* 블라인드 placeholder 카드 3장 */}
      <div className="mb-6 flex justify-center gap-3 opacity-30" aria-hidden>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex h-[88px] w-[68px] flex-col items-center justify-center gap-2 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface)"
          >
            <div className="h-9 w-9 rounded-full bg-(--color-surface-alt)" />
            <div className="h-2 w-10 rounded-full bg-(--color-surface-alt)" />
          </div>
        ))}
      </div>
      <h2 className="mb-2 text-[17px] font-semibold">
        {t('reco.blindTitle')}
      </h2>
      <p className="mb-6 text-[13px] text-(--color-text-muted)">
        {t('reco.blindSubtitle')}
      </p>
      <ActionButton variant="brandSolid" size="medium" asChild>
        <Link to="/mate/form">{t('reco.blindCta')}</Link>
      </ActionButton>
    </div>
  );
}

// ── 추천 카드 목록 ──

function RecoList({ items }: { items: RecommendationItem[] }) {
  const { t } = useTranslation('mate');
  if (items.length === 0) {
    return (
      <div className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-10 text-center">
        <p className="text-[14px] text-(--color-text-muted)">
          {t('reco.noMatch')}
        </p>
        <p className="mt-1 text-[13px] text-(--color-text-muted)">
          {t('reco.noMatchSub')}
        </p>
        <ActionButton variant="neutralOutline" size="small" asChild className="mt-4">
          <Link to="/mate/form">{t('reco.adjustConditions')}</Link>
        </ActionButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 슬라이스3~5 placeholder 주석: 채팅중/약속완료/사용후 상태 카드는 슬라이스3~5에서 구현. */}
      {items.map((item) => (
        <RecoCard key={item.userId} item={item} />
      ))}
    </div>
  );
}

function RecoCard({ item }: { item: RecommendationItem }) {
  const { t } = useTranslation('mate');
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-4 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) px-4 py-3">
      {/* 아바타 */}
      <Avatar
        fallback={item.nickname.slice(0, 1)}
        size="42"
        aria-hidden
      />
      {/* 닉네임 + 메이트지수 */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-[15px] font-semibold text-(--color-text)">
          {item.nickname}
        </p>
        <p className="text-[12px] text-(--color-text-muted)">
          {t('reco.mateScore')}{' '}
          <span className="font-semibold text-(--color-accent)">{item.mateIndex}</span>
        </p>
      </div>
      {/* 채팅 신청 — 슬라이스3 실구현 (GG-POST-008) */}
      <ActionButton
        variant="neutralOutline"
        size="small"
        onClick={() => {
          void navigate(
            `/chat/request?to=${encodeURIComponent(item.userId)}&nickname=${encodeURIComponent(item.nickname)}`,
          );
        }}
        aria-label={t('reco.chatRequestAriaLabel', { nickname: item.nickname })}
      >
        {t('reco.chatRequest')}
      </ActionButton>
    </div>
  );
}

// ── 로딩 스켈레톤 ──

function LoadingSkeleton({ ariaLabel }: { ariaLabel: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={ariaLabel}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) px-4 py-3"
        >
          <div className="h-10 w-10 rounded-full bg-(--color-surface-alt) animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-(--color-surface-alt) animate-pulse" />
            <div className="h-2 w-16 rounded bg-(--color-surface-alt) animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
