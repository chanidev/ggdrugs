---
title: 메이트 평가 · 축제 리뷰/설문 (A_900 / A_901)
type: topic
created: 2026-06-09
updated: 2026-06-09
related:
  - mate-matching.md
  - credits-ledger.md
  - reports-blocking-moderation.md
  - mate-chat-rooms.md
  - db-schema-overview.md
---

# 메이트 평가 · 축제 리뷰/설문 (A_900 / A_901)

## Summary

약속(Appointment)을 "다녀온 후" 단 한 번의 POST 로 **세 가지 산출물 + 크레딧**을
원자적으로 저장하는 서브시스템(Slice 5). 단일 endpoint
`POST /community/appointments/:appointmentId/evaluate` 가:

1. **A_900 메이트 평가** (`MateEvaluation`) — 동행 상대에 대한 1:1/그룹 평가
2. **A_901 축제 설문** (`FestivalSurvey`, **비공개**) — 축제 자체 5범주 Likert
3. **A_901 축제 후기** (`FestivalReview`, **공개**) — 이벤트 상세에 노출될 별점+본문

세 모델 모두 `appointmentId` 를 공유하고, 제출 성공 시 작성자에게 크레딧을 적립한다
(`mate_eval_complete` / `review_complete`, 별도로 스케줄러가 `appointment_complete`).
ADR 0007(결정5, 옵션 C)의 "메이트 활동 완료/평가 작성 후 지급" 원칙 구현이며,
크레딧은 결제 없는 적립형 리워드 카운터다 → [credits-ledger](credits-ledger.md).

## 데이터 모델 — 평가 1 / 설문(비공개) 2 / 후기(공개) 3

### 1. `MateEvaluation` (A_900, GG-REVIEW) — 사람 → 사람

| 필드 | 타입 | 의미 |
|---|---|---|
| `evalId` | BigInt PK | |
| `appointmentId` | BigInt | 약속 출처 |
| `evaluatorUserId` | BigInt | 평가자(나) |
| `evaluatedUserId` | BigInt | 평가 대상(상대) |
| `ratingStars` | SmallInt 1~5 | 종합 별점 |
| `q1` | SmallInt 1~5 | 시간약속 |
| `q2` | SmallInt 1~5 | 의사소통 |
| `q3` | SmallInt 1~5 | 분위기/유쾌함 |
| `q4` | SmallInt 1~5 | 재방문의향 |
| `comment` | VarChar(30)? | ≤30 **UTF-8 byte** (CHECK octet_length) |
| `reportedFor` | VarChar(20)? | 신고 플래그 (아래 §report flag) |

- UNIQUE = `(appointmentId, evaluatorUserId, evaluatedUserId)` (`uq_mate_eval_pair`) →
  방향성 평가 1쌍당 1회. 그룹 N 인 방에서 한 사람이 나머지 N−1 명을 각각 평가 가능.
- 인덱스 `idx_mate_eval_evaluated (evaluatedUserId, createdAt desc)` — 받은 평가 조회용.

### 2. `FestivalSurvey` (A_901 GG-FEST-REVIEW-001~007, **비공개**) — 사람 → 축제

5범주 Likert 1~5 만 보유, 본문/사진 없음. **운영 분석·내부용으로 외부 미노출**.

| 필드 | 의미 |
|---|---|
| `atmosphere` | 분위기 |
| `program` | 프로그램 |
| `food` | 먹거리 |
| `safety` | 안전 |
| `transport` | 교통/접근성 |

- UNIQUE = `(appointmentId, userId)` (`uq_festival_survey_pair`) — 참가자당 1회.
  appointmentId 단독 UNIQUE 아님 → 그룹(최대 4인) 각 멤버 독립 제출.

### 3. `FestivalReview` (A_901 GG-FEST-REVIEW-008, **공개**) — 사람 → 축제

별점 + 본문 + 사진. `eventId` 를 보유해 **이벤트 상세에 공개 surfacing** 전제.

| 필드 | 의미 |
|---|---|
| `eventId` | BigInt? | `Appointment.eventId` 에서 복사 (null 불가 — 라우트가 검증) |
| `ratingStars` | SmallInt 1~5 | 후기 별점 (메이트 별점과 별개) |
| `body` | VarChar(5000) | 후기 본문 (필수, 비어있으면 400) |
| `photoUrls` | TEXT[] | 최대 10 URL (S3 publicUrl) |

- UNIQUE = `(appointmentId, userId)` (`uq_festival_review_pair`) — 참가자당 1회.
- 인덱스 `idx_festival_review_event (eventId, createdAt desc)` (공개 노출),
  `idx_festival_review_user`.

**비공개(Survey) vs 공개(Review) 핵심 차이**: Survey 는 5 Likert 숫자만 → 축제 운영
정량 피드백(외부 미노출). Review 는 별점·자유서술·사진을 가지며 `eventId` 로
이벤트 상세에 일반 사용자에게 보이는 후기다. 둘 다 "축제(이벤트)"가 대상이지만
가시성/형태가 다르다.

## Post-attendance 게이팅 — 누가, 언제 평가/후기 가능한가

`submitEvaluation` 의 순차 게이트(첫 실패에서 반환):

1. `requireAuth` — 미인증 401.
2. **약속 존재** — 없으면 404 `appointment_not_found`.
3. **확정 여부** — `appointment.status !== 'confirmed'` → 409 `appointment_not_confirmed`.
4. **"다녀온 후"** — `appointedAt` 없거나 `appointedAt > now()` → 409 `not_attended_yet`.
   즉 확정 + 약속시각 경과 후에만 허용.
5. **eventId 존재** — `appointment.eventId` null → 400 `event_required`
   (FestivalReview 공개 연동 전제, 이슈4).
6. **요청자 멤버십** — 동일 `chatRoomId` 의 `GroupMembership.memberStatus='active'`
   아니면 403 `not_a_member`.
7. **대상자 검증** — `evaluatedUserId` 가 동일 방의 **active** 멤버여야 함.
   본인 평가(`cannot_eval_self`) 400, 비멤버/kicked/left 는 400
   `evaluated_user_not_in_room` (가장 엄격한 해석 — 무단이탈 후 평가 회피 차단).
8. **필드 검증** — `ratingStars`·`q1~q4`·`atmosphere/program/food/safety/transport`·
   `reviewRating` 모두 정수 1~5(`parseLikert`), `reviewBody` 필수(≤5000), `comment` ≤30 byte.

재제출(동일 대상) → `MateEvaluation.create` 가 `uq_mate_eval_pair` P2002 → 409
`already_submitted`. GET `/community/appointments/:appointmentId/evaluation` 은
본인 제출 평가를 반환(미제출 시 204) — 클라이언트 마운트 시 중복 제출 사전 차단용.

## 5문항 Likert 구조 + report flag

- **메이트 평가**: 종합 `ratingStars` 1개 + 세부 4문항(`q1`~`q4`) — 모두 1~5 정수.
  (종합 별점을 포함하면 사실상 5개 척도이나, "세부 설문"은 q1~q4 의 4문항.)
- **축제 설문**: `atmosphere/program/food/safety/transport` **5범주 Likert** 1~5.
- **report flag** (`MateEvaluation.reportedFor`): 평가 제출에 신고를 끼워 넣는 경로.
  허용값 `{ inappropriate, harassing, no_show, etc }` (그 외/없음 → null).
  reportedFor 가 있으면 평가 대상의 메이트 지수(MateIndex)에 1회성 penalty 가
  반영된다(`updateMateIndex`, best-effort). 정식 신고 워크플로(Report 모델,
  admin 조치)는 별도 → [reports-blocking-moderation](reports-blocking-moderation.md).

제출 직후 best-effort 로 `updateMateIndex(evaluatedUserId)` 호출:
`rawScore = (stars*10 + qAvg*10) / 2`, `newIndex = old*0.6 + rawScore*0.4`,
reportedFor 있으면 penalty 차감, 0~100 clamp. 실패는 warn 후 무시(평가 자체는 성공).

## 크레딧 적립 트리거 — 어떤 행동이 크레딧을 주는가

`CreditLedger` 는 append-only(잔액 = `SUM(pointsAmount)`). 본 흐름이 만드는 action:

| action | 시점 | 적립 위치 | dedup 방어선 |
|---|---|---|---|
| `mate_eval_complete` (+10) | 평가 제출(평가 1건당) | 트랜잭션 **내** | `uq_mate_eval_pair` (평가 create P2002 → 크레딧 미도달) |
| `review_complete` (+10) | FestivalReview **최초** 생성 1회 | 트랜잭션 **밖** bare prisma | `uq_credit_review_complete_user` partial unique + findFirst |
| `appointment_complete` (+10) | 스케줄러 `notifyMateEval` | mate-chat 스케줄러 | `uq_credit_appt_complete_user` partial unique |

- 그룹 N−1: 한 사람이 N−1 명을 각각 평가 → `mate_eval_complete` 도 N−1 행
  (의도됨). 반면 `FestivalSurvey`/`FestivalReview` 는 `(appointmentId, userId)`
  UNIQUE 라 2번째 POST 부터 `upsert({update:{}})` no-op → `review_complete` 는
  최초 1회만. `isNewReview` 플래그로 판별.
- **review_complete 가 트랜잭션 밖인 이유**: Prisma 5 interactive transaction 은
  SAVEPOINT 미사용 → 트랜잭션 내 P2002 catch 후 후속 SQL 이 "transaction is
  aborted" 유발. 따라서 review_complete insert 를 커밋 성공 후 bare `prisma.*` 로
  분리(2-layer dedup: findFirst → P2002 무시).
- +10 액수는 ADR 0007 결정5 의 "액수 Open items" 미정분 → 구현에서 10 으로 가정 고정.
- 적립 액수/잔액 표시·내역 화면은 → [credits-ledger](credits-ledger.md).

## 평가 검증 하니스 (`slice5-eval.ts`)

`npm run slice5:eval` 로 도는 in-process PASS/FAIL 하니스. 실제 DB 픽스처
(user·event·chatRoom·appointment)를 생성하고 라우트 핸들러를 mock req/res 로
직접 호출 후 finally 에서 역순 FK 정리. 주요 케이스:

- CASE 1/2: 정상 제출 201 / 재제출 409.
- CASE 3·3b: comment 31 byte → 400, trim 전 raw byte 기준 검증(이슈23).
- CASE 4/5: `not_attended_yet`(미래 appointedAt) / `appointment_not_confirmed`.
- CASE 7/7b/7c: `mate_eval_complete`·`review_complete` +10 적립 + TOCTOU idempotent.
- CASE 9: MateIndex 50 → 46 갱신(stars4·qavg4, penalty 0) 검증.
- CASE 10/13: `notifyMateEval` 알림 + `appointment_complete` dedup(다중 평가에도 1회).
- CASE 11: 그룹 N=3 N−1 다중 평가 — eval 2행·survey 1행·review_complete 1행 시맨틱.
- CASE 12: kicked 멤버 평가 대상 차단(400).

## References

- `apps/bff/src/routes/evaluation.ts` — `submitEvaluation`, `getMyEvaluation`
- `apps/bff/src/jobs/slice5-eval.ts` — Slice 5 검증 하니스 (`npm run slice5:eval`)
- `apps/bff/src/lib/mate-index-updater.ts` — `updateMateIndex` (best-effort 지수 갱신)
- `apps/bff/src/jobs/chat-scheduler.ts` — `notifyMateEval` (mate_eval 알림 + appointment_complete)
- `apps/bff/prisma/schema.prisma` — `MateEvaluation`(929) / `FestivalSurvey`(958) /
  `FestivalReview`(985) / `CreditLedger`(1017)
- `docs/decisions/0007-phase2-community-mate-matching.md` — 결정5(크레딧 옵션 C)
