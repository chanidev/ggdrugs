import type { Request, Response } from 'express';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';

type PeriodKey = 'today' | 'weekend' | 'week' | 'month' | null;

interface LlmChatResponse {
  reply: string;
  filters: {
    eventTypes: string[];
    companions: string[];
    periodKey: PeriodKey;
    vibes: string[];
    regionHints: string[];
  };
}

interface LlmSearchHit {
  eventId: string;
  score: number;
  payload: Record<string, unknown>;
}

interface ChatSuggestion {
  eventId: string;
  title: string;
  phase: string;
  startDate: string;
  endDate: string;
  region: { sidoName: string; sigunguName: string | null };
  category: { code: string; name: string };
  posterImageUrl: string | null;
  score: number;
}

// 최종 사용자에게 노출할 후보 수.
const SEMANTIC_DISPLAY_LIMIT = 5;
// Qdrant 에서 가져올 over-fetch 수 — phase!='ended' / period 필터로 다수 drop 되므로
// 충분한 후보 풀 확보. 데이터 측정: top 50 중 active 비율 ~30% → 30 over-fetch 면
// 평균 ~9개 active 확보, top 5 cap 가능.
const SEMANTIC_OVERFETCH = 30;

/**
 * periodKey → {start, end} Date 객체. AppShell.tsx 의 rangeForPeriod 와 동일 의미
 * (Asia/Seoul 기준, 자정 정렬). UTC Date 로 반환 — Prisma DateTime 비교용.
 *
 * Note: Date 자체는 UTC ms. 'today' = 오늘 자정 ~ 자정+1d 직전.
 */
function rangeForPeriod(key: PeriodKey): { start: Date; end: Date } | null {
  if (!key) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfDay = (d: Date) => {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
  };
  const endOfDay = (d: Date) => {
    const r = new Date(d);
    r.setHours(23, 59, 59, 999);
    return r;
  };
  const add = (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };
  if (key === 'today') return { start: startOfDay(today), end: endOfDay(today) };
  if (key === 'weekend') {
    const day = today.getDay();
    const sat = add(today, (6 - day + 7) % 7);
    const sun = add(sat, 1);
    return { start: startOfDay(sat), end: endOfDay(sun) };
  }
  if (key === 'week') {
    const day = today.getDay() || 7;
    const mon = add(today, -(day - 1));
    const sun = add(mon, 6);
    return { start: startOfDay(mon), end: endOfDay(sun) };
  }
  if (key === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start: startOfDay(start), end: endOfDay(end) };
  }
  return null;
}

/**
 * POST /chat — services/llm 의 /chat 프록시 + regionHints/vibes → ID 해상도
 *            + semantic search 결합으로 실제 이벤트 후보 동봉.
 *
 * Flow:
 *  1. LLM /chat 호출 → reply + filters.
 *  2. 최근 user 발화를 /events/search 에 보내 의미 기반 top-N 이벤트 id 조회.
 *     필터가 있으면 Qdrant payload filter (regionId / categoryCode) 로 pre-filter.
 *  3. Prisma 로 이벤트 메타 resolve (approved + 미삭제) → suggestions 배열.
 *
 * LLM 이 filter 만 뽑아주던 초기 Stage 에서, "실제 답을 줄 수 있는" 검색 어시스턴트로 승격.
 * services/llm 이 503/502 면 Suggestions 생략하고 기존 응답만 반환 (fallback).
 */
export async function postChat(req: Request, res: Response) {
  const url = `${env.LLM_SERVICE_URL}/chat`;
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(req.body ?? {}),
    });
  } catch (err) {
    logger.error({ err, url }, 'llm proxy: fetch failed');
    res.status(502).json({ error: 'llm_service_unreachable' });
    return;
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    res.status(upstream.status).setHeader(
      'Content-Type',
      upstream.headers.get('content-type') ?? 'application/json',
    );
    res.send(text);
    return;
  }

  const data = (await upstream.json()) as LlmChatResponse;
  const hints = data.filters?.regionHints ?? [];
  const vibeNames = data.filters?.vibes ?? [];

  let regionIds: string[] = [];
  if (hints.length > 0) {
    const rows = await prisma.region.findMany({
      where: { sigunguName: { in: hints }, dongName: null },
      select: { regionId: true, sigunguName: true },
    });
    regionIds = rows.map((r) => r.regionId.toString());
  }

  let vibeIds: string[] = [];
  if (vibeNames.length > 0) {
    const rows = await prisma.eventVibe.findMany({
      where: { vibeName: { in: vibeNames }, isActive: true },
      select: { vibeId: true, vibeName: true },
    });
    vibeIds = rows.map((r) => r.vibeId.toString());
  }

  const suggestions = await semanticSuggestions({
    messages: req.body?.messages ?? [],
    filters: data.filters,
    regionIds,
  });

  res.json({
    reply: data.reply,
    filters: {
      ...data.filters,
      regionIds,
      vibeIds,
    },
    suggestions,
  });
}

/**
 * 자연어 쿼리(최근 user 발화 N 개 concat) → services/llm /events/search → Prisma resolve.
 * LLM/Qdrant 실패 시 빈 배열 반환 (chat 응답 자체는 계속).
 */
async function semanticSuggestions(opts: {
  messages: { role?: string; text?: string }[];
  filters: LlmChatResponse['filters'];
  regionIds: string[];
}): Promise<ChatSuggestion[]> {
  const userTexts = opts.messages
    .filter((m) => m?.role === 'user' && typeof m?.text === 'string')
    .map((m) => (m.text as string).trim())
    .filter((t) => t.length > 0);
  if (userTexts.length === 0) return [];
  // 가장 최근 3턴을 하나로 묶어 의도 context 유지.
  const query = userTexts.slice(-3).join('\n').slice(0, 500);

  const filter: Record<string, unknown> = {};
  if (opts.filters.eventTypes?.length) filter.categoryCode = opts.filters.eventTypes;
  if (opts.regionIds.length === 1) filter.regionId = opts.regionIds[0];

  let url = `${env.LLM_SERVICE_URL}/events/search`;
  let hits: LlmSearchHit[] = [];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        query,
        limit: SEMANTIC_OVERFETCH,
        score_threshold: 0.25,
        filter: Object.keys(filter).length ? filter : null,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { hits?: LlmSearchHit[] };
    hits = data.hits ?? [];
  } catch {
    return [];
  }
  if (hits.length === 0) return [];

  const eventIds = hits
    .map((h) => {
      try {
        return BigInt(h.eventId);
      } catch {
        return null;
      }
    })
    .filter((v): v is bigint => v !== null);
  if (eventIds.length === 0) return [];

  // Qdrant kNN 은 phase / 날짜를 모름. BFF resolve 단계에서 강제 적용:
  //  - phase='ended' 는 어떤 추천 맥락에서도 부적합 → 항상 제외
  //  - periodKey 있으면 그 범위와 이벤트 기간이 겹치는 것만 (endDate >= start AND startDate <= end)
  const periodRange = rangeForPeriod(opts.filters.periodKey);

  const rows = await prisma.event.findMany({
    where: {
      eventId: { in: eventIds },
      approvalStatus: 'approved',
      isDeleted: false,
      phase: { not: 'ended' },
      ...(periodRange
        ? {
            startDate: { lte: periodRange.end },
            endDate: { gte: periodRange.start },
          }
        : {}),
    },
    select: {
      eventId: true,
      title: true,
      phase: true,
      startDate: true,
      endDate: true,
      posterImageUrl: true,
      category: { select: { categoryCode: true, displayName: true } },
      region: { select: { sidoName: true, sigunguName: true } },
    },
  });

  // Qdrant hit 순서를 유지 (score 내림차순). 삭제/비공개 로 resolve 안 되면 drop.
  const scoreById = new Map(hits.map((h) => [h.eventId, h.score]));
  return rows
    .map((r) => ({
      eventId: r.eventId.toString(),
      title: r.title,
      phase: r.phase,
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate.toISOString().slice(0, 10),
      region: {
        sidoName: r.region.sidoName,
        sigunguName: r.region.sigunguName,
      },
      category: {
        code: r.category.categoryCode,
        name: r.category.displayName,
      },
      posterImageUrl: r.posterImageUrl,
      score: scoreById.get(r.eventId.toString()) ?? 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SEMANTIC_DISPLAY_LIMIT);
}
