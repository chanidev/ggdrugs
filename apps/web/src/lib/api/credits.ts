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
 * action 종류:
 *   mate_eval_complete   — 메이트 평가 제출 시 +10 (Slice 5 구현)
 *   review_complete      — 후기 최초 제출 시 +10 (Slice 5 구현)
 *   appointment_complete — 스케줄러 잡(notifyMateEval) +10 (Slice 5 구현)
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
