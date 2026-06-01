// apps/web/src/pages/CreditPage/index.tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '../../layout/Header.js';
import { getMyCredits, type CreditLedgerItem } from '../../lib/api/credits.js';
import { useCurrentUser } from '../../lib/auth-context.js';
import { loginUrl } from '../../lib/auth-redirect.js';

// [오버라이드] appointment_complete는 스케줄러 잡에서 생성 (Slice 5 전체 구현)
// [이슈16] 출처: GG-MY-008 + GG-COMM-017
const ACTION_KEYS: Record<string, string> = {
  appointment_complete: 'credit.actionLabels.appointment_complete',
  mate_eval_complete:   'credit.actionLabels.mate_eval_complete',
  review_complete:      'credit.actionLabels.review_complete',
};

export function CreditPage() {
  const { t, i18n } = useTranslation('mypage');
  const { user, loading: authLoading } = useCurrentUser();
  const [balance, setBalance] = useState<number | null>(null);
  const [items, setItems] = useState<CreditLedgerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // auth-context: 로딩 중 user=null, loading=true. loading 끝나기 전엔 판단 보류.
    if (authLoading || !user) return;
    setLoading(true);
    getMyCredits()
      .then((r) => { setBalance(r.balance); setItems(r.items); setLoading(false); })
      .catch(() => { setError(t('credit.loadError')); setLoading(false); });
  }, [user, authLoading, t]);

  // 인증 로딩 중 — 헤더만
  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-(--color-bg)">
        <Header />
      </div>
    );
  }

  // 비로그인 — /login(미존재 라우트)으로 보내지 않고 로그인 유도(다른 페이지와 동일 패턴)
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-(--color-bg)">
        <Header />
        <main className="mx-auto w-full max-w-[480px] px-4 py-10 text-center">
          <h1 className="mb-2 text-[20px] font-bold tracking-[-0.015em]">{t('page.loginRequired')}</h1>
          <p className="mb-6 text-[14px] text-(--color-text-muted)">{t('page.loginHint')}</p>
          <a
            href={loginUrl('google', '/credits')}
            className="inline-flex h-10 items-center rounded-(--radius-md) bg-(--color-accent) px-4 text-[14px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
          >
            {t('page.loginButton')}
          </a>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg)">
      <Header />
      <main className="mx-auto w-full max-w-[480px] px-4 py-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-(length:--text-h2) font-semibold">{t('credit.title')}</h1>
          {balance !== null && (
            <span className="text-[16px] font-bold text-(--color-brand)">{t('credit.balance', { count: balance.toLocaleString() })}</span>
          )}
        </div>

        {loading && <p className="text-center text-[14px] text-(--color-text-muted)">{t('credit.loading')}</p>}
        {error  && <p className="text-center text-[13px] text-(--color-danger)">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-center text-[14px] text-(--color-text-muted)">{t('credit.empty')}</p>
        )}

        <ul className="flex flex-col divide-y divide-(--color-border)">
          {items.map((item) => (
            <li key={item.ledgerId} className="flex items-center justify-between py-3">
              <div>
                <p className="text-[14px] font-medium">
                  {ACTION_KEYS[item.action] ? t(ACTION_KEYS[item.action]!) : item.action}
                </p>
                <p className="text-[12px] text-(--color-text-muted)">
                  {/* 와이어 9-1: 날짜 + 시간(HH:MM) 표시. 로케일 인지 (현재 언어 기준). */}
                  {new Date(item.createdAt).toLocaleString(i18n.language, {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <span className="text-[15px] font-bold text-(--color-brand)">
                +{item.pointsAmount}
              </span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
