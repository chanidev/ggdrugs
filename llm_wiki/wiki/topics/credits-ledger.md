---
title: 크레딧 · 포인트 원장
type: topic
created: 2026-06-09
updated: 2026-06-09
related:
  - mate-evaluation-festival-review.md
  - mate-matching.md
  - appointments-calendar.md
  - db-schema-overview.md
  - roles-and-active-role.md
---

# 크레딧 · 포인트 원장

## Summary

크레딧은 Phase 2 메이트 활동의 **적립형 리워드 카운터**다 (ADR 0007 결정5, 옵션 C). 메이트 평가
제출·후기 최초 작성·약속 완료 시 각 **+10** 이 `credit_ledgers` 에 한 행씩 쌓이고, 잔액은 그 행들의
`pointsAmount` 합으로 계산된다. 원장은 **append-only(불변)** — 갱신/삭제하는 비즈니스 경로가 없고,
조회 전용(`GET /me/credits`)으로만 읽힌다. 결제(−)·멤버십 정산·구매적립·쿠폰적립 등 9-1 와이어의
차감/충전 항목은 전부 **placeholder**(미구현). 즉 현재 크레딧을 **소비(spend)하는 사용처는 어디에도
없다** — 표시 전용 누적 카운터다 (ADR 0007 결정5: sink 필요 시 옵션 B 자체통화로 확장, 별도 ADR).

용어는 "크레딧"으로 통일(흐름도의 "포인트" 표기 폐기), DB 식별자는 `credit`.

## 데이터 모델 — `CreditLedger` (append-only 불변 원장)

`apps/bff/prisma/schema.prisma` model `CreditLedger` → 테이블 `credit_ledgers`:

| 필드 | 컬럼 | 타입 | 비고 |
|---|---|---|---|
| `ledgerId` | `ledger_id` | BigInt PK autoincrement | |
| `userId` | `user_id` | BigInt | `User` 관계 |
| `action` | `action` | VarChar(30) | 적립 사유 (아래 3종) |
| `pointsAmount` | `points_amount` | Int | 양수 = 적립 (음수 차감 경로 없음) |
| `appointmentId` | `appointment_id` | BigInt? | 출처 추적 (약속 기인 적립) |
| `createdAt` | `created_at` | Timestamptz default now() | |

- 인덱스: `idx_credit_ledger_user` = `(user_id, created_at DESC)` — 내역 페이지네이션·잔액 집계 최적.
- **별도 enum 타입 없음** — `action` 은 `VarChar(30)` 자유 문자열이고, 유효값은 애플리케이션 상수로만 강제.
- `updatedAt`/`deletedAt` 컬럼 없음 = 설계상 행을 절대 수정하지 않는 불변 원장. (cascade 정리 시
  `chat-room-eval.ts` 의 고아 약속 cleanup 에서만 `deleteMany` — 정상 적립 경로는 insert-only.)

## 적립 규칙 (action enum 3종, 각 +10)

`apps/web/src/lib/api/credits.ts` 주석 + BFF 상수로 확정. 세 사유 모두 액수 **+10** (ADR 0007 결정5
"액수 Open items" → 코드에서 10으로 가정한 상수).

| `action` | 액수 | 적립 시점 | 코드 위치 | dedup 단위 |
|---|---|---|---|---|
| `mate_eval_complete` | +10 | 메이트 평가 제출(POST) 트랜잭션 내 | `routes/evaluation.ts` `CREDIT_MATE_EVAL=10` | `uq_mate_eval_pair`(평가쌍) — 그룹 N-1 평가마다 각 +10 의도 |
| `review_complete` | +10 | 축제 후기 **최초** 1회 생성 후 (트랜잭션 밖 bare prisma) | `routes/evaluation.ts` `CREDIT_REVIEW=10` | `uq_credit_review_complete_user` |
| `appointment_complete` | +10 | 스케줄러 잡이 `confirmed` 약속 `appointedAt` 경과 감지 시 참가 멤버 전원 | `jobs/chat-scheduler.ts` `notifyMateEval()`, `CREDIT_APPOINTMENT_COMPLETE=10` | `uq_credit_appt_complete_user` |

적립 흐름 세부:

- **mate_eval_complete** — 평가 제출 시 `MateEvaluation`+`FestivalSurvey`+`FestivalReview` 와 함께
  `tx.creditLedger.create({ action:'mate_eval_complete', pointsAmount:10, appointmentId })` 원자 저장.
  그룹 N-1 평가에서는 평가 대상마다 별도 요청 → 각 +10 (의도된 설계). dedup 은 평가쌍 UNIQUE
  (`uq_mate_eval_pair`)가 유일 방어선 — `(appointmentId)` 단위 partial index 를 쓰면 N-1 의 정상
  복수 적립을 막아버리므로 일부러 쓰지 않음.
- **review_complete** — 같은 평가 제출 핸들러에서, `FestivalReview` 가 **신규 생성**(`willCreateReview`)
  된 경우에만 **트랜잭션 커밋 후** 별도 `prisma.creditLedger.create` 로 적립. 트랜잭션 밖으로 뺀 이유:
  Prisma 5 interactive tx 는 SAVEPOINT 미사용 → tx 내 P2002 catch 후 "transaction is aborted" 발생.
  2단계 dedup: `findFirst`(앱 레이어 사전 확인) + `uq_credit_review_complete_user` P2002 catch(최종).
- **appointment_complete** — `notifyMateEval()` 잡(10분 간격, `MATE_EVAL_NOTIFY_INTERVAL`)이
  `$queryRaw` 로 "active 멤버 중 appointment_complete 크레딧 미보유자가 있는 confirmed·경과 약속"만
  스캔(NOT EXISTS 서브쿼리 → 처리 완료 약속 자동 제외, unbounded scan 방지). 멤버별 `findFirst`
  1차 방어 + `uq_credit_appt_complete_user` P2002 catch 로 idempotent. mate_eval 알림과 함께 fan-out.

### dedup 인덱스 (마이그레이션 전용, schema.prisma 미선언)

`migrations/20260530150000_add_review_complete_dedup_index/migration.sql`:

```sql
CREATE UNIQUE INDEX uq_credit_appt_complete_user
  ON credit_ledgers (appointment_id, user_id) WHERE action = 'appointment_complete';
CREATE UNIQUE INDEX uq_credit_review_complete_user
  ON credit_ledgers (appointment_id, user_id) WHERE action = 'review_complete';
```

둘 다 partial unique → `(약속, 유저)` 당 해당 action 1행 보장. TOCTOU(스케줄러 재시작·다중 프로세스·
클라이언트 double-tap) 경합 시 최종 방어선. `schema.prisma` 에는 선언하지 않은 DB-level 전용 인덱스.

## 사용처(spend / sink)

**없음.** 크레딧을 차감하거나 소비하는 경로는 코드 어디에도 구현돼 있지 않다. `pointsAmount` 는
항상 양수로만 기록되고(주석 "양수 = 적립"), UI 도 `+{pointsAmount}` 로만 표시. 9-1 와이어의
결제·멤버십·구매적립·쿠폰 항목은 ADR 0007 결정5 에서 placeholder 로 명시(결제/PG 연동 없음).
미래에 기프티콘 교환 같은 sink 가 필요하면 옵션 B(자체 통화)로 확장하며 별도 ADR 선행.

## 읽기 API — `GET /me/credits?page=&limit=`

- 라우트 등록: `apps/bff/src/app.ts` (`/me/credits` → `listMyCredits`, requireAuth).
- 핸들러: `apps/bff/src/routes/me.ts` `listMyCredits()`.
- 쿼리: `page`(기본 1), `limit`(기본 20, 최대 100). 미인증 401.
- 응답:

```jsonc
{
  "balance": 30,            // SUM(points_amount), 행 없으면 0
  "page": 1,
  "limit": 20,
  "items": [
    {
      "ledgerId": "123",       // BigInt 직렬화
      "action": "mate_eval_complete",
      "pointsAmount": 10,
      "appointmentId": "456",  // nullable
      "createdAt": "2026-06-01T12:00:00.000Z"
    }
  ]
}
```

## 잔액 계산 (원장 합산)

잔액은 **저장하지 않고** 매 조회 시 원장에서 집계: `prisma.creditLedger.aggregate({ where:{userId},
_sum:{pointsAmount} })`. 행이 없으면 `_sum.pointsAmount === null` → `?? 0`. items 목록과 병렬
조회(`Promise.all`)하며 `orderBy createdAt desc` + skip/take 페이지네이션. ADR 0007 결정5 가 언급한
"잔액 캐시"는 현재 미도입 — 원장이 작아 매번 SUM 으로 충분(append-only + user 인덱스).

## UI

`apps/web/src/pages/CreditPage/index.tsx` (`/credits`, 마이페이지 진입 GG-MY-008):

- 상단 잔액 뱃지 `크레딧 N개`(i18n `credit.balance`), 아래 내역 리스트(divide-y).
- `ACTION_KEYS` 로 action → i18n 라벨 매핑(`credit.actionLabels.{appointment_complete|mate_eval_complete|review_complete}`).
  미매핑 action 은 원문 그대로 표시(fallback).
- 각 행: 라벨 + 로케일 날짜/시간(HH:MM) + `+{pointsAmount}`(항상 +). 비로그인 시 Google 로그인 유도.
- API 클라이언트: `apps/web/src/lib/api/credits.ts` `getMyCredits(page,limit)`.

## References

- `apps/bff/prisma/schema.prisma` — model `CreditLedger` (필드·인덱스)
- `apps/bff/prisma/migrations/20260530140000_phase2_eval_credit/migration.sql` — `credit_ledgers` 테이블 생성
- `apps/bff/prisma/migrations/20260530150000_add_review_complete_dedup_index/migration.sql` — partial unique dedup 인덱스 2종
- `apps/bff/src/routes/evaluation.ts` — `mate_eval_complete` / `review_complete` 적립 (`CREDIT_MATE_EVAL`, `CREDIT_REVIEW`)
- `apps/bff/src/jobs/chat-scheduler.ts` — `notifyMateEval()` `appointment_complete` 적립 (`CREDIT_APPOINTMENT_COMPLETE`)
- `apps/bff/src/routes/me.ts` — `listMyCredits()` 읽기 API + 잔액 SUM
- `apps/bff/src/app.ts` — `/me/credits` 라우트 등록
- `apps/web/src/lib/api/credits.ts` — `getMyCredits` 클라이언트 + 타입
- `apps/web/src/pages/CreditPage/index.tsx` — 크레딧 내역 UI
- `docs/decisions/0007-phase2-community-mate-matching.md` 결정5 — 적립형 카운터, sink 없음, 옵션 C
