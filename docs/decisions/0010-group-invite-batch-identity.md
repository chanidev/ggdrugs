# ADR 0010 — 그룹 초대 배치 식별자(group_batch_id) 도입

**상태:** 승인됨 — 구현 완료 (feature/A_804-group-batch-id)
**날짜:** 2026-06-01
**관련 유스케이스:** A_804 그룹 신청 (GG-MATE-015/016), A_805 채팅방
**범위:** `apps/bff` (match-request 라우트·Prisma 스키마·마이그레이션), `apps/web` (sendGroupInvite)
**관련 ADR:** [0007](0007-phase2-community-mate-matching.md)(Phase 2 메이트/그룹 매칭, 결정6)

---

## 컨텍스트

그룹 메이트 신청(A_804)은 한 명의 신청자(requester)가 추천 목록에서 최대 3명을 골라 초대하면,
`sendGroupInvite` 가 **수신자별로 별개의 `MatchRequest` 행 N개**를 생성한다(requestType='group').
수신자가 수락하면 `acceptMatchRequest` 의 그룹 분기가 다음 로직으로 합류할 방을 정한다:

```ts
// apps/bff/src/routes/match-request.ts (그룹 분기)
const existingAccepted = await tx.matchRequest.findFirst({
  where: { requesterId, requestType: 'group', status: 'accepted', chatRoomId: { not: null } },
  select: { chatRoomId: true },
});
// 있으면 그 방에 합류, 없으면 새 방 생성(최초 수락자 = 방장)
```

문제는 **"하나의 그룹 초대 배치"를 묶는 식별자가 없다**는 점이다. `existingAccepted` 는 신청자의
*아무* accepted 그룹 요청이나 찾으므로, 같은 신청자가 시점이 다른 **두 개의 그룹 배치**를 운용하면
경계가 무너진다.

### 구체적 결함 시나리오

신청자 R 이:
1. 배치 A 를 [U1, U2] 에게 보냄 → U1 수락 → 방 RoomA 생성(accepted).
2. (잠시 후) 배치 B 를 [U3, U4] 에게 보냄.
3. U3 가 배치 B 의 자기 요청을 수락 → `existingAccepted` 가 **RoomA**(배치 A 의 accepted 요청)를 찾음
   → U3 가 **엉뚱한 RoomA 에 합류**. 배치 B 의 의도(별도 그룹)와 컨텍스트·이벤트가 어긋남.

PR #1(commit `b11f897`)에서 그룹 수락의 **동시성**(중복 방 생성 경합, 정원 초과)은 Serializable +
P2034 재시도 + tx 내부 정원 검사로 해소했으나, 이 **배치 경계(temporal) 문제**는 직교(orthogonal)하며
식별자 없이는 풀 수 없다. /review 적대 검증(4각도)에서 P1 로 지목됨.

### 현실적 발생 조건

- 신청자가 6h(그룹 초대 만료) 윈도우 안에 2개 이상 배치를 보낼 때.
- 또는 이전 배치의 방이 아직 `accepted` 상태(미종료)로 남아 있을 때.
- 활동성 높은 사용자/동일 축제 다중 모집 시 충분히 재현 가능 → 그룹 컨텍스트 오염, 잘못된 멤버 혼입.

---

## 결정 (제안)

**`MatchRequest` 에 `group_batch_id`(UUID) 컬럼을 추가하고, 그룹 수락 시 후보 방 조회를 동일 배치로 스코프한다.**

1. **스키마(Prisma 마이그레이션, 금지 #2)**
   - `MatchRequest.groupBatchId String? @map("group_batch_id") @db.Uuid` (1:1 신청은 NULL).
   - 인덱스 `@@index([groupBatchId, status])` — 배치 내 수락 방 조회용.

2. **발신(`sendGroupInvite`)**
   - 배치당 UUID 1개 생성, 그 배치의 모든 `MatchRequest` 행에 동일 `groupBatchId` 기록.
   - (UUID 생성은 BFF에서. 클라이언트 입력 신뢰 금지.)

3. **수락(`acceptMatchRequest` 그룹 분기)**
   - `existingAccepted` 조회를 `groupBatchId = thisRequest.groupBatchId` 로 한정.
   - 즉 "같은 배치에서 이미 만들어진 방"에만 합류, 없으면 그 배치의 새 방 생성.
   - 정원 검사·Serializable 재시도(PR #1)는 그대로 유지.
   - `groupBatchId` 가 NULL 인 레거시 그룹 요청은 기존(신청자 단위) 동작으로 폴백하거나, 마이그레이션에서
     배치 backfill(같은 requester + 근접 createdAt 묶음) — **백필 전략은 구현 시 확정**.

4. **방 ↔ 배치 정합(선택)**
   - `ChatRoom` 에 `groupBatchId` 를 함께 기록해 방-배치 1:1 추적성을 높이는 안은 Open item.

---

## 결과

- (+) 한 신청자가 동시에 여러 그룹 배치를 운용해도 각 배치가 **독립된 방**으로 수렴 — 컨텍스트 오염 제거.
- (+) 그룹 수락 라우팅이 결정적·검증 가능(배치 단위 eval 케이스 추가 가능).
- (−) 스키마 변경(마이그레이션) + `sendGroupInvite`/`acceptMatchRequest` 수정 + 레거시 backfill 필요.
- (−) 컬럼 1개·UUID 발급 오버헤드(무시 가능 수준).
- (−) 방-배치 정합(결정 4)을 안 하면 방 측에서 배치를 역추적할 수 없음(Open item).

---

## 대안

- **A. (requester, createdAt 윈도우) 휴리스틱으로 배치 추론** — 경계가 모호하고 시계 의존. 신뢰 불가. 기각.
- **B. "신청자당 동시 1개 그룹 배치"로 제약** — 식별자 없이 단순화하나, 동일 축제 다중 모집 등 제품 유연성 손실.
  현 요구(GG-MATE-015/016)에 명시 제약 없음 → 제품 결정 필요. 보류.
- **C. 방을 발신 시점에 미리 생성** — 방 생성은 "최초 수락" 시점(ADR 0007 결정6)이라 모델 충돌. 기각.
- **D. 현행 유지(식별자 없음)** — 위 결함 잔존. 기각.

---

## Open items (구현 시 확정)

- 레거시 `groupBatchId=NULL` 그룹 요청 backfill 전략(근접 createdAt 묶음 vs 폴백 동작).
- `ChatRoom.groupBatchId` 동시 기록 여부(결정 4 — 역추적성).
- 만료(6h)·취소된 배치의 잔여 accepted 요청이 후속 합류에 미치는 영향(상태·만료 필터 동반 점검).
- 배치 단위 eval 케이스(같은 배치 합류 / 다른 배치 분리)를 `chat-room-eval` 에 추가.

---

## 참조

- 코드: `apps/bff/src/routes/match-request.ts` (acceptMatchRequest 그룹 분기, sendGroupInvite)
- 선행 PR: #1 그룹 수락 동시성 수정 (commit `b11f897`) — 본 ADR과 직교한 race/정원 해소
- 스키마: `apps/bff/prisma/schema.prisma` (MatchRequest, ChatRoom)
- 관련 ADR: [0007](0007-phase2-community-mate-matching.md) 결정6(A_803/A_804 신청·채팅방)
- 컨벤션: `.claude/CLAUDE.md` §5(용어)·§6 금지 #1(요구 외 기능은 ADR 선행)·#2(스키마는 마이그레이션으로만)
