---
title: 구독 · 알림 센터 (A_203 / A_500)
type: topic
created: 2026-04-21
updated: 2026-04-21
sources: [2026-04-17_requirements-v5]
related:
  - filters-5-types.md
  - main-page-flow.md
  - admin-flow.md
  - db-schema-overview.md
  - use-cases-index.md
  - adr-0001-terminology-reconciliation.md
---

# 구독 · 알림 센터 (A_203 / A_500)

## Summary

사용자가 필터 5종 조건을 "구독" 으로 저장해 두면, 해당 조건에 맞는 신규 이벤트가 승인되는 순간 알림을 받는다. 알림은 헤더 종 아이콘 + `/notifications` 센터 + 마이페이지 구독 탭에서 관리. ADR 0001 §3 에서 "중복 알림 방지 전략 미정" 으로 flagged 됐던 이슈는 `1931072` 에서 2단계 dedup 으로 해소.

## DB

- `event_subscriptions` — userId · isActive · regionIds[] · companions[] · eventTypes[] · vibeIds[] · periodMonths. 5축 전부 배열로 "union 매치"(축 내 OR).
- `notifications` — userId · eventId (nullable) · title · message · scheduledAt · isSent · sentAt · readAt. (userId, eventId) unique 없음, dedup 은 애플리케이션 레벨.

## 매칭 규칙 (subscription-match.ts)

각 축 독립 AND, 축 내부는 OR:
- regionIds 비면 skip, 있으면 event.regionId 포함
- eventTypes 비면 skip, 있으면 event.category.categoryCode 포함
- companions 비면 skip, 있으면 event.expected_companion_primary/secondary 중 하나라도 교집합
- vibeIds 비면 skip, 있으면 event.vibe_assignments 교집합 ≥ 1
- periodMonths NULL 이면 skip, 있으면 event.start_date ≤ now + N months

isActive=false 구독은 제외.

## 중복 방지 — 2단계 dedup (ADR 0001 §3 해소)

한 사용자 × 한 이벤트 조합은 **평생 최대 1건 알림** 보장:

1. **in-run userId dedup** — 같은 user 가 매칭되는 구독을 여러 개 가지면 `Map` 으로 한번에 묶음. 한 승인 이벤트당 사용자 1인 = 알림 1건.
2. **cross-run dedup** — `notifications` 에 이미 같은 `(userId, eventId)` 행이 있으면 skip. 동일 이벤트가 여러 번 fan-out 훅을 받아도 중복 안 됨.

버그 이력: `1931072` 이전엔 dedup 이 1번만 있어서 "3개 구독 × 1 이벤트 → 3개 알림" 스팸 가능. 수정 후 1건 보장.

## 승인 훅 fan-out

`apps/bff/src/routes/admin-uploaders.ts::decideEventUpload` 에서 `action==='approved'` 시:
```
void notifyMatchingSubscribers(eventId);
void runNewsNaverIngest({ onlyEventId: eventId });
```
둘 다 fire-and-forget. 실패해도 승인 응답(관리자 화면)은 영향 없음.

## BFF API

### 구독 (A_203)
- `GET /me/subscriptions` — 본인 구독 목록
- `POST /me/subscriptions` — 생성 (사용자당 20건 상한 `MAX_SUBS_PER_USER`)
- `PATCH /me/subscriptions/:id` — isActive 토글
- `DELETE /me/subscriptions/:id` — 삭제

body 검증: `COMPANION_VALS` / `EVENT_TYPE_VALS` allowlist, BigInt 파싱.

### 알림 (A_500)
- `GET /me/notifications?page&limit&unreadOnly` — 목록 + total + unreadOnly 필터
- `GET /me/notifications/unread-count` — 배지용 카운트
- `POST /me/notifications/:id/read` — 개별 읽음
- `POST /me/notifications/read-all` — 일괄 읽음

응답 각 아이템은 `eventAvailable` 플래그로 이벤트가 공개 상태인지 명시 — 비공개/삭제 이벤트는 상세 링크 비활성화.

## UI

- **헤더** `NotificationBell` — 30초 폴링으로 unreadCount 조회. 9+ overflow 표시. accent vermilion 배지.
- **/notifications** `NotificationsPage` — 전체/미읽음 탭, "모두 읽음" 일괄, 옵티미스틱 읽음(실패해도 다음 reload 에서 정정).
- **마이페이지 '구독' 탭** — 활성/해제 토글, 삭제, 조건 요약(지역·기간·인원구성·이벤트 종류·성향).
- **FilterSearchPanel** — "이 조건 구독" CTA (로그인 + 활성 필터 ≥ 1 일 때만 노출). periodMonths 매핑: `3m→3, 6m→6, all→null, custom→null`.

## 성능

- `notifications` 에 `idx_notif_user_unread` 부분 인덱스 — WHERE `read_at IS NULL`. 폴링 쿼리 (count + top N) 최적.
- `event_subscriptions.userId + isActive` 조합 필터 (isActive 인덱스 활용).

## Open questions

- 이메일/웹푸시 배달 채널 미구현 — 현재는 in-app only. `scheduledAt + isSent + sentAt` 필드는 외부 배달 채널 연계 대비.
- 승인 후 "이미 지나간 이벤트" 는 알림 무의미 — 현재는 periodMonths 필터만. startDate 이미 지난 건 skip 하는 로직 추가 여부 검토.
- 구독 edit 불가 — 현 UX 는 toggle / delete 만. 조건 수정은 삭제 후 재생성.

## References

- [adr-0001-terminology-reconciliation.md](adr-0001-terminology-reconciliation.md) §3 — 중복 알림 방지 전략 확정
- `apps/bff/src/lib/subscription-match.ts` — 매칭 + dedup
- `apps/bff/src/routes/subscriptions.ts` + `notifications.ts` — API
- `apps/web/src/components/notifications/NotificationBell.tsx` — 헤더 배지
- `apps/web/src/pages/NotificationsPage.tsx` — 센터
