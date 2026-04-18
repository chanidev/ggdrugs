/**
 * Mock data — 프론트 전용 placeholder. /events API 연결되면 제거.
 * 값 출처: reference/ui_kit_web.html (handoff 시안). 포스터 색/dateRange 등은 카드 스타일만 검증용.
 */

export type FilterKey = { k: string; l: string };

export const REGIONS: FilterKey[] = [
  { k: 'jongno', l: '종로' },
  { k: 'gangnam', l: '강남' },
  { k: 'mapo', l: '마포' },
  { k: 'yongsan', l: '용산' },
  { k: 'seongbuk', l: '성북' },
  { k: 'guanak', l: '관악' },
];

export const PERIODS: FilterKey[] = [
  { k: 'today', l: '오늘' },
  { k: 'weekend', l: '이번 주말' },
  { k: 'week', l: '이번 주' },
  { k: 'month', l: '이번 달' },
];

// BFF enum: solo|couple|friend|family  (ADR 0001 #4 expected_companion enum)
// 'biz' 는 BFF enum 에 없어 드롭. 필요 시 요구사항 개정 후 enum 추가.
export const COMPANIONS: FilterKey[] = [
  { k: 'solo', l: '혼자' },
  { k: 'couple', l: '연인' },
  { k: 'family', l: '가족' },
  { k: 'friend', l: '친구' },
];

export const TYPES: FilterKey[] = [
  { k: 'festival', l: '축제' },
  { k: 'expo', l: '박람회' },
  { k: 'symposium', l: '심포지움' },
  { k: 'conference', l: '컨퍼런스' },
];

export const VIBES: FilterKey[] = [
  { k: 'edu', l: '교육형' },
  { k: 'exp', l: '체험형' },
  { k: 'net', l: '네트워킹' },
  { k: 'act', l: '활동적' },
  { k: 'quiet', l: '조용한' },
];

export const CATEGORIES = [
  { key: 'all', label: '전체', count: 42 },
  { key: 'festival', label: '축제', count: 18 },
  { key: 'expo', label: '박람회', count: 11 },
  { key: 'symposium', label: '심포지움', count: 7 },
  { key: 'conference', label: '컨퍼런스', count: 6 },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]['key'];

export type Phase = 'upcoming' | 'ongoing' | 'ended';

export interface MockEvent {
  id: number;
  category: string;
  poster: string;
  title: string;
  region: string;
  dateRange: string;
  vibes: string[];
  phase: Phase;
}

export const DUMMY_EVENTS: MockEvent[] = [
  { id: 1, category: 'festival',   poster: '#E8562D', title: '서울 빛초롱 축제 2026', region: '종로구 청계천로',      dateRange: '2026.05.03 — 05.18', vibes: ['체험형', '가족', '야간'], phase: 'upcoming' },
  { id: 2, category: 'expo',       poster: '#1A1A1A', title: '코리아 콘텐츠 박람회',   region: '강남구 코엑스 D홀',     dateRange: '2026.05.12 — 05.14', vibes: ['네트워킹', '업무'],        phase: 'ongoing' },
  { id: 3, category: 'symposium',  poster: '#3A6EA5', title: 'AI 윤리 심포지움',        region: '관악구 서울대 호암관',  dateRange: '2026.04.20',          vibes: ['교육형'],                  phase: 'ended' },
  { id: 4, category: 'conference', poster: '#2C8A4A', title: 'Seoul Frontend Conference', region: '영등포구 더 케이 호텔', dateRange: '2026.06.08 — 06.09', vibes: ['네트워킹', '교육형'],      phase: 'upcoming' },
  { id: 5, category: 'festival',   poster: '#D79B00', title: '한강 달빛 야시장',        region: '용산구 반포한강공원',   dateRange: '2026.05.17 — 09.28', vibes: ['활동적', '체험형'],        phase: 'upcoming' },
  { id: 6, category: 'expo',       poster: '#8C3318', title: '서울 디자인 페스티벌',   region: '마포구 문화비축기지',   dateRange: '2026.05.25 — 05.28', vibes: ['교육형', '체험형'],        phase: 'upcoming' },
];

export const SUGGESTIONS: string[] = [
  '이번 주말 가족이랑',
  '강남 AI 컨퍼런스',
  '혼자 가도 좋은',
  '야간에 열리는 축제',
];

export const CHAT_EXAMPLES: { q: string; hint: string }[] = [
  { q: '이번 주말 가족이랑 볼만한 축제 알려줘', hint: '기간 + 인원구성 + 종류 자동 매핑' },
  { q: '강남에서 이번 달 AI 컨퍼런스',            hint: '지역 + 기간 + 종류 + 키워드' },
  { q: '혼자 가도 좋은 교육형 이벤트',            hint: '인원구성 + 성향 매핑' },
];
