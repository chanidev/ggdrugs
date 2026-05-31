// apps/web/src/lib/api/evaluation.ts
import { BFF_URL, withCredentials } from './client.js';

export interface EvalSubmitBody {
  evaluatedUserId: string;
  ratingStars: number;    // 1~5
  q1: number; q2: number; q3: number; q4: number; // 1~5
  comment?: string;       // ≤30 UTF-8 byte
  reportedFor?: string | null;
  // A_901
  atmosphere: number; program: number; food: number; safety: number; transport: number;
  reviewRating: number;
  reviewBody: string;     // ≤5000 chars
  photoUrls?: string[];   // S3 publicUrl 목록 (클라이언트가 /reviews/photos/upload-url 별도 호출)
}

export interface EvalResult {
  evalId: string;
}

export interface MyEvaluationResult {
  evalId: string;
  evaluatedUserId: string;
  ratingStars: number;
  createdAt: string;
}

/** POST /community/appointments/:appointmentId/evaluate */
export async function submitEvaluation(appointmentId: string, body: EvalSubmitBody): Promise<EvalResult> {
  const res = await fetch(
    `${BFF_URL}/community/appointments/${encodeURIComponent(appointmentId)}/evaluate`,
    withCredentials({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 409) {
    // 409 응답 body를 읽어 에러 종류를 3종 구분한다:
    //   'appointment_not_confirmed' → 'NOT_CONFIRMED'
    //   'not_attended_yet'         → 'NOT_ATTENDED_YET'
    //   'already_submitted'        → 'ALREADY_SUBMITTED' (default)
    const resBody = await res.json().catch(() => ({})) as { error?: string };
    if (resBody.error === 'appointment_not_confirmed') throw new Error('NOT_CONFIRMED');
    if (resBody.error === 'not_attended_yet') throw new Error('NOT_ATTENDED_YET');
    throw new Error('ALREADY_SUBMITTED');
  }
  if (res.status === 400) throw new Error(`VALIDATION: ${await res.text().catch(() => '')}`);
  if (!res.ok) throw new Error(`POST evaluate ${res.status}`);
  return (await res.json()) as EvalResult;
}

/**
 * GET /community/appointments/:appointmentId/evaluation
 * [이슈9] 마운트 시 호출 — null이면 미제출, non-null이면 이미 제출.
 */
export async function getMyEvaluation(appointmentId: string): Promise<MyEvaluationResult | null> {
  const res = await fetch(
    `${BFF_URL}/community/appointments/${encodeURIComponent(appointmentId)}/evaluation`,
    withCredentials(),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`GET evaluation ${res.status}`);
  return (await res.json()) as MyEvaluationResult;
}
