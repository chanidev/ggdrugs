import { env } from '../env.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { Prisma } from '@prisma/client';

/**
 * 이벤트 → Qdrant alle-events collection embedding 파이프라인.
 *
 * Why: Chat / 검색이 단순 필터 매퍼를 넘어 의미 기반 검색을 하려면 이벤트의 title +
 * aiSummary 를 Qdrant 에 올려둬야 한다. services/llm /embed 로 1536d 임베딩 생성,
 * /events/upsert 로 Qdrant 저장. 임베딩은 배치(최대 256) 로 호출.
 *
 * 페이로드 (Qdrant point 에 함께 저장):
 *   title, phase, startDate (epoch ms), endDate, regionId, categoryCode, vibeIds, approvedAt
 *
 * Modes:
 *   default      — 최신 N 건 (기본 200)
 *   --all        — approved 이벤트 전체
 *   --missing    — aiSummary 가 있지만 아직 embed 안 된 이벤트만 (Qdrant scroll 로 판별)
 */

const BATCH_EMBED = 64; // /embed 한 번 호출에 포함되는 텍스트 수
const BATCH_UPSERT = 128; // /events/upsert 한 번 호출에 포함되는 포인트 수

export interface EmbedEventsResult {
  eventsConsidered: number;
  embedded: number;
  upserted: number;
  skipped: number;
  errors: number;
}

const log = logger.child({ job: 'embed-events' });

interface EventForEmbed {
  eventId: bigint;
  title: string;
  description: string | null;
  aiSummary: string | null;
  phase: string;
  startDate: Date;
  endDate: Date;
  regionId: bigint;
  approvedAt: Date | null;
  category: { categoryCode: string };
  vibeAssignments: { vibeId: bigint }[];
}

function buildEmbedText(e: EventForEmbed): string {
  // 우선순위: aiSummary > description > title only. 모두 합쳐서 컨텍스트 풍부화.
  const parts = [e.title];
  if (e.category.categoryCode) parts.push(`분류: ${e.category.categoryCode}`);
  if (e.aiSummary) parts.push(e.aiSummary);
  else if (e.description) parts.push(e.description.slice(0, 1500));
  return parts.join('\n').slice(0, 2000);
}

function buildPayload(e: EventForEmbed) {
  return {
    title: e.title,
    phase: e.phase,
    startDate: e.startDate.toISOString().slice(0, 10),
    endDate: e.endDate.toISOString().slice(0, 10),
    regionId: e.regionId.toString(),
    categoryCode: e.category.categoryCode,
    vibeIds: e.vibeAssignments.map((v) => v.vibeId.toString()),
    approvedAt: e.approvedAt?.toISOString() ?? null,
  };
}

async function fetchExistingIds(): Promise<Set<string>> {
  // Qdrant scroll 대신 services/llm 에 존재 여부 질의하는 엔드포인트가 없으니
  // 전체 상한선이 충분히 작을 때까지는 --missing 시 Qdrant 를 직접 호출한다.
  // 간이: QDRANT_URL 에서 scroll.
  const url = `${env.QDRANT_URL}/collections/alle-events/points/scroll`;
  const existing = new Set<string>();
  let offset: string | number | null = null;
  for (let page = 0; page < 200; page++) {
    const body: Record<string, unknown> = { limit: 1000, with_payload: false, with_vector: false };
    if (offset !== null) body.offset = offset;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      return existing;
    }
    if (!res.ok) return existing;
    const data = (await res.json().catch(() => null)) as {
      result?: { points?: { id: string | number }[]; next_page_offset?: string | number | null };
    } | null;
    const points = data?.result?.points ?? [];
    for (const p of points) existing.add(String(p.id));
    offset = data?.result?.next_page_offset ?? null;
    if (!offset) break;
  }
  return existing;
}

async function callEmbed(texts: string[]): Promise<number[][] | null> {
  const url = `${env.LLM_SERVICE_URL}/embed`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { vectors?: number[][] };
    return data.vectors ?? null;
  } catch {
    return null;
  }
}

async function callUpsert(
  items: { id: number; vector: number[]; payload: Record<string, unknown> }[],
): Promise<number> {
  const url = `${env.LLM_SERVICE_URL}/events/upsert`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { upserted?: number };
    return data.upserted ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Qdrant alle-events 에서 단건/배치 삭제. 승인 취소 · 재제출 · 소프트 삭제에서 호출.
 * 네트워크 실패는 무시 (주기 reconcile 배치가 훗날 재확인).
 */
export async function deleteEventEmbeddings(eventIds: bigint[]): Promise<void> {
  if (eventIds.length === 0) return;
  const url = `${env.LLM_SERVICE_URL}/events/delete`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: eventIds.map((id) => Number(id)) }),
    });
  } catch {
    // no-op
  }
}

export async function runEmbedEvents(
  opts: { eventLimit?: number | 'all'; onlyMissing?: boolean; onlyEventId?: bigint } = {},
): Promise<EmbedEventsResult> {
  const result: EmbedEventsResult = {
    eventsConsidered: 0,
    embedded: 0,
    upserted: 0,
    skipped: 0,
    errors: 0,
  };

  const where: Prisma.EventWhereInput = {
    isDeleted: false,
    approvalStatus: 'approved',
  };
  if (opts.onlyEventId) where.eventId = opts.onlyEventId;

  // onlyEventId 모드는 항상 단건 — take 무시.
  const take: number | undefined = opts.onlyEventId
    ? undefined
    : opts.eventLimit === 'all'
      ? undefined
      : (opts.eventLimit ?? 200);

  const events = (await prisma.event.findMany({
    where,
    orderBy: [{ startDate: 'desc' }],
    ...(take != null ? { take } : {}),
    select: {
      eventId: true,
      title: true,
      description: true,
      aiSummary: true,
      phase: true,
      startDate: true,
      endDate: true,
      regionId: true,
      approvedAt: true,
      category: { select: { categoryCode: true } },
      vibeAssignments: { select: { vibeId: true } },
    },
  })) as EventForEmbed[];

  result.eventsConsidered = events.length;

  let targets = events;
  if (opts.onlyMissing) {
    const existing = await fetchExistingIds();
    targets = events.filter((e) => !existing.has(e.eventId.toString()));
  }
  result.skipped = events.length - targets.length;

  log.info(
    { total: events.length, targets: targets.length, mode: opts.onlyMissing ? 'missing' : 'full' },
    'start',
  );

  // 배치 embed → upsert.
  const pending: { id: number; vector: number[]; payload: Record<string, unknown> }[] = [];

  for (let i = 0; i < targets.length; i += BATCH_EMBED) {
    const chunk = targets.slice(i, i + BATCH_EMBED);
    const texts = chunk.map(buildEmbedText);
    const vectors = await callEmbed(texts);
    if (!vectors || vectors.length !== chunk.length) {
      log.error({ batchStart: i, size: chunk.length }, 'embed failed — abort');
      result.errors += chunk.length;
      break;
    }
    for (let j = 0; j < chunk.length; j++) {
      const e = chunk[j]!;
      pending.push({
        id: Number(e.eventId),
        vector: vectors[j]!,
        payload: buildPayload(e),
      });
      result.embedded += 1;
    }
    // upsert 는 별도 배치 (qdrant 한 호출당 과대 페이로드 방지)
    while (pending.length >= BATCH_UPSERT) {
      const batch = pending.splice(0, BATCH_UPSERT);
      const n = await callUpsert(batch);
      result.upserted += n;
      if (n === 0) {
        log.warn({ batchSize: batch.length }, 'upsert returned 0 — qdrant 불가 가능');
        result.errors += batch.length;
        break;
      }
    }
  }
  if (pending.length > 0) {
    const n = await callUpsert(pending);
    result.upserted += n;
    if (n === 0) {
      log.warn({ batchSize: pending.length }, 'tail upsert returned 0');
      result.errors += pending.length;
    }
  }

  log.info(result, 'done');
  return result;
}
