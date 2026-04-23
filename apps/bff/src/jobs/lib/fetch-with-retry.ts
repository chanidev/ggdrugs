// 외부 API 호출 graceful retry — 429 / 5xx / 네트워크 에러에 exponential backoff.
// `Retry-After` 헤더 존중 (초 단위 또는 HTTP-date 둘 다).
//
// quota / API 키 오류 같은 영구 실패는 retry 안 함 (4xx 중 429 만 transient 로 간주).
// 사용처: tourapi / seoul-culture / kcisa / news-naver ingest 의 외부 호출 wrapper.

import { logger } from '../../logger.js';

export interface FetchRetryOptions {
  retries?: number; // 기본 3
  initialBackoffMs?: number; // 기본 1000
  maxBackoffMs?: number; // 기본 8000
  /** logger child 식별자 (예: 'tourapi'). 로그에 source 필드로 노출. */
  source?: string;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as Error & { code?: string }).code;
  // node fetch native 에러 코드 일부 — 모든 transient 케이스 다 잡진 못해도 흔한 것들.
  if (code && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return true;
  }
  // undici/fetch 레이어가 던지는 generic 에러 일부.
  if (err.name === 'AbortError') return false; // 외부 abort 는 retry 무의미
  if (/network|socket|fetch failed/i.test(err.message)) return true;
  return false;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  // 초 단위 정수
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds) && seconds >= 0 && seconds < 600) {
    return seconds * 1000;
  }
  // HTTP-date (예: 'Wed, 21 Oct 2026 07:28:00 GMT')
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    if (delta > 0 && delta < 600_000) return delta;
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch + retry. retry 소진 후에도 실패하면 마지막 에러/응답을 그대로 throw 또는 반환.
 *
 * 응답 자체가 4xx (429 제외) / 2xx 이면 retry 안 함 — 그대로 반환. 호출자가 res.ok 체크.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts: FetchRetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const initialBackoffMs = opts.initialBackoffMs ?? 1000;
  const maxBackoffMs = opts.maxBackoffMs ?? 8000;
  const log = logger.child({ src: opts.source ?? 'fetch-retry' });

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= retries) {
    attempt += 1;
    try {
      const res = await fetch(url, init);
      if (!RETRYABLE_STATUS.has(res.status)) {
        return res; // 2xx, 3xx, 4xx (429 제외) 모두 호출자 처리
      }
      // 429 / 5xx — retry
      if (attempt > retries) {
        log.warn(
          { url: url.slice(0, 120), status: res.status, attempt },
          'retries exhausted on retryable status',
        );
        return res; // 호출자가 res.ok=false 로 처리
      }
      const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
      const backoff = retryAfter ?? Math.min(initialBackoffMs * 2 ** (attempt - 1), maxBackoffMs);
      log.info(
        { url: url.slice(0, 120), status: res.status, attempt, backoffMs: backoff },
        'transient status, retrying',
      );
      await delay(backoff);
    } catch (err) {
      lastError = err;
      if (!isNetworkError(err) || attempt > retries) {
        throw err;
      }
      const backoff = Math.min(initialBackoffMs * 2 ** (attempt - 1), maxBackoffMs);
      log.info(
        { url: url.slice(0, 120), err: (err as Error).message, attempt, backoffMs: backoff },
        'network error, retrying',
      );
      await delay(backoff);
    }
  }

  // unreachable — loop exit 는 위에서 모두 처리. 안전망.
  throw lastError ?? new Error('fetchWithRetry: exhausted without response');
}
