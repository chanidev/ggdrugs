---
title: 메이트 매칭
type: topic
created: 2026-06-09
updated: 2026-06-09
related:
  - mate-chat-rooms.md
  - mate-evaluation-festival-review.md
  - db-schema-overview.md
  - recommendations.md
  - use-cases-index.md
---

# 메이트 매칭

## Summary

같은 축제(2주 이내 개최)를 함께 갈 동행을 찾아주는 규칙 기반 양방향 매칭이다. `MateProfile`(6속성 + 선호조건)을 저장한 사용자끼리 `bidirectionalScore` 로 서로의 선호를 교차 평가하고, 통과한 후보를 점수 desc·메이트지수 desc 로 정렬해 추천한다. LLM/임베딩은 일절 쓰지 않으며(ADR 0007 #3, CLAUDE.md 금지 #4), 후보풀의 hard 경계는 동일 `selectedEventId` 다. 점수 산식은 `apps/bff/src/lib/mate-score.ts` 에 결정적으로 구현된다.

## 데이터 모델 (apps/bff/prisma/schema.prisma)

### MateProfile (`mate_profiles`)

본인 속성 6종 + 선호조건 6종(prefix `pref`, null=상관없음):

| 그룹 | 필드 | 타입 / 도메인 |
|---|---|---|
| 속성 | `gender` | `Char(1)` — `M` \| `F` |
| 속성 | `ageRangeLower` | Int — 5세 단위 하한 `{10,15,20,25,30,35,40,45,50}` |
| 속성 | `regionId` | BigInt? (Region FK) |
| 속성 | `hasCar` | Boolean (자차) |
| 속성 | `nationality` | `VarChar(20)` |
| 속성 | `koreanOk` | Boolean (한국어 가능) |
| 선호 | `prefGender / prefAgeLower / prefRegionId / prefHasCar / prefNationality / prefKoreanOk` | 위와 동일 도메인의 nullable 버전 — null=상관없음 |
| 게이트 | `autoRecommend` | Boolean `@default(false)` — 매칭 기능 사용 opt-in |
| 게이트 | `groupApply` | Boolean `@default(false)` — 그룹 동행 의사 |
| 경계 | `selectedEventId` | BigInt? — 함께 갈 축제(2주 윈도우). null=미선택 → `state:'no_event'` |
| 동의 | `consentedAt` | `Timestamptz?` — null=미동의 → 매칭 불가 (GG-MATCH-009/010) |
| 소프트삭제 | `isDeleted / deletedAt` | |

인덱스: `idx_mate_profiles_pool (consentedAt, regionId)`, `idx_mate_profiles_event_pool (selectedEventId, consentedAt)` — 후보풀 쿼리 최적.

### MateIndex (`mate_indexes`) — 메이트지수

- `userId` `@unique`, `indexValue` Int `@default(50)` (0~100 클램프).
- 프로필과 **분리 저장** (원본 평가 ≠ 파생 지수, ADR 0007 #4). 사용자 수정 불가(GG-PROFILE-005).
- 생성은 프로필 upsert 트랜잭션에서 `create:{ indexValue:50 }`, 이미 있으면 `update:{}` (불변) — `mate.ts::saveMateProfile`. 갱신은 평가 기반으로만 (아래 §메이트지수 갱신).

## 양방향 점수 (mate-score.ts)

`scoreOneWay(prefs, attrs)` 단방향 → `bidirectionalScore(a, b)` 양방향 합산.

**하드필터** (선호가 null 아닌데 불일치 → `null` 반환, 후보 제외):
- `prefGender` ≠ attrs.gender
- `prefAgeLower` 와 `ageRangeLower` 차 > `AGE_BAND_TOLERANCE`(=10, 즉 5세 밴드 2칸 초과)
- `prefRegionId` ≠ regionId (BigInt primitive `===`)
- `prefHasCar` ≠ hasCar / `prefNationality` ≠ nationality / `prefKoreanOk` ≠ koreanOk

**소프트 가점** (하드 통과 후, 선호 일치 시):

| 항목 | 가점 |
|---|---|
| 연령 근접 | `max(0, 20 - ageDiff*2)` (최대 20) |
| gender 일치 | +20 |
| region 일치 | +20 |
| nationality 일치 | +15 |
| hasCar 일치 | +15 |
| koreanOk 일치 | +10 |

`scoreOneWay` 는 0~100 범위 합산값. `bidirectionalScore` 는 `aToB`(내 선호↔상대 속성) 와 `bToA`(상대 선호↔내 속성) 를 둘 다 계산해 **어느 한 쪽이라도 null 이면 null**, 아니면 두 값을 합산해 반환(0~200). 모듈 헤더에 LLM/Qdrant import 금지·`noUnusedLocals` 규약 명시.

## 선택 축제 — hard 경계 (GG-MATCH-003)

- 윈도우: `upcomingMateEventWindow(now)` = `[오늘, 오늘+14일]` UTC 자정 절삭(`MATE_EVENT_WINDOW_DAYS=14`). selector·저장검증·추천 stale 체크가 공유.
- 저장 시 `selectedEventId` 제공되면 `event.findFirst({ isDeleted:false, approvalStatus:'approved', startDate∈[from,to] })` 로 검증, 실패 시 `400 selected_event_not_selectable`.
- 후보풀 쿼리는 `where.selectedEventId = myProfile.selectedEventId` 로 같은 축제만 모은다(soft 점수가 아닌 hard 필터). 지역은 mate-score 의 soft 가점으로 잔존.
- 추천 시점 stale 게이트: 선택 축제가 삭제·미승인·윈도우 이탈이면 `state:'no_event'` 반환(재선택 유도).

## 동의 / 게이팅 규칙

`getRecommendations` 의 blind/제외 분기:
- 요청자: 프로필 없음 OR `isDeleted` OR `consentedAt` 없음 OR `autoRecommend=false` → `{ state:'blind' }` (opt-out 은 매칭 사용 의사 없음으로 간주).
- 요청자 축제 미선택/stale → `{ state:'no_event' }`.
- 후보풀 제외: `consentedAt:null`·`isDeleted`·`autoRecommend=false` 제외, 본인 제외, 양방향 `Block`(blocker/blocked) 제외, 유효 `sanctionStatus='suspended'`(만료 안 됨) 제외 — GG-REPORT-009. null `sanctionExpiresAt` 방어를 위해 user 레벨 OR 조건 사용.
- 저장 시 `consentedAt` 은 non-empty 문자열 필수 — boolean `true` 우회(`new Date(true)`)도 `422 consent_required` 처리(GG-MATCH-009/010).
- PII(gender·nationality·ageRangeLower)는 저장 audit 로그에서 `maskPii` 로 마스킹(금지 #3).

## 매칭 / 추천 플로우 (mate.ts 라우트)

- `POST /community/mate/profile` — 프로필 upsert (requireAuth). 검증 후 트랜잭션으로 `MateProfile` upsert + `MateIndex` 보장(create 50 / update {}).
- `GET /community/mate/profile` — 본인 프로필. 없거나 삭제면 `204`.
- `GET /community/mate/profile/me` — 프로필 + 메이트지수(A_807). `mateIndex` 동봉(없으면 50).
- `GET /community/mate/events` — 2주 윈도우 내 approved 축제 목록(축제 선택 드롭다운 소스, take 200).
- `GET /community/mate/recommendations` — 추천 본체. 위 게이트 통과 시:
  1. 관계 단계 우선 — `getMateEngagementState`: 활성 채팅방 멤버십 + Appointment 상태로 `chatting`(9-12) / `appointment`(9-13, 확정+미래) / `post_use`(9-14, 확정+경과+미평가) 반환. 단계 있으면 목록 대신 단계 상태 반환.
  2. 후보풀 fetch — 같은 `selectedEventId` + 게이트, `mateIndex desc` 정렬로 `RECO_CANDIDATE_CAP=500` 까지만 로드.
  3. 각 후보에 `bidirectionalScore`, null 제외.
  4. 정렬: score desc, 동점 시 mateIndex desc → `RECO_LIMIT=20` slice.
  5. `{ state:'list', items:[{ userId, nickname, score, mateIndex }] }`.
- `GET /community/mate/index/:userId` — 타인 메이트지수 경량 조회(`{ userId, indexValue|null }`).

## 메이트지수 갱신 (mate-index-updater.ts)

평가 후 `updateMateIndex(evaluatedUserId)` 호출 (ADR 0007 #4, Slice 5):
- `MateEvaluation` 최신순 50건 조회, 비면 no-op. 행 미존재 시 `findUniqueOrThrow` 로 fail-fast(불변 원칙 — UPDATE 전용, create 금지).
- 최신 평가만 사용: `avgQ = (q1+q2+q3+q4)/4`, `rawScore = (ratingStars*10 + avgQ*10)/2` (0~100).
- 가중 이동평균: `newIndex = round(prevIndex*0.6 + rawScore*0.4)` (최근값 40%).
- penalty: 최신 평가에 `reportedFor != null` 이면 -3 (1회성, 윈도우 누적 폐기).
- `clamp(_, 0, 100)`.

## eval 하니스 (apps/bff/src/jobs/mate-eval.ts)

`npm run mate:eval` — community-eval.ts 패턴의 in-process PASS/FAIL 하니스. mockReq/mockRes 로 auth 직접 주입, 라우트 함수를 직접 호출. 21 케이스:
- 프로필 저장/멱등 upsert, consent 누락·boolean-true 우회 → 422, 401 미인증.
- MateIndex 기본값 50 + 불변(재저장해도 99 유지).
- 점수: dont-care(null prefs) skip, 하드필터 제외(gender/hasCar 불일치 → null).
- 추천: blind(프로필 없음), no_event(미선택·stale), autoRecommend=false 양쪽 제외, score↓·mateIndex↓ 정렬, 같은 축제 포함/다른 축제 제외(event_pool_isolation).
- 축제 의존 케이스는 2주 윈도우 내 approved 시드가 없으면 graceful skip. Block·Event 변경은 finally 에서 복원(비파괴).

## References

- `apps/bff/src/routes/mate.ts` — 라우트 핸들러 + 후보풀/추천/관계단계
- `apps/bff/src/lib/mate-score.ts` — 양방향 점수 엔진
- `apps/bff/src/lib/mate-index-updater.ts` — 메이트지수 가중 이동평균
- `apps/bff/src/jobs/mate-eval.ts` — eval 하니스 (`npm run mate:eval`)
- `apps/bff/prisma/schema.prisma` — `MateProfile` / `MateIndex` 모델
- `docs/decisions/0007-phase2-community-mate-matching.md` — ADR 0007 (#3 매칭 알고리즘, #4 메이트지수)
