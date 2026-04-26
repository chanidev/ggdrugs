/**
 * v4.11 (2026-04-26) — chat /chat/stream idempotent resume 용 in-memory cache.
 *
 * 목적: 사용자 stream 도중 network blip → reader error → reconnect 시 LLM 재호출 없이
 * cache 에서 직전 끊김 위치 이후 event 를 그대로 replay. v4.2 의 sealed-gate retry 보강
 * (그건 LLM 재호출, 본 v4.11 은 LLM 재호출 0).
 *
 * Not Redis 인 이유: 단일 인스턴스 가정. ioredis 의존 회피. 향후 horizontal scale 시
 * Redis swap (key prefix `chat_stream:` 호환). TTL 5분 — blip 재시도 window 충분.
 *
 * Memory budget: 평균 stream ~50 event × ~100 byte = 5KB. 1000 concurrent = 5MB. 안전.
 */

const TTL_MS = 5 * 60 * 1000; // 5분.
const MAX_STREAMS = 5000; // upper bound — 초과 시 oldest 제거 (LRU 근사).

export interface CachedSseEvent {
  /** server 측 sequential id (0, 1, 2, ...). Last-Event-ID 의 `<streamId>:<seq>` 의 seq 부분. */
  seq: number;
  event: string;
  /** JSON-serialized data — 그대로 res.write. */
  data: string;
}

interface StreamEntry {
  events: CachedSseEvent[];
  expiresAt: number;
  /** 마지막 access — LRU 정리 시 사용. */
  lastAccessedAt: number;
}

const cache = new Map<string, StreamEntry>();

function now(): number {
  return Date.now();
}

/** TTL 만료 + LRU 정리 — 새 entry 추가 시 호출. */
function evict(): void {
  const t = now();
  for (const [k, v] of cache) {
    if (v.expiresAt <= t) cache.delete(k);
  }
  if (cache.size > MAX_STREAMS) {
    // oldest accessed 부터 제거. 1024 개 일괄.
    const sorted = [...cache.entries()].sort(
      (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt,
    );
    for (let i = 0; i < Math.min(1024, sorted.length); i++) cache.delete(sorted[i]![0]);
  }
}

/** stream 시작 시 호출 — 빈 entry 등록. */
export function startStream(streamId: string): void {
  evict();
  cache.set(streamId, {
    events: [],
    expiresAt: now() + TTL_MS,
    lastAccessedAt: now(),
  });
}

/** event emit 직후 호출 — cache 에 append + TTL 갱신. */
export function recordEvent(
  streamId: string,
  seq: number,
  event: string,
  data: string,
): void {
  const entry = cache.get(streamId);
  if (!entry) return;
  entry.events.push({ seq, event, data });
  entry.expiresAt = now() + TTL_MS;
  entry.lastAccessedAt = now();
}

/**
 * Last-Event-ID 헤더로 reconnect 한 client 에게 cache 에서 events.seq > afterSeq 만 반환.
 * cache miss / expired → null (caller 가 fresh stream 시작).
 */
export function getCachedAfter(
  streamId: string,
  afterSeq: number,
): CachedSseEvent[] | null {
  const entry = cache.get(streamId);
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    cache.delete(streamId);
    return null;
  }
  entry.lastAccessedAt = now();
  return entry.events.filter((e) => e.seq > afterSeq);
}

/** stream 종료 / 에러 시 호출 — cache 에 done event 까지 보존. TTL 동안 reconnect 가능. */
export function finalizeStream(streamId: string): void {
  const entry = cache.get(streamId);
  if (!entry) return;
  entry.expiresAt = now() + TTL_MS;
  entry.lastAccessedAt = now();
}

/** Last-Event-ID 헤더 파싱: "<streamId>:<seq>" → { streamId, afterSeq }. 잘못된 형식은 null. */
export function parseLastEventId(raw: string | undefined): { streamId: string; afterSeq: number } | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf(':');
  if (idx <= 0 || idx === raw.length - 1) return null;
  const streamId = raw.slice(0, idx);
  const seq = Number.parseInt(raw.slice(idx + 1), 10);
  if (!Number.isFinite(seq) || seq < 0) return null;
  return { streamId, afterSeq: seq };
}
