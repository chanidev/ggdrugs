import { useEffect, useState } from 'react';
import { Link } from 'react-router';
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
          setError('추천 목록을 불러오지 못했어요.');
          setLoading(false);
        }
      });
    return () => { mounted = false; };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[640px] px-4 py-8">
          <div className="mb-6">
            <h1 className="text-(length:--text-h2) font-semibold">메이트 추천</h1>
            <p className="mt-1 text-[13px] text-(--color-text-muted)">
              매칭 조건에 맞는 메이트를 추천해 드려요.
            </p>
          </div>

          {loading && <LoadingSkeleton />}

          {!loading && error && (
            <div className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-8 text-center">
              <p className="text-[14px] text-(--color-text-muted)">{error}</p>
              <ActionButton
                variant="neutralOutline"
                size="small"
                onClick={() => window.location.reload()}
                className="mt-4"
              >
                다시 시도
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
        메이트 정보를 입력하면 추천 목록이 보여요
      </h2>
      <p className="mb-6 text-[13px] text-(--color-text-muted)">
        나의 정보와 선호 조건을 입력하고 어울리는 메이트를 찾아보세요.
      </p>
      <ActionButton variant="brandSolid" size="medium" asChild>
        <Link to="/mate/form">메이트 추천 받기</Link>
      </ActionButton>
    </div>
  );
}

// ── 추천 카드 목록 ──

function RecoList({ items }: { items: RecommendationItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-10 text-center">
        <p className="text-[14px] text-(--color-text-muted)">
          현재 매칭 가능한 메이트가 없어요.
        </p>
        <p className="mt-1 text-[13px] text-(--color-text-muted)">
          조건이나 지역을 조정해 보세요.
        </p>
        <ActionButton variant="neutralOutline" size="small" asChild className="mt-4">
          <Link to="/mate/form">조건 수정하기</Link>
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
          메이트지수{' '}
          <span className="font-semibold text-(--color-accent)">{item.mateIndex}</span>
        </p>
      </div>
      {/* 채팅 신청 — 슬라이스3 placeholder */}
      <ActionButton
        variant="neutralOutline"
        size="small"
        disabled
        title="채팅 신청 — 슬라이스3에서 구현 예정"
        aria-label={`${item.nickname}에게 채팅 신청 (준비 중)`}
      >
        채팅 신청
      </ActionButton>
    </div>
  );
}

// ── 로딩 스켈레톤 ──

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="추천 목록 로딩 중">
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
