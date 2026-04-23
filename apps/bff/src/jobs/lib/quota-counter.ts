// 외부 API 일일 호출 카운트 + 임계 알림 (lint queue 후속).
//
// in-memory Map — 단일 BFF 인스턴스 가정 (Phase 1 한정). multi-instance 환경에서는
// Redis 또는 DB 테이블 (api_call_counters) 로 교체 필요.
//
// reset: 매 호출마다 현재 UTC 일자 (YYYY-MM-DD) 와 저장된 일자 비교, 다르면 reset.
//
// 80% 도달 시 logger.warn 1일 1회 (warned 플래그). 95% 이상이면 logger.error 별도.

import { logger } from '../../logger.js';

interface CounterState {
  date: string;
  count: number;
  warned80: boolean;
  warned95: boolean;
}

const counters = new Map<string, CounterState>();

/**
 * provider 별 일일 한도. 모르는 source 는 한도 추적 안 함 (record 만 함).
 * 공식 문서 기준 (2026-04 시점). 한도가 변하면 본 표 갱신.
 */
export const PROVIDER_DAILY_LIMITS: Record<string, number> = {
  tourapi: 1000, // 공공데이터포털 기본
  'seoul-culture': 1000, // 서울열린데이터광장 기본
  kcisa: 1000, // 문화공공데이터광장 기본
  'naver-news': 25000, // 네이버 검색 API
  // google-news — 공식 quota 없음 (rate-limit only)
};

const WARN_THRESHOLD = 0.8;
const ERROR_THRESHOLD = 0.95;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function getState(source: string): CounterState {
  const today = todayUtc();
  const cur = counters.get(source);
  if (!cur || cur.date !== today) {
    const fresh: CounterState = { date: today, count: 0, warned80: false, warned95: false };
    counters.set(source, fresh);
    return fresh;
  }
  return cur;
}

/**
 * source 별 호출 1회 기록. fetchWithRetry 가 매 호출에 (성공/실패 무관) 호출.
 * 임계 도달 시 1회만 logger.warn / logger.error (warned 플래그).
 */
export function record(source: string): void {
  const state = getState(source);
  state.count += 1;

  const limit = PROVIDER_DAILY_LIMITS[source];
  if (!limit) return; // 한도 미정의 source — 카운트만 누적, 알림 없음

  const pct = state.count / limit;
  if (pct >= ERROR_THRESHOLD && !state.warned95) {
    state.warned95 = true;
    logger.error(
      { source, count: state.count, limit, pct: Math.round(pct * 100) / 100 },
      'API daily quota ≥95% — imminent exhaustion',
    );
  } else if (pct >= WARN_THRESHOLD && !state.warned80) {
    state.warned80 = true;
    logger.warn(
      { source, count: state.count, limit, pct: Math.round(pct * 100) / 100 },
      'API daily quota ≥80%',
    );
  }
}

/**
 * 모든 source 의 현재 사용량 snapshot. scheduler 후속 단계에서 호출해 일일 로그.
 */
export function snapshot(): {
  source: string;
  count: number;
  limit: number | null;
  pct: number | null;
}[] {
  const today = todayUtc();
  const out: ReturnType<typeof snapshot> = [];
  for (const [source, state] of counters) {
    if (state.date !== today) continue; // stale (다른 day 의 잔여) 는 제외
    const limit = PROVIDER_DAILY_LIMITS[source] ?? null;
    out.push({
      source,
      count: state.count,
      limit,
      pct: limit ? Math.round((state.count / limit) * 100) / 100 : null,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

/**
 * 테스트/CLI 용 전체 reset.
 */
export function resetAll(): void {
  counters.clear();
}
