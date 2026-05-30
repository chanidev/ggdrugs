/**
 * socket-server.ts — Socket.IO 서버 초기화 + Redis adapter + 인증 미들웨어 + 이벤트 핸들러.
 *
 * 아키텍처:
 *   - pubClient  = getRedisClient()  (singleton, 다른 곳에서 재사용 가능)
 *   - subClient  = pubClient.duplicate()  ← adapter 전용, 외부 재사용 금지
 *   - CORS origin = env.WEB_URL (app.ts ALLOWED_ORIGINS 와 동일 근거)
 *   - 인증: io.use() → extractSession(socket.handshake.headers.cookie, prisma)
 *           미인증 시 next(new Error('unauthenticated')) → 연결 거부
 *   - 접속 직후: socket.join(`user:${userId}`) — 개인 알림 룸
 *
 * 이벤트 계약 (클라이언트 ↔ 서버):
 *   Client → Server:
 *     'room:join'    { chatRoomId: string }
 *     'room:message' { chatRoomId: string; type: MessageType; body?: string; attachmentUrl?: string; stickerId?: string }
 *     'room:leave'   { chatRoomId: string }
 *   Server → Client:
 *     'message'               ChatRoomMessageOut
 *     'room:member_update'    GroupMemberOut[]
 *     'appointment:proposed'  AppointmentOut
 *     'appointment:confirmed' AppointmentOut
 *     'notification'          NotificationOut
 *     'error'                 { code: string; message: string }
 *
 * WARNING: ChatRoom/ChatRoomMessage 는 LLM ChatSession/ChatMessage 와 완전 별개.
 *          이 파일에서 ChatSession / prisma.chatMessage 를 import/사용하지 않는다.
 */

import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'http';
import type Redis from 'ioredis';
import { prisma } from '../prisma.js';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { getRedisClient } from './redis-client.js';
import { extractSession } from './extract-session.js';

// ─── 타입 ───────────────────────────────────────────────────────────────────

type MessageType = 'text' | 'image' | 'sticker' | 'system';

interface RoomJoinPayload {
  chatRoomId: string;
}

interface RoomMessagePayload {
  chatRoomId: string;
  type: MessageType;
  body?: string;
  attachmentUrl?: string;
  stickerId?: string;
}

interface RoomLeavePayload {
  chatRoomId: string;
}

// socket.data 에 인증 정보 저장
declare module 'socket.io' {
  interface SocketData {
    userId: bigint;
    sessionId: string;
  }
}

// ─── 싱글톤 ─────────────────────────────────────────────────────────────────

let _io: SocketServer | null = null;
// subClient 를 모듈 스코프에 보관 — closeSocketServer() 에서 quit 가능하게
let _subClient: Redis | null = null;

export function getSocketServer(): SocketServer {
  if (!_io) throw new Error('Socket.IO server not initialized — call createSocketServer() first');
  return _io;
}

/**
 * Graceful shutdown:
 *   1. io.close() — 열린 WebSocket 연결 전부 종료 (HTTP server.close() 자동 연계 안 됨)
 *   2. subClient.quit() — Redis sub 연결 해제 (pubClient 는 closeRedisClient() 에서 처리)
 *
 * server.ts shutdown 핸들러에서 closeRedisClient() 이전에 호출해야 한다.
 */
export async function closeSocketServer(): Promise<void> {
  if (_io) {
    await new Promise<void>((resolve) => _io!.close(() => resolve()));
    _io = null;
  }
  if (_subClient) {
    await _subClient.quit();
    _subClient = null;
  }
}

// ─── 초기화 ─────────────────────────────────────────────────────────────────

export function createSocketServer(httpServer: HttpServer): SocketServer {
  if (_io) {
    logger.warn('createSocketServer called twice — returning existing instance');
    return _io;
  }

  const pubClient = getRedisClient();
  // subClient 는 adapter 전용 — 외부에서 재사용 금지.
  // 모듈 스코프 _subClient 에 저장해 closeSocketServer() 에서 quit 할 수 있게 함.
  const subClient = pubClient.duplicate();
  _subClient = subClient;

  subClient.on('error', (err) => logger.warn({ err }, 'redis sub client error'));

  const io = new SocketServer(httpServer, {
    cors: {
      origin: env.WEB_URL,
      credentials: true,
    },
    // adapter 는 아래에서 설정
  });

  io.adapter(createAdapter(pubClient, subClient));

  // ─── 인증 미들웨어 ──────────────────────────────────────────────────────
  // extractSession 공유 함수: alle_sid 쿠키 파싱 + isDeleted + expiresAt 체크
  // withCredentials:true (클라이언트) + sameSite 쿠키 전달 필수
  io.use(async (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie;
    try {
      const session = await extractSession(cookieHeader, prisma, false);
      if (!session) {
        next(new Error('unauthenticated'));
        return;
      }
      socket.data.userId = session.userId;
      socket.data.sessionId = session.sessionId;
      next();
    } catch (err) {
      logger.warn({ err }, 'socket auth error');
      next(new Error('unauthenticated'));
    }
  });

  // ─── 연결 핸들러 ────────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const userRoom = `user:${userId.toString()}`;

    // 개인 알림 룸 — 서버에서 직접 push 할 때 사용 (notification, match 수락 등)
    void socket.join(userRoom);

    logger.info({ socketId: socket.id, userId: userId.toString() }, 'socket connected');

    // ── room:join ──────────────────────────────────────────────────────────
    socket.on('room:join', async ({ chatRoomId }: RoomJoinPayload) => {
      try {
        // 멤버십 검증: active 상태인지 확인
        const membership = await prisma.groupMembership.findFirst({
          where: {
            chatRoomId: BigInt(chatRoomId),
            userId,
            memberStatus: 'active',
          },
        });
        if (!membership) {
          socket.emit('error', { code: 'not_member', message: '채팅방 멤버가 아닙니다' });
          return;
        }

        const roomKey = `room:${chatRoomId}`;
        await socket.join(roomKey);

        // lastSeenAt 갱신 (fire-and-forget)
        prisma.groupMembership
          .update({
            where: { membershipId: membership.membershipId },
            data: { lastSeenAt: new Date() },
          })
          .catch((err: unknown) => logger.warn({ err }, 'lastSeenAt update failed'));

        logger.debug({ socketId: socket.id, chatRoomId }, 'room:join');
      } catch (err) {
        logger.warn({ err, chatRoomId }, 'room:join error');
        socket.emit('error', { code: 'join_error', message: '채팅방 참여 중 오류가 발생했습니다' });
      }
    });

    // ── room:message ───────────────────────────────────────────────────────
    socket.on('room:message', async (payload: RoomMessagePayload) => {
      const { chatRoomId, type, body, attachmentUrl, stickerId } = payload;
      try {
        // 멤버십 검증
        const membership = await prisma.groupMembership.findFirst({
          where: {
            chatRoomId: BigInt(chatRoomId),
            userId,
            memberStatus: 'active',
          },
        });
        if (!membership) {
          socket.emit('error', { code: 'not_member', message: '채팅방 멤버가 아닙니다' });
          return;
        }

        // 내용 검증
        if (type === 'text' && !body) {
          socket.emit('error', { code: 'invalid_payload', message: '텍스트 메시지는 body 가 필요합니다' });
          return;
        }
        if (type === 'image' && !attachmentUrl) {
          socket.emit('error', { code: 'invalid_payload', message: '이미지 메시지는 attachmentUrl 이 필요합니다' });
          return;
        }
        if (type === 'sticker' && !stickerId) {
          socket.emit('error', { code: 'invalid_payload', message: '스티커 메시지는 stickerId 가 필요합니다' });
          return;
        }

        // DB 영속
        const message = await prisma.chatRoomMessage.create({
          data: {
            chatRoomId: BigInt(chatRoomId),
            senderUserId: userId,
            messageType: type,
            body: body ?? null,
            attachmentUrl: attachmentUrl ?? null,
            stickerId: stickerId ?? null,
          },
        });

        // lastSeenAt 갱신 (fire-and-forget)
        prisma.groupMembership
          .update({
            where: { membershipId: membership.membershipId },
            data: { lastSeenAt: new Date() },
          })
          .catch((err: unknown) => logger.warn({ err }, 'lastSeenAt update failed on message'));

        // 채팅방 전체 브로드캐스트 (fan-out via Redis adapter)
        const out = {
          messageId: message.messageId.toString(),
          chatRoomId,
          senderUserId: userId.toString(),
          messageType: message.messageType,
          body: message.body ?? null,
          attachmentUrl: message.attachmentUrl ?? null,
          stickerId: message.stickerId ?? null,
          createdAt: message.createdAt.toISOString(),
        };
        io.to(`room:${chatRoomId}`).emit('message', out);

        logger.debug({ chatRoomId, messageId: message.messageId.toString(), type }, 'room:message broadcast');
      } catch (err) {
        logger.warn({ err, chatRoomId }, 'room:message error');
        socket.emit('error', { code: 'message_error', message: '메시지 전송 중 오류가 발생했습니다' });
      }
    });

    // ── room:leave ─────────────────────────────────────────────────────────
    socket.on('room:leave', ({ chatRoomId }: RoomLeavePayload) => {
      void socket.leave(`room:${chatRoomId}`);
      logger.debug({ socketId: socket.id, chatRoomId }, 'room:leave');
    });

    // ── disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, userId: userId.toString(), reason }, 'socket disconnected');
    });
  });

  _io = io;
  logger.info({ origin: env.WEB_URL }, 'Socket.IO server initialized with Redis adapter');
  return io;
}
