/**
 * socket.ts — Socket.IO 클라이언트 싱글톤 + 채팅방 훅 (A_805 실시간)
 *
 * 싱글톤 패턴: getSocket() 은 이미 연결된 소켓 인스턴스를 반환. 중복 연결 방지.
 * cleanup: useChatRoom useEffect return 에서 room:leave emit + off 필수 (언마운트 누수 방지).
 * beforeunload: window.addEventListener('beforeunload', leaveRoom) 등록.
 */

import { io, type Socket } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';
import type { ChatRoomMessageOut, GroupMemberOut, AppointmentOut } from './api/match.js';

const BFF_URL =
  (import.meta.env.VITE_BFF_URL as string | undefined) ?? '/api';

// ── 싱글톤 소켓 ──────────────────────────────────────────────

let _socket: Socket | null = null;

/**
 * Socket.IO 싱글톤 반환. 미연결이면 새로 연결 후 반환.
 * BFF_URL 기준 (same-origin: '/api' → 현재 origin root).
 */
export function getSocket(): Socket {
  if (!_socket || _socket.disconnected) {
    // same-origin 환경에서 VITE_BFF_URL=/api 이면 origin 을 base 로, path 를 /api/socket.io/ 로 설정.
    const url = BFF_URL.startsWith('/') ? window.location.origin : BFF_URL;
    const path = BFF_URL.startsWith('/') ? `${BFF_URL}/socket.io` : '/socket.io';
    _socket = io(url, {
      path,
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
  }
  return _socket;
}

/**
 * 소켓 연결 해제 + 싱글톤 초기화.
 * 로그아웃, 앱 종료 등 세션 종료 시점에 호출.
 */
export function disconnectSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}

/**
 * 특정 채팅방에서 명시적 퇴장 emit.
 * useChatRoom cleanup 에서 자동 호출됨.
 */
export function emitLeaveRoom(chatRoomId: string): void {
  if (_socket?.connected) {
    _socket.emit('room:leave', { chatRoomId });
  }
}

// ── useChatRoom 훅 ───────────────────────────────────────────

export interface UseChatRoomReturn {
  messages: ChatRoomMessageOut[];
  members: GroupMemberOut[];
  appointment: AppointmentOut | null;
  send: (payload: { type: 'text' | 'image' | 'sticker'; body?: string; attachmentUrl?: string; stickerId?: string }) => void;
  leave: () => void;
  connected: boolean;
}

/**
 * 채팅방 Socket.IO 훅.
 *
 * - mount: socket.emit('room:join', { chatRoomId }) 으로 room 구독.
 * - unmount: room:leave emit + 이벤트 off (누수 방지 필수).
 * - beforeunload: leaveRoom emit.
 */
export function useChatRoom(chatRoomId: string): UseChatRoomReturn {
  const [messages, setMessages] = useState<ChatRoomMessageOut[]>([]);
  const [members, setMembers] = useState<GroupMemberOut[]>([]);
  const [appointment, setAppointment] = useState<AppointmentOut | null>(null);
  const [connected, setConnected] = useState(false);
  const chatRoomIdRef = useRef(chatRoomId);
  chatRoomIdRef.current = chatRoomId;

  useEffect(() => {
    const socket = getSocket();

    function onConnect() {
      setConnected(true);
      socket.emit('room:join', { chatRoomId });
    }

    function onDisconnect() {
      setConnected(false);
    }

    function onMessage(msg: ChatRoomMessageOut) {
      setMessages((prev) => [...prev, msg]);
    }

    function onMemberUpdate(data: { members: GroupMemberOut[] }) {
      setMembers(data.members);
    }

    function onAppointmentProposed(appt: AppointmentOut) {
      setAppointment(appt);
    }

    function onAppointmentConfirmed(appt: AppointmentOut) {
      setAppointment(appt);
    }

    function onAppointmentRejected(appt: AppointmentOut) {
      setAppointment(appt);
    }

    // 이미 연결됐으면 즉시 join
    if (socket.connected) {
      setConnected(true);
      socket.emit('room:join', { chatRoomId });
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('message', onMessage);
    socket.on('room:member_update', onMemberUpdate);
    socket.on('appointment:proposed', onAppointmentProposed);
    socket.on('appointment:confirmed', onAppointmentConfirmed);
    socket.on('appointment:rejected', onAppointmentRejected);

    // beforeunload: 브라우저 탭 닫기 시에도 leave emit
    const handleBeforeUnload = () => {
      emitLeaveRoom(chatRoomIdRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      // cleanup — 언마운트 시 leave emit + off (누수 방지 필수)
      socket.emit('room:leave', { chatRoomId });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('message', onMessage);
      socket.off('room:member_update', onMemberUpdate);
      socket.off('appointment:proposed', onAppointmentProposed);
      socket.off('appointment:confirmed', onAppointmentConfirmed);
      socket.off('appointment:rejected', onAppointmentRejected);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [chatRoomId]);

  const send = (payload: {
    type: 'text' | 'image' | 'sticker';
    body?: string;
    attachmentUrl?: string;
    stickerId?: string;
  }) => {
    const socket = getSocket();
    socket.emit('room:message', { chatRoomId, ...payload });
  };

  const leave = () => {
    emitLeaveRoom(chatRoomId);
  };

  return { messages, members, appointment, send, leave, connected };
}
