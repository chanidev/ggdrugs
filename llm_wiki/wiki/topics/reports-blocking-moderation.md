---
title: 신고 · 차단 · 관리자 제재 (A_701)
type: topic
created: 2026-06-09
updated: 2026-06-09
related:
  - community.md
  - mate-chat-rooms.md
  - mate-evaluation-festival-review.md
  - admin-flow.md
  - db-schema-overview.md
---

# 신고 · 차단 · 관리자 제재 (A_701)

## Summary

Phase 2 모더레이션 서브시스템. 사용자가 게시글·댓글·채팅 메시지·메이트 평가를 **신고**(Report)하거나 상대를 **차단**(Block)하고, 관리자가 A_701 화면에서 신고를 검토해 **경고 / 이용정지 / 허위신고 / 기각** 4종 조치를 내린다. CLAUDE.md 금지 #4에 따라 모더레이션 결정은 관리자(사람) 영역이며 LLM에 위임하지 않는다 (ADR 0007 결정 #13). 조치는 단일 Prisma 트랜잭션으로 `User` 제재 컬럼 + `Report` 상태 + `AdminAuditLog` + `Notification`을 원자적으로 갱신한다. 기능요구사항 ID는 GG-REPORT-001~009.

## 데이터 모델

### Report (`reports` 테이블, schema.prisma:1038)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `reportId` | BigInt PK | autoincrement |
| `reporterId` | BigInt FK→users | 신고자 (relation `ReportSender`) |
| `targetUserId` | BigInt FK→users | 피신고자 (relation `ReportTarget`) |
| `targetType` | VarChar(20) | `post` / `comment` / `chat_message` / `mate_eval` |
| `targetEntityId` | BigInt | surface 엔티티 PK (postId / commentId / messageId / evalId) |
| `reason` | VarChar(50) | `spam` / `abuse` / `harassment` / `obscene` / `no_show` / `etc` |
| `detail` | VarChar(500)? | 신고자 자유 입력 (≤500자) |
| `status` | VarChar(20) | `pending`(기본) / `reviewed` / `dismissed` |
| `adminId` | BigInt? FK→users | 처리 관리자 (relation `ReportAdmin`) |
| `adminAction` | VarChar(20)? | `warned` / `suspended` / `false_report` / NULL(기각) |
| `adminNote` | Text? | 관리자 사유 메모 |
| `reviewedAt` | Timestamptz? | 처리 시각 |

인덱스: `(status, createdAt desc)`, `(reporterId, createdAt desc)`, `(targetUserId, createdAt desc)`, `(targetType, targetEntityId)`.

**status vs adminAction 관계**: 기각(dismissed)은 `status='dismissed'` + `adminAction=NULL`로 저장된다 (adminAction 도메인에 `dismissed` 미포함). 나머지 3종 조치는 `status='reviewed'` + `adminAction in {warned, suspended, false_report}`. 클라이언트 StatusBadge는 `status='dismissed'`를 adminAction보다 먼저 분기해 '기각'으로 표시한다.

### Block (`blocks` 테이블, schema.prisma:904)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `blockId` | BigInt PK | autoincrement |
| `blockerId` | BigInt FK→users | 차단한 사람 (relation `BlockSender`) |
| `blockedUserId` | BigInt FK→users | 차단당한 사람 (relation `BlockReceiver`) |
| `createdAt` | Timestamptz | |

`@@unique([blockerId, blockedUserId])` (`uq_block_pair`)로 중복 차단 방지. 차단 사용자는 추천·신청·채팅 상호작용에서 제외(GG-REPORT-009).

### User 제재 컬럼 (`users` 테이블, schema.prisma:68~71)

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `sanctionStatus` | VarChar(20) `@default("none")` | `none` / `warned` / `suspended` |
| `sanctionExpiresAt` | Timestamptz? | 이용정지 만료 시각 (warned/none 시 NULL) |
| `sanctionReason` | Text? | 제재 사유 (관리자 note 복사) |

## 사용자 측 플로우 (reports.ts)

- **`POST /community/reports`** — `createReport`. 4 surface 신고 접수. 검증 순서: ① `targetUserId` 유효 + 자기 신고 차단(`cannot_report_self`), ② `targetType`/`reason` 화이트리스트, ③ `detail` ≤500자, ④ 피신고자 존재(`target_user_not_found`), ⑤ **소유자 교차 검증** `checkTargetEntityWithOwner` — 신고 대상 엔티티의 실제 작성자가 `targetUserId`와 일치하는지 확인(악의적 신고 방지, 불일치 시 `target_entity_owner_mismatch`, 미존재 시 `target_entity_not_found`). 시스템 메시지(`senderUserId=null`)는 신고 불가. mate_eval은 피평가자(`evaluatedUserId`) 기준 검증. ⑥ **중복 방지**: `(reporterId, targetType, targetEntityId)` + `status IN (pending, reviewed)` 존재 시 409 `already_reported` — `dismissed` 후 재신고는 허용. 성공 시 201 `{reportId}`.
- **`GET /me/reports`** — `listMyReports`. 내가 제출한 신고 목록 (page/limit/status 필터, `adminAction`·`adminNote`·`reviewedAt` 포함하여 처리 결과 노출).
- **`POST /community/users/:targetUserId/block`** — `blockUser`. chatRoomId 없는 surface(게시글/댓글)용 일반 차단. `Block.create`만 수행, GroupMembership 변경 없음. 자기 차단(`cannot_block_self`)·중복(`already_blocked`) 가드. 채팅방 내 차단(`blockMember`)은 `chat-room.ts`의 `POST /community/chat-rooms/:chatRoomId/block/:targetUserId`로 별도 병존.

## 관리자 모더레이션 플로우 (admin-reports.ts, A_701)

권한 체인: `requireAuth → requireAdmin`. 조회(GET)는 모든 활성 admin scope에 개방(uploader_review_only 포함). 조치(POST)만 scope 제한.

- **`GET /admin/reports`** — `listAdminReports`. status(기본 `pending`)/targetType 필터 + page/limit. 응답에 전역 `byStatus` 통계(pending/reviewed/dismissed 카운트, targetType 필터 무관). 유효하지 않은 status/targetType 쿼리는 400.
- **`GET /admin/reports/:reportId`** — `getAdminReport`. 신고 상세 + `targetContent` 인라인 로드(post:title/body, comment:body, chat_message:body/messageType, mate_eval:ratingStars/comment/reportedFor) + 피신고자 `sanctionStatus`.
- **`POST /admin/reports/:reportId/action`** — `actionAdminReport`. body `{action, note?, suspendDays?}`. action in {`warned`, `suspended`, `false_report`, `dismissed`}.

**scope 게이트**:
- 경고 / 허위신고 / 기각: `scope in {full, content_only}` — 아니면 403 `admin_scope_content_required`.
- 이용정지(`suspended`): `scope='full'` 전용 — 아니면 403 `admin_scope_full_required`.

**사전 검증**: 신고 미존재 404, `status != 'pending'`이면 409 `already_reviewed`. `suspended`는 `suspendDays` 1~365 필수(`suspendDays_required`).

### 제재 트랜잭션 (`prisma.$transaction`)

조치 한 건이 다음을 원자적으로 수행한다:

1. **User 제재 갱신** (warned/suspended만):
   - `warned` → `sanctionStatus='warned'`, `sanctionExpiresAt=null`(이전 suspended 만료일 오염 방지), `sanctionReason=note`.
   - `suspended` → `sanctionStatus='suspended'`, `sanctionExpiresAt = now + suspendDays*86_400_000`, `sanctionReason=note`.
   - `false_report` / `dismissed` → 피신고자 User 변경 없음.
2. **Report 갱신** — `status` = (dismissed면 `dismissed`, 그 외 `reviewed`), `adminAction` = (dismissed면 NULL, 그 외 action), `adminId=auth.userId`, `adminNote`, `reviewedAt=now`. 주의: `Report.adminId`/`AdminAuditLog.adminId`는 FK→`users(user_id)`이므로 `AdminProfile.adminId`가 아닌 `auth.userId`를 사용.
3. **AdminAuditLog 생성** — `action` in {`report_action_warned`, `report_action_suspended`, `report_action_false_report`, `report_dismissed`}. `targetId` = warned/suspended는 피신고자, false_report는 **신고자**(reporterId, 허위신고 판정 대상), dismissed는 NULL. JSONB `payload`에 reportId/targetUserId/reporterId/action/note(+suspendDays) 박제.
4. **Notification 생성** — dismissed는 알림 없음. warned/suspended는 피신고자에게, false_report는 **신고자**에게 발송.

## 알림 연동

조치 트랜잭션 4단계가 `Notification`을 직접 생성(별도 워커 없이 즉시 발송 — `isSent=true`, `sentAt=now`). 공통 필드: `notificationType='report_action'`, `relatedEntityType='report'`, `relatedEntityId=reportId`. 제목/본문:
- 경고 → "경고 조치 안내" + (note 있으면 사유 포함).
- 이용정지 → "이용정지 조치 안내" + "{N}일간 이용정지 조치…".
- 허위신고 → "허위신고 처리 안내" (신고자 대상).

`subscriptions-notifications.md`의 알림 인박스(`GET /me/notifications`)에서 함께 조회된다.

## eval 하니스

DB가 필요한 in-process PASS/FAIL 검증 (express mock req/res, 실제 핸들러 직접 호출):

- **`apps/bff/src/jobs/report-eval.ts`** — `npx tsx apps/bff/src/jobs/report-eval.ts`. 신고+차단 10 시나리오: 정상 접수(201) / 자기 신고(400) / 미존재 엔티티(404) / pending 중복(409) / dismissed 후 재신고(201) / 미인증(401) + block 정상(201) / 자기 차단(400) / 중복 차단(409) / 미인증(401). `createReport`·`blockUser`를 직접 import, 픽스처는 기존 user 2명 + post 1건.
- **`apps/bff/src/jobs/notif-eval.ts`** — `npm run notif:eval` (apps/bff). Slice 6 알림/약속 검증 10케이스. 일반 알림 인박스(shape, notificationType/relatedEntityId/relatedEntityType 필드, unreadOnly kick_vote 제외, markRead 권한/멱등) 회귀 가드 — `report_action` 알림도 같은 인박스 경로를 타므로 간접 커버된다.

## References

- `apps/bff/src/routes/reports.ts` — `createReport` / `listMyReports` / `blockUser`
- `apps/bff/src/routes/admin-reports.ts` — `listAdminReports` / `getAdminReport` / `actionAdminReport` (제재 트랜잭션)
- `apps/bff/src/routes/chat-room.ts` — `blockMember` (채팅방 내 차단)
- `apps/bff/src/jobs/report-eval.ts` — 신고·차단 eval 하니스
- `apps/bff/src/jobs/notif-eval.ts` — 알림 eval 하니스
- `apps/bff/prisma/schema.prisma` — `Report`(1038) / `Block`(904) / `User` 제재 컬럼(68~71)
- `apps/bff/src/app.ts` — 라우트 등록 (`/community/reports`, `/admin/reports/:reportId/action`, `/community/users/:targetUserId/block`)
- `docs/decisions/0007-phase2-community-mate-matching.md` — 결정 #13 (모더레이션 관리자 영역 유지)
