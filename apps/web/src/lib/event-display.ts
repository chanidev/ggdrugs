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

export function fromBffItem(item: BffEventItem): DisplayEvent {
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
  };
}

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
