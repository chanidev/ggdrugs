import { BFF_URL, withCredentials } from './client.js';
import type { EventPhase } from './events.js';
import type { UploaderApprovalStatus } from './uploader.js';

// =============================================================
// Admin — A_700 vibe 라벨 부여 + 이벤트 승인
// =============================================================

export interface AdminEventItem {
  eventId: string;
  title: string;
  phase: EventPhase;
  approvalStatus: string;
  startDate: string;
  endDate: string;
  posterImageUrl: string | null;
  aiSummary: string | null;
  category: { code: string; name: string };
  region: { regionId: string; sido: string; sigungu: string | null };
  vibes: { vibeId: string; name: string; group: string }[];
}

export interface AdminEventsQuery {
  hasVibes?: 'true' | 'false' | 'any';
  approvalStatus?: string;
  sourceType?: 'uploaded' | 'crawled';
  phase?: EventPhase[];
  regionIds?: string[];
  q?: string;
  page?: number;
  limit?: number;
}

export interface AdminEventsResponse {
  page: number;
  limit: number;
  total: number;
  items: AdminEventItem[];
}

export async function fetchAdminEvents(
  query: AdminEventsQuery = {},
  signal?: AbortSignal,
): Promise<AdminEventsResponse> {
  const sp = new URLSearchParams();
  if (query.hasVibes) sp.set('hasVibes', query.hasVibes);
  if (query.approvalStatus) sp.set('approvalStatus', query.approvalStatus);
  if (query.sourceType) sp.set('sourceType', query.sourceType);
  if (query.phase?.length) sp.set('phase', query.phase.join(','));
  if (query.regionIds?.length) sp.set('regionIds', query.regionIds.join(','));
  if (query.q) sp.set('q', query.q);
  if (query.page) sp.set('page', String(query.page));
  if (query.limit) sp.set('limit', String(query.limit));
  const qs = sp.toString();
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/admin/events${qs ? `?${qs}` : ''}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`GET /admin/events ${res.status}`);
  return (await res.json()) as AdminEventsResponse;
}

export async function putAdminEventVibes(
  eventId: string,
  vibeIds: string[],
): Promise<{ eventId: string; vibes: { vibeId: string; name: string; group: string }[] }> {
  const res = await fetch(
    `${BFF_URL}/admin/events/${encodeURIComponent(eventId)}/vibes`,
    withCredentials({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vibeIds }),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PUT /admin/events/${eventId}/vibes ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as {
    eventId: string;
    vibes: { vibeId: string; name: string; group: string }[];
  };
}

export async function decideAdminEvent(
  eventId: string,
  action: 'approved' | 'revision_requested' | 'rejected',
  reason?: string,
): Promise<{ eventId: string; approvalStatus: UploaderApprovalStatus; reason: string | null }> {
  const res = await fetch(
    `${BFF_URL}/admin/events/${encodeURIComponent(eventId)}/decision`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      `POST /admin/events/${eventId}/decision ${res.status}: ${txt.slice(0, 200)}`,
    );
  }
  return (await res.json()) as {
    eventId: string;
    approvalStatus: UploaderApprovalStatus;
    reason: string | null;
  };
}
