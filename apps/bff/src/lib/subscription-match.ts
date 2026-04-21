import { prisma } from '../prisma.js';
import { logger } from '../logger.js';

/**
 * A_203 구독 매칭 — 이벤트가 approved 상태가 될 때 호출.
 *
 * 매칭 규칙 (각 축 독립 AND):
 *  - regionIds 비어있으면 skip, 있으면 event.regionId 포함 여부
 *  - eventTypes 비어있으면 skip, 있으면 event.category.categoryCode 포함
 *  - companions 비어있으면 skip, 있으면 event.expected_companion_primary/secondary
 *    중 하나라도 교집합
 *  - vibeIds 비어있으면 skip, 있으면 event.vibe_assignments 교집합 ≥ 1
 *  - periodMonths NULL 이면 skip, 있으면 event.start_date <= now + N months
 *
 * isActive = false 구독은 제외.
 *
 * 중복 방지 (ADR 0001 §3 후속):
 *   1. 같은 user 의 여러 구독이 매칭되면 1건만 전송 (in-run userId dedup).
 *   2. 이미 같은 (user, event) notification 이 DB 에 있으면 skip (cross-run dedup).
 *   → 한 user + 한 event 당 평생 최대 1건 알림.
 *
 * 비동기 호출: 관리자 승인 응답 빠르게 두고 fire-and-forget.
 */

export async function notifyMatchingSubscribers(eventId: bigint): Promise<void> {
  try {
    const event = await prisma.event.findUnique({
      where: { eventId },
      select: {
        eventId: true,
        title: true,
        regionId: true,
        startDate: true,
        expectedCompanionPrimary: true,
        expectedCompanionSecondary: true,
        category: { select: { categoryCode: true } },
        vibeAssignments: { select: { vibeId: true } },
      },
    });
    if (!event) return;

    const eventVibeIds = new Set(event.vibeAssignments.map((v) => v.vibeId.toString()));
    const eventCompanions = new Set(
      [event.expectedCompanionPrimary, event.expectedCompanionSecondary].filter(
        (v): v is string => !!v,
      ),
    );

    const subs = await prisma.eventSubscription.findMany({
      where: { isActive: true },
      select: {
        subscriptionId: true,
        userId: true,
        regionIds: true,
        companions: true,
        eventTypes: true,
        vibeIds: true,
        periodMonths: true,
      },
    });

    const now = new Date();
    const matches = subs.filter((s) => {
      if (s.regionIds.length > 0 && !s.regionIds.some((r) => r === event.regionId)) return false;
      if (s.eventTypes.length > 0 && !s.eventTypes.includes(event.category.categoryCode)) return false;
      if (s.companions.length > 0 && !s.companions.some((c) => eventCompanions.has(c))) return false;
      if (s.vibeIds.length > 0 && !s.vibeIds.some((v) => eventVibeIds.has(v.toString()))) return false;
      if (s.periodMonths != null) {
        const cutoff = new Date(now);
        cutoff.setMonth(cutoff.getMonth() + s.periodMonths);
        if (event.startDate > cutoff) return false;
      }
      return true;
    });

    if (matches.length === 0) return;

    // 1단계 dedup — 같은 user 의 여러 구독 매치를 1건으로 묶는다.
    const uniqueUserIds = new Map<string, bigint>();
    for (const m of matches) uniqueUserIds.set(m.userId.toString(), m.userId);

    // 2단계 dedup — 이미 같은 (user, event) notification 이 있으면 skip.
    const existing = await prisma.notification.findMany({
      where: {
        eventId,
        userId: { in: [...uniqueUserIds.values()] },
      },
      select: { userId: true },
    });
    const existingUserIds = new Set(existing.map((n) => n.userId.toString()));
    const targetUserIds = [...uniqueUserIds.entries()]
      .filter(([id]) => !existingUserIds.has(id))
      .map(([, userId]) => userId);
    if (targetUserIds.length === 0) return;

    const rows = targetUserIds.map((userId) => ({
      userId,
      eventId: event.eventId,
      title: '새 이벤트 알림',
      message: `구독 조건에 맞는 새 이벤트가 등록됐어요: ${event.title}`,
      scheduledAt: now,
      isSent: true,
      sentAt: now,
    }));
    const result = await prisma.notification.createMany({ data: rows });
    logger.info(
      { eventId: event.eventId.toString(), notifications: result.count },
      'subscription-match: notifications created',
    );
  } catch (err) {
    logger.warn({ err, eventId: eventId.toString() }, 'subscription-match: failed (best-effort)');
  }
}
