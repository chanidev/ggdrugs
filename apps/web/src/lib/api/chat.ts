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

// ---------------------------------------------------------------------------
// Streaming 버전 — reply 텍스트를 progressive 하게 받아 UI 즉시 갱신.
// ---------------------------------------------------------------------------

export interface ChatStreamHandlers {
  /** LLM 이 방출하는 reply 누적 증분 (append 하면 현재까지 완성된 reply). */
  onReplyDelta?: (chunk: string) => void;
  /** 필터 확정 (regionIds/vibeIds 포함). suggestions 전에 도착. */
  onMeta?: (meta: {
    reply: string;
    filters: ChatFilters;
    specificDate: string | null;
    followups: string[];
  }) => void;
  /** Qdrant + rerank 결과. meta 뒤 도착. 0건일 수 있음. */
  onSuggestions?: (items: ChatSuggestion[]) => void;
  /** retreat 발동 — 지금까지 누적된 reply 를 이 텍스트로 교체하고 followups 대체. */
  onReplyOverride?: (payload: { text: string; followups: string[] }) => void;
  /** LLM/BFF 레벨 에러. stream 은 계속될 수도, 여기서 끝날 수도 있음. */
  onError?: (message: string) => void;
  /** 최종 정상 종료. AbortController.abort() 시에는 호출되지 않음. */
  onDone?: () => void;
}

/** /chat/stream 호출. AbortController 를 반환하지 않음 — caller 가 외부에서 전달해 cancel. */
export async function streamChat(
  messages: { role: 'user' | 'assistant' | 'system'; text: string }[],
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(
      `${BFF_URL}/chat/stream`,
      withCredentials({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ messages }),
        signal,
      }),
    );
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return;
    throw err;
  }

  if (res.status === 502) throw new Error('LLM_UNREACHABLE');
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /chat/stream ${res.status}: ${txt.slice(0, 200)}`);
  }

  const decoder = new TextDecoder('utf-8');
  const reader = res.body.getReader();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let event = 'message';
        const dataLines: string[] = [];
        for (const raw of frame.split('\n')) {
          const line = raw.replace(/\r$/, '');
          if (line.startsWith(':')) continue;
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
        }
        if (dataLines.length === 0) continue;
        const dataStr = dataLines.join('\n');
        try {
          const data = JSON.parse(dataStr) as unknown;
          dispatchSseEvent(event, data, handlers);
        } catch {
          // data 가 JSON 이 아닐 경우 무시. 서버는 항상 JSON 직렬화.
        }
      }
    }
    handlers.onDone?.();
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}

function dispatchSseEvent(event: string, data: unknown, h: ChatStreamHandlers) {
  if (event === 'reply_delta' && typeof data === 'object' && data !== null) {
    const text = (data as { text?: unknown }).text;
    if (typeof text === 'string' && text.length > 0) h.onReplyDelta?.(text);
  } else if (event === 'meta' && typeof data === 'object' && data !== null) {
    const m = data as {
      reply?: string;
      filters: ChatFilters;
      specificDate: string | null;
      followups?: string[];
    };
    h.onMeta?.({
      reply: m.reply ?? '',
      filters: m.filters,
      specificDate: m.specificDate ?? null,
      followups: m.followups ?? [],
    });
  } else if (event === 'suggestions' && typeof data === 'object' && data !== null) {
    const items = (data as { items?: ChatSuggestion[] }).items;
    if (Array.isArray(items)) h.onSuggestions?.(items);
  } else if (event === 'reply_override' && typeof data === 'object' && data !== null) {
    const p = data as { text?: string; followups?: string[] };
    if (typeof p.text === 'string' && p.text.length > 0) {
      h.onReplyOverride?.({ text: p.text, followups: p.followups ?? [] });
    }
  } else if (event === 'error' && typeof data === 'object' && data !== null) {
    const msg = (data as { message?: string }).message ?? 'unknown_error';
    h.onError?.(msg);
  }
}
