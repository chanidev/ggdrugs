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
  /** v3.5 — LLM 이 직전 제안을 가리킨다고 판단 + 클라가 last_suggestions 보냈을 때 true. */
  referencesLast?: boolean;
  /** Qdrant 의미 검색으로 뽑아준 이벤트 후보 (최대 5개). 비어있을 수 있음. */
  suggestions: ChatSuggestion[];
}

/** v3.5 — 클라이언트가 보내는 직전 turn 의 suggestions 요약. */
export interface LastSuggestionRef {
  eventId: string;
  title: string;
  category: string;
  region: string;
  startDate: string;
  endDate: string;
}

/** ChatSuggestion → LastSuggestionRef (요약 필드만 추출). */
export function toLastSuggestionRef(s: ChatSuggestion): LastSuggestionRef {
  return {
    eventId: s.eventId,
    title: s.title,
    category: s.category.name,
    region: s.region.sigunguName ?? s.region.sidoName,
    startDate: s.startDate,
    endDate: s.endDate,
  };
}

export async function sendChat(
  messages: { role: 'user' | 'assistant' | 'system'; text: string }[],
  lastSuggestions?: LastSuggestionRef[],
): Promise<ChatReply> {
  const res = await fetch(
    `${BFF_URL}/chat`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        ...(lastSuggestions && lastSuggestions.length > 0
          ? { last_suggestions: lastSuggestions }
          : {}),
      }),
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
    referencesLast: boolean;
  }) => void;
  /** v4 — LLM reply 토큰 스트림 종료. 이후 reply_delta 는 emit 되지 않음. canonical reply 텍스트 동봉. */
  onReplySealed?: (payload: { text: string }) => void;
  /** Qdrant + rerank 결과. meta 뒤 도착. 0건일 수 있음. */
  onSuggestions?: (items: ChatSuggestion[]) => void;
  /** retreat 발동 — sealed reply 를 이 텍스트로 교체하고 followups 대체. */
  onReplyOverride?: (payload: { text: string; followups: string[] }) => void;
  /** LLM/BFF 레벨 에러. stream 은 계속될 수도, 여기서 끝날 수도 있음. */
  onError?: (message: string) => void;
  /** 최종 정상 종료. AbortController.abort() 시에는 호출되지 않음. */
  onDone?: () => void;
  /**
   * v4.2 — 자동 retry 직전 호출. attempt 는 새 시도 번호 (현재 1회 retry 만 → 항상 2).
   * caller 는 placeholder 메시지의 text/streaming/meta/error 등 transient state 를 리셋.
   * 첫 호출 (attempt=1) 에는 emit 되지 않음 — 진정한 retry 시점에만.
   */
  onAttemptStart?: (attempt: number) => void;
}

/**
 * /chat/stream 호출. AbortController 를 반환하지 않음 — caller 가 외부에서 전달해 cancel.
 *
 * v4.2 — sealed-gate 자동 retry: reply_sealed 도착 전에 네트워크 / 5xx 끊김 발생 시
 * 1회 자동 재시도 (handlers.onAttemptStart(2) 로 caller 에 placeholder reset 알림).
 * sealed 이후 끊김은 soft success (handlers.onDone) — 핵심 reply 는 도달했고
 * suggestions / reply_override 만 누락. 사용자 abort / 4xx / LLM_UNREACHABLE 은 retry X.
 */
export async function streamChat(
  messages: { role: 'user' | 'assistant' | 'system'; text: string }[],
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
  lastSuggestions?: LastSuggestionRef[],
): Promise<void> {
  if (signal?.aborted) throw makeAbortError();

  const RETRY_MAX = 1;
  let attempt = 1;
  let sealed = false;

  // sealed 추적 — caller 의 onReplySealed 를 wrap.
  const wrapped: ChatStreamHandlers = {
    ...handlers,
    onReplySealed: (p) => {
      sealed = true;
      handlers.onReplySealed?.(p);
    },
  };

  // v4.11 — idempotent resume. server 가 stream_start 이벤트로 streamId 전달, 매 event 의
  // SSE id field 가 "<streamId>:<seq>". 끊김 후 재시도 시 Last-Event-ID 헤더 전달 → server 가
  // cache 에서 그 이후만 replay (LLM 재호출 0).
  const ctx: StreamCtx = { streamId: null, lastEventId: null };

  while (true) {
    if (attempt > 1) handlers.onAttemptStart?.(attempt);
    try {
      // v4.11 — 재시도 시점에 streamId 가 있으면 Last-Event-ID 로 cache replay 시도.
      const resumeHeader =
        attempt > 1 && ctx.streamId && ctx.lastEventId !== null
          ? `${ctx.streamId}:${ctx.lastEventId}`
          : null;
      await attemptStream(messages, wrapped, signal, lastSuggestions, ctx, resumeHeader);
      return; // 정상 종료 (onDone 은 attemptStream 내부에서 호출).
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      if (sealed) {
        // sealed 이후 끊김 — 핵심 reply 는 도달. suggestions / override 누락 가능하지만 soft success.
        handlers.onDone?.();
        return;
      }
      if (!isRetryable(err) || attempt > RETRY_MAX) throw err;
      attempt++;
      // 다음 iteration 에서 onAttemptStart 호출.
    }
  }
}

/** v4.11 — 재연결을 위한 stream 식별 정보. attemptStream 이 갱신. */
interface StreamCtx {
  streamId: string | null;
  lastEventId: number | null;
}

/** 단일 stream 시도 — fetch + reader loop. retry 로직은 streamChat 이 wrap. */
async function attemptStream(
  messages: { role: 'user' | 'assistant' | 'system'; text: string }[],
  handlers: ChatStreamHandlers,
  signal: AbortSignal | undefined,
  lastSuggestions: LastSuggestionRef[] | undefined,
  ctx: StreamCtx,
  resumeLastEventId: string | null,
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (resumeLastEventId) headers['Last-Event-ID'] = resumeLastEventId;
  const res = await fetch(
    `${BFF_URL}/chat/stream`,
    withCredentials({
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages,
        ...(lastSuggestions && lastSuggestions.length > 0
          ? { last_suggestions: lastSuggestions }
          : {}),
      }),
      ...(signal != null ? { signal } : {}),
    }),
  );

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
      if (signal?.aborted) throw makeAbortError();
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let event = 'message';
        let frameId: string | null = null;
        const dataLines: string[] = [];
        for (const raw of frame.split('\n')) {
          const line = raw.replace(/\r$/, '');
          if (line.startsWith(':')) continue;
          if (line.startsWith('id:')) frameId = line.slice(3).trim();
          else if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
        }
        // v4.11 — id 형식 "<streamId>:<seq>" 파싱하여 ctx 갱신.
        if (frameId) {
          const sepIdx = frameId.lastIndexOf(':');
          if (sepIdx > 0) {
            const sid = frameId.slice(0, sepIdx);
            const seq = Number.parseInt(frameId.slice(sepIdx + 1), 10);
            if (Number.isFinite(seq)) {
              ctx.streamId = sid;
              ctx.lastEventId = seq;
            }
          }
        }
        if (dataLines.length === 0) continue;
        const dataStr = dataLines.join('\n');
        try {
          const data = JSON.parse(dataStr) as unknown;
          // stream_start event 는 streamId 만 노출 — caller 에 dispatch 안 함.
          if (event === 'stream_start') continue;
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

/**
 * v4.2 — auto-retry 대상 판별. 다음은 retry X:
 * - LLM_UNREACHABLE (BFF 가 명시적으로 LLM 503 신호)
 * - 4xx (validation / auth — 영속 에러)
 * 그 외 (network error / 5xx / parse 에러 등) 는 retry 가능.
 */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message === 'LLM_UNREACHABLE') return false;
  if (/^POST \/chat\/stream 4\d\d:/.test(err.message)) return false;
  return true;
}

// AbortError with standard name so callers can filter by `err.name === 'AbortError'`.
function makeAbortError(): Error {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
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
      referencesLast?: boolean;
    };
    h.onMeta?.({
      reply: m.reply ?? '',
      filters: m.filters,
      specificDate: m.specificDate ?? null,
      followups: m.followups ?? [],
      referencesLast: m.referencesLast === true,
    });
  } else if (event === 'reply_sealed' && typeof data === 'object' && data !== null) {
    const t = (data as { text?: unknown }).text;
    h.onReplySealed?.({ text: typeof t === 'string' ? t : '' });
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
