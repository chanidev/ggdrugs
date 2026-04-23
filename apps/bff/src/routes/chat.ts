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
  /** v3.5 — grounded followup. true 면 직전 suggestions pool 에서 rerank 만 재실행. */
  referencesLast?: boolean;
}

/** v3.5 — 클라이언트가 보내는 직전 assistant turn 의 suggestions 요약. */
interface ClientLastSuggestion {
  eventId: string;
  title?: string;
  category?: string;
  region?: string;
  startDate?: string;
  endDate?: string;
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
// pg_trgm keyword over-fetch — vector 와 병렬. union 후 dedup.
const KEYWORD_OVERFETCH = 30;
// word_similarity 최소치 — long user query → short title 매치 용. 실측:
//  0.30: "서울" 같은 흔한 매치가 들어올 수 있으나 vector/rerank 가 걸러냄
//  0.40: 흔한 매치 drop, 고유명사 위주 (0.875 같은 정확 매치는 유지)
// 0.30 으로 너그럽게 — 최종 노이즈는 rerank 이 처리.
const KEYWORD_SIMILARITY_MIN = 0.3;
// keyword 쿼리 최대 길이 — 마지막 user 발화만 사용 (vector 와 달리 history 미포함).
const KEYWORD_QUERY_MAX = 120;
// rerank 후보로 LLM 에 보낼 최대 수 — 토큰 cost 제한.
const RERANK_INPUT_CAP = 12;
// retreat reply 호출 임계 — 결과가 이 이하면 LLM 에 보내 다시 작성.
const RETREAT_THRESHOLD = 0;

// v3.4 — prompt injection surface 차단.
const CHAT_MAX_MESSAGES = 30;
const CHAT_MAX_MESSAGE_LEN = 2000;
// v3.5 — grounded followup. 직전 turn suggestions 최대 10건 (UI display limit 과 동일).
const LAST_SUGGESTIONS_MAX = 10;

type InvalidReason = 'messages_type' | 'messages_count' | 'message_shape' | 'message_too_long';

interface ValidChatBody {
  messages: Array<{ role: string; text: string }>;
  lastSuggestions: ClientLastSuggestion[];
}

/**
 * /chat 과 /chat/stream 이 공유하는 body validation. shape 문제나 과도한 length 는
 * 400 으로 즉시 차단 — LLM 까지 도달하기 전에.
 *
 * v3.5 — last_suggestions 배열도 함께 정규화 (초과분 drop, shape 위반 drop).
 */
function validateChatBody(
  body: unknown,
): { ok: true; body: ValidChatBody } | { ok: false; reason: InvalidReason } {
  const b = body as { messages?: unknown; last_suggestions?: unknown } | null | undefined;
  const raw = b?.messages;
  if (!Array.isArray(raw)) return { ok: false, reason: 'messages_type' };
  if (raw.length === 0 || raw.length > CHAT_MAX_MESSAGES) {
    return { ok: false, reason: 'messages_count' };
  }
  const msgs: Array<{ role: string; text: string }> = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') return { ok: false, reason: 'message_shape' };
    const role = (m as { role?: unknown }).role;
    const text = (m as { text?: unknown }).text;
    if (typeof role !== 'string' || typeof text !== 'string') {
      return { ok: false, reason: 'message_shape' };
    }
    if (role !== 'user' && role !== 'assistant' && role !== 'system') {
      return { ok: false, reason: 'message_shape' };
    }
    if (text.length > CHAT_MAX_MESSAGE_LEN) {
      return { ok: false, reason: 'message_too_long' };
    }
    msgs.push({ role, text });
  }
  // last_suggestions — malformed 는 조용히 drop (client 가 다양한 상태에서 보낼 수 있음).
  const lastRaw = b?.last_suggestions;
  const last: ClientLastSuggestion[] = [];
  if (Array.isArray(lastRaw)) {
    for (const s of lastRaw.slice(0, LAST_SUGGESTIONS_MAX)) {
      if (!s || typeof s !== 'object') continue;
      const eid = (s as { eventId?: unknown }).eventId;
      if (typeof eid !== 'string' || eid.length === 0 || eid.length > 40) continue;
      const pick = (key: string, cap: number): string => {
        const v = (s as Record<string, unknown>)[key];
        return typeof v === 'string' ? v.slice(0, cap) : '';
      };
      last.push({
        eventId: eid,
        title: pick('title', 200),
        category: pick('category', 30),
        region: pick('region', 40),
        startDate: pick('startDate', 10),
        endDate: pick('endDate', 10),
      });
    }
  }
  return { ok: true, body: { messages: msgs, lastSuggestions: last } };
}

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
  const val = validateChatBody(req.body);
  if (!val.ok) {
    res.status(400).json({ error: 'invalid_chat_body', reason: val.reason });
    return;
  }

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
        messages: val.body.messages,
        ...(userSignals ? { user_signals: userSignals } : {}),
        ...(val.body.lastSuggestions.length > 0
          ? { last_suggestions: val.body.lastSuggestions }
          : {}),
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

  const userTexts = val.body.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text.trim())
    .filter((t) => t.length > 0);
  const lastUser = userTexts[userTexts.length - 1] ?? '';

  // v3.5 — LLM 이 referencesLast=true 를 반환하면 기존 suggestion pool 내부에서만
  // rerank 재실행. 그 외엔 기존 hybrid 검색.
  const useGrounded = data.referencesLast === true && val.body.lastSuggestions.length > 0;
  const suggestions = useGrounded
    ? await groundedRerank({
        lastSuggestions: val.body.lastSuggestions,
        userTexts,
        filters: data.filters,
        specificDate: data.specificDate ?? null,
      })
    : await semanticSuggestions({
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
    referencesLast: useGrounded,
    suggestions,
  });
}

interface SemanticOpts {
  userTexts: string[];
  filters: LlmFilters;
  specificDate: string | null;
  regionIds: string[];
}

// ----------------------------------------------------------------------------
// v3.3 — Hybrid search. Vector (Qdrant) + Keyword (pg_trgm) 병렬.
// ----------------------------------------------------------------------------

interface HybridHit {
  eventId: string;
  score: number;
}

/**
 * Qdrant kNN via LLM service. score_threshold 0.25. LLM/Qdrant 503 → 빈 배열.
 */
async function fetchVectorHits(
  query: string,
  filter: Record<string, unknown>,
): Promise<HybridHit[]> {
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
    return (j.hits ?? []).map((h) => ({ eventId: h.eventId, score: h.score }));
  } catch (err) {
    logger.warn({ err }, 'chat: vector hits fetch failed');
    return [];
  }
}

/**
 * Postgres pg_trgm `word_similarity` — 긴 쿼리의 부분 문자열이 title/ai_summary
 * 에서 얼마나 잘 매치되는지. `similarity` 대비 긴 쿼리→짧은 title 시나리오에
 * 관대함 (예: "2026 서울 일러스트코리아" vs "서울 일러스트" = 0.875).
 *
 * 한글 trigram 특성상 3글자 미만은 의미 있는 매치 불가 → 즉시 반환.
 * 실패 (extension 없음 / 연결 문제) 는 빈 배열 — vector 쪽이 fallback.
 */
async function fetchKeywordHits(query: string): Promise<HybridHit[]> {
  const clean = query.replace(/\s+/g, ' ').trim();
  if (clean.length < 3) return [];
  try {
    const rows = await prisma.$queryRaw<
      { event_id: bigint; score: number }[]
    >`
      SELECT event_id, GREATEST(
        word_similarity(${clean}, title),
        word_similarity(${clean}, COALESCE(ai_summary, ''))
      )::float AS score
      FROM events
      WHERE approval_status = 'approved'
        AND is_deleted = false
        AND phase != 'ended'
        AND (
          word_similarity(${clean}, title) > ${KEYWORD_SIMILARITY_MIN}
          OR word_similarity(${clean}, COALESCE(ai_summary, '')) > ${KEYWORD_SIMILARITY_MIN}
        )
      ORDER BY score DESC
      LIMIT ${KEYWORD_OVERFETCH}
    `;
    return rows.map((r) => ({
      eventId: r.event_id.toString(),
      score: typeof r.score === 'number' ? r.score : Number(r.score),
    }));
  } catch (err) {
    logger.warn({ err }, 'chat: keyword (pg_trgm) hits fetch failed');
    return [];
  }
}

/**
 * Hybrid 검색 (v3.3 — 2026-04-23): Qdrant vector + Postgres pg_trgm keyword 병렬 →
 * eventId 기준 union + max(score) → Prisma resolve (phase != ended + period/specificDate
 * 교집합) → 후보 ≥ 6 + query 비-trivial 이면 LLM rerank → top 5 cap.
 *
 * Vector 는 의미·문맥, keyword 는 고유명사·부분 일치를 보강. 두 score 는 같은 0~1 스케일
 * 이라 max() 로 결합 — 한 쪽에서 강하게 맞으면 그 점수로 올라감.
 *
 * LLM/Qdrant/DB 실패는 fall-through (빈 배열 또는 다른 쪽 결과만 유지).
 */
async function semanticSuggestions(opts: SemanticOpts): Promise<ChatSuggestion[]> {
  if (opts.userTexts.length === 0) return [];
  const query = opts.userTexts.slice(-3).join('\n').slice(0, 500);

  const filter: Record<string, unknown> = {};
  if (opts.filters.eventTypes?.length) filter.categoryCode = opts.filters.eventTypes;
  if (opts.regionIds.length === 1) filter.regionId = opts.regionIds[0];

  // Keyword 쿼리는 마지막 user 발화만 — long concatenation 은 pg_trgm 을 희석.
  const lastUser = opts.userTexts[opts.userTexts.length - 1] ?? '';
  const keywordQuery = lastUser.slice(0, KEYWORD_QUERY_MAX);

  const [vectorHits, keywordHitsArr] = await Promise.all([
    fetchVectorHits(query, filter),
    fetchKeywordHits(keywordQuery),
  ]);

  // eventId → combined score. max(vec, trgm) — 두 score 모두 0~1 정규화되어 있음.
  const combinedScore = new Map<string, number>();
  for (const h of vectorHits) combinedScore.set(h.eventId, h.score);
  for (const h of keywordHitsArr) {
    const prev = combinedScore.get(h.eventId) ?? 0;
    if (h.score > prev) combinedScore.set(h.eventId, h.score);
  }
  if (combinedScore.size === 0) return [];

  const eventIds: bigint[] = [];
  for (const k of combinedScore.keys()) {
    try {
      eventIds.push(BigInt(k));
    } catch {
      // ignore
    }
  }
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
      score: combinedScore.get(r.eventId.toString()) ?? 0,
      vibesNames: r.vibeAssignments.map((v) => v.vibe.vibeName),
    }))
    .sort((a, b) => b.score - a.score);

  // Rerank — 후보가 풍부하고 (≥6) query 가 단순 echo 가 아닐 때.
  let reasonById = new Map<string, string>();
  let order: string[] | null = null;
  if (scored.length >= 6 && query.length >= 8) {
    // v3.2 — Article RAG. rerank 입력 후보들에 대해 top 1 매핑 기사 snippet fetch.
    // 기사 없는 후보는 빈 snippet 으로 전달.
    const rerankPool = scored.slice(0, RERANK_INPUT_CAP);
    const articleSnippets = await fetchTopArticleSnippets(
      rerankPool.map((s) => s.eventId),
    );
    try {
      const rerankRes = await fetch(`${env.LLM_SERVICE_URL}/events/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          query,
          top_k: SEMANTIC_DISPLAY_LIMIT,
          candidates: rerankPool.map((s) => ({
            eventId: s.eventId,
            title: s.title,
            phase: s.phase,
            startDate: s.startDate,
            endDate: s.endDate,
            region: s.region.sigunguName ?? s.region.sidoName,
            category: s.category.name,
            vibes: s.vibesNames,
            score: s.score,
            articleSnippet: articleSnippets.get(s.eventId) ?? '',
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

// ----------------------------------------------------------------------------
// v3.2 — Article RAG. rerank 입력 후보에 매핑된 상위 뉴스 기사 snippet 주입.
// ----------------------------------------------------------------------------

// 각 후보 이벤트 당 LLM 에 보낼 기사 snippet 최대 길이.
const ARTICLE_SNIPPET_MAX = 220;

/**
 * eventIds (string) → Map<eventId, snippet>. 매핑 없는 이벤트는 Map 에 없음.
 *
 * 전략:
 * - event_article_mappings.relevanceScore DESC 로 top 1 / event
 * - article.summary 우선, 없으면 contentBody 앞부분 slice
 * - 220자 cap + whitespace 정규화
 *
 * 실패 시 빈 Map 반환 — rerank 는 계속 진행 (snippet 없으면 LLM 이 fallback).
 */
async function fetchTopArticleSnippets(
  eventIdStrs: string[],
): Promise<Map<string, string>> {
  if (eventIdStrs.length === 0) return new Map();
  const eventIds: bigint[] = [];
  for (const s of eventIdStrs) {
    try {
      eventIds.push(BigInt(s));
    } catch {
      // ignore invalid id
    }
  }
  if (eventIds.length === 0) return new Map();

  // eventId 당 최상위 1건만 필요 — Prisma DISTINCT ON 미지원이라 raw 대신
  // relevanceScore desc 로 전체 fetch 후 JS 에서 dedup. 후보 cap 12 → 최악 케이스 ~100행.
  let rows: Array<{
    eventId: bigint;
    relevanceScore: unknown;
    article: { title: string; summary: string | null; contentBody: string | null };
  }> = [];
  try {
    rows = await prisma.eventArticleMapping.findMany({
      where: { eventId: { in: eventIds } },
      orderBy: [{ eventId: 'asc' }, { relevanceScore: 'desc' }],
      select: {
        eventId: true,
        relevanceScore: true,
        article: {
          select: { title: true, summary: true, contentBody: true },
        },
      },
    });
  } catch (err) {
    logger.warn({ err }, 'chat: fetchTopArticleSnippets failed');
    return new Map();
  }

  const out = new Map<string, string>();
  for (const r of rows) {
    const key = r.eventId.toString();
    if (out.has(key)) continue; // eventId 당 최상위 1건만
    const snippet = buildArticleSnippet(r.article);
    if (snippet) out.set(key, snippet);
  }
  return out;
}

function buildArticleSnippet(a: {
  title: string;
  summary: string | null;
  contentBody: string | null;
}): string {
  // title 은 식별·근거에 유용 → 짧게 앞에 붙이고, summary/body 내용을 이어 붙임.
  const body = (a.summary && a.summary.trim()) || (a.contentBody && a.contentBody.trim()) || '';
  if (!body) return '';
  // title 과 body 중복 방지 — body 가 이미 title 로 시작하면 title 생략.
  const titleClean = a.title.trim();
  const base = body.startsWith(titleClean) ? body : `${titleClean} - ${body}`;
  // 공백 정규화 + 길이 cap.
  return base.replace(/\s+/g, ' ').trim().slice(0, ARTICLE_SNIPPET_MAX);
}

// ----------------------------------------------------------------------------
// v3.5 — Grounded followup. referencesLast=true 시 rerank pool 을 직전 제안 목록
// 으로 고정. vector/keyword 재검색 skip — 사용자가 같은 후보 집합 안에서 좁히거나
// 재정렬하려는 의도이므로.
// ----------------------------------------------------------------------------

interface GroundedOpts {
  lastSuggestions: ClientLastSuggestion[];
  userTexts: string[];
  filters: LlmFilters;
  specificDate: string | null;
}

async function groundedRerank(opts: GroundedOpts): Promise<ChatSuggestion[]> {
  if (opts.lastSuggestions.length === 0) return [];
  const eventIds: bigint[] = [];
  for (const s of opts.lastSuggestions) {
    try {
      eventIds.push(BigInt(s.eventId));
    } catch {
      // ignore invalid id
    }
  }
  if (eventIds.length === 0) return [];

  // specificDate 우선, 없으면 periodKey. 직전 제안이더라도 사용자가 "그 중 이번 주말만"
  // 같이 좁히면 기간 필터 적용.
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
      vibeAssignments: { select: { vibe: { select: { vibeName: true } } } },
    },
  });

  if (rows.length === 0) return [];

  // 원래 client 가 보낸 순서를 기본 order 로 — rerank 가 다시 섞음.
  const originalOrder = new Map(opts.lastSuggestions.map((s, i) => [s.eventId, i]));
  const scored = rows
    .map((r) => ({
      eventId: r.eventId.toString(),
      title: r.title,
      phase: r.phase,
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate.toISOString().slice(0, 10),
      region: { sidoName: r.region.sidoName, sigunguName: r.region.sigunguName },
      category: { code: r.category.categoryCode, name: r.category.displayName },
      posterImageUrl: r.posterImageUrl,
      // original index 를 descending score 로 변환 (앞쪽이 높은 점수) — LLM rerank 가 덮어씀.
      score: 1 - (originalOrder.get(r.eventId.toString()) ?? 0) / Math.max(1, opts.lastSuggestions.length),
      vibesNames: r.vibeAssignments.map((v) => v.vibe.vibeName),
    }))
    .sort((a, b) => b.score - a.score);

  // rerank query 는 사용자 turn 전체 history 반영 — 직전 제안 기반이라도 의도 변화 반영해야.
  const query = opts.userTexts.slice(-3).join('\n').slice(0, 500);
  const articleSnippets = await fetchTopArticleSnippets(scored.map((s) => s.eventId));

  let reasonById = new Map<string, string>();
  let order: string[] | null = null;
  if (scored.length >= 2 && query.length >= 4) {
    try {
      const rerankRes = await fetch(`${env.LLM_SERVICE_URL}/events/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          query,
          top_k: SEMANTIC_DISPLAY_LIMIT,
          candidates: scored.map((s) => ({
            eventId: s.eventId,
            title: s.title,
            phase: s.phase,
            startDate: s.startDate,
            endDate: s.endDate,
            region: s.region.sigunguName ?? s.region.sidoName,
            category: s.category.name,
            vibes: s.vibesNames,
            score: s.score,
            articleSnippet: articleSnippets.get(s.eventId) ?? '',
          })),
        }),
      });
      if (rerankRes.ok) {
        const rj = (await rerankRes.json()) as { ranked?: LlmRerankItem[] };
        order = (rj.ranked ?? []).map((r) => r.eventId);
        reasonById = new Map((rj.ranked ?? []).map((r) => [r.eventId, r.reason]));
      }
    } catch (err) {
      logger.warn({ err }, 'chat: grounded rerank failed — fall back to original order');
    }
  }

  const byId = new Map(scored.map((s) => [s.eventId, s]));
  const finalOrder = order && order.length > 0
    ? order.map((id) => byId.get(id)).filter((s): s is (typeof scored)[number] => Boolean(s))
    : scored.slice(0, SEMANTIC_DISPLAY_LIMIT);

  return finalOrder.slice(0, SEMANTIC_DISPLAY_LIMIT).map((s) => ({
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

// ============================================================================
// POST /chat/stream — SSE 스트림 버전.
// ============================================================================

/**
 * 이벤트:
 *   reply_delta   {text: string}             # LLM 이 생성 중인 reply 텍스트 증분
 *   meta          {filters, specificDate, followups, reply}
 *   suggestions   {items: ChatSuggestion[]}  # semantic + rerank 결과
 *   reply_override {text, followups}         # retreat 발동 시 reply 교체
 *   done          {}
 *   error         {message}
 *
 * 흐름:
 *   1. LLM /chat/stream proxy — reply_delta 이벤트는 즉시 client 로 relay.
 *   2. meta 수신 → regionIds / vibeIds resolve + semantic + rerank 병렬 시작.
 *   3. suggestions 확정 → 이벤트 emit. 0건이면 compose-retreat 호출 → reply_override.
 *   4. done.
 */
export async function postChatStream(req: Request, res: Response) {
  const val = validateChatBody(req.body);
  if (!val.ok) {
    res.status(400).json({ error: 'invalid_chat_body', reason: val.reason });
    return;
  }

  const auth = (req as Partial<AuthenticatedRequest>).auth;
  const userId = auth?.userId ?? null;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // 즉시 header flush — 클라이언트가 빨리 readable stream open.
  res.flushHeaders?.();

  const emit = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let userSignals: Record<string, unknown> | null = null;
  if (userId) {
    try {
      userSignals = await buildUserSignals(userId);
    } catch (err) {
      logger.warn({ err, userId: userId.toString() }, 'chat/stream: buildUserSignals failed');
    }
  }

  const userTexts = val.body.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text.trim())
    .filter((t) => t.length > 0);
  const lastUser = userTexts[userTexts.length - 1] ?? '';

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(`${env.LLM_SERVICE_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        messages: val.body.messages,
        ...(userSignals ? { user_signals: userSignals } : {}),
        ...(val.body.lastSuggestions.length > 0
          ? { last_suggestions: val.body.lastSuggestions }
          : {}),
      }),
    });
  } catch (err) {
    logger.error({ err }, 'chat/stream: llm fetch failed');
    emit('error', { message: 'llm_service_unreachable' });
    emit('done', {});
    res.end();
    return;
  }

  if (!upstream.ok || !upstream.body) {
    emit('error', { message: `llm_upstream_${upstream.status}` });
    emit('done', {});
    res.end();
    return;
  }

  let metaPayload: {
    filters: LlmFilters;
    specificDate: string | null;
    followups: string[];
    reply: string;
    referencesLast: boolean;
  } | null = null;

  const aborted = { value: false };
  req.on('close', () => {
    aborted.value = true;
  });

  try {
    for await (const evt of parseSse(upstream.body)) {
      if (aborted.value) break;
      if (evt.event === 'reply_delta') {
        res.write(`event: reply_delta\ndata: ${evt.data}\n\n`);
      } else if (evt.event === 'meta') {
        try {
          const parsed = JSON.parse(evt.data) as {
            filters: LlmFilters;
            specificDate: string | null;
            followups?: string[];
            reply?: string;
            referencesLast?: boolean;
          };
          metaPayload = {
            filters: parsed.filters,
            specificDate: parsed.specificDate ?? null,
            followups: parsed.followups ?? [],
            reply: parsed.reply ?? '',
            referencesLast: parsed.referencesLast === true,
          };
        } catch (err) {
          logger.warn({ err }, 'chat/stream: meta parse failed');
        }
      } else if (evt.event === 'error') {
        res.write(`event: error\ndata: ${evt.data}\n\n`);
      }
      // 'done' 은 upstream 종료 신호 — 자체 처리하지 않고 for-await 가 끝나길 기다림.
    }
  } catch (err) {
    logger.error({ err }, 'chat/stream: upstream read failed');
    emit('error', { message: 'upstream_read_failed' });
  }

  if (!metaPayload) {
    emit('done', {});
    res.end();
    return;
  }

  // meta 기반 regionIds / vibeIds resolve + semantic + rerank.
  const hints = metaPayload.filters.regionHints ?? [];
  const vibeNames = metaPayload.filters.vibes ?? [];

  let regionIds: string[] = [];
  if (hints.length > 0) {
    const rows = await prisma.region.findMany({
      where: { sigunguName: { in: hints }, dongName: null },
      select: { regionId: true },
    });
    regionIds = rows.map((r) => r.regionId.toString());
  }

  let vibeIds: string[] = [];
  if (vibeNames.length > 0) {
    const rows = await prisma.eventVibe.findMany({
      where: { vibeName: { in: vibeNames }, isActive: true },
      select: { vibeId: true },
    });
    vibeIds = rows.map((r) => r.vibeId.toString());
  }

  // v3.5 — grounded followup: LLM 이 직전 제안을 가리킨다고 판단 + 클라이언트가
  // last_suggestions 를 보냈으면 hybrid 검색 skip 하고 해당 pool 에서만 rerank.
  const useGrounded =
    metaPayload.referencesLast === true && val.body.lastSuggestions.length > 0;

  // meta 이벤트는 regionIds / vibeIds 를 붙여서 재-emit (기존 /chat 응답과 동형).
  emit('meta', {
    reply: metaPayload.reply,
    filters: {
      ...metaPayload.filters,
      regionIds,
      vibeIds,
    },
    specificDate: metaPayload.specificDate,
    followups: metaPayload.followups.slice(0, 3),
    referencesLast: useGrounded,
  });

  let suggestions: ChatSuggestion[] = [];
  try {
    suggestions = useGrounded
      ? await groundedRerank({
          lastSuggestions: val.body.lastSuggestions,
          userTexts,
          filters: metaPayload.filters,
          specificDate: metaPayload.specificDate,
        })
      : await semanticSuggestions({
          userTexts,
          filters: metaPayload.filters,
          specificDate: metaPayload.specificDate,
          regionIds,
        });
  } catch (err) {
    logger.warn({ err }, 'chat/stream: semantic failed');
  }
  emit('suggestions', { items: suggestions });

  if (suggestions.length <= RETREAT_THRESHOLD && userTexts.length > 0 && !useGrounded) {
    try {
      const retreat = await composeRetreat({
        userText: lastUser,
        filters: metaPayload.filters,
        sqlCount: 0,
        semanticCount: 0,
      });
      if (retreat.reply) {
        emit('reply_override', {
          text: retreat.reply,
          followups: retreat.followups.slice(0, 3),
        });
      }
    } catch (err) {
      logger.warn({ err }, 'chat/stream: compose-retreat failed');
    }
  }

  emit('done', {});
  res.end();
}

// ----------------------------------------------------------------------------
// SSE 파서 — undici ReadableStream<Uint8Array> → async iterable of {event,data}.
// ----------------------------------------------------------------------------
async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string; data: string }> {
  const decoder = new TextDecoder('utf-8');
  const reader = body.getReader();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE 이벤트는 빈 줄(\n\n) 로 구분.
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
        if (dataLines.length > 0) {
          yield { event, data: dataLines.join('\n') };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
