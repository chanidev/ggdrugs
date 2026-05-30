// apps/web/src/pages/CreditPage/index.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Header } from '../../layout/Header.js';
import { getMyCredits, type CreditLedgerItem } from '../../lib/api/credits.js';
import { useCurrentUser } from '../../lib/auth-context.js';

// [오버라이드] appointment_complete는 스케줄러 잡에서 생성 (Slice 5 전체 구현)
// [이슈16] 출처: GG-MY-008 + GG-COMM-017
const ACTION_LABELS: Record<string, string> = {
  appointment_complete: '메이트 약속 완료',
  mate_eval_complete:   '메이트 평가 작성',
  review_complete:      '후기 작성',
};

export function CreditPage() {
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
      .catch(() => { setError('불러오기 실패'); setLoading(false); });
  }, [user, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg)">
      <Header />
      <main className="mx-auto w-full max-w-[480px] px-4 py-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-(length:--text-h2) font-semibold">크레딧 내역</h1>
          {balance !== null && (
            <span className="text-[16px] font-bold text-(--color-brand)">{balance.toLocaleString()}개</span>
          )}
        </div>

        {loading && <p className="text-center text-[14px] text-(--color-text-muted)">불러오는 중...</p>}
        {error  && <p className="text-center text-[13px] text-(--color-danger)">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-center text-[14px] text-(--color-text-muted)">크레딧 내역이 없어요.</p>
        )}

        <ul className="flex flex-col divide-y divide-(--color-border)">
          {items.map((item) => (
            <li key={item.ledgerId} className="flex items-center justify-between py-3">
              <div>
                <p className="text-[14px] font-medium">
                  {ACTION_LABELS[item.action] ?? item.action}
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
