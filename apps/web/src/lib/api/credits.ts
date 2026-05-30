// apps/web/src/lib/api/credits.ts
import { BFF_URL, withCredentials } from './client.js';

export interface CreditLedgerItem {
  ledgerId: string;         // BigInt 직렬화
  action: string;
  pointsAmount: number;
  appointmentId: string | null;
  createdAt: string;
}

/**
 * [이슈21] balance = SUM(pointsAmount). 행 없으면 0.
 * [오버라이드] appointment_complete 항목은 스케줄러 잡(notifyMateEval)에서 생성.
 */
export interface CreditsResponse {
  balance: number;
  page: number;
  limit: number;
  items: CreditLedgerItem[];
}

/** GET /me/credits?page=&limit= */
export async function getMyCredits(page = 1, limit = 20): Promise<CreditsResponse> {
  const res = await fetch(
    `${BFF_URL}/me/credits?page=${page}&limit=${limit}`,
    withCredentials(),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /me/credits ${res.status}`);
  return (await res.json()) as CreditsResponse;
}
