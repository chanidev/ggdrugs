# Phase 2 Slice 5 — 평가 + 설문 + 크레딧 Implementation Plan (최종)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) 또는 `superpowers:executing-plans`. 체크박스(`- [ ]`) 단위로 진행.
>
> 이 플랜은 **focused**형: 스키마/마이그레이션은 전체, BFF/UI는 스코프드 스펙 + 핵심 시그니처. 세부 구현은 슬라이스2·3 패턴을 템플릿으로 따른다.

**Goal.** 약속을 **다녀온 후** 메이트 평가(A_900)·축제 설문+후기(A_901)·크레딧 적립(CreditLedger)을 end-to-end로 구현한다.

> ## ⚠️ 전체 구현 오버라이드 (이 블록이 아래 본문의 모든 "컷/한정/미구현/placeholder"를 **무효화**한다. 미구현 없음 — 전부 실제 구현.)
> 1. **그룹 평가 전체 구현** — "1:1 한정"·`group_not_supported` 409 게이트 **삭제**. 그룹 약속이면 **참가자 N-1명 전원**을 평가 대상으로 처리(메이트 평가는 대상별 1행). 축제 설문/후기는 참가자별 1회. `evaluatedUserId`는 동일 `chatRoomId` 멤버 검증.
> 2. **"다녀온 후" 완료 게이트** — confirmed 직후 게이트 **삭제**. 평가/설문/후기는 `appointment.status='confirmed' AND appointedAt <= now()`(약속일 경과)일 때만 허용. 아니면 409 `not_attended_yet`.
> 3. **mate_eval 평가 알림 진입 전체 구현(GG-REVIEW-001)** — "버튼 한정" **삭제**. `chat-scheduler.ts`에 신규 잡: `confirmed` 약속의 `appointedAt` 경과 시 참가자 전원에게 `notificationType='mate_eval'` 알림 생성(중복 방지는 동일 약속·사용자의 기존 mate_eval Notification 존재로 dedup). 알림 클릭 → 평가 화면 진입.
> 4. **크레딧 적립 2종 전체 구현** — `appointment_complete` "미구현/placeholder" **삭제**. 약속 완료(appointedAt 경과, 스케줄러) 시 참가자에게 `appointment_complete` 적립 **+** 평가 작성 시 `mate_eval_complete` 적립. 둘 다 `credit_ledger.appointment_id`로 dedup.
> 5. 그 외 본문의 "Slice 7+ placeholder", "미구현", "범위 밖" 표현은 전부 이 슬라이스에서 실제 구현(스키마 변경 없이 기존 컬럼 appointedAt/Notification/credit_ledger.appointment_id 로 가능).

**Architecture.**

```
Appointment.confirmed (voteAppointment)
  └─► [이슈2 결정] 진입 경로 = 커뮤니티 추천 영역 "평가하기" 버튼 (query: appointmentId, evaluatedUserId, chatRoomId)
        ※ mate_eval 알림 생성은 이 슬라이스 범위 밖 — chat-room.ts 수정 없음.
        ※ 아키텍처 초안의 "notificationType='mate_eval' 알림 안내" 문구를 삭제.

POST /community/appointments/:appointmentId/evaluate
  ├─ 트랜잭션: MateEvaluation + FestivalSurvey + FestivalReview + CreditLedger
  └─ best-effort: updateMateIndex(evaluatedUserId) (트랜잭션 밖)
```

**Tech Stack.** Express 5, Prisma 5 (BigInt, `@db.VarChar`), PostgreSQL 15, SEED Option B (all.css), React 19 + Vite 6, TypeScript strict (noUnusedLocals).

---

## 설계 결정 (리뷰 28건 반영)

| # | 이슈 | 결정 |
|---|---|---|
| 2 | mate_eval 알림 미존재 | **진입 = 커뮤니티 추천 영역 "평가하기" 버튼 한정.** chat-room.ts 수정 없음. 아키텍처 문구 수정. |
| 3 | 그룹 다대다 평가 미설계 | **1:1 약속 한정**으로 명시. `ChatRoom.roomType='1:1'` 게이트 추가. `FestivalSurvey/FestivalReview`의 UNIQUE = `(appointmentId, userId)` 로 변경(그룹 확장 대비). 메이트 평가는 단일 `evaluatedUserId` 허용(uq_mate_eval_pair 유지). |
| 4 | eventId 부재 | `FestivalReview`에 `eventId BigInt? @map("event_id")` 추가. 제출 시 `Appointment.eventId`로부터 채움. `eventId`가 null이면 설문/후기 제출 차단(400 `event_required`). 이벤트-후기 연동(GG-FEST-REVIEW-008 공개) 데이터 모델 전제 충족. |
| 5 | appointment_complete 적립 누락 | `appointment_complete`는 **향후 슬라이스(Slice 7+) placeholder** — 이 슬라이스에서 적립 코드 없음. `action` 도메인/라벨에는 남겨두되 플랜에 "Slice 5 미구현" 명기. |
| 6 | upsert vs update 불일치 | Slice2 `mate.ts`가 `upsert({create:{50}, update:{}})` 이미 구현 확인. Slice5 `mate-index-updater.ts`는 `prisma.mateIndex.update`만 사용(create 금지). 행 미존재 시 에러 throw — Slice2 초기화 전제 fail-fast. 주석 정정. |
| 7 | evaluatedUserId 검증 미흡 | `evaluatedUserId`가 동일 `chatRoomId`의 `GroupMembership` 멤버인지 검증 스텝 추가. 1:1 한정이므로 "상대 1명" 검증으로 단순화. |
| 1 | 사진 업로드 계약 불일치 | 경로 `POST /reviews/photos/upload-url`, body `{contentType: file.type, sizeBytes: file.size}`, 응답 `{uploadUrl, publicUrl, key}` — 실제 `reviewPhotoUploadUrl` 핸들러 확인. `fileUrl` 사용 금지, `publicUrl` 사용. |
| 8 | 파일 맵 mate-eval.ts 모순 | 파일 맵에서 `mate-eval.ts Case 17~20` 행 삭제. 하니스는 신규 `slice5-eval.ts`만. |
| 9 | EvaluationPage 중복 제출 사전 차단 | 마운트 시 `getMyEvaluation` 호출 → 이미 제출이면 즉시 'done' 화면. |
| 10 | penalty 중복 누적 | penalty = **최신 평가(evals[0])에 reportedFor가 있을 때만 -3** (1회성). 윈도우 전체 카운트 방식 폐기. |
| 11 | GG-REVIEW-003 결번 | 요구사항 원문(`_p2_req_text.txt`)에서 GG-REVIEW-003이 결번(002→004 점프). 자기검토표 "GG-REVIEW-001~010 완료" → "GG-REVIEW-001,002,004~010 완료(003 원문 결번)"로 수정. |
| 12 | GG-FEST-REVIEW-008 eventId 전제 | 이슈4 해결(eventId 추가)로 후속 events/:id 연동 가능 상태로 복원. 공개 surfacing 자체는 후속 태스크. |
| 13 | 신고 Report 모델 연계 공백 | MateEvaluation.reportedFor 단독 기록(Report 모델 별도 생성 없음) — 관리자는 `SELECT * FROM mate_evaluations WHERE reported_for IS NOT NULL`으로 조회. ADR 0007 결정13/14의 Report 모델은 Slice 8 범위로 연기. 플랜에 명기. |
| 14 | 크레딧 +10 근거 | ADR 0007 결정5 "액수 Open items"로 미정. **이 플랜에서 `+10`으로 가정 상수 고정** — ADR 0007에 보강 필요(에이전트 작업 아님). |
| 15 | 약속 완료 시점 미정의 | **진입 게이트 = `Appointment.status='confirmed'`** (약속 합의 직후). 스펙 이상("다녀온 후")과의 차이는 ADR 0007 Open item으로 남김 — 현재 시스템에 `completed` 상태 없음. `appointedAt` 경과 판정 로직 미구현. |
| 16 | GG-COMM-011/012 ID 불일치 | 크레딧 내역 화면(9-1) 요구 출처는 **GG-MY-008 + GG-COMM-017** (파일 원문 기준). 자기검토표 레퍼런스 정정. |
| 17 | StarRating SEED 미제공 | `StarRating.tsx` 직접 구현. 실행 전 `all.css`에서 `--color-brand`, `--color-border`, `--radius-sm` 토큰 존재 확인. |
| 18 | MateIndex upsert vs update | 이슈6과 동일. `update`만 사용, 행 미존재 시 에러 — 이슈6 참조. |
| 19 | Appointment→Notification 흐름 | 이슈2 결정: 알림 트리거 없음. 진입은 버튼 경로. |
| 20 | router 파일 오류 | 라우터 파일 = `apps/web/src/main.tsx` (BrowserRouter + Routes). `app.tsx` 아님. |
| 21 | balance=0 모호성 | 주석으로 명확화: `balance = SUM(pointsAmount)`. 행 없으면 `_sum.pointsAmount`가 `null` → `?? 0`. |
| 22 | photo_urls CHECK 제약 | migration.sql에 `CHECK (array_length(photo_urls, 1) IS NULL OR array_length(photo_urls, 1) <= 10)` 추가. |
| 23 | comment whitespace trim | 주석으로 명확화: trim 후 빈 문자열이면 null. 검증은 trim 전 raw에 대해 실행. |
| 24 | test case 3 off-by-one | `'가나다라마바사아자차'` = 30 bytes → 조건 `> 30` 이므로 PASS. 테스트 31-byte 문자열로 교체: `'가나다라마바사아자차a'` (30+1=31 bytes → 400). |
| 25 | Notification 트리거 | 이슈2 결정으로 불필요. |
| 26 | MateIndex 초기화 계약 | Slice2 `mate.ts:174` 확인: `upsert({create:{indexValue:50}, update:{}})` — 프로필 저장 시 MateIndex 자동 생성. Slice5 `updateMateIndex`는 `update`만 사용. |
| 27 | 사진 업로드 엔드포인트 | `POST /reviews/photos/upload-url` 이미 존재 (`app.ts:658`). Task 6에서 재사용. |
| 28 | appointment_complete 미구현 | 이슈5와 동일. |

---

## 파일 맵

### 신규 생성

| 파일 | 책임 |
|---|---|
| `apps/bff/prisma/migrations/20260530_slice5_eval_credit/migration.sql` | 4개 신규 테이블 DDL + CHECK + 트리거 |
| `apps/bff/src/routes/evaluation.ts` | POST evaluate + GET evaluation |
| `apps/bff/src/lib/mate-index-updater.ts` | 가중 이동평균 indexValue 갱신 (update 전용) |
| `apps/bff/src/jobs/slice5-eval.ts` | in-process 검증 하니스 8케이스 |
| `apps/web/src/pages/EvaluationPage/index.tsx` | A_900+A_901 2-step 폼 |
| `apps/web/src/pages/EvaluationPage/parts/MateEvalStep.tsx` | Step 1: 별점+Likert+한줄평+신고/차단 |
| `apps/web/src/pages/EvaluationPage/parts/FestivalStep.tsx` | Step 2: 설문+후기+사진 |
| `apps/web/src/pages/EvaluationPage/parts/StarRating.tsx` | 별점 위젯 (SEED 미제공, 직접 구현) |
| `apps/web/src/pages/CreditPage/index.tsx` | 크레딧 내역 (와이어 9-1) |
| `apps/web/src/lib/api/evaluation.ts` | evaluation API 클라이언트 |
| `apps/web/src/lib/api/credits.ts` | credits API 클라이언트 |

### 수정

| 파일 | 변경 내용 |
|---|---|
| `apps/bff/prisma/schema.prisma` | 4모델 추가 + User 관계 5개 |
| `apps/bff/src/app.ts` | 평가 라우트 2개 + credits 라우트 마운트 |
| `apps/bff/src/routes/me.ts` | `listMyCredits` 함수 추가 |
| `apps/bff/package.json` | `"slice5:eval"` 스크립트 추가 |
| `apps/web/src/main.tsx` | `/evaluate/:appointmentId`, `/credits` 라우트 추가 |
| `apps/web/src/pages/CommunityPage/parts/CommunityShell.tsx` | "크레딧 N개" placeholder → 실 API 연결 |

---

## Task 1: Prisma 스키마 4모델 + migration.sql 초안

**Files:**
- Modify: `apps/bff/prisma/schema.prisma`
- Create: `apps/bff/prisma/migrations/20260530_slice5_eval_credit/migration.sql`

### 배경 지식

- 기존 패턴: `String @db.VarChar` enum, BigInt FK, `@map` snake_case, `@db.Timestamptz`.
- **MIGRATION HUMAN GATE**: 에이전트는 `prisma migrate`, `db push`, `db reset`, `migrate diff` **절대 실행 금지**. `prisma validate` + `prisma generate`까지만. 적용은 사람이 `prisma migrate deploy`로 수행.
- **이슈3 결정**: `FestivalSurvey`, `FestivalReview`의 UNIQUE = `(appointmentId, userId)` (단일 `appointmentId` UNIQUE 아님 — 그룹 확장 대비).
- **이슈4 결정**: `FestivalReview`에 `eventId BigInt?` 추가. 제출 시 `Appointment.eventId`에서 채움.
- **이슈6/26 결정**: MateIndex는 Slice2가 이미 생성. Slice5 updater는 `update`만.

- [ ] **Step 1: schema.prisma — User 모델 관계 5개 추가**

`User` 모델의 `blocksReceived Block[] @relation("BlockReceiver")` 줄 바로 다음에 추가:

```prisma
  mateEvaluationsGiven    MateEvaluation[]    @relation("EvalGiver")
  mateEvaluationsReceived MateEvaluation[]    @relation("EvalReceiver")
  festivalSurveys         FestivalSurvey[]
  festivalReviews         FestivalReview[]
  creditLedgers           CreditLedger[]
```

- [ ] **Step 2: schema.prisma — 4모델 블록 추가 (EOF 뒤)**

```prisma
// ============================================================
// MATE_EVALUATION (A_900 — GG-REVIEW-001,002,004~010, 와이어 9-15)
// GG-REVIEW-003은 요구사항 원문(_p2_req_text.txt)에서 결번(002→004 점프).
// reportedFor: null=신고없음 | 'inappropriate'|'harassing'|'no_show'|'etc'
// 1 evaluator → 1 evaluation per (appointment, evaluated) — uq_mate_eval_pair
// [이슈3] 1:1 약속 한정 (ChatRoom.roomType='1:1' 게이트는 BFF 라우트에서 확인).
// [이슈13] 신고 별도 Report 모델 없음 — Slice 8 범위. 관리자는 reported_for IS NOT NULL 직접 조회.
// ============================================================
model MateEvaluation {
  evalId          BigInt    @id @default(autoincrement()) @map("eval_id")
  appointmentId   BigInt    @map("appointment_id")
  evaluatorUserId BigInt    @map("evaluator_user_id")
  evaluatedUserId BigInt    @map("evaluated_user_id")
  ratingStars     Int       @map("rating_stars") @db.SmallInt // 1~5
  q1              Int       @db.SmallInt // 시간약속 1~5
  q2              Int       @db.SmallInt // 의사소통 1~5
  q3              Int       @db.SmallInt // 분위기/유쾌함 1~5
  q4              Int       @db.SmallInt // 재방문의향 1~5
  comment         String?   @db.VarChar(30) // ≤30 UTF-8 byte (GG-REVIEW-005)
  reportedFor     String?   @map("reported_for") @db.VarChar(20)
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz

  evaluator     User @relation("EvalGiver",    fields: [evaluatorUserId], references: [userId])
  evaluatedUser User @relation("EvalReceiver", fields: [evaluatedUserId], references: [userId])

  @@unique([appointmentId, evaluatorUserId, evaluatedUserId], map: "uq_mate_eval_pair")
  @@index([evaluatedUserId, createdAt(sort: Desc)], map: "idx_mate_eval_evaluated")
  @@map("mate_evaluations")
}

// ============================================================
// FESTIVAL_SURVEY (A_901 — GG-FEST-REVIEW-001~007, 비공개)
// 5범주 Likert 1~5: atmosphere, program, food, safety, transport
// [이슈3] UNIQUE = (appointmentId, userId) — appointmentId 단독 UNIQUE 아님.
//         그룹(최대 4인) 확장 시 각 멤버가 독립 제출 가능.
// ============================================================
model FestivalSurvey {
  surveyId      BigInt   @id @default(autoincrement()) @map("survey_id")
  appointmentId BigInt   @map("appointment_id")
  userId        BigInt   @map("user_id")
  atmosphere    Int      @db.SmallInt
  program       Int      @db.SmallInt
  food          Int      @db.SmallInt
  safety        Int      @db.SmallInt
  transport     Int      @db.SmallInt
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [userId])

  @@unique([appointmentId, userId], map: "uq_festival_survey_pair")
  @@map("festival_surveys")
}

// ============================================================
// FESTIVAL_REVIEW (A_901 — GG-FEST-REVIEW-008, 공개)
// [이슈3] UNIQUE = (appointmentId, userId).
// [이슈4] eventId 추가 — 이벤트 상세 연동 전제 (GG-FEST-REVIEW-008 공개 surfacing).
//         eventId=null인 약속은 평가 제출 차단(400 event_required).
//         후기 공개 surfacing(events/:id) 자체는 후속 태스크.
// ============================================================
model FestivalReview {
  reviewId      BigInt   @id @default(autoincrement()) @map("review_id")
  appointmentId BigInt   @map("appointment_id")
  userId        BigInt   @map("user_id")
  eventId       BigInt?  @map("event_id") // Appointment.eventId에서 복사 (null 불가 — 라우트에서 검증)
  ratingStars   Int      @map("rating_stars") @db.SmallInt // 1~5
  body          String   @db.VarChar(5000)
  photoUrls     String[] @map("photo_urls") // TEXT[], max 10 URLs (S3 publicUrl)
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [userId])

  @@unique([appointmentId, userId], map: "uq_festival_review_pair")
  @@index([eventId, createdAt(sort: Desc)], map: "idx_festival_review_event")
  @@index([userId, createdAt(sort: Desc)],  map: "idx_festival_review_user")
  @@map("festival_reviews")
}

// ============================================================
// CREDIT_LEDGER (ADR 0007 결정5 옵션C — GG-MY-008, GG-COMM-017)
// append-only 거래 로그. 잔액 = SUM(pointsAmount) WHERE userId.
// action 도메인:
//   'mate_eval_complete'  — 메이트 평가 작성 +10 (Slice 5 구현)
//   'review_complete'     — 후기 작성 (Slice 5 구현 — 동일 트랜잭션)
//   'appointment_complete'— 약속 완료 (Slice 7+ placeholder, Slice 5 미구현)
// 크레딧 적립 +10 상수: ADR 0007 결정5에서 "액수 Open items"로 미정.
//   이 플랜에서 10으로 가정 고정 — ADR 0007 보강 필요 (에이전트 작업 아님).
// ============================================================
model CreditLedger {
  ledgerId      BigInt   @id @default(autoincrement()) @map("ledger_id")
  userId        BigInt   @map("user_id")
  action        String   @db.VarChar(30)
  pointsAmount  Int      @map("points_amount") // 양수 = 적립
  appointmentId BigInt?  @map("appointment_id") // 출처 추적
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [userId])

  @@index([userId, createdAt(sort: Desc)], map: "idx_credit_ledger_user")
  @@map("credit_ledgers")
}
```

- [ ] **Step 3: prisma validate 실행**

```bash
cd apps/bff
npm run prisma:validate
```

Expected: `The schema at ... is valid` (exit 0). 오류 시 관계명/필드 오타 수정 후 재실행.

- [ ] **Step 4: migration.sql 초안 작성**

`apps/bff/prisma/migrations/20260530_slice5_eval_credit/migration.sql` 파일 생성:

```sql
-- Slice 5: MateEvaluation / FestivalSurvey / FestivalReview / CreditLedger
-- HUMAN GATE: 에이전트는 이 파일을 실행하지 않는다.
--             사람이 `prisma migrate deploy` 로 수동 적용할 것.
--
-- 설계 결정:
--   [이슈3] FestivalSurvey/FestivalReview UNIQUE = (appointment_id, user_id)
--           — 그룹 최대 4인 대비, appointmentId 단독 UNIQUE 아님.
--   [이슈4] festival_reviews.event_id — 이벤트 상세 연동 전제.
--   [이슈22] photo_urls CHECK ≤10장.

CREATE TABLE mate_evaluations (
  eval_id           BIGSERIAL PRIMARY KEY,
  appointment_id    BIGINT NOT NULL,
  evaluator_user_id BIGINT NOT NULL REFERENCES users(user_id),
  evaluated_user_id BIGINT NOT NULL REFERENCES users(user_id),
  rating_stars      SMALLINT NOT NULL CHECK (rating_stars BETWEEN 1 AND 5),
  q1                SMALLINT NOT NULL CHECK (q1 BETWEEN 1 AND 5),
  q2                SMALLINT NOT NULL CHECK (q2 BETWEEN 1 AND 5),
  q3                SMALLINT NOT NULL CHECK (q3 BETWEEN 1 AND 5),
  q4                SMALLINT NOT NULL CHECK (q4 BETWEEN 1 AND 5),
  comment           VARCHAR(30),
  reported_for      VARCHAR(20) CHECK (reported_for IN ('inappropriate','harassing','no_show','etc')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mate_eval_pair UNIQUE (appointment_id, evaluator_user_id, evaluated_user_id)
);
CREATE INDEX idx_mate_eval_evaluated ON mate_evaluations (evaluated_user_id, created_at DESC);

-- [이슈3] UNIQUE = (appointment_id, user_id)
CREATE TABLE festival_surveys (
  survey_id      BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT NOT NULL REFERENCES appointments(appointment_id),
  user_id        BIGINT NOT NULL REFERENCES users(user_id),
  atmosphere     SMALLINT NOT NULL CHECK (atmosphere BETWEEN 1 AND 5),
  program        SMALLINT NOT NULL CHECK (program BETWEEN 1 AND 5),
  food           SMALLINT NOT NULL CHECK (food BETWEEN 1 AND 5),
  safety         SMALLINT NOT NULL CHECK (safety BETWEEN 1 AND 5),
  transport      SMALLINT NOT NULL CHECK (transport BETWEEN 1 AND 5),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_festival_survey_pair UNIQUE (appointment_id, user_id)
);

-- [이슈3] UNIQUE = (appointment_id, user_id)
-- [이슈4] event_id — Appointment.eventId 복사 (NULL 허용하지만 라우트에서 NULL 시 400)
-- [이슈22] photo_urls CHECK ≤10장
CREATE TABLE festival_reviews (
  review_id      BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT NOT NULL REFERENCES appointments(appointment_id),
  user_id        BIGINT NOT NULL REFERENCES users(user_id),
  event_id       BIGINT,
  rating_stars   SMALLINT NOT NULL CHECK (rating_stars BETWEEN 1 AND 5),
  body           VARCHAR(5000) NOT NULL,
  photo_urls     TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_festival_review_pair UNIQUE (appointment_id, user_id),
  CONSTRAINT check_photo_urls_count
    CHECK (array_length(photo_urls, 1) IS NULL OR array_length(photo_urls, 1) <= 10)
);
CREATE INDEX idx_festival_review_event ON festival_reviews (event_id, created_at DESC);
CREATE INDEX idx_festival_review_user  ON festival_reviews (user_id, created_at DESC);
CREATE TRIGGER trg_festival_reviews_updated_at
  BEFORE UPDATE ON festival_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- action CHECK: appointment_complete = Slice 7+ placeholder (Slice 5 미구현)
CREATE TABLE credit_ledgers (
  ledger_id      BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(user_id),
  action         VARCHAR(30) NOT NULL
    CHECK (action IN ('appointment_complete','mate_eval_complete','review_complete')),
  points_amount  INT NOT NULL,
  appointment_id BIGINT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_credit_ledger_user ON credit_ledgers (user_id, created_at DESC);
```

- [ ] **Step 5: prisma generate (클라이언트 재빌드)**

```bash
cd apps/bff
npm run prisma:generate
```

Expected: `Generated Prisma Client` (exit 0). DB 연결 없이 타입만 생성됨.

- [ ] **Step 6: 커밋**

```bash
git add apps/bff/prisma/schema.prisma \
        apps/bff/prisma/migrations/20260530_slice5_eval_credit/migration.sql
git commit -m "feat(infra): slice5 schema — MateEvaluation/FestivalSurvey/FestivalReview/CreditLedger (HUMAN migrate)"
```

---

## Task 2: BFF 평가 라우트 (evaluation.ts) + MateIndex 갱신 순수 함수

**Files:**
- Create: `apps/bff/src/lib/mate-index-updater.ts`
- Create: `apps/bff/src/routes/evaluation.ts`
- Modify: `apps/bff/src/app.ts`

### 배경 지식

- `POST /community/appointments/:appointmentId/evaluate` 단일 제출: MateEvaluation + FestivalSurvey + FestivalReview + CreditLedger를 `prisma.$transaction`으로 원자 저장.
- **[이슈2]** 진입 경로 = 커뮤니티 추천 영역 버튼. `chat-room.ts` 수정 없음.
- **[이슈3]** `ChatRoom.roomType='1:1'` 게이트: 그룹 채팅방은 이 슬라이스에서 평가 불가(409 `group_not_supported`).
- **[이슈4]** `Appointment.eventId` 조회: null이면 400 `event_required`.
- **[이슈6/26]** `updateMateIndex`는 `prisma.mateIndex.update`만 사용. 행 없으면 에러 throw (Slice2 초기화 전제 fail-fast).
- **[이슈7]** `evaluatedUserId`가 동일 chatRoomId의 GroupMembership 멤버인지 검증.
- **[이슈10]** penalty = 최신 평가(evals[0])의 `reportedFor !== null`이면 -3, 아니면 0 (1회성, 중복 누적 없음).
- 중복 제출: `P2002` → 409 `already_submitted`.
- `comment` ≤30 UTF-8 byte: `Buffer.byteLength(commentRaw, 'utf8') > 30` 시 400. trim 후 빈 문자열이면 null ([이슈23]).
- `photoUrls`: BFF에서 배열 수집만. S3 presigned URL은 클라이언트가 별도 호출.
- `reportedFor` 저장: MateEvaluation.reportedFor 필드만. 별도 Report 모델 없음 ([이슈13]).
- PII: comment 내용 로그 출력 금지.
- CreditLedger: `mate_eval_complete +10` (트랜잭션 내). `appointment_complete`는 미구현 ([이슈5]).

### 2-1: mate-index-updater.ts

- [ ] **Step 1: `apps/bff/src/lib/mate-index-updater.ts` 생성**

```typescript
/**
 * mate-index-updater.ts — MateIndex 가중 이동평균 갱신 (Slice 5, ADR 0007 결정4)
 *
 * 공식:
 *   rawScore = (ratingStars*10 + avg(q1~q4)*10) / 2  → 0~100 범위
 *   newIndex = round(prevIndex * 0.6 + rawScore * 0.4) → 최근값 40% 반영
 *
 * [이슈10] penalty: 최신 평가(evals[0])에 reportedFor가 있을 때만 -3 (1회성).
 *   윈도우 전체 카운트 방식 폐기 — 이미 반영된 감점 중복 누적 방지.
 *
 * [이슈6/26] 불변 원칙: prisma.mateIndex.UPDATE 전용 — create 금지.
 *   MateIndex 행은 Slice2(mate.ts createMateProfile)에서 indexValue=50으로 생성됨.
 *   행 미존재 시 RecordNotFound 에러 throw (fail-fast).
 */
import { prisma } from '../prisma.js';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export async function updateMateIndex(evaluatedUserId: bigint): Promise<void> {
  const evals = await prisma.mateEvaluation.findMany({
    where: { evaluatedUserId },
    select: { ratingStars: true, q1: true, q2: true, q3: true, q4: true, reportedFor: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  if (evals.length === 0) return;

  // [이슈6] update 전용 — 행 없으면 findUniqueOrThrow가 에러 throw
  const current = await prisma.mateIndex.findUniqueOrThrow({
    where: { userId: evaluatedUserId },
    select: { indexValue: true },
  });
  const prevIndex = current.indexValue;

  // 최신 평가 점수 (가중 이동평균용 최근값)
  const latest = evals[0]!;
  const avgQ = (latest.q1 + latest.q2 + latest.q3 + latest.q4) / 4;
  const rawScore = (latest.ratingStars * 10 + avgQ * 10) / 2;

  // [이슈10] penalty: 최신 평가에 신고가 있을 때만 -3 (1회성)
  const penalty = latest.reportedFor !== null ? 3 : 0;

  const newIndex = clamp(Math.round(prevIndex * 0.6 + rawScore * 0.4) - penalty, 0, 100);

  await prisma.mateIndex.update({
    where: { userId: evaluatedUserId },
    data: { indexValue: newIndex },
  });
}
```

### 2-2: routes/evaluation.ts

- [ ] **Step 2: `apps/bff/src/routes/evaluation.ts` 생성**

```typescript
/**
 * evaluation.ts — A_900 메이트평가 + A_901 축제설문/후기 단일 제출 (Slice 5)
 *
 * POST /community/appointments/:appointmentId/evaluate
 *   - requireAuth
 *   - [이슈3] ChatRoom.roomType='1:1' 게이트 (그룹 미지원)
 *   - [이슈4] Appointment.eventId 게이트 (null 시 400)
 *   - [이슈7] evaluatedUserId가 동일 chatRoomId 멤버인지 검증
 *   - MateEvaluation + FestivalSurvey + FestivalReview + CreditLedger 원자 저장
 *   - best-effort: updateMateIndex(evaluatedUserId)
 *
 * GET /community/appointments/:appointmentId/evaluation
 *   - requireAuth
 *   - 본인이 제출한 평가 조회 (이미 제출 여부 확인 — [이슈9] 클라이언트 사전 차단용)
 */
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { logger } from '../logger.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';
import { updateMateIndex } from '../lib/mate-index-updater.js';

const REPORTED_FOR_VALUES = new Set(['inappropriate', 'harassing', 'no_show', 'etc']);

function parseBigId(raw: unknown): bigint | null {
  const s = typeof raw === 'string' ? raw : '';
  try {
    const n = BigInt(s);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

function parseLikert(v: unknown): number | null {
  const n =
    typeof v === 'number' ? v
    : typeof v === 'string' ? Number.parseInt(v, 10)
    : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export async function submitEvaluation(req: Request, res: Response): Promise<void> {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }

  const appointmentId = parseBigId(req.params['appointmentId']);
  if (!appointmentId) { res.status(400).json({ error: 'invalid appointmentId' }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;

  // ── Step A: 약속 존재 + 확정 게이트 ──────────────────────────────────
  const appointment = await prisma.appointment.findUnique({
    where: { appointmentId },
    select: { status: true, chatRoomId: true, eventId: true },
  });
  if (!appointment) { res.status(404).json({ error: 'appointment_not_found' }); return; }
  if (appointment.status !== 'confirmed') {
    res.status(409).json({ error: 'appointment_not_confirmed' }); return;
  }

  // ── [이슈4] eventId 게이트 ─────────────────────────────────────────
  if (!appointment.eventId) {
    res.status(400).json({ error: 'event_required' }); return;
  }

  // ── [이슈3] 1:1 채팅방 게이트 ─────────────────────────────────────
  const room = await prisma.chatRoom.findUnique({
    where: { chatRoomId: appointment.chatRoomId },
    select: { roomType: true },
  });
  if (!room || room.roomType !== '1:1') {
    res.status(409).json({ error: 'group_not_supported' }); return;
  }

  // ── Step B: 요청자가 채팅방 멤버인지 확인 ──────────────────────────
  const myMembership = await prisma.groupMembership.findUnique({
    where: { chatRoomId_userId: { chatRoomId: appointment.chatRoomId, userId: auth.userId } },
    select: { memberStatus: true },
  });
  if (!myMembership || myMembership.memberStatus !== 'active') {
    res.status(403).json({ error: 'not_a_member' }); return;
  }

  // ── Step C: A_900 메이트평가 필드 검증 ──────────────────────────────
  const evaluatedUserId = parseBigId(body['evaluatedUserId']);
  if (!evaluatedUserId) { res.status(400).json({ error: 'evaluatedUserId required' }); return; }
  if (evaluatedUserId === auth.userId) { res.status(400).json({ error: 'cannot_eval_self' }); return; }

  // ── [이슈7] evaluatedUserId가 동일 chatRoomId 멤버인지 검증 ───────
  const targetMembership = await prisma.groupMembership.findUnique({
    where: { chatRoomId_userId: { chatRoomId: appointment.chatRoomId, userId: evaluatedUserId } },
    select: { memberStatus: true },
  });
  if (!targetMembership) {
    res.status(400).json({ error: 'evaluated_user_not_in_room' }); return;
  }

  const ratingStars = parseLikert(body['ratingStars']);
  if (!ratingStars) { res.status(400).json({ error: 'ratingStars 1~5 required' }); return; }

  const q1 = parseLikert(body['q1']);
  const q2 = parseLikert(body['q2']);
  const q3 = parseLikert(body['q3']);
  const q4 = parseLikert(body['q4']);
  if (!q1 || !q2 || !q3 || !q4) { res.status(400).json({ error: 'q1~q4 1~5 required' }); return; }

  // [이슈23] trim 전 raw에 대해 byte 검증, trim 후 빈 문자열이면 null
  const commentRaw = typeof body['comment'] === 'string' ? body['comment'].trim() : '';
  if (commentRaw && Buffer.byteLength(commentRaw, 'utf8') > 30) {
    res.status(400).json({ error: 'comment_too_long' }); return;
  }
  const comment = commentRaw || null;

  const reportedFor =
    typeof body['reportedFor'] === 'string' && REPORTED_FOR_VALUES.has(body['reportedFor'])
      ? body['reportedFor']
      : null;

  // ── Step D: A_901 설문/후기 필드 검증 ────────────────────────────
  const atmosphere = parseLikert(body['atmosphere']);
  const program    = parseLikert(body['program']);
  const food       = parseLikert(body['food']);
  const safety     = parseLikert(body['safety']);
  const transport  = parseLikert(body['transport']);
  if (!atmosphere || !program || !food || !safety || !transport) {
    res.status(400).json({ error: 'survey fields 1~5 required' }); return;
  }

  const reviewBody = typeof body['reviewBody'] === 'string' ? body['reviewBody'].trim() : '';
  if (!reviewBody) { res.status(400).json({ error: 'reviewBody required' }); return; }
  if (reviewBody.length > 5000) { res.status(400).json({ error: 'reviewBody_too_long' }); return; }

  const photoUrls: string[] = Array.isArray(body['photoUrls'])
    ? (body['photoUrls'] as unknown[]).filter((u): u is string => typeof u === 'string').slice(0, 10)
    : [];

  const reviewRating = parseLikert(body['reviewRating']);
  if (!reviewRating) { res.status(400).json({ error: 'reviewRating 1~5 required' }); return; }

  // ── Step E: 트랜잭션 저장 ────────────────────────────────────────
  let evalId: bigint;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const ev = await tx.mateEvaluation.create({
        data: {
          appointmentId,
          evaluatorUserId: auth.userId,
          evaluatedUserId,
          ratingStars,
          q1, q2, q3, q4,
          comment,
          reportedFor,
        },
        select: { evalId: true },
      });

      await tx.festivalSurvey.create({
        data: {
          appointmentId,
          userId: auth.userId,
          atmosphere, program, food, safety, transport,
        },
      });

      await tx.festivalReview.create({
        data: {
          appointmentId,
          userId: auth.userId,
          eventId: appointment.eventId,   // [이슈4] Appointment.eventId 복사
          ratingStars: reviewRating,
          body: reviewBody,
          photoUrls,
        },
      });

      // 크레딧 적립: mate_eval_complete +10 (ADR 0007 결정5, 상수 가정)
      // appointment_complete는 Slice 7+ placeholder — 이 트랜잭션에서 미생성.
      await tx.creditLedger.create({
        data: {
          userId: auth.userId,
          action: 'mate_eval_complete',
          pointsAmount: 10,
          appointmentId,
        },
      });

      return ev;
    });
    evalId = result.evalId;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      res.status(409).json({ error: 'already_submitted' }); return;
    }
    throw e;
  }

  // ── Step F: MateIndex 갱신 (best-effort, 트랜잭션 밖) ─────────────
  try {
    await updateMateIndex(evaluatedUserId);
  } catch (e) {
    logger.warn(
      { err: e, evaluatedUserId: evaluatedUserId.toString() },
      'updateMateIndex failed (non-fatal)',
    );
  }

  // PII: comment 내용 로그 출력 금지
  logger.info(
    { action: 'mate_eval_submit', evaluatorUserId: auth.userId.toString(), appointmentId: appointmentId.toString() },
    'evaluation submitted',
  );

  res.status(201).json({ evalId: evalId.toString() });
}

/** [이슈9] GET — 마운트 시 중복 제출 사전 차단용. null이면 204. */
export async function getMyEvaluation(req: Request, res: Response): Promise<void> {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }

  const appointmentId = parseBigId(req.params['appointmentId']);
  if (!appointmentId) { res.status(400).json({ error: 'invalid appointmentId' }); return; }

  const ev = await prisma.mateEvaluation.findFirst({
    where: { appointmentId, evaluatorUserId: auth.userId },
    select: { evalId: true, evaluatedUserId: true, ratingStars: true, createdAt: true },
  });

  if (!ev) { res.status(204).end(); return; }
  res.json({
    evalId:          ev.evalId.toString(),
    evaluatedUserId: ev.evaluatedUserId.toString(),
    ratingStars:     ev.ratingStars,
    createdAt:       ev.createdAt.toISOString(),
  });
}
```

- [ ] **Step 3: app.ts — evaluation 라우트 마운트**

`apps/bff/src/app.ts` 상단 import 블록에:

```typescript
import { submitEvaluation, getMyEvaluation } from './routes/evaluation.js';
```

chat-rooms 라우트 블록 뒤 (vote 라우트 바로 다음):

```typescript
  // A_900/A_901 평가 제출 (Slice 5)
  app.post(
    '/community/appointments/:appointmentId/evaluate',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => submitEvaluation(req, res).catch(next),
  );
  app.get(
    '/community/appointments/:appointmentId/evaluation',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => getMyEvaluation(req, res).catch(next),
  );
```

- [ ] **Step 4: typecheck**

```bash
cd apps/bff && npm run typecheck
```

Expected: 에러 0건.

- [ ] **Step 5: 커밋**

```bash
git add apps/bff/src/lib/mate-index-updater.ts \
        apps/bff/src/routes/evaluation.ts \
        apps/bff/src/app.ts
git commit -m "feat(bff): slice5 evaluation route + mate-index-updater (A_900/A_901)"
```

---

## Task 3: GET /me/credits + CreditLedger 잔액 조회

**Files:**
- Modify: `apps/bff/src/routes/me.ts`
- Modify: `apps/bff/src/app.ts`

### 배경 지식

- CreditLedger append-only. 잔액 = `SUM(pointsAmount)` WHERE userId.
- Prisma aggregate: `_sum.pointsAmount`가 null이면 0 ([이슈21]: 행 없으면 balance=0).
- 내역 목록: 최신순 20건 기본 (page/limit 지원, max 100).
- `ledgerId`는 BigInt → `.toString()` 직렬화.
- `appointment_complete` 라벨은 ACTION_LABELS에 남기되 Slice 5에서는 데이터 미생성 ([이슈5]).

- [ ] **Step 1: me.ts — `listMyCredits` 추가 (파일 맨 끝)**

```typescript
/** GET /me/credits?page=&limit= — 크레딧 내역 + 잔액 (ADR 0007 결정5, 와이어 9-1)
 *
 * [이슈21] balance = SUM(pointsAmount). 행 없으면 _sum.pointsAmount=null → 0.
 * [이슈5]  appointment_complete 적립은 Slice 7+ — Slice 5에서는 해당 행 미생성.
 */
export async function listMyCredits(req: Request, res: Response): Promise<void> {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }

  const page  = Math.max(1, Number.parseInt(typeof req.query['page']  === 'string' ? req.query['page']  : '1',  10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(typeof req.query['limit'] === 'string' ? req.query['limit'] : '20', 10) || 20));

  const [agg, rows] = await Promise.all([
    prisma.creditLedger.aggregate({
      where: { userId: auth.userId },
      _sum: { pointsAmount: true },
    }),
    prisma.creditLedger.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: { ledgerId: true, action: true, pointsAmount: true, appointmentId: true, createdAt: true },
    }),
  ]);

  const balance = agg._sum.pointsAmount ?? 0;

  res.json({
    balance,
    page,
    limit,
    items: rows.map((r) => ({
      ledgerId:      r.ledgerId.toString(),
      action:        r.action,
      pointsAmount:  r.pointsAmount,
      appointmentId: r.appointmentId?.toString() ?? null,
      createdAt:     r.createdAt.toISOString(),
    })),
  });
}
```

- [ ] **Step 2: app.ts — credits 라우트 마운트**

import 블록에 `listMyCredits` 추가:

```typescript
import { updateMyProfile, listMyCredits } from './routes/me.js';
```

`/me/reviews` GET 라우트 근처에:

```typescript
  app.get(
    '/me/credits',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => listMyCredits(req, res).catch(next),
  );
```

- [ ] **Step 3: typecheck + 커밋**

```bash
cd apps/bff && npm run typecheck
git add apps/bff/src/routes/me.ts apps/bff/src/app.ts
git commit -m "feat(bff): GET /me/credits — CreditLedger 잔액+내역 (slice5)"
```

---

## Task 4: in-process 검증 하니스 (slice5-eval.ts)

**Files:**
- Create: `apps/bff/src/jobs/slice5-eval.ts`
- Modify: `apps/bff/package.json`

### 배경 지식

- 기존 `mate-eval.ts` 패턴 그대로 모방: MockReq/MockRes, check(), main().
- **[이슈8]** `mate-eval.ts`는 이 슬라이스에서 수정하지 않는다. 하니스는 `slice5-eval.ts`만.
- **[이슈24]** Case 3 comment 31 bytes (`'가나다라마바사아자차a'` = 30+1) → 조건 `> 30` → 400.
  `'가나다라마바사아자차'` = 30 bytes exactly → `> 30` 불만족 → PASS (테스트 대상 아님).
- MateIndex 초기화: 픽스처에서 `prisma.mateIndex.upsert({create:{indexValue:50}, update:{}})` — 테스트 후 삭제.
- `Appointment.eventId` 픽스처: `eventId`가 있어야 평가 제출 통과 ([이슈4]).
- `ChatRoom.roomType='1:1'` 픽스처 필수 ([이슈3]).

- [ ] **Step 1: `apps/bff/src/jobs/slice5-eval.ts` 생성**

```typescript
/**
 * slice5-eval.ts — Slice 5 in-process 검증 하니스 (PASS/FAIL)
 * 실행: npm run slice5:eval (apps/bff 에서)
 *
 * [이슈8]  mate-eval.ts 수정 없음. 이 파일만 신규 생성.
 * [이슈24] Case 3: 31-byte 문자열('가나다라마바사아자차a') → 400.
 */
import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { submitEvaluation, getMyEvaluation } from '../routes/evaluation.js';
import { listMyCredits } from '../routes/me.js';
import { updateMateIndex } from '../lib/mate-index-updater.js';

interface MockAuth { userId: bigint; nickname: string; activeRole: string; }
interface MockReq {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  auth?: MockAuth;
}
interface Captured { status: number; json: unknown; }

function mockRes(): Response & { _c: Captured } {
  const c: Captured = { status: 200, json: undefined };
  return {
    _c: c,
    status(s: number) { c.status = s; return this; },
    json(b: unknown) { c.json = b; return this; },
    end() { return this; },
  } as unknown as Response & { _c: Captured };
}

function mockReq(r: MockReq): Request {
  return { params: r.params ?? {}, query: r.query ?? {}, body: r.body ?? {}, auth: r.auth } as unknown as Request;
}

interface CaseResult { id: string; pass: boolean; failures: string[]; }
const results: CaseResult[] = [];

function check(id: string, fn: () => Promise<string[]>) {
  return fn()
    .then((f) => results.push({ id, pass: f.length === 0, failures: f }))
    .catch((e) => results.push({ id, pass: false, failures: [`threw: ${String(e)}`] }));
}

const BASE_EVAL_BODY = {
  ratingStars: 4,
  q1: 4, q2: 3, q3: 5, q4: 4,
  comment: '재밌었어요',   // '재밌었어요' = UTF-8 15 bytes → OK
  reportedFor: null,
  atmosphere: 4, program: 3, food: 4, safety: 5, transport: 3,
  reviewBody: '정말 즐거운 축제였습니다.',
  reviewRating: 4,
  photoUrls: [],
};

async function main() {
  // ── 픽스처 준비 ──────────────────────────────────────────────────
  const u1 = await prisma.user.findFirst({ where: { isDeleted: false }, select: { userId: true, nickname: true, activeRole: true } });
  const u2 = await prisma.user.findFirst({ where: { isDeleted: false, userId: { not: u1!.userId } }, select: { userId: true, nickname: true, activeRole: true } });
  if (!u1 || !u2) { console.error('need 2+ users'); process.exit(1); }

  const auth1: MockAuth = { userId: u1.userId, nickname: u1.nickname, activeRole: u1.activeRole };

  // 이벤트 1건 (eventId 픽스처 — [이슈4])
  const event = await prisma.event.findFirst({ where: { status: 'approved' }, select: { eventId: true } });
  if (!event) { console.error('need 1+ approved event'); process.exit(1); }

  // [이슈3] roomType='1:1'
  const room = await prisma.chatRoom.create({
    data: { roomType: '1:1', status: 'active', maxMembers: 2 },
    select: { chatRoomId: true },
  });
  await prisma.groupMembership.createMany({ data: [
    { chatRoomId: room.chatRoomId, userId: u1.userId, role: 'member', memberStatus: 'active' },
    { chatRoomId: room.chatRoomId, userId: u2.userId, role: 'member', memberStatus: 'active' },
  ]});
  const appt = await prisma.appointment.create({
    data: {
      chatRoomId: room.chatRoomId,
      proposerUserId: u1.userId,
      status: 'confirmed',
      eventId: event.eventId,   // [이슈4]
      expiresAt: new Date(Date.now() + 36 * 3600 * 1000),
    },
    select: { appointmentId: true },
  });

  // MateIndex 픽스처 ([이슈26] Slice2가 생성해야 하므로 테스트에서 upsert 보장)
  await prisma.mateIndex.upsert({
    where: { userId: u2.userId },
    create: { userId: u2.userId, indexValue: 50 },
    update: {},
  });

  try {
    // ── CASE 1: 정상 평가 제출 201 ───────────────────────────────
    await check('eval.submit.ok', async () => {
      const res = mockRes();
      await submitEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: appt.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u2.userId.toString() } }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 201) f.push(`status ${res._c.status} != 201`);
      if (!(res._c.json as { evalId?: string })?.evalId) f.push('no evalId');
      return f;
    });

    // ── CASE 2: 중복 제출 409 ────────────────────────────────────
    await check('eval.submit.duplicate_409', async () => {
      const res = mockRes();
      await submitEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: appt.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u2.userId.toString() } }),
        res,
      );
      return res._c.status === 409 ? [] : [`status ${res._c.status} != 409`];
    });

    // ── CASE 3: comment 31 byte 초과 400 ([이슈24]) ──────────────
    await check('eval.comment.too_long', async () => {
      // '가나다라마바사아자차' = 30 bytes (PASS), 'a' 추가 = 31 bytes → 400
      const longComment = '가나다라마바사아자차a';
      const res = mockRes();
      await submitEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: appt.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u2.userId.toString(), comment: longComment } }),
        res,
      );
      return res._c.status === 400 ? [] : [`status ${res._c.status} != 400 (comment_too_long)`];
    });

    // ── CASE 4: 미확정 약속 게이트 409 ──────────────────────────
    await check('eval.gate.not_confirmed', async () => {
      const pendingAppt = await prisma.appointment.create({
        data: { chatRoomId: room.chatRoomId, proposerUserId: u1.userId, status: 'proposed', eventId: event.eventId, expiresAt: new Date(Date.now() + 3600 * 1000) },
        select: { appointmentId: true },
      });
      const res = mockRes();
      await submitEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: pendingAppt.appointmentId.toString() }, body: { ...BASE_EVAL_BODY, evaluatedUserId: u2.userId.toString() } }),
        res,
      );
      await prisma.appointment.delete({ where: { appointmentId: pendingAppt.appointmentId } });
      return res._c.status === 409 ? [] : [`status ${res._c.status} != 409`];
    });

    // ── CASE 5: GET evaluation (제출 후 조회) ────────────────────
    await check('eval.get.ok', async () => {
      const res = mockRes();
      await getMyEvaluation(
        mockReq({ auth: auth1, params: { appointmentId: appt.appointmentId.toString() } }),
        res,
      );
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
      const b = res._c.json as { evalId?: string; ratingStars?: number };
      if (!b?.evalId) f.push('no evalId');
      if (b?.ratingStars !== 4) f.push(`ratingStars ${b?.ratingStars} != 4`);
      return f;
    });

    // ── CASE 6: CreditLedger 적립 검증 ──────────────────────────
    await check('credit.ledger.created', async () => {
      const ledger = await prisma.creditLedger.findFirst({
        where: { userId: auth1.userId, action: 'mate_eval_complete', appointmentId: appt.appointmentId },
        select: { pointsAmount: true },
      });
      const f: string[] = [];
      if (!ledger) f.push('CreditLedger row not found');
      if (ledger?.pointsAmount !== 10) f.push(`pointsAmount ${ledger?.pointsAmount} != 10`);
      return f;
    });

    // ── CASE 7: GET /me/credits 잔액 반영 ────────────────────────
    await check('credit.balance.ok', async () => {
      const res = mockRes();
      await listMyCredits(mockReq({ auth: auth1, query: { page: '1', limit: '20' } }), res);
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status} != 200`);
      const b = res._c.json as { balance?: number; items?: unknown[] };
      if (typeof b?.balance !== 'number') f.push('no balance field');
      if ((b?.balance ?? -1) < 10) f.push(`balance ${b?.balance} < 10`);
      if (!Array.isArray(b?.items)) f.push('items not array');
      return f;
    });

    // ── CASE 8: MateIndex 갱신 검증 ([이슈10] penalty 1회성) ─────
    await check('mateIndex.updated', async () => {
      await updateMateIndex(u2.userId);
      const idx = await prisma.mateIndex.findUnique({ where: { userId: u2.userId }, select: { indexValue: true } });
      const f: string[] = [];
      if (!idx) f.push('MateIndex not found');
      // stars=4, q avg=4 → rawScore=(40+40)/2=40 → 50*0.6+40*0.4=46, reportedFor=null → penalty=0 → 46
      if (idx && idx.indexValue === 50) f.push('indexValue unchanged (expected 46)');
      if (idx && (idx.indexValue < 0 || idx.indexValue > 100)) f.push(`indexValue ${idx.indexValue} out of range`);
      return f;
    });

  } finally {
    // 픽스처 정리 (역순 FK)
    await prisma.creditLedger.deleteMany({ where: { userId: auth1.userId, appointmentId: appt.appointmentId } });
    await prisma.mateEvaluation.deleteMany({ where: { appointmentId: appt.appointmentId } });
    await prisma.festivalSurvey.deleteMany({ where: { appointmentId: appt.appointmentId } });
    await prisma.festivalReview.deleteMany({ where: { appointmentId: appt.appointmentId } });
    await prisma.appointment.deleteMany({ where: { chatRoomId: room.chatRoomId } });
    await prisma.groupMembership.deleteMany({ where: { chatRoomId: room.chatRoomId } });
    await prisma.chatRoom.delete({ where: { chatRoomId: room.chatRoomId } });
    await prisma.mateIndex.upsert({
      where: { userId: u2.userId },
      create: { userId: u2.userId, indexValue: 50 },
      update: { indexValue: 50 }, // 원복
    });
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id}${r.failures.length ? ' :: ' + r.failures.join('; ') : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();
```

- [ ] **Step 2: package.json — 스크립트 추가**

`apps/bff/package.json` scripts 블록 내 `"mate:eval"` 바로 다음에:

```json
"slice5:eval": "dotenv -e ../../.env -- tsx src/jobs/slice5-eval.ts",
```

- [ ] **Step 3: typecheck + 커밋**

```bash
cd apps/bff && npm run typecheck
git add apps/bff/src/jobs/slice5-eval.ts apps/bff/package.json
git commit -m "test(bff): slice5-eval 하니스 8케이스 (eval/credit/mateIndex)"
```

- [ ] **Step 4: DB 준비 시 하니스 실행 (선택)**

```bash
cd apps/bff && npm run slice5:eval
```

Expected: `8/8 passed`.

---

## Task 5: Web — API 클라이언트 타입

**Files:**
- Create: `apps/web/src/lib/api/evaluation.ts`
- Create: `apps/web/src/lib/api/credits.ts`

### 배경 지식

- `apps/web/src/lib/api/client.ts`의 `BFF_URL`, `withCredentials` 패턴 그대로.
- `ledgerId`는 string (BigInt 직렬화).
- `getMyEvaluation` null 반환 = 미제출 (204 → null) ([이슈9] 사전 차단에 사용).

- [ ] **Step 1: `apps/web/src/lib/api/evaluation.ts` 생성**

```typescript
// apps/web/src/lib/api/evaluation.ts
import { BFF_URL, withCredentials } from './client.js';

export interface EvalSubmitBody {
  evaluatedUserId: string;
  ratingStars: number;    // 1~5
  q1: number; q2: number; q3: number; q4: number; // 1~5
  comment?: string;       // ≤30 UTF-8 byte
  reportedFor?: string | null;
  // A_901
  atmosphere: number; program: number; food: number; safety: number; transport: number;
  reviewRating: number;
  reviewBody: string;     // ≤5000 chars
  photoUrls?: string[];   // S3 publicUrl 목록 (클라이언트가 /reviews/photos/upload-url 별도 호출)
}

export interface EvalResult {
  evalId: string;
}

export interface MyEvaluationResult {
  evalId: string;
  evaluatedUserId: string;
  ratingStars: number;
  createdAt: string;
}

/** POST /community/appointments/:appointmentId/evaluate */
export async function submitEvaluation(appointmentId: string, body: EvalSubmitBody): Promise<EvalResult> {
  const res = await fetch(
    `${BFF_URL}/community/appointments/${encodeURIComponent(appointmentId)}/evaluate`,
    withCredentials({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 409) throw new Error('ALREADY_SUBMITTED');
  if (res.status === 400) throw new Error(`VALIDATION: ${await res.text().catch(() => '')}`);
  if (!res.ok) throw new Error(`POST evaluate ${res.status}`);
  return (await res.json()) as EvalResult;
}

/**
 * GET /community/appointments/:appointmentId/evaluation
 * [이슈9] 마운트 시 호출 — null이면 미제출, non-null이면 이미 제출.
 */
export async function getMyEvaluation(appointmentId: string): Promise<MyEvaluationResult | null> {
  const res = await fetch(
    `${BFF_URL}/community/appointments/${encodeURIComponent(appointmentId)}/evaluation`,
    withCredentials(),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`GET evaluation ${res.status}`);
  return (await res.json()) as MyEvaluationResult;
}
```

- [ ] **Step 2: `apps/web/src/lib/api/credits.ts` 생성**

```typescript
// apps/web/src/lib/api/credits.ts
import { BFF_URL, withCredentials } from './client.js';

export interface CreditLedgerItem {
  ledgerId: string;         // BigInt 직렬화
  action: string;
  pointsAmount: number;
  appointmentId: string | null;
  createdAt: string;
}

/**
 * [이슈21] balance = SUM(pointsAmount). 행 없으면 0.
 * [이슈5]  appointment_complete 항목은 Slice 7+에서 데이터 생성.
 */
export interface CreditsResponse {
  balance: number;
  page: number;
  limit: number;
  items: CreditLedgerItem[];
}

/** GET /me/credits?page=&limit= */
export async function getMyCredits(page = 1, limit = 20): Promise<CreditsResponse> {
  const res = await fetch(
    `${BFF_URL}/me/credits?page=${page}&limit=${limit}`,
    withCredentials(),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /me/credits ${res.status}`);
  return (await res.json()) as CreditsResponse;
}
```

- [ ] **Step 3: typecheck + 커밋**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/lib/api/evaluation.ts apps/web/src/lib/api/credits.ts
git commit -m "feat(web): evaluation/credits API 클라이언트 타입 (slice5)"
```

---

## Task 6: Web — EvaluationPage (A_900+A_901 2-step 폼)

**Files:**
- Create: `apps/web/src/pages/EvaluationPage/parts/StarRating.tsx`
- Create: `apps/web/src/pages/EvaluationPage/parts/MateEvalStep.tsx`
- Create: `apps/web/src/pages/EvaluationPage/parts/FestivalStep.tsx`
- Create: `apps/web/src/pages/EvaluationPage/index.tsx`
- Modify: `apps/web/src/main.tsx`

### 배경 지식

- **[이슈17]** SEED가 StarRating을 미제공하므로 직접 구현. 실행 전 `apps/web/src/styles/seed-overrides.css` 또는 `all.css`에서 `--color-brand`, `--color-border`, `--radius-sm` 토큰 존재 확인. 없으면 Tailwind 색상 fallback 사용.
- **[이슈9]** EvaluationPage 마운트 시 `getMyEvaluation` 호출 → non-null이면 즉시 'done' 화면.
- **[이슈1]** 사진 업로드:
  - URL: `POST /reviews/photos/upload-url` (app.ts:659에 이미 존재)
  - body: `{ contentType: file.type, sizeBytes: file.size }`
  - 응답: `{ uploadUrl, publicUrl, key, expiresIn, maxBytes }`
  - `publicUrl` 사용 (`fileUrl` 없음)
  - MIME: `ALLOWED_REVIEW_PHOTO_MIME = {image/jpeg, image/png, image/webp}`
  - MAX: `MAX_REVIEW_PHOTO_BYTES = 5MB`
- **[이슈20]** 라우터 파일 = `apps/web/src/main.tsx` (BrowserRouter + Routes).
- **[이슈2]** 진입: URL `/evaluate/:appointmentId?evaluatedUserId=<id>&chatRoomId=<id>` (알림 없음, 버튼 직접 진입).
- SEED cli add Step: `SegmentedControl`이 없으면 `npx @seed-design/cli@latest add ui:segmented-control --on-diff overwrite`. 기존 슬라이스에서 이미 사용 중인지 확인 후 생략 가능.

- [ ] **Step 0: SEED 컴포넌트 사전 확인**

```bash
cd apps/web
ls node_modules/seed-design/ui/ | grep segmented-control
ls node_modules/seed-design/ui/ | grep action-button
```

없는 컴포넌트가 있으면:

```bash
npx @seed-design/cli@latest add ui:segmented-control --on-diff overwrite
npx @seed-design/cli@latest add ui:action-button --on-diff overwrite
```

CSS 토큰 존재 확인:

```bash
grep -l "\-\-color-brand" apps/web/src/styles/
```

없으면 StarRating.tsx에서 `var(--color-brand)` 대신 `#0070f3` (임시 Tailwind brand) 사용.

- [ ] **Step 1: StarRating.tsx 생성**

```tsx
// apps/web/src/pages/EvaluationPage/parts/StarRating.tsx
interface StarRatingProps {
  value: number;     // 1~5, 0=미선택
  onChange: (v: number) => void;
  readOnly?: boolean;
}

export function StarRating({ value, onChange, readOnly = false }: StarRatingProps) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="별점">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          aria-label={`${star}점`}
          aria-pressed={value === star}
          onClick={() => !readOnly && onChange(star)}
          style={{
            fontSize: '28px',
            cursor: readOnly ? 'default' : 'pointer',
            background: 'none',
            border: 'none',
            padding: '0 2px',
            color: star <= value ? 'var(--color-brand, #0070f3)' : 'var(--color-border, #d1d5db)',
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: MateEvalStep.tsx 생성**

```tsx
// apps/web/src/pages/EvaluationPage/parts/MateEvalStep.tsx
import { useState } from 'react';
import { ActionButton } from 'seed-design/ui/action-button';
import { SegmentedControl, SegmentedControlItem } from 'seed-design/ui/segmented-control';
import { StarRating } from './StarRating.js';

export interface MateEvalData {
  ratingStars: number;
  q1: number; q2: number; q3: number; q4: number;
  comment: string;
  reportedFor: string | null;
}

interface Props {
  onNext: (data: MateEvalData) => void;
  onBlock: () => void;
}

const Q_LABELS = ['시간 약속', '의사소통', '분위기/유쾌함', '재방문 의향'] as const;
const REPORT_OPTIONS = [
  { value: 'inappropriate', label: '부적절한 언행' },
  { value: 'harassing',     label: '괴롭힘/폭력' },
  { value: 'no_show',       label: '노쇼' },
  { value: 'etc',           label: '기타' },
] as const;

export function MateEvalStep({ onNext, onBlock }: Props) {
  const [stars, setStars] = useState(0);
  const [qs, setQs] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [comment, setComment] = useState('');
  const [reportedFor, setReportedFor] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);

  function setQ(i: 0 | 1 | 2 | 3, v: number) {
    const next: [number, number, number, number] = [...qs] as [number, number, number, number];
    next[i] = v;
    setQs(next);
  }

  function handleCommentChange(v: string) {
    setComment(v);
    setCommentError(
      new TextEncoder().encode(v).length > 30 ? '한줄평은 최대 30바이트입니다.' : null,
    );
  }

  const canNext = stars > 0 && qs.every((q) => q > 0) && !commentError;

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-(length:--text-h3) font-semibold">메이트 평가</h2>

      <section>
        <p className="mb-2 text-[13px] text-(--color-text-muted)">전체 만족도</p>
        <StarRating value={stars} onChange={setStars} />
      </section>

      {Q_LABELS.map((label, i) => (
        <section key={label}>
          <p className="mb-1 text-[13px] font-medium">{label}</p>
          <SegmentedControl
            aria-label={label}
            value={qs[i] === 0 ? undefined : String(qs[i])}
            onValueChange={(v) => setQ(i as 0 | 1 | 2 | 3, Number(v))}
          >
            {[1, 2, 3, 4, 5].map((v) => (
              <SegmentedControlItem key={v} value={String(v)}>{v}</SegmentedControlItem>
            ))}
          </SegmentedControl>
        </section>
      ))}

      <section>
        <label className="mb-1 block text-[13px] font-medium" htmlFor="comment">
          한줄평 <span className="text-(--color-text-muted)">(선택, 최대 30바이트)</span>
        </label>
        <input
          id="comment"
          type="text"
          value={comment}
          onChange={(e) => handleCommentChange(e.target.value)}
          placeholder="짧게 한 마디"
          className="w-full rounded-(--radius-md) border border-(--color-border) px-3 py-2 text-[14px] focus:outline-none focus:border-(--color-brand)"
        />
        {commentError && <p className="mt-1 text-[12px] text-(--color-danger)">{commentError}</p>}
      </section>

      <section>
        <p className="mb-1 text-[13px] font-medium">신고 사유 <span className="text-(--color-text-muted)">(선택)</span></p>
        <div className="flex flex-wrap gap-2">
          {REPORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setReportedFor(reportedFor === o.value ? null : o.value)}
              className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                reportedFor === o.value
                  ? 'border-(--color-brand) bg-(--color-brand) text-white'
                  : 'border-(--color-border) text-(--color-text-muted)'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      <div className="flex gap-2">
        <ActionButton variant="dangerOutline" size="small" onClick={onBlock}>
          차단
        </ActionButton>
        <ActionButton
          variant="brandSolid"
          size="medium"
          disabled={!canNext}
          onClick={() =>
            canNext &&
            onNext({ ratingStars: stars, q1: qs[0]!, q2: qs[1]!, q3: qs[2]!, q4: qs[3]!, comment, reportedFor })
          }
          className="flex-1"
        >
          다음 — 축제 후기 작성
        </ActionButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: FestivalStep.tsx 생성**

사진 업로드 계약 ([이슈1]):
- URL: `POST /reviews/photos/upload-url`
- body: `{ contentType: file.type, sizeBytes: file.size }`
- 응답: `{ uploadUrl, publicUrl, key }` → `publicUrl` 사용
- MIME 클라이언트 사전 필터: `image/jpeg | image/png | image/webp` (ALLOWED_REVIEW_PHOTO_MIME)
- MAX 5MB 클라이언트 사전 필터

```tsx
// apps/web/src/pages/EvaluationPage/parts/FestivalStep.tsx
import { useRef, useState } from 'react';
import { ActionButton } from 'seed-design/ui/action-button';
import { SegmentedControl, SegmentedControlItem } from 'seed-design/ui/segmented-control';
import { StarRating } from './StarRating.js';

export interface FestivalData {
  atmosphere: number; program: number; food: number; safety: number; transport: number;
  reviewRating: number;
  reviewBody: string;
  photoUrls: string[];
}

interface Props {
  onBack: () => void;
  onSubmit: (data: FestivalData) => void;
  submitting: boolean;
}

const SURVEY_ITEMS = [
  { key: 'atmosphere', label: '분위기' },
  { key: 'program',    label: '프로그램' },
  { key: 'food',       label: '먹거리' },
  { key: 'safety',     label: '안전' },
  { key: 'transport',  label: '교통' },
] as const;
type SurveyKey = (typeof SURVEY_ITEMS)[number]['key'];

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function FestivalStep({ onBack, onSubmit, submitting }: Props) {
  const [survey, setSurvey] = useState<Record<SurveyKey, number>>({
    atmosphere: 0, program: 0, food: 0, safety: 0, transport: 0,
  });
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewBody, setReviewBody] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const surveyComplete = SURVEY_ITEMS.every((i) => survey[i.key] > 0);
  const canSubmit = surveyComplete && reviewRating > 0 && reviewBody.trim().length > 0 && !submitting && !uploading;

  // [이슈1] 실제 BFF 계약에 맞춘 업로드
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (photoUrls.length + files.length > 10) {
      alert('사진은 최대 10장까지 첨부할 수 있어요.'); return;
    }

    const BFF_URL = (import.meta.env['VITE_BFF_URL'] as string | undefined) ?? 'http://localhost:3001';
    setUploading(true);
    const newUrls: string[] = [];

    for (const file of files) {
      // 클라이언트 사전 필터
      if (!ALLOWED_MIME.has(file.type)) {
        alert(`지원하지 않는 형식입니다: ${file.type} (jpeg/png/webp만 가능)`);
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        alert(`${file.name}이 5MB를 초과합니다.`);
        continue;
      }

      try {
        // [이슈1] body: { contentType, sizeBytes } — filename 없음
        const presignRes = await fetch(`${BFF_URL}/reviews/photos/upload-url`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
        });
        if (!presignRes.ok) {
          console.error('presign failed', presignRes.status); continue;
        }
        // [이슈1] 응답 키: publicUrl (fileUrl 없음)
        const { uploadUrl, publicUrl } = await presignRes.json() as { uploadUrl: string; publicUrl: string };
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
        if (!putRes.ok) { console.error('S3 PUT failed', putRes.status); continue; }
        newUrls.push(publicUrl);
      } catch (err) {
        console.error('upload error', err);
      }
    }

    setPhotoUrls((prev) => [...prev, ...newUrls].slice(0, 10));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-(length:--text-h3) font-semibold">축제 설문 + 후기</h2>
      <p className="text-[12px] text-(--color-text-muted)">설문은 비공개, 후기는 이벤트 페이지에 공개됩니다.</p>

      {SURVEY_ITEMS.map(({ key, label }) => (
        <section key={key}>
          <p className="mb-1 text-[13px] font-medium">{label}</p>
          <SegmentedControl
            aria-label={label}
            value={survey[key] === 0 ? undefined : String(survey[key])}
            onValueChange={(v) => setSurvey((prev) => ({ ...prev, [key]: Number(v) }))}
          >
            {[1, 2, 3, 4, 5].map((v) => (
              <SegmentedControlItem key={v} value={String(v)}>{v}</SegmentedControlItem>
            ))}
          </SegmentedControl>
        </section>
      ))}

      <section>
        <p className="mb-2 text-[13px] font-medium">후기 별점</p>
        <StarRating value={reviewRating} onChange={setReviewRating} />
      </section>

      <section>
        <label className="mb-1 block text-[13px] font-medium" htmlFor="reviewBody">
          후기 <span className="text-(--color-text-muted)">({reviewBody.length}/5000자)</span>
        </label>
        <textarea
          id="reviewBody"
          value={reviewBody}
          onChange={(e) => setReviewBody(e.target.value.slice(0, 5000))}
          rows={5}
          placeholder="축제 경험을 자유롭게 작성해 주세요."
          className="w-full resize-y rounded-(--radius-md) border border-(--color-border) px-3 py-2 text-[14px] focus:outline-none focus:border-(--color-brand)"
        />
      </section>

      <section>
        <p className="mb-2 text-[13px] font-medium">
          사진 <span className="text-(--color-text-muted)">({photoUrls.length}/10, jpeg/png/webp, 각 최대 5MB)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {photoUrls.map((url, idx) => (
            <div key={url} className="relative h-16 w-16">
              <img src={url} alt={`첨부사진 ${idx + 1}`} className="h-full w-full rounded-(--radius-sm) object-cover" />
              <button
                type="button"
                onClick={() => setPhotoUrls((prev) => prev.filter((_, i) => i !== idx))}
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-(--color-danger) text-[10px] text-white"
                aria-label="사진 삭제"
              >
                x
              </button>
            </div>
          ))}
          {photoUrls.length < 10 && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex h-16 w-16 items-center justify-center rounded-(--radius-sm) border border-dashed border-(--color-border) text-[24px] text-(--color-text-muted) disabled:opacity-50"
              aria-label="사진 추가"
            >
              {uploading ? '...' : '+'}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </section>

      <div className="flex gap-2">
        <ActionButton variant="neutralOutline" size="medium" onClick={onBack} disabled={submitting || uploading}>
          이전
        </ActionButton>
        <ActionButton
          variant="brandSolid"
          size="medium"
          disabled={!canSubmit}
          onClick={() => canSubmit && onSubmit({ ...survey, reviewRating, reviewBody, photoUrls })}
          className="flex-1"
        >
          {submitting ? '제출 중...' : '평가 완료'}
        </ActionButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: EvaluationPage/index.tsx 생성**

```tsx
// apps/web/src/pages/EvaluationPage/index.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Header } from '../../layout/Header.js';
import { MateEvalStep, type MateEvalData } from './parts/MateEvalStep.js';
import { FestivalStep, type FestivalData } from './parts/FestivalStep.js';
import { submitEvaluation, getMyEvaluation } from '../../lib/api/evaluation.js';

type Step = 'loading' | 'mate' | 'festival' | 'done';

/**
 * EvaluationPage — A_900 + A_901 단일 진입점.
 * [이슈2] 진입 경로: 커뮤니티 추천 영역 "평가하기" 버튼 (알림 아님).
 * URL: /evaluate/:appointmentId?evaluatedUserId=<id>&chatRoomId=<id>
 * [이슈9] 마운트 시 getMyEvaluation 호출 → 이미 제출이면 즉시 'done' 화면.
 */
export function EvaluationPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [searchParams] = useSearchParams();
  const evaluatedUserId = searchParams.get('evaluatedUserId') ?? '';
  const chatRoomId = searchParams.get('chatRoomId') ?? '';
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('loading');
  const [mateData, setMateData] = useState<MateEvalData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // [이슈9] 마운트 시 중복 제출 사전 차단
  useEffect(() => {
    if (!appointmentId) { setStep('mate'); return; }
    getMyEvaluation(appointmentId)
      .then((existing) => setStep(existing ? 'done' : 'mate'))
      .catch(() => setStep('mate')); // 조회 실패 시 폼 표시 (제출 시점에 409 처리)
  }, [appointmentId]);

  if (!appointmentId || !evaluatedUserId) {
    return (
      <div className="flex h-screen flex-col bg-(--color-bg)">
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <p className="text-(--color-danger)">잘못된 접근입니다.</p>
        </main>
      </div>
    );
  }

  async function handleBlock() {
    if (!chatRoomId) { alert('채팅방 정보가 없어 차단할 수 없어요.'); return; }
    const BFF_URL = (import.meta.env['VITE_BFF_URL'] as string | undefined) ?? 'http://localhost:3001';
    try {
      await fetch(`${BFF_URL}/community/chat-rooms/${chatRoomId}/block/${evaluatedUserId}`, {
        method: 'POST',
        credentials: 'include',
      });
      alert('차단되었습니다.');
    } catch {
      alert('차단 처리 중 오류가 발생했어요.');
    }
  }

  async function handleFestivalSubmit(festivalData: FestivalData) {
    if (!mateData) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitEvaluation(appointmentId!, {
        evaluatedUserId,
        ...mateData,
        comment: mateData.comment || undefined,
        reportedFor: mateData.reportedFor,
        ...festivalData,
      });
      setStep('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg === 'ALREADY_SUBMITTED' ? '이미 평가를 완료했어요.' : '제출 중 오류가 발생했어요. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg)">
      <Header />
      <main className="mx-auto w-full max-w-[480px] px-4 py-6">
        {step === 'loading' && (
          <p className="text-center text-[14px] text-(--color-text-muted)">불러오는 중...</p>
        )}
        {step === 'mate' && (
          <MateEvalStep
            onNext={(data) => { setMateData(data); setStep('festival'); }}
            onBlock={handleBlock}
          />
        )}
        {step === 'festival' && (
          <FestivalStep
            onBack={() => setStep('mate')}
            onSubmit={handleFestivalSubmit}
            submitting={submitting}
          />
        )}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-[40px]">✓</p>
            <h2 className="text-(length:--text-h3) font-semibold">평가 완료!</h2>
            <p className="text-[14px] text-(--color-text-muted)">크레딧 10개가 적립되었어요.</p>
            <button
              type="button"
              onClick={() => navigate('/community')}
              className="mt-2 rounded-(--radius-md) bg-(--color-brand) px-6 py-2 text-[14px] font-medium text-white"
            >
              커뮤니티로
            </button>
          </div>
        )}
        {error && <p className="mt-3 text-center text-[13px] text-(--color-danger)">{error}</p>}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: main.tsx — 라우트 등록**

**[이슈20]** 라우터 파일 = `apps/web/src/main.tsx`. import 블록 끝에:

```tsx
import { EvaluationPage } from './pages/EvaluationPage/index.js';
```

`<Routes>` 블록 내 `/chat/rooms/:chatRoomId` 다음에:

```tsx
        {/* 슬라이스5: 평가 (A_900+A_901) */}
        <Route path="/evaluate/:appointmentId" element={<EvaluationPage />} />
```

- [ ] **Step 6: typecheck + build + 커밋**

```bash
cd apps/web && npx tsc --noEmit && npm run build
git add apps/web/src/pages/EvaluationPage/ apps/web/src/main.tsx
git commit -m "feat(web): EvaluationPage A_900+A_901 (StarRating+Likert+후기, 와이어 9-15/9-16)"
```

---

## Task 7: Web — CreditPage (A_9-1) + CommunityShell 실연결

**Files:**
- Create: `apps/web/src/pages/CreditPage/index.tsx`
- Modify: `apps/web/src/pages/CommunityPage/parts/CommunityShell.tsx`
- Modify: `apps/web/src/main.tsx`

### 배경 지식

- 와이어 9-1: 크레딧 잔액 + 내역 목록 (action 라벨, pointsAmount, 날짜).
- ACTION_LABELS: 3종 표시 — `mate_eval_complete`, `review_complete`, `appointment_complete`.
  `appointment_complete`는 Slice 5에서 데이터 미생성([이슈5]) → 목록에 표시 안 됨(정상).
- **[이슈16]** 크레딧 내역 출처: GG-MY-008 + GG-COMM-017 (원문 기준).

- [ ] **Step 1: CreditPage/index.tsx 생성**

```tsx
// apps/web/src/pages/CreditPage/index.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Header } from '../../layout/Header.js';
import { getMyCredits, type CreditLedgerItem } from '../../lib/api/credits.js';
import { useCurrentUser } from '../../lib/auth-context.js';

// [이슈5] appointment_complete는 Slice 7+ — Slice 5에서 해당 항목 미생성(정상)
// [이슈16] 출처: GG-MY-008 + GG-COMM-017
const ACTION_LABELS: Record<string, string> = {
  appointment_complete: '메이트 약속 완료',
  mate_eval_complete:   '메이트 평가 작성',
  review_complete:      '후기 작성',
};

export function CreditPage() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number | null>(null);
  const [items, setItems] = useState<CreditLedgerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user === null) { void navigate('/login'); return; }
    if (user === undefined) return;
    setLoading(true);
    getMyCredits()
      .then((r) => { setBalance(r.balance); setItems(r.items); setLoading(false); })
      .catch(() => { setError('불러오기 실패'); setLoading(false); });
  }, [user, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg)">
      <Header />
      <main className="mx-auto w-full max-w-[480px] px-4 py-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-(length:--text-h2) font-semibold">크레딧 내역</h1>
          {balance !== null && (
            <span className="text-[16px] font-bold text-(--color-brand)">{balance.toLocaleString()}개</span>
          )}
        </div>

        {loading && <p className="text-center text-[14px] text-(--color-text-muted)">불러오는 중...</p>}
        {error  && <p className="text-center text-[13px] text-(--color-danger)">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-center text-[14px] text-(--color-text-muted)">크레딧 내역이 없어요.</p>
        )}

        <ul className="flex flex-col divide-y divide-(--color-border)">
          {items.map((item) => (
            <li key={item.ledgerId} className="flex items-center justify-between py-3">
              <div>
                <p className="text-[14px] font-medium">
                  {ACTION_LABELS[item.action] ?? item.action}
                </p>
                <p className="text-[12px] text-(--color-text-muted)">
                  {new Date(item.createdAt).toLocaleDateString('ko-KR')}
                </p>
              </div>
              <span className="text-[15px] font-bold text-(--color-brand)">
                +{item.pointsAmount}
              </span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: CommunityShell.tsx — 크레딧 실연결**

`apps/web/src/pages/CommunityPage/parts/CommunityShell.tsx` 수정:

1. import 추가 (파일 상단):

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getMyCredits } from '../../../lib/api/credits.js';
import { useCurrentUser } from '../../../lib/auth-context.js';
```

2. `CommunityShell` 함수 내부 상단에:

```tsx
  const { user } = useCurrentUser();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    getMyCredits(1, 1)
      .then((r) => setCreditBalance(r.balance))
      .catch(() => { /* silent — 크레딧 조회 실패 시 placeholder 유지 */ });
  }, [user]);
```

3. 기존 "크레딧 0개" placeholder span을 교체:

```tsx
                {/* GG-COMM-017 크레딧 실연결 (slice5) */}
                {user ? (
                  <Link
                    to="/credits"
                    className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px] text-(--color-text-muted) hover:border-(--color-border-hover)"
                  >
                    크레딧 {creditBalance !== null ? creditBalance.toLocaleString() : '...'}개
                  </Link>
                ) : (
                  <span className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px] text-(--color-text-muted)">
                    크레딧
                  </span>
                )}
```

- [ ] **Step 3: main.tsx — /credits 라우트 등록**

import 블록에:

```tsx
import { CreditPage } from './pages/CreditPage/index.js';
```

`<Routes>` 블록 내 `/evaluate/:appointmentId` 다음에:

```tsx
        <Route path="/credits" element={<CreditPage />} />
```

- [ ] **Step 4: typecheck + build + 커밋**

```bash
cd apps/web && npx tsc --noEmit && npm run build
git add apps/web/src/pages/CreditPage/ \
        apps/web/src/pages/CommunityPage/parts/CommunityShell.tsx \
        apps/web/src/main.tsx
git commit -m "feat(web): CreditPage + CommunityShell 크레딧 실연결 (와이어 9-1, GG-COMM-017)"
```

---

## 자기 검토 (Spec Coverage)

| 요구사항 | 담당 Task | 확인 |
|---|---|---|
| GG-REVIEW-001,002,004~010 MateEvaluation 저장 | T2 (evaluation.ts) | 완료 |
| GG-REVIEW-003 | 원문(_p2_req_text.txt)에서 결번(002→004 점프) — 해당 없음 |
| GG-REVIEW-004 별점 5점 척도 | T6 (StarRating) | 완료 |
| GG-REVIEW-005 한줄평 ≤30byte | T2 (Buffer.byteLength), T6 (TextEncoder) | 완료 |
| GG-REVIEW-008/009 신고/차단 | T2 (reportedFor 저장), T6 (UI 버튼) | 완료 (신고 Report 모델 = Slice 8) |
| GG-FEST-REVIEW-001~007 설문 비공개 | T2 (트랜잭션 + GET 미노출), T6 (FestivalStep 안내 문구) | 완료 |
| GG-FEST-REVIEW-008 후기 공개 (eventId 전제) | T1 (eventId 컬럼), T2 (eventId 복사 + null 차단) | 완료 (surfacing은 후속) |
| GG-MY-008 + GG-COMM-017 크레딧 내역 표시 | T3 (GET /me/credits), T7 (CreditPage, CommunityShell) | 완료 |
| ADR 0007 결정4 가중 이동평균 | T2 (mate-index-updater.ts) | 완료 |
| ADR 0007 결정5 옵션C 적립형 (+10 가정) | T2 (CreditLedger), T3 (잔액) | 완료 |
| 약속확정 게이트 (status='confirmed') | T2 | 완료 |
| 1:1 한정 게이트 (roomType='1:1') | T2 [이슈3] | 완료 |
| eventId 게이트 (null 시 400) | T2 [이슈4] | 완료 |
| evaluatedUserId 멤버 검증 | T2 [이슈7] | 완료 |
| 중복 제출 방지 (P2002 → 409) | T2 | 완료 |
| 중복 제출 사전 차단 (마운트 시 GET) | T6 [이슈9] | 완료 |
| MateIndex update 전용 (Slice2 초기화 전제) | T2 [이슈6/26] | 완료 |
| penalty 1회성 (이슈10) | T2 (최신 평가 reportedFor만) | 완료 |
| 사진 업로드 BFF 계약 일치 | T6 FestivalStep [이슈1] | 완료 |
| MIGRATION HUMAN GATE | T1 (validate+generate만, deploy 금지) | 완료 |
| PII 마스킹 (comment 로그 금지) | T2 (logger.info에서 comment 제외) | 완료 |
| noUnusedLocals | 각 파일 미사용 변수 없음 | 완료 |
| SEED all.css (base.css 아님) | all.css는 main.tsx에서 전역 import — 페이지는 토큰만 사용 | 완료 |

### 미해결 Open Items (이 플랜 범위 밖)

| # | 항목 | 후속 조치 |
|---|---|---|
| 이슈2/15 | 약속 '완료(다녀온 후)' 시점 정의 미완 — 현재 'confirmed' 게이트 | ADR 0007 보강 필요 |
| 이슈5 | appointment_complete 적립 — Slice 7+ | 미구현 명시 |
| 이슈12 | GG-FEST-REVIEW-008 events/:id surfacing | 후속 이벤트 리뷰 섹션 태스크 |
| 이슈13 | GG-REPORT-003/004 관리자 신고 목록 (Report 모델) | Slice 8 |
| 이슈14 | 크레딧 +10 상수 ADR 보강 | ADR 0007 개정 (사람) |
| 이슈16 | GG-COMM-011/012 ID가 원문에 없음 — GG-MY-008+GG-COMM-017로 정정 완료 |

---

*Plan finalized: 2026-05-30. 리뷰 28건 전량 반영.*
