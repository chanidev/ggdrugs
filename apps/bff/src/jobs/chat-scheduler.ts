/**
 * chat-scheduler.ts — 채팅 타임아웃 백그라운드 워커 (ADR 0007 결정10).
 *
 * Task 6 에서 구현 예정. 현재는 server.ts 가 import 할 수 있도록 스텁만 제공.
 *
 * 타임아웃 정책:
 *   - 1:1 신청: 24h 후 expired
 *   - 그룹 초대: 6h 후 expired
 *   - 강퇴 투표: 36h 미응답 시 동의로 간주
 *   - 약속 제안: 36h 후 rejected 자동
 *   - 미접속 멤버: 48h 후 kicked
 *
 * WARNING: ChatSession(LLM 검색)과 완전 별개. prisma.chatMessage 사용 금지.
 */

import { logger } from '../logger.js';
import { env } from '../env.js';

// Task 6 구현 예정 — 각 핸들러는 개별 setInterval 로 등록
// wrapHandler: handler 에러가 interval 을 멈추지 않도록 보호

export function startChatScheduler(): void {
  if (env.NODE_ENV === 'test') return;
  // TODO(Task 6): expireMatchRequests, resolveExpiredKickVotes, expireAppointments, handleInactiveMembers
  logger.info('chat scheduler stub — Task 6 에서 구현 예정');
}
