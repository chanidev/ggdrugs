---
title: 약속 · 캘린더
type: topic
created: 2026-06-09
updated: 2026-06-09
related:
  - mate-chat-rooms.md
  - mate-matching.md
  - subscriptions-notifications.md
  - db-schema-overview.md
  - event-state-machine.md
---

# 약속 · 캘린더

## Summary

채팅방 멤버가 함께 갈 이벤트의 **약속(날짜·시간)을 제안 → 투표 → 확정**하는 합의 서브시스템이다 (GG-ROOM-013~021). 강퇴 투표가 알림 메시지에 상태를 묻어두는 것과 달리, 약속은 `Appointment` + `AppointmentVote` 두 테이블로 동의 현황을 명시적으로 영속화한다(ADR 0007 결정14). 확정된(`confirmed`) 약속은 마이페이지 캘린더(GG-MY-002)에 카드로 노출되고, 약속일이 지나면 메이트 평가 알림 + `appointment_complete` 크레딧(+10)으로 이어진다.

핵심 정책 두 가지: **단일 거절 = 즉시 파기**(ADR 0009), **미응답 36h = 자동 거절**(스케줄러). 전자는 실시간 투표 핸들러가, 후자는 백그라운드 워커가 담당한다.

## 데이터 모델

### `Appointment` (`appointments`)
- `appointmentId` BigInt PK
- `chatRoomId` BigInt — 소속 채팅방 (`ChatRoom` FK)
- `proposerUserId` BigInt — 제안자
- `eventName` String? (VarChar 200) — 자유 입력 이벤트명
- `eventId` BigInt? — 연결된 정식 이벤트(선택). 없을 수도 있음.
- `appointedAt` DateTime? (Timestamptz) — 제안된 약속 일시
- `status` String(20) default `'proposed'` — enum: **`proposed` | `confirmed` | `rejected` | `cancelled` | `counter_proposed`**
- `expiresAt` DateTime (Timestamptz) — 제안 시각 + **36h**
- `createdAt` / `updatedAt`
- 인덱스: `idx_appointment_room_status (chatRoomId, status)`, `idx_appointment_expires (expiresAt, status)` (스케줄러 만료 스캔용)
- 역관계: `votes`, `mateEvaluations`, `festivalSurveys`, `festivalReviews` (삭제된 약속 ID로 평가 행 잠김 방지하는 FK)

### `AppointmentVote` (`appointment_votes`)
- `voteId` BigInt PK
- `appointmentId` BigInt FK
- `userId` BigInt
- `vote` String(20) — enum: **`agree` | `reject` | `counter` | `pending`**
- `counterAt` DateTime? — 역제안 일시 / `counterTime` DateTime? — 역제안 제안 시각
- `createdAt` / `updatedAt`
- **`uq_appointment_vote_user (appointmentId, userId)`** — 1인 1표.
- 제안 생성 시 active 멤버 전원에 대해 `vote='pending'` 행을 createMany로 미리 깐다.

## 약속 상태 머신

```
[제안 POST /community/chat-rooms/:id/appointment]
   └ status: proposed, expiresAt = now+36h
       votes: active 멤버 전원 pending (제안자 포함)
       ├ [전원 agree]              → confirmed   (실시간 emit appointment:confirmed)
       ├ [단일 reject]            → rejected    (ADR 0009 — 즉시 파기, appointment:rejected)
       ├ [counter 제출]           → counter_proposed
       │     └ 역제안자 외 전원 vote=pending 리셋 → 새 투표 라운드
       │           ├ [전원 agree]  → confirmed
       │           ├ [단일 reject] → rejected
       │           └ [재 counter]  → counter_proposed (반복)
       └ [36h 무응답]             → rejected    (chat-scheduler 자동, expiresAt 경과)
```

- **투표 가능 상태**(`VOTABLE`)는 `['proposed', 'counter_proposed']` 둘 뿐. 그 외 status에 투표 시 `409 appointment_not_votable`, 만료 시 `410 appointment_expired`.
- `cancelled`는 enum에 존재하나 현재 투표 흐름에서 자동 전이 경로 없음(제안자 취소용 예약값).

### ADR 0009 — 단일 거절 즉시 파기
명시적 `vote='reject'` 한 건이면 36h를 기다리지 않고 트랜잭션 내에서 즉시 `status='rejected'`로 전환한다. 근거: (1) 거절 의사가 명시된 상황에서 36h 대기는 UX 해악, (2) 스케줄러는 **무응답(pending) 만료**만 전담하는 단일 책임, (3) `agree` 전원 동의 즉시 `confirmed`와 도메인 대칭. 명시적 거절은 이미 `rejected`라 스케줄러 조건(`status in proposed|counter_proposed`)에 안 걸려 중복 없음.

## 투표 메커닉 (`voteAppointment`)

`PATCH /community/chat-rooms/:chatRoomId/appointment/:appointmentId/vote` (`apps/bff/src/routes/chat-room.ts`).

- **동시성**: `Serializable` 트랜잭션 + 조건부 `updateMany(WHERE status IN VOTABLE)` + `P2034` 재시도(최대 3회, 20·40·60ms 백오프). 트랜잭션 진입 시 status를 재확인해 외부 체크와의 경합을 차단하고, `count===0`이면 이미 전이된 것으로 보고 부수효과(알림·시스템 메시지)를 skip → `reject↔confirm` 뒤집힘 방지. 최종적으로 무의미해진 표는 `409 retryable`.
- **agree**: 본인 표 갱신 후 `allVotes.every(v => v.vote === 'agree')`(제안자 포함 전원) 검사 → 전원 동의 시 `confirmed`, `'약속이 확정되었습니다'` 시스템 메시지 + active 멤버 전원 `appointment` 알림.
- **reject**: 즉시 `rejected`, `'약속이 거절되었습니다'` 시스템 메시지 + 거절자 제외 나머지에게 파기 알림.
- **counter**: `counter_proposed`로 전환 후 **역제안자 외 전원의 vote를 `pending`으로 리셋**(이전 표 무효화 — 새 라운드), `'역제안이 제출되었습니다'` 시스템 메시지 + 나머지에게 재투표 유도 알림(GG-NOTI-012).
- 매 결과는 Socket.IO로 해당 룸에 `appointment:confirmed` / `appointment:proposed`(counter 시) / `appointment:rejected` emit.

## 마이페이지 캘린더 피드 (GG-MY-002)

`GET /me/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD` → `listMyAppointments` (`apps/bff/src/routes/appointments.ts`, `app.ts:456` 등록).

- 사용자가 **`memberStatus='active'`인 채팅방**의 **`status='confirmed'`** 약속만 반환.
- **날짜 필터 동작**: `from`/`to` 둘 다 없으면 `appointedAt` 제약 없이 전체 confirmed 반환(`appointedAt IS NULL` 포함). 하나라도 있으면 `gte/lte` 적용(기본 폴백 −90일 ~ +180일) — 단 Prisma 범위 비교상 `appointedAt IS NULL` 행은 자동 제외됨.
- 이벤트 조인: `Appointment.eventId ?? ChatRoom.eventId`로 eventId 수집 후 `Event` 일괄 조회. `ChatRoom`엔 Prisma event 관계가 없어 별도 조회한다.
- 응답 이벤트 필드: `title / startDate / endDate / region(sido+sigungu 또는 fullAddress) / price / operatingHours / targetAudience` — AppointmentCard 6항목 충족. **`price`는 DB 컬럼 `admissionFee`(String|null)를 이름만 바꿔 그대로 노출** — Web은 string으로 받고 `Number()` 강제 변환 금지.
- **UI**: `CalendarTab.tsx`가 북마크·리뷰·confirmed 약속을 하나의 `CalendarEvent[]`로 병합(약속 키는 `appt:` 접두사로 충돌 방지). 도트 색상은 phase 기반(과거=ended, 미래=upcoming)이며 약속 접두사는 색 미분화(알려진 한계). 선택일의 약속은 emerald 스타일 `AppointmentCard`로 표시 — 채팅방 이동(GG-ROOM-020) + 이벤트 상세 링크.

## 알림 · 크레딧 연동

`notificationType='appointment'`(투표 결과) / `'appointment_update'`(만료) 로 fan-out. 약속일(`appointedAt`) 경과 시점은 별도 워커 `notifyMateEval`이 처리:
- 조건: `status='confirmed'` AND `appointedAt <= now`.
- active 멤버 전원에 `mate_eval` 평가 알림 + `appointment_complete` **+10 크레딧** 적립.
- dedup: `uq_notif_mate_eval_per_user_appt` / `uq_credit_appt_complete_user` partial unique index(DB) + `findFirst` 1차 방어 + `P2002` catch (TOCTOU-safe). 완전 처리된 약속은 `NOT EXISTS` 서브쿼리로 스캔 제외.

스케줄러 폴링 간격은 약속 만료·평가 알림 모두 10분(`APPT_EXPIRE_INTERVAL` / `MATE_EVAL_NOTIFY_INTERVAL`). `NODE_ENV=test`에선 early-return.

## References

- `apps/bff/prisma/schema.prisma` — `model Appointment` (L861), `model AppointmentVote` (L886)
- `apps/bff/src/routes/chat-room.ts` — `proposeAppointment` / `voteAppointment` (Serializable 투표 핸들러, `APPOINTMENT_TTL_MS = 36h`)
- `apps/bff/src/routes/appointments.ts` — `listMyAppointments` (GG-MY-002 캘린더 피드)
- `apps/bff/src/jobs/chat-scheduler.ts` — `expireAppointments`(36h 자동 거절), `notifyMateEval`(평가 알림+크레딧)
- `apps/bff/src/app.ts` — `GET /me/appointments` 라우트 등록 (L456)
- `apps/web/src/pages/MyPage/tabs/CalendarTab.tsx` + `apps/web/src/lib/api/appointments.ts` — 캘린더 UI / API 클라이언트
- `docs/decisions/0009-appointment-single-reject-immediate-termination.md` — 단일 거절 즉시 파기 정책
