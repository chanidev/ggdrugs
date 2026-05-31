import { BFF_URL, withCredentials } from './client.js';

// =============================================================
// GG-MY-002 캘린더용 약속 조회
// =============================================================

export interface MyAppointmentItem {
  appointmentId: string;
  chatRoomId: string;
  eventId: string | null;
  eventName: string | null;
  appointedAt: string | null;
  status: string;
  event: {
    eventId: string;
    title: string;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    region: string | null;
    /** BFF 노출명은 price지만 DB 원본은 admissionFee(String). string | null. */
    price: string | null;
    operatingHours: string | null;
    targetAudience: string | null;
  } | null;
}

export interface MyAppointmentsResponse {
  items: MyAppointmentItem[];
}

export async function fetchMyAppointments(
  opts: { from?: string; to?: string } = {},
  signal?: AbortSignal,
): Promise<MyAppointmentsResponse> {
  const sp = new URLSearchParams();
  if (opts.from) sp.set('from', opts.from);
  if (opts.to) sp.set('to', opts.to);
  const qs = sp.toString();
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/appointments${qs ? `?${qs}` : ''}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /me/appointments ${res.status}`);
  return (await res.json()) as MyAppointmentsResponse;
}
