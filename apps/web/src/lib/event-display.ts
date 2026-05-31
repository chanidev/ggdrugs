import type { BffEventItem } from './api';
import type { MockEvent } from '../data/mock';
import { TYPES } from '../data/mock';

/**
 * EventList 렌더용 정규화된 형상. BFF 응답과 프론트 mock 데이터 모두 이쪽으로 변환.
 */
export interface DisplayEvent {
  id: string;
  category: string; // category_code
  categoryLabel: string;
  title: string;
  region: string;
  dateRange: string;
  vibes: string[];
  phase: 'upcoming' | 'ongoing' | 'ended';
  posterImageUrl: string | null;
  posterFallbackColor: string;
  /** v4.5 — sort=distance 일 때만 채워짐. 사람이 읽는 라벨 ("850m" / "2.3km"). */
  distanceLabel?: string;
}

/** id 기반 해시 색상 — 포스터 이미지 없을 때 placeholder 배경. DESIGN 토큰 팔레트에서 선택. */
const FALLBACK_PALETTE = ['#E8562D', '#1A1A1A', '#3A6EA5', '#2C8A4A', '#D79B00', '#8C3318'];

function hashToColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length]!;
}

function formatDateRange(startIso: string, endIso: string): string {
  const fmt = (s: string) => s.replaceAll('-', '.'); // YYYY-MM-DD → YYYY.MM.DD
  if (startIso === endIso) return fmt(startIso);
  // 동일 월이면 end 는 MM.DD 만
  const [sy, sm] = startIso.split('-');
  const [ey, em, ed] = endIso.split('-');
  if (sy === ey && sm === em) {
    return `${fmt(startIso)} — ${em}.${ed}`;
  }
  return `${fmt(startIso)} — ${fmt(endIso)}`;
}

function shortRegion(sido: string, sigungu: string | null): string {
  return sigungu ? `${sido} ${sigungu}` : sido;
}

/**
 * v4.5 — 거리 라벨. < 1000m → "%dm" (정수), >= 1000m → "%.1fkm" (소수 1자리).
 * undefined 입력은 undefined 반환 — 카드 렌더에서 미표시.
 */
function formatDistance(meters: number | undefined): string | undefined {
  if (meters === undefined || !Number.isFinite(meters)) return undefined;
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function fromBffItem(item: BffEventItem): DisplayEvent {
  const distanceLabel = formatDistance(item.distanceMeters);
  return {
    id: item.eventId,
    category: item.category.code,
    categoryLabel: item.category.name,
    title: item.title,
    region: shortRegion(item.region.sidoName, item.region.sigunguName),
    dateRange: formatDateRange(item.startDate, item.endDate),
    vibes: item.vibes.map((v) => v.name),
    phase: item.phase,
    posterImageUrl: item.posterImageUrl,
    posterFallbackColor: hashToColor(item.eventId),
    ...(distanceLabel ? { distanceLabel } : {}),
  };
}

/**
 * @dev-only mock 변환 — 실사용 경로에서는 호출되지 않음. categoryLabel은 한국어 고정.
 * 실사용 시 fromBffItem을 사용할 것.
 */
export function fromMockEvent(m: MockEvent): DisplayEvent {
  const typeLabel = TYPES.find((t) => t.k === m.category)?.l ?? m.category;
  return {
    id: String(m.id),
    category: m.category,
    categoryLabel: typeLabel,
    title: m.title,
    region: m.region,
    dateRange: m.dateRange,
    vibes: m.vibes,
    phase: m.phase,
    posterImageUrl: null,
    posterFallbackColor: m.poster, // mock 은 이미 hex
  };
}
