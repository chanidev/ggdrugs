import { BFF_URL, withCredentials } from './client.js';

export type EventPhase = 'upcoming' | 'ongoing' | 'ended';

export interface BffEventItem {
  eventId: string;
  title: string;
  category: { code: string; name: string };
  region: {
    regionId: string;
    sidoName: string;
    sigunguName: string | null;
    dongName: string | null;
    fullAddress: string;
  };
  startDate: string; // YYYY-MM-DD
  endDate: string;
  phase: EventPhase;
  latitude: number | null;
  longitude: number | null;
  posterImageUrl: string | null;
  bookmarkCount: number;
  avgRating: number;
  reviewCount: number;
  vibes: { vibeId: string; name: string; group: string }[];
}

export interface EventListResponse {
  page: number;
  limit: number;
  total: number;
  items: BffEventItem[];
}

export interface EventListQuery {
  regionIds?: string[];
  period?: '3m' | '6m' | 'all' | 'custom';
  periodStart?: string;
  periodEnd?: string;
  companions?: string[];
  eventTypes?: string[];
  vibeIds?: string[];
  phases?: EventPhase[];
  page?: number;
  limit?: number;
  /** v4.3 stage 3 — PostGIS bbox 필터: "minLng,minLat,maxLng,maxLat". BFF 가 ST_Within 적용. */
  bbox?: string;
}

function buildQuery(q: EventListQuery): string {
  const sp = new URLSearchParams();
  if (q.regionIds?.length) sp.set('regionIds', q.regionIds.join(','));
  if (q.period) sp.set('period', q.period);
  if (q.periodStart) sp.set('periodStart', q.periodStart);
  if (q.periodEnd) sp.set('periodEnd', q.periodEnd);
  if (q.companions?.length) sp.set('companions', q.companions.join(','));
  if (q.eventTypes?.length) sp.set('eventTypes', q.eventTypes.join(','));
  if (q.vibeIds?.length) sp.set('vibeIds', q.vibeIds.join(','));
  if (q.phases?.length) sp.set('phases', q.phases.join(','));
  if (q.page) sp.set('page', String(q.page));
  if (q.limit) sp.set('limit', String(q.limit));
  if (q.bbox) sp.set('bbox', q.bbox);
  return sp.toString();
}

export async function fetchEvents(
  query: EventListQuery,
  signal?: AbortSignal,
): Promise<EventListResponse> {
  const qs = buildQuery(query);
  const url = `${BFF_URL}/events${qs ? `?${qs}` : ''}`;
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET /events ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as EventListResponse;
}

export interface EventsStatsResponse {
  total: number;
  categories: { code: string; label: string; count: number }[];
  phases: Record<EventPhase, number>;
}

export async function fetchEventsStats(signal?: AbortSignal): Promise<EventsStatsResponse> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/events/stats`, init);
  if (!res.ok) throw new Error(`GET /events/stats ${res.status}`);
  return (await res.json()) as EventsStatsResponse;
}

export interface RegionItem {
  regionId: string;
  sido: string;
  sigungu: string | null;
  fullAddress: string;
}

export async function fetchRegions(signal?: AbortSignal): Promise<RegionItem[]> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/regions`, init);
  if (!res.ok) throw new Error(`GET /regions ${res.status}`);
  const data = (await res.json()) as { items: RegionItem[] };
  return data.items;
}

export interface VibeItem {
  vibeId: string;
  name: string;
  group: string; // mood | activity | theme
}

export async function fetchVibes(signal?: AbortSignal): Promise<VibeItem[]> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/vibes`, init);
  if (!res.ok) throw new Error(`GET /vibes ${res.status}`);
  const data = (await res.json()) as { items: VibeItem[] };
  return data.items;
}

export interface BffEventDetail extends BffEventItem {
  description: string | null;
  /** gpt-4o-mini 가 생성한 2~3문장 한국어 요약. description/title/category/vibes 기반. */
  aiSummary: string | null;
  addressDetail: string | null;
  operatingHours: string | null;
  targetAudience: string | null;
  admissionFee: string | null;
  /** 매핑된 관련 기사 수 (A_400 상세 섹션에서 실제 list 조회). */
  articleCount: number;
  source: { type: string; crawlOrigin: string; externalId: string };
  createdAt: string;
  updatedAt: string;
  /** null = 비로그인. true/false = 로그인 상태의 현재 북마크 여부. */
  isBookmarked: boolean | null;
}

export async function fetchEventDetail(id: string, signal?: AbortSignal): Promise<BffEventDetail> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/events/${encodeURIComponent(id)}`, init);
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`GET /events/${id} ${res.status}`);
  return (await res.json()) as BffEventDetail;
}
