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
              {/* 이미지 업로드 placeholder (GG-ROOM-008) */}
              <button
                type="button"
                title="이미지 첨부 (준비 중)"
                disabled
                aria-label="이미지 첨부 (준비 중)"
                className="flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-(--radius-md) border border-(--color-border) text-(--color-text-subtle) opacity-50"
              >
                &#128247;
              </button>
              {/* 스티커 placeholder (GG-ROOM-008) */}
              <button
                type="button"
                title="스티커 (준비 중)"
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

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
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
}: {
  isOwner: boolean;
  chatRoomId: string;
  members: { userId: string; nickname: string; role: string }[];
  myUserId: string;
  onClose: () => void;
  onLeave: () => void;
}) {
  const [kickUsed, setKickUsed] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

            {/* 방장 메뉴: 멤버별 액션 */}
            {isOwner && otherMembers.length > 0 && (
              <div className="mb-2">
                <p className="mb-2 text-[12px] font-medium text-(--color-text-muted)">멤버 관리</p>
                {otherMembers.map((m) => (
                  <div key={m.userId} className="mb-2 flex items-center justify-between gap-2 rounded-(--radius-md) bg-(--color-surface-alt) p-3">
                    <span className="text-[14px] font-medium">{m.nickname}</span>
                    <div className="flex gap-1.5">
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
  );
}

// ── EventSelectDialog (GG-ROOM-004) ──────────────────────────

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
  const [inputEventId, setInputEventId] = useState(currentEventId ?? '');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSelect = async () => {
    if (!inputEventId.trim()) {
      setErr('이벤트 ID를 입력해 주세요.');
      return;
    }
    setPending(true);
    setErr(null);
    try {
      await selectRoomEvent(chatRoomId, inputEventId.trim());
      onSelected(inputEventId.trim());
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg === 'EVENT_NOT_FOUND' ? '해당 이벤트를 찾을 수 없어요.' : '이벤트를 선택하지 못했어요.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content className="w-[340px] max-w-[92vw]">
          <Dialog.Header>
            <Dialog.Title>같이 갈 축제 정하기</Dialog.Title>
            <Dialog.Description>
              이벤트 ID를 입력하면 채팅방에 축제 정보가 연결돼요. (GG-ROOM-004)
            </Dialog.Description>
          </Dialog.Header>

          <div className="flex flex-col gap-3 px-5 pb-3">
            <label htmlFor="event-id-input" className="text-[13px] font-medium">
              이벤트 ID
            </label>
            <input
              id="event-id-input"
              type="text"
              value={inputEventId}
              onChange={(e) => setInputEventId(e.target.value)}
              placeholder="이벤트 ID 입력"
              className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-3 py-2 text-[14px] focus:border-(--color-accent) focus:outline-none"
            />
            {/* 주관처 연락처 (GG-ROOM-003 placeholder) */}
            {currentEventId && (
              <p className="text-[12px] text-(--color-text-muted)">
                현재 선택된 축제 ID: {currentEventId}
                {/* GG-ROOM-003: 슬라이스4에서 주관처 연락처 실구현 */}
              </p>
            )}
            {err && <p role="alert" className="text-[13px] text-(--color-error)">{err}</p>}
          </div>

          <Dialog.Footer>
            <ActionButton variant="neutralOutline" size="medium" onClick={onClose} disabled={pending}>
              취소
            </ActionButton>
            <ActionButton
              variant="brandSolid"
              size="medium"
              onClick={() => { void handleSelect(); }}
              loading={pending}
              disabled={pending}
            >
              선택하기
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
            {/* 현재 약속 표시 */}
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
                  {/* 역제안 (GG-ROOM-016): 현재는 새 날짜 입력 후 counter */}
                </div>
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
            <ActionButton variant="neutralOutline" size="medium" onClick={onClose} disabled={pending}>
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

