# Slice 2 — 메이트 프로필 + 추천 (A_801 / A_807) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development per Task. 체크박스(`- [ ]`) 단위로 진행.
> 이 플랜은 집중형(focused)이다 — 스키마/마이그레이션은 전체, BFF/UI 는 스코프드 스펙 + 핵심 시그니처. 세부 구현은 **슬라이스 1 수직슬라이스를 템플릿**으로 따른다(posts.ts·community-eval.ts·CommunityPage SEED 사용법).

**Goal.** 일반 사용자가 메이트 프로필(자기 속성 + 선호조건 + 약관동의)을 입력하면, 규칙 기반 양방향 매칭으로 추천 메이트 목록을 받는다. 프로필 화면(A_807)에서 메이트 지수를 본다.

**Architecture.** 슬라이스 1 패턴 그대로: Prisma 모델 → 마이그레이션(**HUMAN 적용**) → BFF 라우트(requireAuth + 트랜잭션) → in-process 검증 하니스(mate-eval.ts) → SEED UI 페이지. 매칭은 **순수 산술 룰 엔진**(mate-score.ts, LLM/Qdrant 미사용 — 금지 #4). SEED CSS 는 **all.css**(base.css 아님 — 슬라이스1 버그 수정 반영).

**Tech Stack.** BFF Express+Prisma+Postgres. Web React19+Vite6+SEED(Option B, ADR 0008). enum=String+@db.VarChar(Prisma enum 미사용).

## 핵심 결정 (ADR 0007/0008 + 리뷰 25건 반영)
- **매칭 알고리즘**: 양방향. 후보풀 = *매칭 동의 + 같은 지역(슬라이스2 경계)*. 하드필터('상관없음' 아닌 선호 불일치 제외) → 소프트 점수(연령대 차·국적·한국어·자차·지역 가중) → 동점 메이트지수. **차단 사용자 제외(GG-REPORT-009 는 슬라이스8, 슬라이스2는 훅만)**. ⚠️ "같은 축제(2주내)"는 슬라이스 3에서 이벤트 연결 — 슬라이스2는 지역 기반. **미사용 `TWO_WEEKS_MS`/now 변수 선언 금지**(noUnusedLocals).
- **상관없음** = 선호 필드 NULL.
- **메이트 지수**: `MateIndex.indexValue` 기본 50, **수정 불가**(upsert update:{} 패턴). 갱신 로직은 슬라이스5. A_807·프로필 모달에 표시만.
- **PII**(성별/연령대/지역/국적/한국어): 약관 동의(`consentedAt`) 게이트 — 미동의 시 저장 422 + UI 적용 버튼 disabled(GG-MATCH-009/010). 로깅 시 `maskPii()` **실제 호출**(저장 audit 로그에서). 미사용이면 maskPii 제거.
- **연령대**: 5세 단위 정수 하한 `ageRangeLower`(10/15/.../50). CHECK 제약.
- **SEED checkbox 미존재** → 사용 Task 의 Step 0 에서 `npx @seed-design/cli@latest add ui:checkbox --on-diff overwrite`(react-checkbox 설치돼 있음). SegmentedControl 마다 `aria-label` 필수.
- **마이그레이션은 HUMAN(사람)이 적용** — 에이전트는 prisma migrate/db push/diff/reset **절대 실행 금지**(과거 DB 초기화 사고). 적용은 `prisma migrate deploy`(신규 pending 1건만; diff/shadow 금지).

## File Structure
| 경로 | 책임 |
|---|---|
| `apps/bff/prisma/migrations/20260530090000_phase2_mate_profile/migration.sql` | MateProfile/MateIndex DDL (HUMAN 적용) |
| `apps/bff/src/routes/mate.ts` | 메이트 프로필 저장/조회 + 추천 목록 라우트 |
| `apps/bff/src/lib/mate-score.ts` | 순수 룰 기반 양방향 매칭 점수 엔진 |
| `apps/bff/src/jobs/mate-eval.ts` | in-process 검증 하니스(PASS/FAIL) |
| `apps/web/src/lib/api/mate.ts` | 메이트 API 클라이언트 |
| `apps/web/src/pages/MateFormPage/` | 메이트 추천 받기 폼(A_801, 9-11) + ConsentGate + 안전가이드 |
| `apps/web/src/pages/MateRecommendationsPage/` | 추천 목록 4상태(9-10/12/13/14) |
| `apps/web/src/pages/ProfilePage/` | A_807 프로필(닉네임/사진/메이트지수) |
| 수정: `schema.prisma`(모델+User 역관계), `app.ts`(라우트), `main.tsx`(/mate/* 라우트), `CommunityPage/parts/MateRecoPlaceholder.tsx`(실링크), `PostDetailPage`+`CommentTree.tsx`(아래 Task 6) |

---

## Task 1 — Prisma 모델 + 마이그레이션 (HUMAN 적용)
**Files:** `apps/bff/prisma/schema.prisma`, `apps/bff/prisma/migrations/20260530090000_phase2_mate_profile/migration.sql`

- [ ] schema.prisma `User` 모델 역관계 추가 — `postLikes PostLike[]`(L34) **다음 줄**에 2줄(`@@unique` 위):
```prisma
  mateProfile     MateProfile?
  mateIndex       MateIndex?
```
- [ ] schema.prisma 끝에 2개 모델 추가:
```prisma
// ============ MATE PROFILE (Phase 2 / ADR 0007 — A_801) ============
model MateProfile {
  mateProfileId  BigInt    @id @default(autoincrement()) @map("mate_profile_id")
  userId         BigInt    @unique @map("user_id")
  // 자기 속성 (PII)
  gender         String    @db.Char(1)            // M | F
  ageRangeLower  Int       @map("age_range_lower") // 10/15/.../50 (5세 단위 하한)
  regionId       BigInt?   @map("region_id")
  hasCar         Boolean   @map("has_car")
  nationality    String    @db.VarChar(20)
  koreanOk       Boolean   @map("korean_ok")
  // 선호 조건 (NULL = 상관없음)
  prefGender       String?  @map("pref_gender") @db.Char(1)
  prefAgeLower     Int?     @map("pref_age_lower")
  prefRegionId     BigInt?  @map("pref_region_id")
  prefHasCar       Boolean? @map("pref_has_car")
  prefNationality  String?  @map("pref_nationality") @db.VarChar(20)
  prefKoreanOk     Boolean? @map("pref_korean_ok")
  // 플래그/동의
  autoRecommend  Boolean   @default(false) @map("auto_recommend")
  groupApply     Boolean   @default(false) @map("group_apply")
  consentedAt    DateTime? @map("consented_at") @db.Timestamptz  // null=미동의→매칭불가
  isDeleted      Boolean   @default(false) @map("is_deleted")
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz

  user       User    @relation(fields: [userId], references: [userId])
  region     Region? @relation("MateRegion", fields: [regionId], references: [regionId])
  prefRegion Region? @relation("MatePrefRegion", fields: [prefRegionId], references: [regionId])

  @@index([consentedAt, regionId], map: "idx_mate_profiles_pool")
  @@map("mate_profiles")
}

// ============ MATE INDEX (메이트 지수 — 수정불가, 갱신 슬라이스5) ============
model MateIndex {
  mateIndexId BigInt   @id @default(autoincrement()) @map("mate_index_id")
  userId      BigInt   @unique @map("user_id")
  indexValue  Int      @default(50) @map("index_value") // 0~100
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [userId])
  @@map("mate_indexes")
}
```
  - **Region 모델에 역관계 2줄 추가**(named relations 짝): `mateRegions MateProfile[] @relation("MateRegion")`, `matePrefRegions MateProfile[] @relation("MatePrefRegion")`.
- [ ] `migration.sql` 작성 (Prisma 네이밍 규칙 — `_pkey`/`_fkey`/`_key`, slice1 교훈):
```sql
-- Phase 2 / ADR 0007 — 메이트 프로필+지수(A_801/A_807). HUMAN 이 migrate deploy 로 적용.
CREATE TABLE "mate_profiles" (
  "mate_profile_id" BIGSERIAL NOT NULL,
  "user_id" BIGINT NOT NULL,
  "gender" CHAR(1) NOT NULL,
  "age_range_lower" INTEGER NOT NULL,
  "region_id" BIGINT,
  "has_car" BOOLEAN NOT NULL,
  "nationality" VARCHAR(20) NOT NULL,
  "korean_ok" BOOLEAN NOT NULL,
  "pref_gender" CHAR(1),
  "pref_age_lower" INTEGER,
  "pref_region_id" BIGINT,
  "pref_has_car" BOOLEAN,
  "pref_nationality" VARCHAR(20),
  "pref_korean_ok" BOOLEAN,
  "auto_recommend" BOOLEAN NOT NULL DEFAULT false,
  "group_apply" BOOLEAN NOT NULL DEFAULT false,
  "consented_at" TIMESTAMPTZ,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "mate_profiles_pkey" PRIMARY KEY ("mate_profile_id"),
  CONSTRAINT "mate_profiles_gender_check" CHECK ("gender" IN ('M','F')),
  CONSTRAINT "mate_profiles_age_check" CHECK ("age_range_lower" IN (10,15,20,25,30,35,40,45,50)),
  CONSTRAINT "mate_profiles_pref_gender_check" CHECK ("pref_gender" IS NULL OR "pref_gender" IN ('M','F'))
);
CREATE UNIQUE INDEX "mate_profiles_user_id_key" ON "mate_profiles"("user_id");
CREATE INDEX "idx_mate_profiles_pool" ON "mate_profiles"("consented_at","region_id");
ALTER TABLE "mate_profiles" ADD CONSTRAINT "mate_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id");
ALTER TABLE "mate_profiles" ADD CONSTRAINT "mate_profiles_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("region_id");
ALTER TABLE "mate_profiles" ADD CONSTRAINT "mate_profiles_pref_region_id_fkey" FOREIGN KEY ("pref_region_id") REFERENCES "regions"("region_id");

CREATE TABLE "mate_indexes" (
  "mate_index_id" BIGSERIAL NOT NULL,
  "user_id" BIGINT NOT NULL,
  "index_value" INTEGER NOT NULL DEFAULT 50,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mate_indexes_pkey" PRIMARY KEY ("mate_index_id")
);
CREATE UNIQUE INDEX "mate_indexes_user_id_key" ON "mate_indexes"("user_id");
ALTER TABLE "mate_indexes" ADD CONSTRAINT "mate_indexes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id");
```
- [ ] **green (HUMAN)**: `prisma validate` → `prisma migrate deploy`(신규 1건 적용) → `prisma generate`. **에이전트는 실행 금지**, 사람이 적용.
- [ ] commit: `feat(bff): MateProfile/MateIndex 모델 + 마이그레이션 (ADR 0007 A_801/A_807)`

---

## Task 2 — BFF 메이트 프로필 저장/조회 + 약관 게이트
**Files:** `apps/bff/src/routes/mate.ts`(생성), `apps/bff/src/jobs/mate-eval.ts`(생성), `app.ts`(수정)
패턴: `routes/posts.ts`(requireAuth/resolveAuth, 트랜잭션, 입력검증, 에러응답) + `jobs/community-eval.ts`(in-process 하니스) 그대로 모방.

- [ ] `POST /community/mate/profile` — upsert. body 검증(gender M/F, ageRangeLower ∈ set, nationality 1~20, koreanOk/hasCar boolean, 선호필드 optional). **consentedAt 없으면 422 `consent_required`**(GG-MATCH-009/010). 저장 시 `MateIndex` 없으면 `create{indexValue:50}`(이미 있으면 `update:{}` — 불변). 저장 audit 로그에 **`maskPii()` 호출**(gender/nationality/age 마스킹).
- [ ] `GET /community/mate/profile` — 본인 프로필(없으면 204/null). `GET /community/mate/profile/me` 프로필+지수(A_807용).
- [ ] mate-eval.ts 케이스: `profile.save.ok`, `profile.save.no_consent`(422), `profile.upsert.idempotent`, `mateIndex.default50`, `mateIndex.immutable`(재저장해도 50 유지 — 50 아닌 값으로 수동 변경 시도 후 upsert 가 안 덮음 검증). green: `npm run mate:eval`(package.json 스크립트 추가) + bff typecheck.
- [ ] commit.

---

## Task 3 — 매칭 엔진 + 추천 목록
**Files:** `apps/bff/src/lib/mate-score.ts`(생성), `routes/mate.ts`(추가), `mate-eval.ts`(추가)

- [ ] `mate-score.ts` — 순수 함수(LLM/Qdrant import 금지):
```ts
export interface MateAttrs { gender:string; ageRangeLower:number; regionId:bigint|null; hasCar:boolean; nationality:string; koreanOk:boolean; }
export interface MatePrefs { prefGender:string|null; prefAgeLower:number|null; prefRegionId:bigint|null; prefHasCar:boolean|null; prefNationality:string|null; prefKoreanOk:boolean|null; }
// 단방향 적합: 선호(null=상관없음) vs 상대 속성. 하드불일치 시 null 반환(후보 제외).
export function scoreOneWay(prefs:MatePrefs, attrs:MateAttrs): number|null;
// 양방향: 둘 다 통과해야 후보. 합산 점수 반환(null=제외).
export function bidirectionalScore(a:{attrs:MateAttrs;prefs:MatePrefs}, b:{attrs:MateAttrs;prefs:MatePrefs}): number|null;
```
  하드필터: 선호값 있고 불일치(gender/연령대 band 초과/지역/국적/한국어/자차) → null. 소프트: 일치/근접 가중 합. **미사용 TWO_WEEKS_MS/now 변수 선언 금지.**
- [ ] `GET /community/mate/recommendations` — 본인 consent 확인 → 후보풀(consentedAt not null + 본인 제외 + 같은 지역(슬라이스2 경계, 주석으로 "슬라이스3 이벤트 연결") + **차단 사용자 제외 훅**) → bidirectionalScore null 제외 → 점수 desc, 동점 mateIndex desc 정렬 → 상위 N. 미입력(프로필 없음) 시 `{ state:'blind' }`(GG-COMM-007/008).
- [ ] mate-eval 케이스: `reco.blind_when_no_profile`, `reco.hardfilter_excludes`, `reco.sorted_by_score_then_index`, `score.dontcare_skips`(상관없음=제외 안 함). green.
- [ ] commit.

---

## Task 4 — SEED UI: 메이트 추천 받기 폼 (A_801, 9-11)
**Files:** `apps/web/src/lib/api/mate.ts`, `apps/web/src/pages/MateFormPage/`(index + parts: ConsentGate, SafetyNotice)
패턴: `CommunityPage` SEED 사용법. **SEED CSS는 all.css(이미 적용).**

- [ ] **Step 0**: `cd apps/web && npx @seed-design/cli@latest add ui:checkbox --on-diff overwrite`(react-checkbox 설치됨). 추가 후 `seed-design/ui/checkbox.tsx` 의 실제 props(onCheckedChange 시그니처 boolean|'indeterminate')에 맞춰 사용.
- [ ] mate.ts: `saveMateProfile(body)`, `getMyMateProfile()`, `getRecommendations()` (posts.ts 패턴).
- [ ] MateFormPage: 내 프로필 + 선호조건 폼. 성별/자차/한국어=SegmentedControl(**각 aria-label 필수**), 연령대=SegmentedControl(5세 단위 라벨 30~34 형식), **지역=시/도 select(self + preferred, GG-MATCH-004/005)**, 국적=select. 선호 각 항목 "상관없음" 체크(null 처리). 자동추천/그룹신청 체크. **개인정보 약관 Checkbox + 안전 가이드라인 SafetyNotice 블록(GG-MATCH-008)**. 약관 미동의 시 적용 버튼 disabled(GG-MATCH-010). 적용 시 saveMateProfile → 성공 시 축하 dialog(GG-MATCH-013) → 커뮤니티 이동(GG-MATCH-014). 다시하기=초기화(GG-MATCH-017).
- [ ] green: web typecheck + build(all.css). commit.

---

## Task 5 — SEED UI: 추천 목록 4상태 + 프로필(A_807) + 커뮤니티 연결
**Files:** `MateRecommendationsPage/`, `ProfilePage/`, 수정 `MateRecoPlaceholder.tsx`·`main.tsx`

- [ ] MateRecommendationsPage: getRecommendations → state='blind'(프로필 미입력 GG-COMM-007/008) 시 블라인드+「메이트 추천 받기」버튼(→/mate/form). 입력완료 시 추천 카드 목록(ui:avatar + 닉네임 + 메이트지수). 9-10/12/13/14 상태는 슬라이스2에선 blind/list 2상태 + 채팅중/약속/사용후는 슬라이스3~5 placeholder 주석.
- [ ] ProfilePage(A_807): 본인 사진/닉네임(수정 가능, 기존 User 수정 API 재사용 또는 신규) + **메이트지수 표시(수정 불가, GG-PROFILE-005)**.
- [ ] MateRecoPlaceholder.tsx(슬라이스1 생성분) → 실 링크 `/mate/recommendations`. main.tsx 라우트 추가: `/mate/form`(MateFormPage), `/mate/recommendations`, `/me/profile`(ProfilePage). MyPage 프로필 보기 버튼(GG-MY-007) 연결.
- [ ] green + commit.

---

## Task 6 — 작성자 프로필 모달에 메이트지수 연결 (슬라이스1 carryover 수정)
**Files:** 수정 `PostDetailPage/parts/AuthorProfileModal.tsx`, `PostDetailPage/index.tsx`, `PostDetailPage/parts/CommentTree.tsx`
(리뷰 blocking #2: 슬라이스1에서 모달이 nickname-only 흐름이라 작성자별 메이트지수 표시가 안 됨)

- [ ] `CommentTree.onAuthorClick` 시그니처 `(nickname:string)` → `(nickname:string, userId:string)`. node.authorUserId(이미 posts 응답 CommentNodeOut 에 존재) 함께 전달.
- [ ] `PostDetailPage` 모달 상태 `useState<string|null>` → `useState<{nickname:string;userId:string}|null>`. post 작성자 클릭도 `detail.authorUserId` 전달.
- [ ] `AuthorProfileModal` props 에 `authorUserId` 추가 → 메이트지수 조회(GET mate index by userId, 신규 경량 라우트 `GET /community/mate/index/:userId`) 표시. 채팅 신청 버튼은 여전히 placeholder(슬라이스3).
- [ ] green(web typecheck + build) + commit.

---

## 마감
- [ ] 전체 회귀: `mate:eval` + `community:eval` + bff/web typecheck + web build(all.css).
- [ ] graphify 코드 그래프 갱신.
- [ ] 슬라이스 2 마감 커밋 + 완료 보고.
