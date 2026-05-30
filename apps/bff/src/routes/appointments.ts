/**
 * appointments.ts — GG-MY-002 캘린더용 내 약속 조회
 *
 * GET /me/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 반환: 사용자가 active member인 chatRoom의 confirmed 약속.
 * 마이그레이션 없음 — Appointment 모델 슬라이스3 기존.
 *
 * 참고: Appointment.eventId 또는 ChatRoom.eventId 중 하나로 이벤트 정보를 조인한다.
 * ChatRoom에는 Prisma event 관계가 없으므로 eventId를 직접 수집해 Event 별도 조회한다.
 *
 * 응답 필드 노트:
 *  - event.price: DB 컬럼 admissionFee(String|null) 를 price 이름으로 노출.
 *    DB 컬럼명은 변경하지 않는다.
 *  - event.operatingHours / event.targetAudience: GG-MY-002 AppointmentCard 6항목 충족.
 *  - appointedAt null 처리: 날짜 필터가 없으면 appointedAt IS NULL인 confirmed 약속도 포함.
 */
import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function listMyAppointments(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;

  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);

  // 사용자가 active member인 채팅방 ID 목록
  const memberships = await prisma.groupMembership.findMany({
    where: { userId: auth.userId, memberStatus: 'active' },
    select: { chatRoomId: true },
  });
  const chatRoomIds = memberships.map((m) => m.chatRoomId);

  if (chatRoomIds.length === 0) {
    res.json({ items: [] });
    return;
  }

  // appointedAt 필터:
  //  - from/to가 모두 없으면 기본 범위(과거 90일~미래 180일)를 사용하되,
  //    appointedAt IS NULL인 confirmed 약속도 포함한다(일시 미정 케이스).
  //  - from 또는 to가 있으면 해당 날짜 범위를 적용.
  //    단, appointedAt IS NULL인 경우는 날짜 비교 불가이므로 범위 내에서 제외한다.
  const hasDateFilter = from !== null || to !== null;
  const effectiveFrom = from ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const effectiveTo = to ?? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

  const appointedAtFilter = hasDateFilter
    ? { gte: effectiveFrom, lte: effectiveTo }
    : undefined;

  const appointments = await prisma.appointment.findMany({
    where: {
      chatRoomId: { in: chatRoomIds },
      status: 'confirmed',
      // 날짜 필터 없음: appointedAt 제약 없이 모든 confirmed 반환(null 포함)
      // 날짜 필터 있음: gte/lte 범위 적용(null 제외됨 — Prisma 동작)
      ...(appointedAtFilter !== undefined ? { appointedAt: appointedAtFilter } : {}),
    },
    orderBy: { appointedAt: 'asc' },
    select: {
      appointmentId: true,
      chatRoomId: true,
      eventId: true,
      eventName: true,
      appointedAt: true,
      status: true,
      chatRoom: {
        select: {
          roomType: true,
          eventId: true, // ChatRoom의 연결 이벤트 ID (Appointment.eventId 우선)
        },
      },
    },
  });

  // Appointment.eventId 또는 ChatRoom.eventId 에서 이벤트 ID 수집 후 Event 한 번에 조회
  const eventIdSet = new Set<bigint>();
  for (const a of appointments) {
    const eid = a.eventId ?? a.chatRoom.eventId;
    if (eid != null) eventIdSet.add(eid);
  }

  const eventMap = new Map<
    string,
    {
      eventId: string;
      title: string;
      startDate: string;
      endDate: string;
      region: string | null;
      /** DB 컬럼명은 admissionFee(String). 응답 필드명은 price로 노출. */
      price: string | null;
      operatingHours: string | null;
      targetAudience: string | null;
    }
  >();

  if (eventIdSet.size > 0) {
    const events = await prisma.event.findMany({
      where: { eventId: { in: [...eventIdSet] } },
      select: {
        eventId: true,
        title: true,
        startDate: true,
        endDate: true,
        admissionFee: true,   // → 응답에서 price로 노출
        operatingHours: true,
        targetAudience: true,
        region: {
          select: { sidoName: true, sigunguName: true, fullAddress: true },
        },
      },
    });
    for (const e of events) {
      const regionStr =
        e.region.fullAddress.trim() ||
        [e.region.sidoName, e.region.sigunguName].filter(Boolean).join(' ');
      eventMap.set(e.eventId.toString(), {
        eventId: e.eventId.toString(),
        title: e.title,
        startDate: e.startDate.toISOString().slice(0, 10),
        endDate: e.endDate.toISOString().slice(0, 10),
        region: regionStr || null,
        price: e.admissionFee ?? null,
        operatingHours: e.operatingHours ?? null,
        targetAudience: e.targetAudience ?? null,
      });
    }
  }

  res.json({
    items: appointments.map((a) => {
      const resolvedEventId = a.eventId ?? a.chatRoom.eventId;
      const event = resolvedEventId ? (eventMap.get(resolvedEventId.toString()) ?? null) : null;
      return {
        appointmentId: a.appointmentId.toString(),
        chatRoomId: a.chatRoomId.toString(),
        eventId: event?.eventId ?? null,
        eventName: a.eventName ?? event?.title ?? null,
        appointedAt: a.appointedAt?.toISOString() ?? null,
        status: a.status,
        event: event
          ? {
              eventId: event.eventId,
              title: event.title,
              startDate: event.startDate,
              endDate: event.endDate,
              region: event.region,
              price: event.price,
              operatingHours: event.operatingHours,
              targetAudience: event.targetAudience,
            }
          : null,
      };
    }),
  });
}
