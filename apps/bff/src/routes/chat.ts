import type { Request, Response } from 'express';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

type PeriodKey = 'today' | 'tomorrow' | 'weekend' | 'week' | 'month' | null;

interface LlmFilters {
  eventTypes: string[];
  companions: string[];
  periodKey: PeriodKey;
  vibes: string[];
  regionHints: string[];
}

interface LlmChatResponse {
  reply: string;
  filters: LlmFilters;
  /** v3 — 사용자가 명시한 단일 날짜 ISO. 있으면 periodKey 보다 우선. */
  specificDate?: string | null;
  /** v3 — 다음 user 발화 후보 칩 2~3개 (각 12자 이하). */
  followups?: string[];
}

interface LlmSearchHit {
  eventId: string;
  score: number;
  payload: Record<string, unknown>;
}

interface LlmRerankItem {
  eventId: string;
  reason: string;
}

interface LlmRetreatResponse {
  reply: string;
  followups: string[];
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
  /** v3 — LLM rerank 가 붙인 한 줄 추천 사유. 없으면 null. */
  matchReason?: string | null;
}

// 최종 노출할 후보 수.
const SEMANTIC_DISPLAY_LIMIT = 5;
// Qdrant over-fetch — phase/period 필터로 다수 drop, rerank 선택 풀 확보.
const SEMANTIC_OVERFETCH = 30;
// rerank 후보로 LLM 에 보낼 최대 수 — 토큰 cost 제한.
const RERANK_INPUT_CAP = 12;
// retreat reply 호출 임계 — 결과가 이 이하면 LLM 에 보내 다시 작성.
const RETREAT_THRESHOLD = 0;

/**
 * periodKey → {start, end} Date. AppShell.tsx rangeForPeriod 와 동일 의미 (Asia/Seoul 자정).
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
  if (key === 'tomorrow') {
    const tmr = add(today, 1);
    return { start: startOfDay(tmr), end: endOfDay(tmr) };
  }
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
 * specificDate (ISO YYYY-MM-DD) → 그 하루 범위 Date. 잘못된 포맷이면 null.
 * periodKey 보다 우선 적용.
 */
function rangeForSpecificDate(iso: string | null | undefined): { start: Date; end: Date } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts as [number, number, number];
  const day = new Date(y, m - 1, d);
  if (Number.isNaN(day.getTime())) return null;
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * 로그인 사용자의 user_taste_profiles → LLM `user_signals` 라벨로 변환.
 * tasteValue 는 enum/ID 기반 (preferred_category=festival 등). 사람이 읽는 라벨로 매핑.
 */
async function buildUserSignals(userId: bigint | null): Promise<Record<string, unknown> | null> {
  if (!userId) return null;
  const profiles = await prisma.userTasteProfile.findMany({
    where: { userId },
    select: { tasteDimension: true, tasteValue: true },
  });
  if (profiles.length === 0) return null;
  const dims: Record<string, string> = {};
  for (const p of profiles) dims[p.tasteDimension] = p.tasteValue;

  const signals: Record<string, unknown> = {};

  if (dims.preferred_category) {
    const cat = await prisma.eventCategory.findFirst({
      where: { categoryCode: dims.preferred_category },
      select: { displayName: true },
    });
    if (cat) signals.preferred_category = cat.displayName;
  }
  if (dims.preferred_region) {
    try {
      const region = await prisma.region.findUnique({
        where: { regionId: BigInt(dims.preferred_region) },
        select: { sigunguName: true, sidoName: true },
      });
      if (region) signals.preferred_region = region.sigunguName ?? region.sidoName;
    } catch {
      /* 손상된 값 — 무시 */
    }
  }
  if (dims.preferred_vibe) {
    try {
      const vibe = await prisma.eventVibe.findUnique({
        where: { vibeId: BigInt(dims.preferred_vibe) },
        select: { vibeName: true },
      });
      if (vibe) signals.preferred_vibe = vibe.vibeName;
    } catch {
      /* 무시 */
    }
  }

  // 최근 30일 북마크 수 — '최근 활성도' 가벼운 시그널.
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const recent = await prisma.bookmark.count({
    where: { userId, createdAt: { gte: since } },
  });
  if (recent > 0) signals.recent_bookmarks = recent;

  return Object.keys(signals).length > 0 ? signals : null;
}

/**
 * POST /chat — v3.
 *
 * Flow:
 *  1. (선택) 로그인 사용자면 taste_profile → user_signals 빌드.
 *  2. LLM /chat 호출 → reply + filters + specificDate + followups.
 *  3. regionHints/vibes → ID resolve.
 *  4. semanticSuggestions: Qdrant kNN over-fetch 30 → Prisma resolve (phase + 날짜 필터)
 *     → (조건 부합 시) LLM rerank → top 5 cap.
 *  5. 최종 결과 ≤ RETREAT_THRESHOLD 면 LLM /chat/compose-retreat 로 reply + followups
 *     덮어쓰기 (정직한 0건 안내 + 대체 followups).
 *
 * LLM 503/502: BFF 도 그 status 반환 (web 이 LLM_UNREACHABLE 처리).
 */
export async function postChat(req: Request, res: Response) {
  const auth = (req as Partial<AuthenticatedRequest>).auth;
  const userId = auth?.userId ?? null;

  let userSignals: Record<string, unknown> | null = null;
  if (userId) {
    try {
      userSignals = await buildUserSignals(userId);
    } catch (err) {
      logger.warn({ err, userId: userId.toString() }, 'chat: buildUserSignals failed — continuing without');
    }
  }

  const url = `${env.LLM_SERVICE_URL}/chat`;
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        ...(req.body ?? {}),
        ...(userSignals ? { user_signals: userSignals } : {}),
      }),
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

  const messages = (req.body?.messages ?? []) as { role?: string; text?: string }[];
  const userTexts = messages
    .filter((m) => m?.role === 'user' && typeof m?.text === 'string')
    .map((m) => (m.text as string).trim())
    .filter((t) => t.length > 0);
  const lastUser = userTexts[userTexts.length - 1] ?? '';

  const suggestions = await semanticSuggestions({
    userTexts,
    filters: data.filters,
    specificDate: data.specificDate ?? null,
    regionIds,
  });

  // Retreat — 결과 부족 시 LLM 에 다시 reply 작성 요청.
  let finalReply = data.reply;
  let finalFollowups = (data.followups ?? []).slice(0, 3);
  if (suggestions.length <= RETREAT_THRESHOLD && userTexts.length > 0) {
    try {
      const retreat = await composeRetreat({
        userText: lastUser,
        filters: data.filters,
        sqlCount: 0,
        semanticCount: 0,
      });
      if (retreat.reply) {
        finalReply = retreat.reply;
        if (retreat.followups.length > 0) finalFollowups = retreat.followups;
      }
    } catch (err) {
      logger.warn({ err }, 'chat: compose-retreat failed — keeping LLM original reply');
    }
  }

  res.json({
    reply: finalReply,
    filters: {
      ...data.filters,
      regionIds,
      vibeIds,
    },
    specificDate: data.specificDate ?? null,
    followups: finalFollowups,
    suggestions,
  });
}

interface SemanticOpts {
  userTexts: string[];
  filters: LlmFilters;
  specificDate: string | null;
  regionIds: string[];
}

/**
 * Qdrant kNN over-fetch → Prisma resolve (phase != ended + period/specificDate 교집합)
 * → 후보 ≥ 8 이고 query 가 비-trivial 이면 LLM rerank → top 5 cap.
 *
 * LLM/Qdrant 실패는 fall-through (빈 배열 또는 score 순서 유지).
 */
async function semanticSuggestions(opts: SemanticOpts): Promise<ChatSuggestion[]> {
  if (opts.userTexts.length === 0) return [];
  const query = opts.userTexts.slice(-3).join('\n').slice(0, 500);

  const filter: Record<string, unknown> = {};
  if (opts.filters.eventTypes?.length) filter.categoryCode = opts.filters.eventTypes;
  if (opts.regionIds.length === 1) filter.regionId = opts.regionIds[0];

  let hits: LlmSearchHit[] = [];
  try {
    const r = await fetch(`${env.LLM_SERVICE_URL}/events/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        query,
        limit: SEMANTIC_OVERFETCH,
        score_threshold: 0.25,
        filter: Object.keys(filter).length ? filter : null,
      }),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { hits?: LlmSearchHit[] };
    hits = j.hits ?? [];
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

  // specificDate 우선, 없으면 periodKey 범위.
  const periodRange =
    rangeForSpecificDate(opts.specificDate) ?? rangeForPeriod(opts.filters.periodKey);

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
      vibeAssignments: {
        select: {
          vibe: { select: { vibeName: true } },
        },
      },
    },
  });

  const scoreById = new Map(hits.map((h) => [h.eventId, h.score]));
  const scored = rows
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
      vibesNames: r.vibeAssignments.map((v) => v.vibe.vibeName),
    }))
    .sort((a, b) => b.score - a.score);

  // Rerank — 후보가 풍부하고 (≥6) query 가 단순 echo 가 아닐 때.
  let reasonById = new Map<string, string>();
  let order: string[] | null = null;
  if (scored.length >= 6 && query.length >= 8) {
    try {
      const rerankRes = await fetch(`${env.LLM_SERVICE_URL}/events/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          query,
          top_k: SEMANTIC_DISPLAY_LIMIT,
          candidates: scored.slice(0, RERANK_INPUT_CAP).map((s) => ({
            eventId: s.eventId,
            title: s.title,
            phase: s.phase,
            startDate: s.startDate,
            endDate: s.endDate,
            region: s.region.sigunguName ?? s.region.sidoName,
            category: s.category.name,
            vibes: s.vibesNames,
            score: s.score,
          })),
        }),
      });
      if (rerankRes.ok) {
        const rj = (await rerankRes.json()) as { ranked?: LlmRerankItem[] };
        order = (rj.ranked ?? []).map((r) => r.eventId);
        reasonById = new Map((rj.ranked ?? []).map((r) => [r.eventId, r.reason]));
      }
    } catch (err) {
      logger.warn({ err }, 'chat: rerank failed — fall back to score order');
    }
  }

  let final: ChatSuggestion[];
  if (order && order.length > 0) {
    const byId = new Map(scored.map((s) => [s.eventId, s]));
    final = order
      .map((id) => byId.get(id))
      .filter((s): s is (typeof scored)[number] => Boolean(s))
      .map((s) => ({
        eventId: s.eventId,
        title: s.title,
        phase: s.phase,
        startDate: s.startDate,
        endDate: s.endDate,
        region: s.region,
        category: s.category,
        posterImageUrl: s.posterImageUrl,
        score: s.score,
        matchReason: reasonById.get(s.eventId) ?? null,
      }));
  } else {
    final = scored.slice(0, SEMANTIC_DISPLAY_LIMIT).map((s) => ({
      eventId: s.eventId,
      title: s.title,
      phase: s.phase,
      startDate: s.startDate,
      endDate: s.endDate,
      region: s.region,
      category: s.category,
      posterImageUrl: s.posterImageUrl,
      score: s.score,
      matchReason: null,
    }));
  }

  return final;
}

interface RetreatOpts {
  userText: string;
  filters: LlmFilters;
  sqlCount: number;
  semanticCount: number;
}

async function composeRetreat(opts: RetreatOpts): Promise<LlmRetreatResponse> {
  const r = await fetch(`${env.LLM_SERVICE_URL}/chat/compose-retreat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      user_text: opts.userText,
      filters: opts.filters,
      sql_count: opts.sqlCount,
      semantic_count: opts.semanticCount,
    }),
  });
  if (!r.ok) throw new Error(`compose-retreat ${r.status}`);
  return (await r.json()) as LlmRetreatResponse;
}
