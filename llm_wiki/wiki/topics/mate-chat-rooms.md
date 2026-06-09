---
title: 메이트 채팅방 (1:1 · 그룹)
type: topic
created: 2026-06-09
updated: 2026-06-09
related:
  - mate-matching.md
  - appointments-calendar.md
  - mate-evaluation-festival-review.md
  - semantic-search.md
  - db-schema-overview.md
---

# 메이트 채팅방 (1:1 · 그룹)

## Summary

메이트(동행)끼리 실시간으로 대화하는 **영속 채팅방** 서브시스템. 1:1 방(최대 2인)과 그룹 방(최대 4인)을 지원하며, Postgres 영속 + Socket.IO(Redis adapter) 실시간 fan-out 으로 동작한다. 채팅방 안에서 축제 선택(GG-ROOM-004), 약속 제안/투표([appointments-calendar.md](appointments-calendar.md)), 방장 권한(즉시강퇴·투표강퇴), 차단이 이뤄진다.

> **[semantic-search.md](semantic-search.md) 의 LLM 검색챗과 완전 별개다.** 이 페이지의 모델은 `ChatRoom` / `ChatRoomMessage` (Prisma `prisma.chatRoom*`). LLM 이벤트 검색의 `ChatSession` / `ChatMessage` (`prisma.chatMessage`) 와는 **JOIN 도 import 도 하지 않는다** — 모든 관련 파일 상단에 `WARNING: ChatSession / prisma.chatMessage 를 절대 사용하지 않는다` 주석이 박혀 있다. 검색챗은 사용자↔LLM 단일 세션이고, 이 채팅방은 사용자↔사용자 멀티-멤버 영속 방이다.

ADR 0007 결정6(채팅방), 결정10(타임아웃 스케줄러), 결정11(방장 권한), ADR 0010(그룹 배치 식별자) 기반.

## 신청 → 방 생성 흐름 (match-request.ts, A_803/A_804)

채팅방은 직접 만들지 않는다 — **신청(MatchRequest) 을 상대가 수락하는 순간** 생성된다.

- **1:1 신청** `POST /community/match/request/1-to-1` — body `{ receiverUserId }`. 가드: 본인 신청 불가(400), 본인 MateProfile 필수(422 `profile_required`), 수신자 이용정지(409 `target_suspended`), 양방향 차단(409 `blocked`), pending 중복(409 `duplicate_pending`). `expiresAt = now + 24h`.
- **그룹 신청** `POST /community/match/request/group` — body `{ receiverUserIds: string[] }` (최대 3명, 초과 시 422). 각 수신자 `MateProfile.groupApply=true` 필수(422 `group_apply_required`). 기존 active 그룹방이 있으면 `현재멤버수 + 초대수 ≤ 4` 검사(422 `group_capacity_exceeded`). `expiresAt = now + 6h`. **배치당 UUID 1개**(`groupBatchId`)를 발급해 모든 행에 기록(ADR 0010).
- **수락** `PATCH /community/match/request/:id/accept` — receiver 본인 + status='pending' + 미만료(410 `expired`) 확인 후:
  - **1:1**: `ChatRoom(roomType='1:1', maxMembers=2, ownerUserId=null)` + `GroupMembership` 2건(둘 다 `role='member'`) + 시스템 메시지 `'채팅방이 시작되었습니다'`.
  - **그룹**: 같은 `groupBatchId` 의 accepted 방이 있으면 합류(`memberStatus='active'` upsert), 없으면 **최초 수락자가 방장**(`ownerUserId=수락자`, role='owner')으로 새 방 생성. Serializable + P2034 재시도(최대 3회, 20ms 점증 백오프)로 (a)중복 방 생성, (b)정원 초과(409 `group_full`) 경합 차단.
- **거절** `.../reject`, **수신함** `GET /community/match/request/incoming` (receiver=me, pending, 미만료).

ADR 0010 핵심: `existingAccepted` 조회를 `groupBatchId` 로 스코프하지 않으면 한 신청자의 다른 배치 수락자가 엉뚱한 방에 합류한다. `groupBatchId=NULL`(레거시 1:1/구 그룹)은 신청자 단위 폴백.

## 데이터 모델 (prisma/schema.prisma)

- **MatchRequest** `match_requests` — `matchRequestId` · `requesterId` · `receiverId` · `requestType`(`'1:1'|'group'`) · `status`(`pending|accepted|rejected|expired|cancelled`) · `chatRoomId?`(수락 후 채움) · `groupBatchId?`(UUID, 1:1=NULL) · `expiresAt`(1:1=+24h/group=+6h).
- **ChatRoom** `chat_rooms` — `chatRoomId` · `roomType`(`'1:1'|'group'`) · `status`(`'active'|'ended'`) · `maxMembers`(1:1=2/group=4) · `eventId?`(축제 선택) · `ownerUserId?`(그룹 방장만, 1:1=NULL) · `endedAt?`. **ChatRoom↔Event 는 관계 없이 스칼라 `eventId` 만** — 축제명은 id→title 일괄 조회로 매핑.
- **ChatRoomMessage** `chat_room_messages` — `messageId` · `chatRoomId` · `senderUserId?`(NULL=시스템 메시지) · `messageType`(`'text'|'image'|'sticker'|'system'`) · `body?`(≤1000자) · `attachmentUrl?`(S3) · `stickerId?` · `createdAt`. **GroupMembership FK 없음** — 멤버십 검증은 앱 레이어 트랜잭션으로 보호.
- **GroupMembership** `group_memberships` — `membershipId` · `chatRoomId` · `userId` · `role`(`'owner'|'member'`) · `memberStatus`(`'active'|'left'|'kicked'|'blocked'`) · `instantKickUsed`(방장 행에서만 유효, 방 전체 1회 소진 카운터) · `lastSeenAt?`(48h 미접속 체크) · `joinedAt` · `leftAt?`. `@@unique([chatRoomId, userId])`.
- (약속) **Appointment** `appointments` — `status`(`proposed|confirmed|rejected|cancelled|counter_proposed`) · `expiresAt`(+36h). **AppointmentVote** `appointment_votes` — `vote`(`agree|reject|counter|pending`) · `@@unique([appointmentId, userId])`. 상세는 [appointments-calendar.md](appointments-calendar.md).

## Socket.IO 실시간 레이어 (lib/socket-server.ts)

- **초기화**: `createSocketServer(httpServer)` 싱글톤. CORS origin = `env.WEB_URL`, `credentials:true`.
- **Redis adapter**: `pubClient = getRedisClient()` + `subClient = pubClient.duplicate()` → `createAdapter(pubClient, subClient)`. 다중 인스턴스 fan-out 보장. `closeSocketServer()` 가 `io.close()` + `subClient.quit()`.
- **인증**: `io.use()` 미들웨어가 handshake 쿠키(`alle_sid`)를 `extractSession()` 으로 검증, 미인증 시 `next(new Error('unauthenticated'))` → 연결 거부. 접속 직후 `socket.join('user:<userId>')`(개인 알림 룸).
- **Client→Server 이벤트**: `room:join` `{chatRoomId}`(active 멤버십 검증 후 `room:<id>` join + `lastSeenAt` 갱신), `room:message` `{chatRoomId,type,body?,attachmentUrl?,stickerId?}`, `room:leave` `{chatRoomId}`.
- **Server→Client 이벤트**: `message`(ChatRoomMessageOut), `room:member_update`(멤버 목록), `appointment:proposed` / `appointment:confirmed` / `appointment:rejected`, `notification`, `error` `{code,message}`.
- **room:message 보안**: DB 진입 전 타입별 payload 검증(text→body / image→attachmentUrl / sticker→stickerId 필수) → 발신자 제재 가드(`isActivelySuspended` → `error sanction_active`) → **단일 트랜잭션 안에서 멤버십 active 재검증 + create**(TOCTOU 방지, room:join 이후 kicked/left 전환 차단) → `io.to('room:<id>').emit('message', out)`.

## 그룹 방장 권한 + 강퇴 (chat-room.ts, GG-MATE-017~021)

방장(role='owner')만 호출 가능, 모두 Serializable 트랜잭션.

- **즉시강퇴** `POST /community/chat-rooms/:id/kick/instant/:targetUserId` (GG-MATE-017) — **방 전체 평생 1회**(`instantKickUsed` 플래그 소진). 이미 소진 시 422 `instant_kick_used`, 비방장 403 `not_owner`, 동시 경합 409 `concurrent_conflict`. 대상 `memberStatus='kicked'` + 시스템 메시지 + 남은 멤버에게 `vacancy_notification` + `room:member_update` emit.
- **투표강퇴 시작** `POST /community/chat-rooms/:id/kick/vote` body `{targetUserId}` (GG-MATE-018) — 대상 제외 active 멤버 전원에게 `notificationType='kick_vote'` 알림 생성(`expiresAt`/`targetUserId` 는 message JSON 에 직렬화 — Notification 모델에 expiresAt 컬럼 없음). 진행 중 라운드 중복 시 409 `kick_vote_already_active`. **만료 +36h**.
- **투표 행사** `PATCH /community/chat-rooms/:id/kick/vote/:voteNotifId` body `{vote:'agree'|'reject'}` (GG-MATE-019~020) — 응답은 message JSON 의 `voteResult` 로 기록(중복 409 `already_voted`). **완료/투표 마커로 `readAt` 을 쓰지 않는다**(알림센터 markAllRead 가 덮어쓰므로). 대상 제외 전원 `voteResult='agree'` → 즉시 `kicked`.

## 라이프사이클 타임아웃 (chat-scheduler.ts, ADR 0007 결정10)

폴링 워커 5종. 각 핸들러는 `now` 파라미터를 받는 순수 함수(테스트/eval 직접 호출 가능), `wrapHandler` 로 개별 실패 격리, `NODE_ENV=test` 면 `startChatScheduler()` early-return.

| 핸들러 | 타임아웃 | 폴링 간격 | 동작 |
|---|---|---|---|
| `expireMatchRequests` | 1:1 신청 **24h** / 그룹 초대 **6h** | 10분 | pending+expiresAt<now → `expired`, requester 만료 알림. requestType별 독립 쿼리로 createdAt 하한 이중 검증 |
| `resolveExpiredKickVotes` | 강퇴 투표 **36h** | 10분 | 미응답자를 `agree` 로 간주 → 대상 제외 전원 agree 면 `kicked`(+시스템 메시지 `'강퇴 투표가 가결되었습니다 (시간 초과)'`). 최근 7일 미처리 알림만 스캔 |
| `expireAppointments` | 약속 제안 **36h** | 10분 | proposed/counter_proposed+expiresAt<now → `rejected` + 멤버 알림 |
| `handleInactiveMembers` | 미접속 **48h** | 30분 | `lastSeenAt < now-48h` 인 그룹방 active 멤버 → `kicked`(+`vacancy_notification`). 트랜잭션 내 재확인으로 재접속 멤버 제외 |
| `notifyMateEval` | (약속일 경과 시) | 10분 | confirmed 약속의 appointedAt 경과 → active 멤버에게 `mate_eval` 알림 + `appointment_complete` +10 크레딧. partial unique index + P2002 catch 로 멱등 |

상수: `INACTIVITY_THRESHOLD_MS=48h`, `ONE_TO_ONE_TIMEOUT_MS=24h`, `GROUP_INVITE_TIMEOUT_MS=6h`. 투표/약속 36h 는 각 라우트(`startKickVote` / `proposeAppointment` `APPOINTMENT_TTL_MS=36h`)에서 `expiresAt` 으로 세팅, 스케줄러는 만료 처리만 담당.

스케줄러 기동 시 7일 이상 미처리 `kick_vote` 알림이 있으면 운영자 경고 로그(수동 조정 필요).

## leaveRoom / block / event-select

- **나가기** `POST /community/chat-rooms/:id/leave` — 멤버십 `left`. **1:1** 은 상대방도 `left` + 방 `ended`. **그룹 방장** 이 나가면 joinedAt 빠른 다음 멤버로 `ownerUserId` 이전(+방장 변경 알림), 남은 active 0명이면 방 `ended`. Serializable+P2034 재시도(스케줄러 동시성).
- **차단** `POST /community/chat-rooms/:id/block/:targetUserId` — 대상 `memberStatus='blocked'` + `Block` 레코드 + 시스템 메시지. 이미 차단 시 409. (GG-REPORT-009: 차단자는 추천/신청 풀에서 제외 — [mate-matching.md](mate-matching.md).)
- **축제 선택** `PATCH /community/chat-rooms/:id/event` body `{eventId}` (GG-ROOM-004) — approved+미삭제 이벤트만(404 `event_not_found`). 변경된 경우에만 시스템 메시지 `'이 채팅방의 축제가 ...(으)로 정해졌어요'` + `message` 브로드캐스트(같은 축제 재선택 시 노이즈 방지).

## eval 하니스 (chat-room-eval.ts)

`npm run chatroom:eval` (apps/bff) — in-process PASS/FAIL 하니스. Express `Request`/`Response` 를 mock 으로 만들어 라우트 핸들러를 직접 호출(실 DB 필요, Socket.IO 미초기화여도 fire-and-forget emit 은 try/catch 로 안전).

커버리지: 신청 1:1/그룹(중복·만료·max3·groupApply 게이트·차단·정원 가드 `match.group.capacity_guard`·accept-side 정원 `match.group.accept.full_room`·**배치 격리 `match.group.batch_isolation`** — 같은 배치=같은 방/다른 배치=별도 방), 채팅방(메시지 페이지네이션·축제 선택·약속 제안/전원동의/거절/역제안·차단·1:1 나가기 종료·그룹 방장 이전/마지막 멤버 종료), 방장 권한(즉시강퇴/투표강퇴), 스케줄러 핸들러 직접 호출. 각 케이스는 응답 status + DB 상태를 함께 검증하고 끝에 합성 유저/방을 클린업한다.

## References

- `apps/bff/src/routes/match-request.ts` — 신청·수락·거절 (A_803/A_804)
- `apps/bff/src/routes/chat-room.ts` — 채팅방 REST + 방장 권한 (A_805)
- `apps/bff/src/lib/socket-server.ts` — Socket.IO + Redis adapter + 이벤트 핸들러
- `apps/bff/src/jobs/chat-scheduler.ts` — 타임아웃 5종 워커
- `apps/bff/src/jobs/chat-room-eval.ts` — PASS/FAIL eval 하니스
- `apps/bff/prisma/schema.prisma` — ChatRoom/ChatRoomMessage/MatchRequest/GroupMembership/Appointment/AppointmentVote
- [docs/decisions/0007-phase2-community-mate-matching.md](../../../docs/decisions/0007-phase2-community-mate-matching.md) — 결정6/10/11/14
- [docs/decisions/0010-group-invite-batch-identity.md](../../../docs/decisions/0010-group-invite-batch-identity.md) — group_batch_id
