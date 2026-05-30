// apps/web/src/pages/CreditPage/index.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Header } from '../../layout/Header.js';
import { getMyCredits, type CreditLedgerItem } from '../../lib/api/credits.js';
import { useCurrentUser } from '../../lib/auth-context.js';

// [오버라이드] appointment_complete는 스케줄러 잡에서 생성 (Slice 5 전체 구현)
// [이슈16] 출처: GG-MY-008 + GG-COMM-017
const ACTION_KEYS: Record<string, string> = {
  appointment_complete: 'credit.actionLabels.appointment_complete',
  mate_eval_complete:   'credit.actionLabels.mate_eval_complete',
  review_complete:      'credit.actionLabels.review_complete',
};

export function CreditPage() {
  const { t } = useTranslation('mypage');
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number | null>(null);
  const [items, setItems] = useState<CreditLedgerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user === null) { void navigate('/login'); return; }
    if (user === undefined) return;
    setLoading(true);
    getMyCredits()
      .then((r) => { setBalance(r.balance); setItems(r.items); setLoading(false); })
      .catch(() => { setError(t('credit.loadError')); setLoading(false); });
  }, [user, navigate]);

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
                  {new Date(item.createdAt).toLocaleDateString('ko-KR')}
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
