import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Header } from '../../layout/Header.js';
import { Avatar } from 'seed-design/ui/avatar';
import { ActionButton } from 'seed-design/ui/action-button';
import * as Dialog from 'seed-design/ui/dialog';
import { useChatRoom } from '../../lib/socket.js';
import { useCurrentUser } from '../../lib/auth-context.js';
import {
  getChatRoomMessages,
  getMyChatRooms,
  selectRoomEvent,
  proposeAppointment,
  leaveRoom,
  blockUser,
  instantKick,
  startKickVote,
  voteAppointment,
  type ChatRoomSummaryOut,
  type ChatRoomMessageOut,
  type AppointmentOut,
} from '../../lib/api/match.js';
import { fetchEvents, fetchEventDetail, type BffEventItem, type BffEventDetail } from '../../lib/api/events.js';
import { ReportModal } from '../../components/ReportModal.js';

/**
 * ChatRoomPage — 실시간 채팅방 (와이어 9-4/9-5/9-17/9-19, A_805).
 *
 * GG-ROOM-002: 참여자 Avatar 목록
 * GG-ROOM-003/004/005/006: 축제 선택 박스 + 주관처 연락처 + 요약 팝업
 * GG-ROOM-007/008: 메시지 입력창 (텍스트/이미지/스티커 placeholder)
 * GG-ROOM-013~018: "같이 가자" 약속 팝업
 * GG-ROOM-021: 약속 확정 시 메이트 추천 블라인드 + 안내문구
 * GG-MATE-017/018: 방장 즉시강퇴 + 강퇴투표
 */
export function ChatRoomPage() {
  const { chatRoomId } = useParams<{ chatRoomId: string }>();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const id = chatRoomId ?? '';

  // ── 채팅방 메타 로드 ──
  const [room, setRoom] = useState<ChatRoomSummaryOut | null>(null);
  const [initMessages, setInitMessages] = useState<ChatRoomMessageOut[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([getMyChatRooms(), getChatRoomMessages(id)])
      .then(([rooms, page]) => {
        if (!mounted) return;
        const found = rooms.find((r) => r.chatRoomId === id) ?? null;
        setRoom(found);
        setInitMessages(page.messages.slice().reverse()); // DB는 최신순 → 역순
      })
      .catch(() => {
        if (mounted) setLoadErr('채팅방을 불러오지 못했어요.');
      });
    return () => { mounted = false; };
  }, [id]);

  // ── 실시간 소켓 훅 ──
  const { messages: liveMessages, members, appointment, send, leave } = useChatRoom(id);

  // initMessages + liveMessages 합치기 (중복 제거: messageId 기준)
  const allMessages: ChatRoomMessageOut[] = (() => {
    const seen = new Set<string>();
    return [...initMessages, ...liveMessages].filter((m) => {
      if (seen.has(m.messageId)) return false;
      seen.add(m.messageId);
      return true;
    });
  })();

  // ── UI 상태 ──
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [eventBoxOpen, setEventBoxOpen] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 메시지 오면 스크롤 맨 아래로
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages.length]);

  const isOwner = user ? (room?.ownerUserId === user.userId || members.find((m) => m.userId === user.userId)?.role === 'owner') : false;
  const myUserId = user?.userId ?? '';

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    send({ type: 'text', body: trimmed });
    setText('');
  };

  const handleLeave = async () => {
    leave();
    try {
      await leaveRoom(id);
    } catch {
      // ignore
    }
    void navigate('/community');
  };

  if (loadErr) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg)">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="mb-4 text-(--color-text-muted)">{loadErr}</p>
            <ActionButton variant="neutralOutline" size="medium" onClick={() => void navigate('/community')}>
              커뮤니티로 돌아가기
            </ActionButton>
          </div>
        </div>
      </div>
    );
  }

  const appointmentConfirmed = appointment?.status === 'confirmed';

  // 표시할 멤버 목록 — 소켓에서 최신 값이 있으면 사용, 아니면 room.members 사용
  const displayMembers = members.length > 0 ? members : (room?.members ?? []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />

      {/* ── 채팅방 콘텐츠 ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* 좌측: 참여자 Avatar 목록 (GG-ROOM-002) */}
        <aside className="hidden w-[72px] shrink-0 flex-col items-center gap-3 border-r border-(--color-border) bg-(--color-surface) py-4 md:flex">
          {displayMembers.map((m) => (
            <div key={m.userId} className="flex flex-col items-center gap-1">
              <div className="relative">
                <Avatar
                  fallback={m.nickname.slice(0, 1)}
                  size="42"
                  aria-label={`${m.nickname}${m.role === 'owner' ? ' (방장)' : ''}`}
                />
                {m.role === 'owner' && (
                  <span
                    className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-(--color-accent) text-[9px] text-white"
                    aria-label="방장"
                  >
                    ★
                  </span>
                )}
              </div>
              <span className="max-w-[60px] truncate text-center text-[10px] text-(--color-text-muted)">
                {m.nickname}
              </span>
            </div>
          ))}
        </aside>

        {/* 중앙: 메인 채팅 영역 */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* 채팅방 헤더 바 */}
          <div className="flex items-center justify-between border-b border-(--color-border) bg-(--color-surface) px-4 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void navigate('/community')}
                className="text-[20px] text-(--color-text-muted) hover:text-(--color-text)"
                aria-label="뒤로 가기"
              >
                &#8592;
              </button>
              <span className="text-[15px] font-semibold">
                {room?.roomType === '1:1' ? '1:1 채팅' : `그룹 채팅 (${displayMembers.length}명)`}
              </span>
            </div>
            {/* 우측: 이벤트 선택 + 햄버거 */}
            <div className="flex items-center gap-2">
              {/* 축제 정하기 박스 (GG-ROOM-004) */}
              <button
                type="button"
                onClick={() => setEventBoxOpen(true)}
                className="hidden items-center gap-1.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-3 py-1.5 text-[13px] text-(--color-text-muted) transition-colors hover:border-(--color-border-hover) hover:text-(--color-text) sm:flex"
                aria-label="축제 정하기"
              >
                {room?.eventId ? '축제 선택됨' : '축제 정하기'}
              </button>
              {/* 약속 버튼 (GG-ROOM-013) */}
              <button
                type="button"
                onClick={() => setAppointmentOpen(true)}
                disabled={appointmentConfirmed}
                className="hidden items-center gap-1.5 rounded-(--radius-md) border border-(--color-accent)/40 bg-(--color-accent)/5 px-3 py-1.5 text-[13px] font-medium text-(--color-accent) transition-colors hover:bg-(--color-accent)/10 disabled:cursor-not-allowed disabled:opacity-40 sm:flex"
                aria-label="같이 가자 — 약속 제안"
              >
                같이 가자
              </button>
              {/* 햄버거 메뉴 */}
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-(--radius-md) text-(--color-text-muted) hover:bg-(--color-surface-alt) hover:text-(--color-text)"
                aria-label="채팅방 메뉴"
              >
                &#9776;
              </button>
            </div>
          </div>

          {/* 약속 확정 안내 배너 (GG-ROOM-021) */}
          {appointmentConfirmed && (
            <div className="flex items-center gap-2 border-b border-(--color-border) bg-(--color-accent)/5 px-4 py-2 text-[13px] text-(--color-accent)">
              <span aria-hidden>&#10003;</span>
              <span>
                약속이 확정됐어요!{' '}
                {appointment?.appointedAt
                  ? new Date(appointment.appointedAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : ''}
              </span>
            </div>
          )}

          {/* 메이트 추천 위젯 (GG-ROOM-021: 약속 확정 시 blind) */}
          {!appointmentConfirmed && (
            <div
              className="flex items-center gap-2 border-b border-(--color-border) bg-(--color-surface-alt) px-4 py-2 text-[12px] text-(--color-text-muted)"
              aria-label="메이트 추천"
            >
              <span aria-hidden>&#9733;</span>
              <span>이 채팅방에 어울리는 메이트를 추천해 드려요.</span>
              {/* Slice 4 에서 실제 추천 목록 연결 예정 (A_802 메이트 추천 API) */}
            </div>
          )}

          {/* 메시지 목록 */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4"
            aria-label="채팅 메시지 목록"
            aria-live="polite"
            aria-relevant="additions"
          >
            {allMessages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <p className="text-[14px] text-(--color-text-muted)">
                  첫 메시지를 보내서 대화를 시작해 보세요!
                </p>
              </div>
            )}
            <div className="flex flex-col gap-3">
              {allMessages.map((msg) => (
                <MessageBubble key={msg.messageId} msg={msg} myUserId={myUserId} />
              ))}
            </div>
          </div>

          {/* 하단: 메시지 입력창 (GG-ROOM-007/008) */}
          <div className="border-t border-(--color-border) bg-(--color-surface) px-4 py-3">
            {/* 모바일: 축제/약속 버튼 */}
            <div className="mb-2 flex gap-2 sm:hidden">
              <button
                type="button"
                onClick={() => setEventBoxOpen(true)}
                className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[12px] text-(--color-text-muted)"
              >
                축제 정하기
              </button>
              <button
                type="button"
                onClick={() => setAppointmentOpen(true)}
                disabled={appointmentConfirmed}
                className="rounded-(--radius-md) border border-(--color-accent)/40 px-3 py-1.5 text-[12px] text-(--color-accent) disabled:opacity-40"
              >
                같이 가자
              </button>
            </div>
            <div className="flex gap-2">
              {/*
               * GG-ROOM-008: 이미지 업로드 + 스티커 팔레트.
               * Slice 4 (A_808) 에서 구현 예정:
               *   - 이미지: uploads.ts uploadFile() → S3 URL → socket.emit('room:message', { type:'image', attachmentUrl })
               *   - 스티커: SEED BottomSheet 기반 팔레트 UI → socket.emit('room:message', { type:'sticker', stickerId })
               * 현재는 disabled placeholder 유지 (기획서 v5.0 범위 외).
               */}
              {/* 이미지 업로드 placeholder (GG-ROOM-008 — Slice 4 예정) */}
              <button
                type="button"
                title="이미지 첨부 (Slice 4 예정)"
                disabled
                aria-label="이미지 첨부 (준비 중)"
                className="flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-(--radius-md) border border-(--color-border) text-(--color-text-subtle) opacity-50"
              >
                &#128247;
              </button>
              {/* 스티커 팔레트 placeholder (GG-ROOM-008 — Slice 4 예정) */}
              <button
                type="button"
                title="스티커 (Slice 4 예정)"
                disabled
                aria-label="스티커 팔레트 (준비 중)"
                className="flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-(--radius-md) border border-(--color-border) text-(--color-text-subtle) opacity-50"
              >
                &#128512;
              </button>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="메시지를 입력하세요"
                aria-label="메시지 입력"
                className="flex-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-3 py-2 text-[14px] text-(--color-text) placeholder:text-(--color-text-subtle) focus:border-(--color-accent) focus:outline-none"
              />
              <ActionButton
                variant="brandSolid"
                size="small"
                onClick={handleSend}
                disabled={!text.trim()}
                aria-label="전송"
              >
                전송
              </ActionButton>
            </div>
          </div>
        </div>
      </div>

      {/* ── 햄버거/방장 메뉴 Dialog (와이어 9-5/9-19) ── */}
      {menuOpen && (
        <MenuDialog
          isOwner={isOwner}
          chatRoomId={id}
          members={displayMembers}
          myUserId={myUserId}
          onClose={() => setMenuOpen(false)}
          onLeave={handleLeave}
          allMessages={allMessages}
        />
      )}

      {/* ── 축제 선택 Dialog (GG-ROOM-004) ── */}
      {eventBoxOpen && (
        <EventSelectDialog
          chatRoomId={id}
          currentEventId={room?.eventId ?? null}
          onClose={() => setEventBoxOpen(false)}
          onSelected={(eventId) => {
            if (room) setRoom({ ...room, eventId });
            setEventBoxOpen(false);
          }}
        />
      )}

      {/* ── 약속 팝업 (GG-ROOM-013~018) ── */}
      {appointmentOpen && (
        <AppointmentDialog
          chatRoomId={id}
          currentAppointment={appointment}
          onClose={() => setAppointmentOpen(false)}
          onProposed={(appt) => {
            setAppointmentOpen(false);
            // 소켓에서 appointment:proposed 이벤트로도 업데이트되나 즉시 반영
            void appt;
          }}
        />
      )}
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────

function MessageBubble({
  msg,
  myUserId,
}: {
  msg: ChatRoomMessageOut;
  myUserId: string;
}) {
  const [reportOpen, setReportOpen] = useState(false);

  if (msg.messageType === 'system') {
    return (
      <div className="my-1 text-center">
        <span className="rounded-full bg-(--color-surface-alt) px-3 py-1 text-[12px] text-(--color-text-muted)">
          {msg.body}
        </span>
      </div>
    );
  }

  const isMe = msg.senderUserId === myUserId;
  // 본인 메시지 또는 시스템 메시지(senderUserId=null)는 신고 불가
  const canReport = !isMe && msg.senderUserId != null;

  return (
    <div className={`group flex items-end gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
      {/* GG-REPORT-001: 타인 메시지 신고 버튼 (hover 시 표시) */}
      {canReport && !isMe && (
        <button
          type="button"
          aria-label="메시지 신고"
          onClick={() => setReportOpen(true)}
          className="invisible shrink-0 rounded-(--radius-sm) border border-(--color-border) px-1.5 py-0.5 text-[10px] text-(--color-text-subtle) opacity-0 transition-opacity hover:text-(--color-text-muted) group-hover:visible group-hover:opacity-100"
        >
          신고
        </button>
      )}
      <div
        className={`max-w-[70%] rounded-(--radius-lg) px-3 py-2 text-[14px] ${
          isMe
            ? 'bg-(--color-accent) text-white'
            : 'bg-(--color-surface) border border-(--color-border) text-(--color-text)'
        }`}
      >
        {msg.messageType === 'text' && <p>{msg.body}</p>}
        {msg.messageType === 'image' && msg.attachmentUrl && (
          <img src={msg.attachmentUrl} alt="첨부 이미지" className="max-w-full rounded" />
        )}
        {msg.messageType === 'sticker' && (
          <span className="text-[32px]" aria-label="스티커">&#128512;</span>
        )}
        <span className="mt-0.5 block text-[10px] opacity-60">
          {new Date(msg.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* GG-REPORT-001: 채팅 메시지 신고 모달 */}
      {canReport && msg.senderUserId != null && (
        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="chat_message"
          targetEntityId={msg.messageId}
          targetUserId={msg.senderUserId}
          onSuccess={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}

// ── MenuDialog (와이어 9-5 일반 / 9-19 방장) ─────────────────

function MenuDialog({
  isOwner,
  chatRoomId,
  members,
  myUserId,
  onClose,
  onLeave,
  allMessages,
}: {
  isOwner: boolean;
  chatRoomId: string;
  members: { userId: string; nickname: string; role: string }[];
  myUserId: string;
  onClose: () => void;
  onLeave: () => void;
  allMessages: ChatRoomMessageOut[];
}) {
  const [kickUsed, setKickUsed] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    messageId: string;
    senderUserId: string;
  } | null>(null);

  const otherMembers = members.filter((m) => m.userId !== myUserId);

  const handleBlock = async (targetUserId: string) => {
    setPending(true);
    setActionErr(null);
    try {
      await blockUser(chatRoomId, targetUserId);
      onClose();
    } catch (e) {
      const msg = (e as Error).message;
      setActionErr(msg === 'ALREADY_BLOCKED' ? '이미 차단한 사용자입니다.' : '차단하지 못했어요.');
    } finally {
      setPending(false);
    }
  };

  const handleInstantKick = async (targetUserId: string) => {
    setPending(true);
    setActionErr(null);
    try {
      await instantKick(chatRoomId, targetUserId);
      setKickUsed(true);
      onClose();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'INSTANT_KICK_USED') {
        setKickUsed(true);
        setActionErr('즉시강퇴 권한을 이미 사용했어요.');
      } else {
        setActionErr('강퇴하지 못했어요.');
      }
    } finally {
      setPending(false);
    }
  };

  const handleKickVote = async (targetUserId: string) => {
    setPending(true);
    setActionErr(null);
    try {
      await startKickVote(chatRoomId, targetUserId);
      onClose();
    } catch (e) {
      const msg = (e as Error).message;
      setActionErr(msg === 'VOTE_ALREADY_ACTIVE' ? '이미 강퇴 투표가 진행 중입니다.' : '투표를 시작하지 못했어요.');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content className="w-[320px] max-w-[92vw]">
          <Dialog.Header>
            <Dialog.Title>{isOwner ? '방장 메뉴' : '채팅방 메뉴'}</Dialog.Title>
          </Dialog.Header>

          <div className="flex flex-col gap-2 px-5 pb-3">
            {actionErr && (
              <p role="alert" className="text-[13px] text-(--color-error)">{actionErr}</p>
            )}

            {/* 방장 메뉴: 멤버별 액션 (7-4 스펙: 즉시강퇴 + 강퇴투표 + 차단 + 신고placeholder) */}
            {isOwner && otherMembers.length > 0 && (
              <div className="mb-2">
                <p className="mb-2 text-[12px] font-medium text-(--color-text-muted)">멤버 관리</p>
                {otherMembers.map((m) => (
                  <div key={m.userId} className="mb-2 rounded-(--radius-md) bg-(--color-surface-alt) p-3">
                    <span className="mb-2 block text-[14px] font-medium">{m.nickname}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {/* 즉시강퇴 (GG-MATE-017) */}
                      <button
                        type="button"
                        onClick={() => { void handleInstantKick(m.userId); }}
                        disabled={kickUsed || pending}
                        className="rounded-(--radius-md) border border-(--color-error)/40 px-2 py-1 text-[12px] text-(--color-error) disabled:cursor-not-allowed disabled:opacity-40"
                        title={kickUsed ? '1회 권한 소진' : '즉시강퇴'}
                      >
                        {kickUsed ? '권한 소진' : '즉시강퇴'}
                      </button>
                      {/* 강퇴투표 (GG-MATE-018) */}
                      <button
                        type="button"
                        onClick={() => { void handleKickVote(m.userId); }}
                        disabled={pending}
                        className="rounded-(--radius-md) border border-(--color-border) px-2 py-1 text-[12px] text-(--color-text-muted) disabled:opacity-40"
                      >
                        강퇴투표
                      </button>
                      {/* 차단하기 (7-4 스펙: 방장도 차단 가능) */}
                      <button
                        type="button"
                        onClick={() => { void handleBlock(m.userId); }}
                        disabled={pending}
                        className="rounded-(--radius-md) border border-(--color-error)/40 px-2 py-1 text-[12px] text-(--color-error) disabled:opacity-40"
                      >
                        차단하기
                      </button>
                      {/* GG-REPORT-001: 신고 — 최근 메시지 신고 (chat_message surface) */}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          // 해당 멤버의 가장 최근 메시지 찾기
                          const lastMsg = [...allMessages]
                            .reverse()
                            .find((msg) => msg.senderUserId === m.userId && msg.messageType !== 'system');
                          if (!lastMsg) {
                            setActionErr('신고할 메시지가 없습니다.');
                            return;
                          }
                          setReportTarget({ messageId: lastMsg.messageId, senderUserId: m.userId });
                        }}
                        className="rounded-(--radius-md) border border-(--color-border) px-2 py-1 text-[12px] text-(--color-text-muted) disabled:opacity-40"
                      >
                        신고
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 일반 멤버: 차단 */}
            {!isOwner && otherMembers.length > 0 && (
              <div className="mb-2">
                <p className="mb-2 text-[12px] font-medium text-(--color-text-muted)">멤버 관리</p>
                {otherMembers.map((m) => (
                  <div key={m.userId} className="mb-2 flex items-center justify-between gap-2 rounded-(--radius-md) bg-(--color-surface-alt) p-3">
                    <span className="text-[14px] font-medium">{m.nickname}</span>
                    <button
                      type="button"
                      onClick={() => { void handleBlock(m.userId); }}
                      disabled={pending}
                      className="rounded-(--radius-md) border border-(--color-error)/40 px-2 py-1 text-[12px] text-(--color-error) disabled:opacity-40"
                    >
                      차단하기
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Dialog.Footer>
            <ActionButton
              variant="neutralOutline"
              size="medium"
              onClick={onClose}
              disabled={pending}
            >
              닫기
            </ActionButton>
            {/* 나가기 */}
            <ActionButton
              variant="neutralSolid"
              size="medium"
              onClick={() => { void onLeave(); }}
              disabled={pending}
            >
              나가기
            </ActionButton>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>

    {/* GG-REPORT-001: 채팅 메시지 신고 모달 (MenuDialog 내 신고 버튼에서 열림) */}
    {reportTarget && (
      <ReportModal
        open
        onClose={() => setReportTarget(null)}
        targetType="chat_message"
        targetEntityId={reportTarget.messageId}
        targetUserId={reportTarget.senderUserId}
        onSuccess={() => { setReportTarget(null); onClose(); }}
      />
    )}
    </>
  );
}

// ── EventSelectDialog (GG-ROOM-004/005/006) ──────────────────
// 이름 검색 → 결과 목록 선택 → 요약 팝업 → 상세이동

function EventSelectDialog({
  chatRoomId,
  currentEventId,
  onClose,
  onSelected,
}: {
  chatRoomId: string;
  currentEventId: string | null;
  onClose: () => void;
  onSelected: (eventId: string) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BffEventItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<BffEventItem | null>(null);
  // GG-ROOM-003: 요약 팝업에서 표시할 이벤트 상세 (organizer 포함)
  const [selectedDetail, setSelectedDetail] = useState<BffEventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // GG-ROOM-004: BFF에 search 파라미터 전달 — 서버 사이드 제목 필터 (4111건 대응)
  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setErr(null);
    try {
      const resp = await fetchEvents({ page: 1, limit: 20, search: q });
      setSearchResults(resp.items);
      if (resp.items.length === 0) setErr('검색 결과가 없어요. 다른 키워드를 시도해 보세요.');
    } catch {
      setErr('이벤트 목록을 불러오지 못했어요.');
    } finally {
      setSearching(false);
    }
  };

  // GG-ROOM-003: 이벤트 선택 시 상세 정보(organizer) 함께 로드
  const handleOpenSummary = async (ev: BffEventItem) => {
    setSelectedEvent(ev);
    setDetailLoading(true);
    setSummaryOpen(true);
    setErr(null);
    try {
      const detail = await fetchEventDetail(ev.eventId);
      setSelectedDetail(detail);
    } catch {
      // detail 로드 실패해도 기본 정보로 팝업 유지
      setSelectedDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectEvent = async (ev: BffEventItem) => {
    setPending(true);
    setErr(null);
    try {
      await selectRoomEvent(chatRoomId, ev.eventId);
      onSelected(ev.eventId);
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg === 'EVENT_NOT_FOUND' ? '해당 이벤트를 찾을 수 없어요.' : '이벤트를 선택하지 못했어요.');
      setPending(false);
    }
  };

  // 선택된 이벤트 요약 팝업 (GG-ROOM-005/006/GG-ROOM-003)
  if (summaryOpen && selectedEvent) {
    const organizer = selectedDetail?.organizer ?? null;
    return (
      <Dialog.Root open onOpenChange={(open) => { if (!open) setSummaryOpen(false); }}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content className="w-[340px] max-w-[92vw]">
            <Dialog.Header>
              <Dialog.Title>{selectedEvent.title}</Dialog.Title>
              <Dialog.Description>
                {selectedEvent.region.sidoName} {selectedEvent.region.sigunguName ?? ''}
                {' · '}
                {selectedEvent.startDate} ~ {selectedEvent.endDate}
              </Dialog.Description>
            </Dialog.Header>
            <div className="flex flex-col gap-2 px-5 pb-3">
              {/* GG-ROOM-003: 주관처 정보 — 업로더 이벤트는 organizer 표시, 크롤 이벤트는 없음 안내 */}
              {detailLoading ? (
                <p className="text-[12px] text-(--color-text-muted)">주관처 정보 불러오는 중...</p>
              ) : organizer ? (
                <div className="rounded-(--radius-md) bg-(--color-surface-alt) p-2.5 text-[12px]">
                  <p className="font-medium text-(--color-text)">{organizer.name}</p>
                  {organizer.phone && (
                    <p className="mt-0.5 text-(--color-text-muted)">연락처: {organizer.phone}</p>
                  )}
                  {organizer.email && (
                    <p className="mt-0.5 text-(--color-text-muted)">이메일: {organizer.email}</p>
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-(--color-text-muted)">주관처 정보 없음 (크롤 이벤트)</p>
              )}
              {err && <p role="alert" className="text-[13px] text-(--color-error)">{err}</p>}
            </div>
            <Dialog.Footer>
              <ActionButton
                variant="neutralOutline"
                size="medium"
                onClick={() => setSummaryOpen(false)}
                disabled={pending}
              >
                뒤로
              </ActionButton>
              {/* GG-ROOM-006: 상세 보기 → /events/:id */}
              <ActionButton
                variant="neutralSolid"
                size="medium"
                onClick={() => {
                  onClose();
                  void navigate(`/events/${selectedEvent.eventId}`);
                }}
                disabled={pending}
              >
                상세 보기
              </ActionButton>
              <ActionButton
                variant="brandSolid"
                size="medium"
                onClick={() => { void handleSelectEvent(selectedEvent); }}
                loading={pending}
                disabled={pending}
              >
                이 축제로 정하기
              </ActionButton>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    );
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content className="w-[360px] max-w-[92vw]">
          <Dialog.Header>
            <Dialog.Title>같이 갈 축제 정하기</Dialog.Title>
            <Dialog.Description>
              축제 이름으로 검색해 채팅방에 연결하세요. (GG-ROOM-004)
            </Dialog.Description>
          </Dialog.Header>

          <div className="flex flex-col gap-3 px-5 pb-3">
            {/* 검색 입력 */}
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); }}
                placeholder="축제 이름 입력"
                aria-label="축제 이름 검색"
                className="flex-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-3 py-2 text-[14px] focus:border-(--color-accent) focus:outline-none"
              />
              <ActionButton
                variant="neutralOutline"
                size="small"
                onClick={() => { void handleSearch(); }}
                loading={searching}
                disabled={searching || !query.trim()}
              >
                검색
              </ActionButton>
            </div>

            {/* 현재 선택된 축제 안내 */}
            {currentEventId && searchResults.length === 0 && (
              <p className="text-[12px] text-(--color-text-muted)">
                현재 선택된 축제 ID: {currentEventId}
              </p>
            )}

            {/* 검색 결과 목록 */}
            {searchResults.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto rounded-(--radius-md) border border-(--color-border)">
                {searchResults.map((ev) => (
                  <button
                    key={ev.eventId}
                    type="button"
                    onClick={() => { void handleOpenSummary(ev); }}
                    className="flex w-full flex-col gap-0.5 border-b border-(--color-border) px-3 py-2 text-left last:border-b-0 hover:bg-(--color-surface-alt)"
                  >
                    <span className="text-[14px] font-medium text-(--color-text)">{ev.title}</span>
                    <span className="text-[12px] text-(--color-text-muted)">
                      {ev.region.sidoName} · {ev.startDate}~{ev.endDate}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {err && <p role="alert" className="text-[13px] text-(--color-error)">{err}</p>}
          </div>

          <Dialog.Footer>
            <ActionButton variant="neutralOutline" size="medium" onClick={onClose} disabled={pending}>
              닫기
            </ActionButton>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}

// ── AppointmentDialog (GG-ROOM-013~018) ──────────────────────

function AppointmentDialog({
  chatRoomId,
  currentAppointment,
  onClose,
  onProposed,
}: {
  chatRoomId: string;
  currentAppointment: AppointmentOut | null;
  onClose: () => void;
  onProposed: (appt: AppointmentOut) => void;
}) {
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [eventName, setEventName] = useState('');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 약속 투표 액션
  const [votePending, setVotePending] = useState(false);

  // 역제안용 날짜/시간 입력 (GG-ROOM-016)
  const [counterDateStr, setCounterDateStr] = useState('');
  const [counterTimeStr, setCounterTimeStr] = useState('');

  const canVote =
    currentAppointment &&
    (currentAppointment.status === 'proposed' || currentAppointment.status === 'counter_proposed');

  const handlePropose = async () => {
    if (!dateStr || !timeStr) {
      setErr('날짜와 시간을 입력해 주세요.');
      return;
    }
    const appointedAt = new Date(`${dateStr}T${timeStr}`);
    if (isNaN(appointedAt.getTime())) {
      setErr('올바른 날짜/시간을 입력해 주세요.');
      return;
    }
    setPending(true);
    setErr(null);
    try {
      const appt = await proposeAppointment(chatRoomId, {
        appointedAt: appointedAt.toISOString(),
        ...(eventName.trim() ? { eventName: eventName.trim() } : {}),
      });
      onProposed(appt);
    } catch {
      setErr('약속을 제안하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setPending(false);
    }
  };

  const handleVote = async (vote: 'agree' | 'reject' | 'counter', counterAt?: string) => {
    if (!currentAppointment) return;
    setVotePending(true);
    setErr(null);
    try {
      await voteAppointment(chatRoomId, currentAppointment.appointmentId, {
        vote,
        ...(counterAt ? { counterAt } : {}),
      });
      onClose();
    } catch {
      setErr('투표하지 못했어요.');
    } finally {
      setVotePending(false);
    }
  };

  const handleCounter = () => {
    if (!counterDateStr || !counterTimeStr) {
      setErr('역제안할 날짜와 시간을 입력해 주세요.');
      return;
    }
    const counterAt = new Date(`${counterDateStr}T${counterTimeStr}`);
    if (isNaN(counterAt.getTime())) {
      setErr('올바른 날짜/시간을 입력해 주세요.');
      return;
    }
    void handleVote('counter', counterAt.toISOString());
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content className="w-[360px] max-w-[92vw]">
          <Dialog.Header>
            <Dialog.Title>같이 가자 — 약속 제안</Dialog.Title>
            {canVote && (
              <Dialog.Description>
                제안된 약속이 있어요. 동의하거나 역제안할 수 있어요.
              </Dialog.Description>
            )}
          </Dialog.Header>

          <div className="flex flex-col gap-3 px-5 pb-3">
            {/* 현재 약속 표시 + 투표 액션 */}
            {currentAppointment && canVote && (
              <div className="rounded-(--radius-md) bg-(--color-surface-alt) p-3">
                <p className="text-[13px] font-medium">제안된 약속</p>
                <p className="mt-1 text-[14px]">
                  {currentAppointment.appointedAt
                    ? new Date(currentAppointment.appointedAt).toLocaleString('ko-KR')
                    : '-'}
                </p>
                {currentAppointment.eventName && (
                  <p className="mt-0.5 text-[13px] text-(--color-text-muted)">{currentAppointment.eventName}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <ActionButton
                    variant="brandSolid"
                    size="small"
                    onClick={() => { void handleVote('agree'); }}
                    loading={votePending}
                    disabled={votePending}
                  >
                    동의
                  </ActionButton>
                  <ActionButton
                    variant="neutralOutline"
                    size="small"
                    onClick={() => { void handleVote('reject'); }}
                    disabled={votePending}
                  >
                    거절
                  </ActionButton>
                </div>
              </div>
            )}

            {/* 역제안 입력 폼 (GG-ROOM-016) — canVote 상태에서만 표시 */}
            {canVote && (
              <div className="rounded-(--radius-md) border border-(--color-border) p-3">
                <p className="mb-2 text-[13px] font-medium text-(--color-text-muted)">역제안 날짜/시간</p>
                <div className="flex gap-2">
                  <input
                    id="counter-date"
                    type="date"
                    value={counterDateStr}
                    onChange={(e) => setCounterDateStr(e.target.value)}
                    aria-label="역제안 날짜"
                    className="flex-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-2 py-1.5 text-[13px] focus:border-(--color-accent) focus:outline-none"
                  />
                  <input
                    id="counter-time"
                    type="time"
                    value={counterTimeStr}
                    onChange={(e) => setCounterTimeStr(e.target.value)}
                    aria-label="역제안 시간"
                    className="w-[100px] rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-2 py-1.5 text-[13px] focus:border-(--color-accent) focus:outline-none"
                  />
                </div>
                <ActionButton
                  variant="neutralSolid"
                  size="small"
                  onClick={handleCounter}
                  loading={votePending}
                  disabled={votePending || !counterDateStr || !counterTimeStr}
                  className="mt-2 w-full"
                >
                  역제안하기
                </ActionButton>
              </div>
            )}

            {/* 신규 약속 제안 폼 */}
            {!canVote && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="appt-date" className="text-[13px] font-medium">날짜</label>
                  <input
                    id="appt-date"
                    type="date"
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-3 py-2 text-[14px] focus:border-(--color-accent) focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="appt-time" className="text-[13px] font-medium">시간</label>
                  <input
                    id="appt-time"
                    type="time"
                    value={timeStr}
                    onChange={(e) => setTimeStr(e.target.value)}
                    className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-3 py-2 text-[14px] focus:border-(--color-accent) focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="appt-event-name" className="text-[13px] font-medium">
                    축제 이름 (선택)
                  </label>
                  <input
                    id="appt-event-name"
                    type="text"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="예: 2026 서울 벚꽃 축제"
                    className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-3 py-2 text-[14px] focus:border-(--color-accent) focus:outline-none"
                  />
                </div>
              </>
            )}

            {err && <p role="alert" className="text-[13px] text-(--color-error)">{err}</p>}
          </div>

          <Dialog.Footer>
            <ActionButton variant="neutralOutline" size="medium" onClick={onClose} disabled={pending || votePending}>
              닫기
            </ActionButton>
            {!canVote && (
              <ActionButton
                variant="brandSolid"
                size="medium"
                onClick={() => { void handlePropose(); }}
                loading={pending}
                disabled={pending}
              >
                약속 제안하기
              </ActionButton>
            )}
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}

