# ADR 0009 — 약속 단일 거절 시 즉시 파기 정책

**상태:** 승인됨  
**날짜:** 2026-05-30  
**관련 유스케이스:** A_805 (GG-ROOM-021)  
**범위:** `services/llm`, `apps/bff` (Appointment 상태 전환)

---

## 컨텍스트

Task 4 구현(PATCH `/community/chat-rooms/:chatRoomId/appointment/:appointmentId/vote`) 에서  
`vote === 'reject'` 처리 방식을 결정해야 했다.

플랜 스펙(2026-05-30-phase2-slice3-chat-realtime.md, 라인 625)에는 다음과 같이 기술돼 있다:

> 36h 미응답 → chat-scheduler 처리 (rejected 자동)

스펙은 스케줄러가 **무응답(pending) 만료**를 처리한다고만 명시하며,  
명시적 거절(`vote='reject'`)에 대한 처리 방식은 기술되지 않았다.

---

## 결정

**명시적 `vote='reject'` 투표 한 건이 도착하면 즉시 `Appointment.status = 'rejected'`로 전환한다.**

근거:

1. **UX 명확성**: 거절 의사가 명시된 상황에서 최대 36시간을 기다리는 것은 사용자 경험에 해롭다.  
   상대방이 "거절했다"는 신호를 실시간으로 받는 편이 일관성이 있다.
2. **스케줄러 단일 책임**: 스케줄러는 **무응답(pending 상태 만료)** 처리에만 집중한다.  
   명시적 의사 표현(agree/reject/counter)은 즉각 처리하는 것이 책임 분리 원칙에 부합한다.
3. **도메인 대칭**: `vote='agree'`가 전원 동의 즉시 `confirmed`로 전환하는 것과 대칭적이다.

---

## 결과

- `voteAppointment()` 핸들러: `vote === 'reject'` 시 트랜잭션 내에서 `status = 'rejected'`로 즉시 업데이트.
- 시스템 메시지 `'약속이 거절되었습니다'` 생성.
- Socket.IO `appointment:rejected` 이벤트를 해당 채팅방 전원에게 emit (클라이언트 실시간 UI 갱신).
- chat-scheduler는 여전히 `pending` 상태 36시간 경과 시 `rejected` 자동 전환을 담당한다 (중복 없음 — 명시적 거절은 이미 `rejected` 상태이므로 스케줄러 조건에 해당 안 됨).

---

## 대안 검토

| 대안 | 이유로 기각 |
|------|------------|
| 거절 투표 기록 후 36h 경과 시 스케줄러 처리 | 명시적 거절 의사를 무시하고 36h 대기하는 UX 문제 |
| 거절자 1인 이탈 후 나머지 동의 시 진행 | 요구사항정의서에 없는 복잡한 부분 동의 플로우 |

---

*작성: Claude Code (Backend Agent) — 코드 리뷰 지적사항 해소 (2026-05-30)*
