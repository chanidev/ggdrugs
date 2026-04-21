import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

/**
 * A_203 조건 기반 신규 이벤트 알림 구독.
 *
 * 사용자가 현재 필터 5종 스냅샷을 저장 → 새 이벤트가 승인될 때 매칭되면 알림.
 * 빈 배열 = 해당 축 무시 (match-all).
 *
 *   GET    /me/subscriptions
 *   POST   /me/subscriptions              body: {regionIds, companions, eventTypes, vibeIds, periodMonths}
 *   PATCH  /me/subscriptions/:id          body: {isActive}
 *   DELETE /me/subscriptions/:id
 */

const COMPANION_VALS = new Set(['solo', 'couple', 'friend', 'family']);
const EVENT_TYPE_VALS = new Set([
  'festival',
  'expo',
  'symposium',
  'conference',
  'exhibition',
  'performance',
  'education',
  'movie',
]);
const MAX_SUBS_PER_USER = 20;

function parseBigIntArray(raw: unknown): bigint[] | { error: string } {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return { error: 'bigint 배열 필요' };
  const out: bigint[] = [];
  for (const x of raw) {
    try {
      const n = typeof x === 'bigint' ? x : BigInt(typeof x === 'number' ? Math.trunc(x) : String(x));
      if (n > 0n) out.push(n);
    } catch {
      return { error: `invalid bigint: ${String(x)}` };
    }
  }
  // dedup
  return [...new Set(out.map(String))].map(BigInt);
}

function parseStringArray(raw: unknown, allowed: Set<string>): string[] | { error: string } {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return { error: '문자열 배열 필요' };
  const out = new Set<string>();
  for (const x of raw) {
    if (typeof x !== 'string') return { error: 'invalid string' };
    if (!allowed.has(x)) return { error: `허용 외 값: ${x}` };
    out.add(x);
  }
  return [...out];
}

function shape(s: {
  subscriptionId: bigint;
  regionIds: bigint[];
  companions: string[];
  eventTypes: string[];
  vibeIds: bigint[];
  periodMonths: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    subscriptionId: s.subscriptionId.toString(),
    regionIds: s.regionIds.map((n) => n.toString()),
    companions: s.companions,
    eventTypes: s.eventTypes,
    vibeIds: s.vibeIds.map((n) => n.toString()),
    periodMonths: s.periodMonths,
    isActive: s.isActive,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export async function listMySubscriptions(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const rows = await prisma.eventSubscription.findMany({
    where: { userId: auth.userId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    select: {
      subscriptionId: true,
      regionIds: true,
      companions: true,
      eventTypes: true,
      vibeIds: true,
      periodMonths: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json({ items: rows.map(shape) });
}

export async function createSubscription(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const b = req.body ?? {};

  const regionIdsRes = parseBigIntArray(b.regionIds);
  if (!Array.isArray(regionIdsRes)) {
    res.status(400).json({ error: `regionIds: ${regionIdsRes.error}` });
    return;
  }
  const companionsRes = parseStringArray(b.companions, COMPANION_VALS);
  if (!Array.isArray(companionsRes)) {
    res.status(400).json({ error: `companions: ${companionsRes.error}` });
    return;
  }
  const eventTypesRes = parseStringArray(b.eventTypes, EVENT_TYPE_VALS);
  if (!Array.isArray(eventTypesRes)) {
    res.status(400).json({ error: `eventTypes: ${eventTypesRes.error}` });
    return;
  }
  const vibeIdsRes = parseBigIntArray(b.vibeIds);
  if (!Array.isArray(vibeIdsRes)) {
    res.status(400).json({ error: `vibeIds: ${vibeIdsRes.error}` });
    return;
  }
  let periodMonths: number | null = null;
  if (b.periodMonths != null) {
    const n = typeof b.periodMonths === 'number' ? b.periodMonths : Number.parseInt(String(b.periodMonths), 10);
    if (!Number.isInteger(n) || n < 1 || n > 24) {
      res.status(400).json({ error: 'periodMonths 는 1~24 또는 null' });
      return;
    }
    periodMonths = n;
  }

  const count = await prisma.eventSubscription.count({ where: { userId: auth.userId } });
  if (count >= MAX_SUBS_PER_USER) {
    res.status(409).json({ error: `구독은 사용자당 최대 ${MAX_SUBS_PER_USER}개` });
    return;
  }

  const created = await prisma.eventSubscription.create({
    data: {
      userId: auth.userId,
      regionIds: regionIdsRes,
      companions: companionsRes,
      eventTypes: eventTypesRes,
      vibeIds: vibeIdsRes,
      periodMonths,
      isActive: true,
    },
    select: {
      subscriptionId: true,
      regionIds: true,
      companions: true,
      eventTypes: true,
      vibeIds: true,
      periodMonths: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.status(201).json({ subscription: shape(created) });
}

export async function toggleSubscription(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const idStr = typeof req.params.id === 'string' ? req.params.id : '';
  let subId: bigint;
  try {
    subId = BigInt(idStr);
    if (subId <= 0n) throw new Error('bad');
  } catch {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const existing = await prisma.eventSubscription.findUnique({
    where: { subscriptionId: subId },
    select: { userId: true },
  });
  if (!existing || existing.userId !== auth.userId) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const nextActive = (req.body ?? {}).isActive;
  if (typeof nextActive !== 'boolean') {
    res.status(400).json({ error: 'isActive (boolean) 필요' });
    return;
  }
  const updated = await prisma.eventSubscription.update({
    where: { subscriptionId: subId },
    data: { isActive: nextActive },
    select: {
      subscriptionId: true,
      regionIds: true,
      companions: true,
      eventTypes: true,
      vibeIds: true,
      periodMonths: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json({ subscription: shape(updated) });
}

export async function deleteSubscription(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  const idStr = typeof req.params.id === 'string' ? req.params.id : '';
  let subId: bigint;
  try {
    subId = BigInt(idStr);
    if (subId <= 0n) throw new Error('bad');
  } catch {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const existing = await prisma.eventSubscription.findUnique({
    where: { subscriptionId: subId },
    select: { userId: true },
  });
  if (!existing || existing.userId !== auth.userId) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  await prisma.eventSubscription.delete({ where: { subscriptionId: subId } });
  res.json({ ok: true });
}
