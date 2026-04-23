import { BFF_URL, withCredentials } from './client.js';
import type { EventPhase } from './events.js';

// =============================================================
// Chat (A_201 — LLM 자연어 검색)
// =============================================================

export interface ChatFilters {
  eventTypes: string[];
  companions: string[];
  periodKey: 'today' | 'tomorrow' | 'weekend' | 'week' | 'month' | null;
  vibes: string[];
  regionHints: string[];
  /** BFF 가 regionHints 를 regions 테이블에서 resolve 해 추가한 id (없으면 []). */
  regionIds: string[];
  /** BFF 가 vibes(이름) 를 event_vibes 테이블에서 resolve 해 추가한 id. */
  vibeIds: string[];
}

export interface ChatSuggestion {
  eventId: string;
  title: string;
  phase: EventPhase;
  startDate: string;
  endDate: string;
  region: { sidoName: string; sigunguName: string | null };
  category: { code: string; name: string };
  posterImageUrl: string | null;
  score: number;
  /** v3 — LLM rerank 가 붙인 한 줄 추천 사유 (없으면 null). */
  matchReason?: string | null;
}

export interface ChatReply {
  reply: string;
  filters: ChatFilters;
  /** v3 — 사용자가 명시한 단일 날짜 ISO YYYY-MM-DD. */
  specificDate?: string | null;
  /** v3 — 다음 user 발화 후보 칩 2~3개 (각 ≤14자). */
  followups?: string[];
  /** Qdrant 의미 검색으로 뽑아준 이벤트 후보 (최대 5개). 비어있을 수 있음. */
  suggestions: ChatSuggestion[];
}

export async function sendChat(
  messages: { role: 'user' | 'assistant' | 'system'; text: string }[],
): Promise<ChatReply> {
  const res = await fetch(
    `${BFF_URL}/chat`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    }),
  );
  if (res.status === 502) throw new Error('LLM_UNREACHABLE');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /chat ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as ChatReply;
}
