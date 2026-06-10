/**
 * seed-chat-test.ts — 대상 계정(suj4861/예찬)을 "채팅 가능한 상태"로 연결하는 시드.
 *
 * 대상: suj4861@gmail.com (auth_provider 'google'). 상대는 seed-mate-test 의 더미 후보 재사용.
 * 생성:
 *   - 1:1 채팅방  예찬 ↔ 메이트테스트A  (active) + 약속 '제안(proposed)' 상태 + 메시지
 *   - 그룹 채팅방 예찬(방장) + 메이트테스트B·C·D (active) + 메시지
 *
 * ⚠️ 설계 메모(mate.ts getMateEngagementState): 예찬이 활성 채팅방 멤버가 되면
 *    GET /community/mate/recommendations 는 후보 목록 대신 'chatting' 단계 상태를 반환한다.
 *    (요구사항: 메이트 관계 진입 시 추천 목록 블라인드)
 *
 * 실행:  cd apps/bff && npx dotenv -e ../../.env -- tsx src/jobs/seed-chat-test.ts
 * 정리:  ... tsx src/jobs/seed-chat-test.ts clean   (채팅방만 제거, 메이트 프로필/추천 데이터는 보존)
 */
import { prisma } from '../prisma.js';

const TARGET_PROVIDER = 'google';
const TARGET_SOCIAL_UID = '104250056155439846865';

// 채팅 상대 (seed-mate-test 후보 재사용). A=1:1, B·C·D=그룹.
const PARTNER_UIDS = {
  a: 'mate_test_1', // 메이트테스트A
  b: 'mate_test_2', // 메이트테스트B
  c: 'mate_test_3', // 메이트테스트C
  d: 'mate_test_4', // 메이트테스트D
};

async function findTarget() {
  const byUid = await prisma.user.findUnique({
    where: { authProvider_socialUid: { authProvider: TARGET_PROVIDER, socialUid: TARGET_SOCIAL_UID } },
    select: { userId: true, nickname: true },
  });
  if (byUid) return byUid;
  return prisma.user.findFirst({ where: { authProvider: TARGET_PROVIDER, isDeleted: false }, select: { userId: true, nickname: true } });
}

// 채팅방 정리 — "상대(dev 더미)" 가 멤버인 방만 스코프 → 대상의 다른(실제) 방은 건드리지 않음.
async function cleanByPartners(partnerIds: bigint[]) {
  const rooms = await prisma.groupMembership.findMany({ where: { userId: { in: partnerIds } }, select: { chatRoomId: true } });
  const roomIds = [...new Set(rooms.map((r) => r.chatRoomId.toString()))].map((s) => BigInt(s));
  if (!roomIds.length) return 0;
  const appts = await prisma.appointment.findMany({ where: { chatRoomId: { in: roomIds } }, select: { appointmentId: true } });
  const apptIds = appts.map((a) => a.appointmentId);
  if (apptIds.length) {
    await prisma.mateEvaluation.deleteMany({ where: { appointmentId: { in: apptIds } } });
    await prisma.appointmentVote.deleteMany({ where: { appointmentId: { in: apptIds } } });
    await prisma.appointment.deleteMany({ where: { appointmentId: { in: apptIds } } });
  }
  await prisma.chatRoomMessage.deleteMany({ where: { chatRoomId: { in: roomIds } } });
  await prisma.groupMembership.deleteMany({ where: { chatRoomId: { in: roomIds } } });
  await prisma.matchRequest.deleteMany({ where: { chatRoomId: { in: roomIds } } });
  await prisma.chatRoom.deleteMany({ where: { chatRoomId: { in: roomIds } } });
  return roomIds.length;
}

async function main() {
  const mode = process.argv[2];

  const target = await findTarget();
  if (!target) {
    console.error(`대상 계정(${TARGET_PROVIDER}/${TARGET_SOCIAL_UID})을 찾지 못했습니다. 먼저 한 번 로그인하세요.`);
    await prisma.$disconnect();
    return;
  }

  const partners = await prisma.user.findMany({
    where: { authProvider: 'dev', socialUid: { in: Object.values(PARTNER_UIDS) } },
    select: { userId: true, socialUid: true, nickname: true },
  });
  const bySuid = new Map(partners.map((p) => [p.socialUid, p]));
  const partnerIds = partners.map((p) => p.userId);

  // 항상 이전 채팅-테스트 방을 먼저 정리 (idempotent)
  const removed = await cleanByPartners(partnerIds);

  if (mode === 'clean') {
    console.log(`CLEANED ${removed} chat-test 방 (메이트 프로필/추천 데이터는 보존)`);
    await prisma.$disconnect();
    return;
  }

  const A = bySuid.get(PARTNER_UIDS.a);
  const B = bySuid.get(PARTNER_UIDS.b);
  const C = bySuid.get(PARTNER_UIDS.c);
  const D = bySuid.get(PARTNER_UIDS.d);
  if (!A || !B || !C || !D) {
    console.error('메이트테스트 후보(mate_test_1~4)가 없습니다. 먼저 seed-mate-test 를 실행하세요.');
    await prisma.$disconnect();
    return;
  }

  // 대상이 선택한 축제(있으면) — 약속/방 eventId 용
  const myProfile = await prisma.mateProfile.findUnique({
    where: { userId: target.userId },
    select: { selectedEventId: true },
  });
  const ev = myProfile?.selectedEventId
    ? await prisma.event.findUnique({ where: { eventId: myProfile.selectedEventId }, select: { eventId: true, title: true } })
    : await prisma.event.findFirst({ where: { isDeleted: false, approvalStatus: 'approved' }, orderBy: { startDate: 'asc' }, select: { eventId: true, title: true } });

  const T = target.userId;
  const now = Date.now();
  const msg = (chatRoomId: bigint, sender: bigint | null, body: string, offsetMin: number, type = 'text') =>
    prisma.chatRoomMessage.create({ data: { chatRoomId, senderUserId: sender, messageType: type, body, createdAt: new Date(now - offsetMin * 60000) } });

  // ── 1:1 채팅방 (예찬 ↔ 메이트테스트A) + 제안 상태 약속 ──
  const room1 = await prisma.chatRoom.create({ data: { roomType: '1:1', maxMembers: 2, status: 'active', ownerUserId: null, eventId: ev?.eventId ?? null }, select: { chatRoomId: true } });
  await prisma.groupMembership.createMany({ data: [
    { chatRoomId: room1.chatRoomId, userId: T, role: 'member', memberStatus: 'active' },
    { chatRoomId: room1.chatRoomId, userId: A.userId, role: 'member', memberStatus: 'active' },
  ]});
  await msg(room1.chatRoomId, null, '채팅방이 시작되었습니다', 60, 'system');
  await msg(room1.chatRoomId, A.userId, '안녕하세요! 같이 가실 분 찾고 있었어요 :)', 50);
  await msg(room1.chatRoomId, T, '반가워요! 저도요. 언제 가실 생각이세요?', 48);
  await msg(room1.chatRoomId, A.userId, '이번 주말 오후 어떠세요?', 45);
  const appt = await prisma.appointment.create({ data: { chatRoomId: room1.chatRoomId, proposerUserId: A.userId, eventName: ev?.title ?? '데모 축제', eventId: ev?.eventId ?? null, appointedAt: new Date(now + 3 * 86400000), status: 'proposed', expiresAt: new Date(now + 36 * 3600000) }, select: { appointmentId: true } });
  await prisma.appointmentVote.createMany({ data: [
    { appointmentId: appt.appointmentId, userId: T, vote: 'pending' },
    { appointmentId: appt.appointmentId, userId: A.userId, vote: 'agree' },
  ]});
  await msg(room1.chatRoomId, null, '약속이 제안되었습니다', 44, 'system');

  // ── 그룹 채팅방 (예찬=방장 + B·C·D) ──
  const room2 = await prisma.chatRoom.create({ data: { roomType: 'group', maxMembers: 4, status: 'active', ownerUserId: T, eventId: ev?.eventId ?? null }, select: { chatRoomId: true } });
  await prisma.groupMembership.createMany({ data: [
    { chatRoomId: room2.chatRoomId, userId: T, role: 'owner', memberStatus: 'active' },
    { chatRoomId: room2.chatRoomId, userId: B.userId, role: 'member', memberStatus: 'active' },
    { chatRoomId: room2.chatRoomId, userId: C.userId, role: 'member', memberStatus: 'active' },
    { chatRoomId: room2.chatRoomId, userId: D.userId, role: 'member', memberStatus: 'active' },
  ]});
  await msg(room2.chatRoomId, null, '그룹 채팅방이 시작되었습니다', 30, 'system');
  await msg(room2.chatRoomId, B.userId, '다들 안녕하세요~ 4명 모였네요!', 25);
  await msg(room2.chatRoomId, C.userId, '반갑습니다 :)', 23);
  await msg(room2.chatRoomId, T, '제가 방장이에요. 축제 정하고 약속 잡아봐요!', 20);

  console.log('───────────────────────────────────────────');
  console.log(`대상       : ${target.nickname} (userId=${T})`);
  console.log(`연결 축제   : ${ev ? `[${ev.eventId}] ${ev.title}` : '없음'}`);
  console.log(`1:1 방      : chatRoomId=${room1.chatRoomId}  ↔ ${A.nickname}  (약속 '제안' 대기)`);
  console.log(`그룹 방     : chatRoomId=${room2.chatRoomId}  방장=${target.nickname} + ${B.nickname}·${C.nickname}·${D.nickname}`);
  console.log('확인: 앱에서 suj4861 로 로그인 → /chat/rooms 에 위 2개 방이 보여야 함.');
  console.log('주의: 활성 채팅방 진입으로 메이트 추천 목록은 \'chatting\' 단계로 블라인드됨(설계대로).');
  console.log('───────────────────────────────────────────');
  await prisma.$disconnect();
}
void main();
