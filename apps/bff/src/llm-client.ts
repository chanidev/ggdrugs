/**
 * services/llm 호출 공용 helper.
 *
 * 정책:
 * - 1회 백오프 재시도: 429 or 5xx 일 때만 300ms 후 한 번 더.
 * - 4xx (429 제외) 는 즉시 실패 — 요청 문제이므로 재시도해도 같은 결과.
 * - 네트워크 오류(fetch throw) 도 1회 재시도.
 * - 재시도 포함 실패 시 null 반환 (호출자 fallback 책임).
 */

import { env } from './env.js';
import { logger } from './logger.js';

const RETRY_DELAY_MS = 300;

function isRetriable(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function callLlm<T>(path: string, body: unknown): Promise<T | null> {
  const url = `${env.LLM_SERVICE_URL}${path}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        return (await res.json()) as T;
      }
      if (attempt === 0 && isRetriable(res.status)) {
        logger.warn({ path, status: res.status }, 'llm call retriable, retry');
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      logger.warn({ path, status: res.status }, 'llm call non-retriable fail');
      return null;
    } catch (err) {
      if (attempt === 0) {
        logger.warn({ path, err }, 'llm call network error, retry');
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      logger.error({ path, err }, 'llm call failed after retry');
      return null;
    }
  }
  return null;
}
