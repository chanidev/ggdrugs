# Phase 2 Slice 2: Mate Profile + Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메이트 프로필 저장/조회 + 규칙 기반 추천 엔진 + SEED UI(메이트 추천 받기 폼, 추천목록 4상태, 프로필 모달)을 수직 슬라이스로 구현한다.

**Architecture:** Prisma 모델 2종(MateProfile, MateIndex) 추가 → BFF 5 라우트(프로필 CRUD + 추천목록) + 가중 점수 엔진(순수 TS, LLM 없음) → Web lib/api 클라이언트 → React 페이지 2종(MateFormPage, RecommendationsPage) + 커뮤니티 우측 레일 연결. 마이그레이션은 HUMAN이 직접 적용(에이전트 `prisma migrate/push/reset` 실행 절대 금지).

**Tech Stack:** Express 5, Prisma 5, PostgreSQL+PostGIS(포트 5433), TypeScript NodeNext ESM, React 19, Vite 6, Tailwind 4, SEED Design (`seed-design/ui/*`), `dotenv-cli` + `tsx` for eval harness.

---

## 파일 구조 (생성/수정 대상 전체 목록)

### BFF
| 파일 | 역할 |
|---|---|
| `apps/bff/prisma/schema.prisma` | MateProfile, MateIndex 모델 추가 + User 역방향 관계 3줄 추가 |
| `apps/bff/prisma/migrations/<timestamp>_phase2_mate_profile/migration.sql` | HUMAN 적용용 SQL 초안 (에이전트는 생성만, 적용 금지) |
| `apps/bff/src/routes/mate-profiles.ts` | 5 핸들러: getMateProfile, upsertMateProfile, deleteMateProfile, fetchRecommendations, getMyMateProfile |
| `apps/bff/src/lib/mate-score.ts` | 순수 TS 매칭 점수 엔진 (하드필터 + 소프트점수 + 정렬) |
| `apps/bff/src/jobs/mate-eval.ts` | in-process 검증 하니스 (DB 픽스처, handler 직접 호출) |
| `apps/bff/src/app.ts` | 5 라우트 등록 |
| `apps/bff/package.json` | `"mate:eval"` 스크립트 추가 |

### Web
| 파일 | 역할 |
|---|---|
| `apps/web/src/lib/api/mate-profiles.ts` | 타입 정의 + fetch 래퍼 5종 |
| `apps/web/src/pages/MateFormPage/index.tsx` | 메이트 추천 받기 폼 (와이어 9-11) — 자기 속성 + 선호조건 + 약관 동의 |
| `apps/web/src/pages/MateFormPage/parts/ConsentGate.tsx` | 약관 동의 게이트 컴포넌트 |
| `apps/web/src/pages/RecommendationsPage/index.tsx` | 추천목록 (와이어 9-10/12/13/14) — 4상태 BlindCard |
| `apps/web/src/pages/RecommendationsPage/parts/BlindCard.tsx` | 4상태 카드 (blind / pass / request / matched) |
| `apps/web/src/pages/CommunityPage/parts/MateRecoPlaceholder.tsx` | 기존 파일 수정 — 실 링크/상태 연결 |
| `apps/web/src/pages/PostDetailPage/parts/AuthorProfileModal.tsx` | 기존 파일 수정 — 메이트 지수 실데이터 표시 |
| `apps/web/src/main.tsx` | `/mate/form`, `/mate/recommendations` 라우트 등록 |

---

## Task 1: Prisma 스키마 편집 + migration.sql 초안 작성 (HUMAN 적용)

**Files:**
- Modify: `apps/bff/prisma/schema.prisma`
- Create: `apps/bff/prisma/migrations/20260529100000_phase2_mate_profile/migration.sql`

> **HUMAN 적용 필수:** 에이전트는 아래 파일을 편집/생성하기만 하고, `prisma migrate dev`, `prisma db push`, `prisma migrate reset` 명령은 절대 실행하지 않는다. 사람이 직접 `cd apps/bff && dotenv -e ../../.env -- prisma migrate dev --name phase2_mate_profile` 을 실행한다.

- [ ] **Step 1: schema.prisma에 MateProfile 모델 추가**

`apps/bff/prisma/schema.prisma` 파일 끝(PostLike 모델 다음)에 아래를 추가한다:

```prisma
// =============================================================
// MATE_PROFILES  (Phase 2 / ADR 0007 — A_801 메이트 매칭 프로필)
// PII 필드(gender/ageRangeLower/regionId/nationality/koreanSpeaking):
//   로그 마스킹 · 본인 접근 · 약관 동의 게이트 (ADR 0003 / ADR 0007 결정 17).
// =============================================================
model MateProfile {
  profileId          BigInt    @id @default(autoincrement()) @map("profile_id")
  userId             BigInt    @unique @map("user_id")
  // --- 자기 속성 (PII) ---
  // M | F | null(미입력). 5세 단위 ageRangeLower: 10/15/20/25/30/35/40/45/50
  gender             String?   @db.Char(1)              @map("gender")
  ageRangeLower      Int?                                @map("age_range_lower")
  regionId           BigInt?                             @map("region_id")
  hasCar             Boolean   @default(false)           @map("has_car")
  // KR | foreign | null(미입력)
  nationality        String?   @db.VarChar(20)          @map("nationality")
  // true=가능, false=불가, null=미입력
  koreanSpeaking     Boolean?                            @map("korean_speaking")

  // --- 선호 조건 (null = '상관없음') ---
  prefGender         String?   @db.Char(1)              @map("pref_gender")
  // null = 상관없음, 값=하한 정수
  prefAgeRangeLower  Int?                                @map("pref_age_range_lower")
  prefAgeRangeUpper  Int?                                @map("pref_age_range_upper")
  // null = 상관없음, 값 있으면 regionId (OR 다중 지역은 배열로)
  prefRegionIds      BigInt[]  @default([])              @map("pref_region_ids")
  prefHasCar         Boolean?                            @map("pref_has_car")
  // null = 상관없음 / KR / foreign
  prefNationality    String?   @db.VarChar(20)          @map("pref_nationality")
  // null = 상관없음 / true = 필수 / false = 불필요
  prefKoreanSpeaking Boolean?                            @map("pref_korean_speaking")

  // --- 매칭 설정 ---
  // false = 매칭 풀 제외 (GG-MATCH-009 약관 동의 게이트)
  consentToMatching  Boolean   @default(false)           @map("consent_to_matching")
  autoRecommend      Boolean   @default(true)            @map("auto_recommend")
  acceptGroupInvites Boolean   @default(false)           @map("accept_group_invites")

  isDeleted          Boolean   @default(false)           @map("is_deleted")
  createdAt          DateTime  @default(now())            @map("created_at") @db.Timestamptz
  updatedAt          DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt          DateTime?                            @map("deleted_at") @db.Timestamptz

  user   User    @relation(fields: [userId], references: [userId])
  region Region? @relation(fields: [regionId], references: [regionId])

  @@index([userId], map: "idx_mate_profile_user")
  @@index([regionId, ageRangeLower], map: "idx_mate_profile_region_age")
  @@map("mate_profiles")
}

// =============================================================
// MATE_INDEX  (Phase 2 / ADR 0007 결정 4 — 메이트 지수)
// 기본값 50. 슬라이스 2는 표시·생성만. 갱신 로직은 슬라이스 5(MateEvaluation).
// =============================================================
model MateIndex {
  mateIndexId      BigInt    @id @default(autoincrement()) @map("mate_index_id")
  userId           BigInt    @unique @map("user_id")
  // 0~100 정수. 기본 50. 슬라이스 5까지 수정 불가.
  indexValue       Int       @default(50)                  @map("index_value")
  lastEvaluatedAt  DateTime? @map("last_evaluated_at") @db.Timestamptz
  createdAt        DateTime  @default(now())                @map("created_at") @db.Timestamptz
  updatedAt        DateTime  @default(now()) @updatedAt     @map("updated_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [userId])

  @@map("mate_index")
}
```

- [ ] **Step 2: User 모델에 역방향 관계 3줄 추가**

`apps/bff/prisma/schema.prisma` 의 User 모델 내부, `posts Post[]` 줄 다음에 추가:

```prisma
  mateProfile     MateProfile?
  mateIndex       MateIndex?
```

`MateProfile` 모델 내부의 `user User @relation(...)` 다음 줄에 이미 `region Region?` 가 있으므로 Region 모델에도 역방향 관계를 추가한다. `apps/bff/prisma/schema.prisma`의 Region 모델 내부, `events Event[]` 줄 다음에:

```prisma
  mateProfiles MateProfile[]
```

- [ ] **Step 3: migration.sql 초안 파일 생성**

`apps/bff/prisma/migrations/20260529100000_phase2_mate_profile/migration.sql` 을 아래 내용으로 생성한다:

```sql
-- Phase 2 Slice 2: MateProfile + MateIndex
-- HUMAN이 직접 적용: cd apps/bff && dotenv -e ../../.env -- prisma migrate dev --name phase2_mate_profile
-- 또는 수동: psql $DATABASE_URL < migration.sql (migrate dev 권장)

-- mate_profiles
CREATE TABLE "mate_profiles" (
  "profile_id"           BIGSERIAL PRIMARY KEY,
  "user_id"              BIGINT NOT NULL UNIQUE REFERENCES "users"("user_id"),
  "gender"               CHAR(1),
  "age_range_lower"      INT,
  "region_id"            BIGINT REFERENCES "regions"("region_id"),
  "has_car"              BOOLEAN NOT NULL DEFAULT false,
  "nationality"          VARCHAR(20),
  "korean_speaking"      BOOLEAN,
  "pref_gender"          CHAR(1),
  "pref_age_range_lower" INT,
  "pref_age_range_upper" INT,
  "pref_region_ids"      BIGINT[] NOT NULL DEFAULT '{}',
  "pref_has_car"         BOOLEAN,
  "pref_nationality"     VARCHAR(20),
  "pref_korean_speaking" BOOLEAN,
  "consent_to_matching"  BOOLEAN NOT NULL DEFAULT false,
  "auto_recommend"       BOOLEAN NOT NULL DEFAULT true,
  "accept_group_invites" BOOLEAN NOT NULL DEFAULT false,
  "is_deleted"           BOOLEAN NOT NULL DEFAULT false,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at"           TIMESTAMPTZ
);

CREATE INDEX "idx_mate_profile_user"       ON "mate_profiles"("user_id");
CREATE INDEX "idx_mate_profile_region_age" ON "mate_profiles"("region_id", "age_range_lower");

-- CHECK constraints (Prisma drift 무시용 — migration SQL에만 추가)
ALTER TABLE "mate_profiles"
  ADD CONSTRAINT chk_mate_gender      CHECK ("gender"      IN ('M','F') OR "gender"      IS NULL),
  ADD CONSTRAINT chk_mate_pref_gender CHECK ("pref_gender" IN ('M','F') OR "pref_gender" IS NULL),
  ADD CONSTRAINT chk_mate_nationality CHECK ("nationality" IN ('KR','foreign') OR "nationality" IS NULL),
  ADD CONSTRAINT chk_mate_age_lower   CHECK ("age_range_lower" IS NULL OR ("age_range_lower" >= 10 AND "age_range_lower" <= 50)),
  ADD CONSTRAINT chk_mate_pref_age    CHECK ("pref_age_range_lower" IS NULL OR "pref_age_range_upper" IS NULL OR "pref_age_range_lower" <= "pref_age_range_upper");

-- updated_at 자동 갱신 트리거 (fn_set_updated_at 은 기존 마이그레이션에서 생성됨)
CREATE TRIGGER trg_mate_profiles_updated_at
  BEFORE UPDATE ON "mate_profiles"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- mate_index
CREATE TABLE "mate_index" (
  "mate_index_id"     BIGSERIAL PRIMARY KEY,
  "user_id"           BIGINT NOT NULL UNIQUE REFERENCES "users"("user_id"),
  "index_value"       INT NOT NULL DEFAULT 50,
  "last_evaluated_at" TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "mate_index"
  ADD CONSTRAINT chk_mate_index_value CHECK ("index_value" >= 0 AND "index_value" <= 100);

CREATE TRIGGER trg_mate_index_updated_at
  BEFORE UPDATE ON "mate_index"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
```

- [ ] **Step 4: HUMAN 적용 지시 확인 (에이전트는 아무것도 실행하지 않음)**

다음 내용을 출력하고 멈춘다. 사람이 직접 실행해야 한다:

```
[HUMAN ACTION REQUIRED]
cd apps/bff
dotenv -e ../../.env -- prisma migrate dev --name phase2_mate_profile

완료 후:
dotenv -e ../../.env -- prisma generate

이후 Task 2부터 진행.
```

---

## Task 2: BFF 매칭 점수 엔진 (`mate-score.ts`)

**Files:**
- Create: `apps/bff/src/lib/mate-score.ts`

이 파일은 Express, Prisma에 의존하지 않는 순수 TS 함수다. 테스트는 mate-eval.ts (Task 4)에서 handler 경유로 검증한다.

- [ ] **Step 1: `apps/bff/src/lib/mate-score.ts` 생성**

```typescript
/**
 * mate-score.ts — 메이트 매칭 규칙 기반 점수 엔진 (ADR 0007 결정 3)
 *
 * NO LLM. NO Qdrant. 순수 가중 산술 + 하드필터.
 *
 * 하드필터: '상관없음'(null)이 아닌 선호조건이 상대 프로필과 불일치 → 후보 제외.
 * 소프트점수: 지역 일치, 연령대 근접, 국적 일치, 한국어 일치, 자차 일치.
 * 동점 정렬: mateIndex 내림차순.
 */

export interface CandidateProfile {
  userId: string;            // BigInt를 string 직렬화
  nickname: string;
  gender: string | null;     // 'M' | 'F' | null
  ageRangeLower: number | null;
  regionId: string | null;
  hasCar: boolean;
  nationality: string | null;
  koreanSpeaking: boolean | null;
  mateIndex: number;         // MateIndex.indexValue (기본 50)
}

export interface RequesterPrefs {
  prefGender: string | null;
  prefAgeRangeLower: number | null;
  prefAgeRangeUpper: number | null;
  prefRegionIds: string[];
  prefHasCar: boolean | null;
  prefNationality: string | null;
  prefKoreanSpeaking: boolean | null;
}

export interface RequesterProfile {
  userId: string;
  gender: string | null;
  ageRangeLower: number | null;
  regionId: string | null;
  hasCar: boolean;
  nationality: string | null;
  koreanSpeaking: boolean | null;
}

export interface ScoredCandidate {
  candidate: CandidateProfile;
  score: number;
}

// 가중치 상수 — 외부화(변경 시 이 객체만 수정)
export const SCORE_WEIGHTS = {
  region: 30,
  age: 25,
  nationality: 20,
  korean: 15,
  car: 10,
} as const;

/**
 * 하드필터: 요청자의 선호조건(prefs)이 null(상관없음)이 아닌데
 * 후보(candidate) 속성이 불일치하면 false 반환.
 * 양방향: requesterPrefs vs candidateProfile AND candidatePrefs vs requesterProfile.
 */
export function passHardFilter(
  requesterPrefs: RequesterPrefs,
  candidate: CandidateProfile,
  candidatePrefs: RequesterPrefs,
  requester: RequesterProfile,
): boolean {
  // 요청자 선호 → 후보 속성 검사
  if (requesterPrefs.prefGender !== null && candidate.gender !== null
      && requesterPrefs.prefGender !== candidate.gender) return false;

  if (requesterPrefs.prefAgeRangeLower !== null && candidate.ageRangeLower !== null) {
    if (candidate.ageRangeLower < requesterPrefs.prefAgeRangeLower) return false;
  }
  if (requesterPrefs.prefAgeRangeUpper !== null && candidate.ageRangeLower !== null) {
    if (candidate.ageRangeLower > requesterPrefs.prefAgeRangeUpper) return false;
  }
  if (requesterPrefs.prefRegionIds.length > 0 && candidate.regionId !== null) {
    if (!requesterPrefs.prefRegionIds.includes(candidate.regionId)) return false;
  }
  if (requesterPrefs.prefHasCar !== null && requesterPrefs.prefHasCar !== candidate.hasCar) return false;
  if (requesterPrefs.prefNationality !== null && candidate.nationality !== null
      && requesterPrefs.prefNationality !== candidate.nationality) return false;
  if (requesterPrefs.prefKoreanSpeaking !== null && candidate.koreanSpeaking !== null
      && requesterPrefs.prefKoreanSpeaking !== candidate.koreanSpeaking) return false;

  // 후보 선호 → 요청자 속성 역방향 검사
  if (candidatePrefs.prefGender !== null && requester.gender !== null
      && candidatePrefs.prefGender !== requester.gender) return false;

  if (candidatePrefs.prefAgeRangeLower !== null && requester.ageRangeLower !== null) {
    if (requester.ageRangeLower < candidatePrefs.prefAgeRangeLower) return false;
  }
  if (candidatePrefs.prefAgeRangeUpper !== null && requester.ageRangeLower !== null) {
    if (requester.ageRangeLower > candidatePrefs.prefAgeRangeUpper) return false;
  }
  if (candidatePrefs.prefRegionIds.length > 0 && requester.regionId !== null) {
    if (!candidatePrefs.prefRegionIds.includes(requester.regionId)) return false;
  }
  if (candidatePrefs.prefHasCar !== null && candidatePrefs.prefHasCar !== requester.hasCar) return false;
  if (candidatePrefs.prefNationality !== null && requester.nationality !== null
      && candidatePrefs.prefNationality !== requester.nationality) return false;
  if (candidatePrefs.prefKoreanSpeaking !== null && requester.koreanSpeaking !== null
      && candidatePrefs.prefKoreanSpeaking !== requester.koreanSpeaking) return false;

  return true;
}

/**
 * 소프트 점수 계산 (0~100).
 * 각 항목: 일치 or 상관없음 → weight 만점, 불일치(둘 다 값 있는데 다름) → 0점.
 */
export function computeSoftScore(
  requesterPrefs: RequesterPrefs,
  candidate: CandidateProfile,
): number {
  let score = 0;

  // 지역: 선호지역 목록에 포함 or 상관없음(prefRegionIds 빈 배열) → 만점
  if (requesterPrefs.prefRegionIds.length === 0 || candidate.regionId === null
      || requesterPrefs.prefRegionIds.includes(candidate.regionId)) {
    score += SCORE_WEIGHTS.region;
  }

  // 연령대: 범위 내 or 상관없음 → 만점
  const ageLower = requesterPrefs.prefAgeRangeLower;
  const ageUpper = requesterPrefs.prefAgeRangeUpper;
  const candAge = candidate.ageRangeLower;
  if ((ageLower === null && ageUpper === null) || candAge === null
      || ((ageLower === null || candAge >= ageLower) && (ageUpper === null || candAge <= ageUpper))) {
    score += SCORE_WEIGHTS.age;
  }

  // 국적: 상관없음 or 일치 → 만점
  if (requesterPrefs.prefNationality === null || candidate.nationality === null
      || requesterPrefs.prefNationality === candidate.nationality) {
    score += SCORE_WEIGHTS.nationality;
  }

  // 한국어: 상관없음 or 일치 → 만점
  if (requesterPrefs.prefKoreanSpeaking === null || candidate.koreanSpeaking === null
      || requesterPrefs.prefKoreanSpeaking === candidate.koreanSpeaking) {
    score += SCORE_WEIGHTS.korean;
  }

  // 자차: 상관없음 or 일치 → 만점
  if (requesterPrefs.prefHasCar === null || requesterPrefs.prefHasCar === candidate.hasCar) {
    score += SCORE_WEIGHTS.car;
  }

  return score;
}

/**
 * rankCandidates: 하드필터 적용 후 소프트점수 내림차순, 동점은 mateIndex 내림차순.
 */
export function rankCandidates(
  requester: RequesterProfile,
  requesterPrefs: RequesterPrefs,
  candidates: Array<CandidateProfile & { prefs: RequesterPrefs }>,
): ScoredCandidate[] {
  const passed: ScoredCandidate[] = [];

  for (const c of candidates) {
    if (!passHardFilter(requesterPrefs, c, c.prefs, requester)) continue;
    const score = computeSoftScore(requesterPrefs, c);
    passed.push({ candidate: c, score });
  }

  passed.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.candidate.mateIndex - a.candidate.mateIndex;
  });

  return passed;
}
```

- [ ] **Step 2: BFF typecheck 통과 확인**

```bash
cd apps/bff && npm run typecheck
```

Expected: 0 errors (새 파일은 아직 Prisma 타입에 의존하지 않으므로 마이그레이션 전에도 통과).

- [ ] **Step 3: commit**

```bash
git add apps/bff/src/lib/mate-score.ts
git commit -m "feat(bff): add rule-based mate matching score engine"
```

---

## Task 3: BFF 라우트 (`mate-profiles.ts`) + app.ts 등록

**Files:**
- Create: `apps/bff/src/routes/mate-profiles.ts`
- Modify: `apps/bff/src/app.ts`

> **전제**: Task 1의 마이그레이션이 HUMAN에 의해 적용되고 `prisma generate`가 완료되어 있어야 한다. 미완료 시 Prisma Client 타입 에러가 발생한다.

- [ ] **Step 1: `apps/bff/src/routes/mate-profiles.ts` 생성**

```typescript
import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';
import {
  rankCandidates,
  type CandidateProfile,
  type RequesterPrefs,
  type RequesterProfile,
} from '../lib/mate-score.js';

// 내부 헬퍼 — posts.ts 패턴 동일
function parseBigId(raw: unknown): bigint | null {
  const s = typeof raw === 'string' ? raw : '';
  try { const n = BigInt(s); return n > 0n ? n : null; } catch { return null; }
}

const VALID_GENDERS = new Set(['M', 'F']);
const VALID_NATIONALITIES = new Set(['KR', 'foreign']);
const VALID_AGE_LOWERS = new Set([10, 15, 20, 25, 30, 35, 40, 45, 50]);

function validateGender(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string' && VALID_GENDERS.has(v)) return v;
  return undefined; // undefined = 검증 실패
}
function validateNationality(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string' && VALID_NATIONALITIES.has(v)) return v;
  return undefined;
}
function validateAgeLower(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN);
  if (VALID_AGE_LOWERS.has(n)) return n;
  return undefined;
}
function validateBooleanNullable(v: unknown): boolean | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

// PII 마스킹 로거용 — 로그에 PII 노출 금지 (ADR 0003 / ADR 0007 결정 17)
function maskPii(profile: Record<string, unknown>): Record<string, unknown> {
  return {
    ...profile,
    gender: '***',
    ageRangeLower: '***',
    regionId: '***',
    nationality: '***',
    koreanSpeaking: '***',
  };
}

/** GET /mate/profiles/me — 본인 프로필 조회. 없으면 404. */
export async function getMyMateProfile(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }

  const profile = await prisma.mateProfile.findFirst({
    where: { userId: auth.userId, isDeleted: false },
    include: { region: { select: { sidoName: true, sigunguName: true } } },
  });
  if (!profile) { res.status(404).json({ error: 'not found' }); return; }

  const mateIdx = await prisma.mateIndex.findUnique({ where: { userId: auth.userId } });

  res.json(serializeProfile(profile, mateIdx?.indexValue ?? 50));
}

/** GET /mate/profiles/:userId — 타인 프로필 조회. 본인 제외 PII 일부 숨김. */
export async function getMateProfile(req: Request, res: Response) {
  const targetUserId = parseBigId(req.params.userId);
  if (!targetUserId) { res.status(400).json({ error: 'invalid userId' }); return; }

  const profile = await prisma.mateProfile.findFirst({
    where: { userId: targetUserId, isDeleted: false, consentToMatching: true },
    include: { region: { select: { sidoName: true, sigunguName: true } } },
  });
  if (!profile) { res.status(404).json({ error: 'not found' }); return; }

  const mateIdx = await prisma.mateIndex.findUnique({ where: { userId: targetUserId } });
  // 타인 조회 시 선호조건만 — 자기 속성(PII)은 숨김
  res.json(serializePublicProfile(profile, mateIdx?.indexValue ?? 50));
}

/** POST /mate/profiles — 프로필 생성(upsert). 약관 동의 없으면 422. (GG-MATCH-009) */
export async function upsertMateProfile(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;

  // 약관 동의 게이트 (GG-MATCH-009): consentToMatching=true 가 반드시 포함되어야 함.
  if (body.consentToMatching !== true) {
    res.status(422).json({ error: 'consent_required' }); return;
  }

  // 자기 속성 파싱
  const gender = validateGender(body.gender);
  if (gender === undefined) { res.status(400).json({ error: 'invalid gender' }); return; }

  const ageRangeLower = validateAgeLower(body.ageRangeLower);
  if (ageRangeLower === undefined) { res.status(400).json({ error: 'invalid ageRangeLower' }); return; }

  const regionId = body.regionId != null ? parseBigId(body.regionId) : null;
  const hasCar = typeof body.hasCar === 'boolean' ? body.hasCar : false;

  const nationality = validateNationality(body.nationality);
  if (nationality === undefined) { res.status(400).json({ error: 'invalid nationality' }); return; }

  const koreanSpeaking = validateBooleanNullable(body.koreanSpeaking);
  if (koreanSpeaking === undefined) { res.status(400).json({ error: 'invalid koreanSpeaking' }); return; }

  // 선호조건 파싱
  const prefGender = validateGender(body.prefGender);
  if (prefGender === undefined) { res.status(400).json({ error: 'invalid prefGender' }); return; }

  const prefAgeRangeLower = validateAgeLower(body.prefAgeRangeLower);
  if (prefAgeRangeLower === undefined) { res.status(400).json({ error: 'invalid prefAgeRangeLower' }); return; }

  const prefAgeRangeUpper = validateAgeLower(body.prefAgeRangeUpper);
  if (prefAgeRangeUpper === undefined) { res.status(400).json({ error: 'invalid prefAgeRangeUpper' }); return; }

  const prefRegionRaw = Array.isArray(body.prefRegionIds) ? body.prefRegionIds : [];
  const prefRegionIds: bigint[] = [];
  for (const r of prefRegionRaw) {
    const id = parseBigId(r);
    if (!id) { res.status(400).json({ error: 'invalid prefRegionIds' }); return; }
    prefRegionIds.push(id);
  }

  const prefHasCar = validateBooleanNullable(body.prefHasCar);
  if (prefHasCar === undefined) { res.status(400).json({ error: 'invalid prefHasCar' }); return; }

  const prefNationality = validateNationality(body.prefNationality);
  if (prefNationality === undefined) { res.status(400).json({ error: 'invalid prefNationality' }); return; }

  const prefKoreanSpeaking = validateBooleanNullable(body.prefKoreanSpeaking);
  if (prefKoreanSpeaking === undefined) { res.status(400).json({ error: 'invalid prefKoreanSpeaking' }); return; }

  const autoRecommend = typeof body.autoRecommend === 'boolean' ? body.autoRecommend : true;
  const acceptGroupInvites = typeof body.acceptGroupInvites === 'boolean' ? body.acceptGroupInvites : false;

  const data = {
    gender,
    ageRangeLower,
    regionId,
    hasCar,
    nationality,
    koreanSpeaking,
    prefGender,
    prefAgeRangeLower,
    prefAgeRangeUpper,
    prefRegionIds,
    prefHasCar,
    prefNationality,
    prefKoreanSpeaking,
    consentToMatching: true,
    autoRecommend,
    acceptGroupInvites,
    isDeleted: false,
    deletedAt: null,
  };

  const profile = await prisma.mateProfile.upsert({
    where: { userId: auth.userId },
    create: { userId: auth.userId, ...data },
    update: data,
    include: { region: { select: { sidoName: true, sigunguName: true } } },
  });

  // MateIndex가 없으면 기본값 50으로 생성
  await prisma.mateIndex.upsert({
    where: { userId: auth.userId },
    create: { userId: auth.userId, indexValue: 50 },
    update: {}, // 갱신 없음 — 슬라이스 5까지 수정 불가
  });

  const mateIdx = await prisma.mateIndex.findUnique({ where: { userId: auth.userId } });
  res.status(201).json(serializeProfile(profile, mateIdx?.indexValue ?? 50));
}

/** DELETE /mate/profiles/me — 프로필 soft-delete. */
export async function deleteMateProfile(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }

  const existing = await prisma.mateProfile.findFirst({
    where: { userId: auth.userId, isDeleted: false },
    select: { profileId: true },
  });
  if (!existing) { res.status(404).json({ error: 'profile not found' }); return; }

  await prisma.mateProfile.update({
    where: { profileId: existing.profileId },
    data: { isDeleted: true, deletedAt: new Date(), consentToMatching: false },
  });
  res.json({ ok: true });
}

/**
 * GET /mate/recommendations — 추천 목록 (GG-MATCH-001/012).
 *
 * 후보 풀: 같은 지역의 이벤트(2주 이내) 참여 의사 + 매칭 동의한 사용자.
 * 현재 슬라이스 2에서는 "같은 지역 + 매칭 동의" 조건으로 풀을 구성.
 * (이벤트 등록 연결은 슬라이스 3에서 확장)
 */
export async function fetchRecommendations(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }

  const myProfile = await prisma.mateProfile.findFirst({
    where: { userId: auth.userId, isDeleted: false, consentToMatching: true },
  });
  // 프로필 없거나 동의 없으면 빈 목록 반환 (GG-COMM-007: 정보 미입력 = 블라인드 상태)
  if (!myProfile) { res.json({ items: [], blind: true }); return; }

  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  const now = new Date();
  const twoWeeksLater = new Date(now.getTime() + TWO_WEEKS_MS);

  // 후보 풀: 매칭 동의 + isDeleted=false + 본인 제외 + autoRecommend=true
  // 지역 기반 풀: 내 prefRegionIds에 있는 지역 OR 내 regionId와 같은 지역의 프로필
  const regionFilter = myProfile.prefRegionIds.length > 0
    ? { regionId: { in: myProfile.prefRegionIds } }
    : (myProfile.regionId ? { regionId: myProfile.regionId } : {});

  const rawCandidates = await prisma.mateProfile.findMany({
    where: {
      ...regionFilter,
      consentToMatching: true,
      isDeleted: false,
      autoRecommend: true,
      userId: { not: auth.userId },
    },
    include: {
      user: { select: { nickname: true } },
      region: { select: { sidoName: true, sigunguName: true } },
    },
    take: 50, // 점수 계산 전 DB 단계 최대치
  });

  // MateIndex 일괄 조회
  const userIds = rawCandidates.map((c) => c.userId);
  const mateIndexRows = await prisma.mateIndex.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, indexValue: true },
  });
  const indexMap = new Map(mateIndexRows.map((r) => [r.userId.toString(), r.indexValue]));

  const requesterProfile: RequesterProfile = {
    userId: auth.userId.toString(),
    gender: myProfile.gender,
    ageRangeLower: myProfile.ageRangeLower,
    regionId: myProfile.regionId?.toString() ?? null,
    hasCar: myProfile.hasCar,
    nationality: myProfile.nationality,
    koreanSpeaking: myProfile.koreanSpeaking,
  };

  const requesterPrefs: RequesterPrefs = {
    prefGender: myProfile.prefGender,
    prefAgeRangeLower: myProfile.prefAgeRangeLower,
    prefAgeRangeUpper: myProfile.prefAgeRangeUpper,
    prefRegionIds: myProfile.prefRegionIds.map((id) => id.toString()),
    prefHasCar: myProfile.prefHasCar,
    prefNationality: myProfile.prefNationality,
    prefKoreanSpeaking: myProfile.prefKoreanSpeaking,
  };

  const candidates: Array<CandidateProfile & { prefs: RequesterPrefs }> = rawCandidates.map((c) => ({
    userId: c.userId.toString(),
    nickname: c.user.nickname,
    gender: c.gender,
    ageRangeLower: c.ageRangeLower,
    regionId: c.regionId?.toString() ?? null,
    hasCar: c.hasCar,
    nationality: c.nationality,
    koreanSpeaking: c.koreanSpeaking,
    mateIndex: indexMap.get(c.userId.toString()) ?? 50,
    prefs: {
      prefGender: c.prefGender,
      prefAgeRangeLower: c.prefAgeRangeLower,
      prefAgeRangeUpper: c.prefAgeRangeUpper,
      prefRegionIds: c.prefRegionIds.map((id) => id.toString()),
      prefHasCar: c.prefHasCar,
      prefNationality: c.prefNationality,
      prefKoreanSpeaking: c.prefKoreanSpeaking,
    },
  }));

  const ranked = rankCandidates(requesterProfile, requesterPrefs, candidates);

  res.json({
    blind: false,
    items: ranked.map(({ candidate, score }) => ({
      userId: candidate.userId,
      nickname: candidate.nickname,
      mateIndex: candidate.mateIndex,
      score,
    })),
  });
}

// --- 직렬화 헬퍼 ---

function serializeProfile(
  p: {
    profileId: bigint; userId: bigint; gender: string | null; ageRangeLower: number | null;
    regionId: bigint | null; hasCar: boolean; nationality: string | null;
    koreanSpeaking: boolean | null; prefGender: string | null; prefAgeRangeLower: number | null;
    prefAgeRangeUpper: number | null; prefRegionIds: bigint[]; prefHasCar: boolean | null;
    prefNationality: string | null; prefKoreanSpeaking: boolean | null;
    consentToMatching: boolean; autoRecommend: boolean; acceptGroupInvites: boolean;
    createdAt: Date; updatedAt: Date;
    region: { sidoName: string; sigunguName: string | null } | null;
  },
  mateIndex: number,
) {
  return {
    profileId: p.profileId.toString(),
    userId: p.userId.toString(),
    gender: p.gender,
    ageRangeLower: p.ageRangeLower,
    regionId: p.regionId?.toString() ?? null,
    regionLabel: p.region ? `${p.region.sidoName}${p.region.sigunguName ? ' ' + p.region.sigunguName : ''}` : null,
    hasCar: p.hasCar,
    nationality: p.nationality,
    koreanSpeaking: p.koreanSpeaking,
    prefGender: p.prefGender,
    prefAgeRangeLower: p.prefAgeRangeLower,
    prefAgeRangeUpper: p.prefAgeRangeUpper,
    prefRegionIds: p.prefRegionIds.map((id) => id.toString()),
    prefHasCar: p.prefHasCar,
    prefNationality: p.prefNationality,
    prefKoreanSpeaking: p.prefKoreanSpeaking,
    consentToMatching: p.consentToMatching,
    autoRecommend: p.autoRecommend,
    acceptGroupInvites: p.acceptGroupInvites,
    mateIndex,
    updatedAt: p.updatedAt.toISOString(),
  };
}

function serializePublicProfile(
  p: Parameters<typeof serializeProfile>[0],
  mateIndex: number,
) {
  // 타인 조회 시 자기 속성(PII) 숨김 — 선호조건과 mateIndex만 노출
  const full = serializeProfile(p, mateIndex);
  return {
    userId: full.userId,
    mateIndex: full.mateIndex,
    // 선호조건은 공개 (상대가 어떤 메이트를 원하는지 알 수 있어야 신청 판단 가능)
    prefGender: full.prefGender,
    prefAgeRangeLower: full.prefAgeRangeLower,
    prefAgeRangeUpper: full.prefAgeRangeUpper,
    prefRegionIds: full.prefRegionIds,
    prefHasCar: full.prefHasCar,
    prefNationality: full.prefNationality,
    prefKoreanSpeaking: full.prefKoreanSpeaking,
    regionLabel: full.regionLabel, // 시/구 수준만 — 동 이하 숨김
    autoRecommend: full.autoRecommend,
  };
}
```

- [ ] **Step 2: `apps/bff/src/app.ts` 에 import 및 5개 라우트 등록**

`apps/bff/src/app.ts` 상단 import 블록에 추가:

```typescript
import {
  getMyMateProfile,
  getMateProfile,
  upsertMateProfile,
  deleteMateProfile,
  fetchRecommendations,
} from './routes/mate-profiles.js';
```

`app.ts` 내부, 커뮤니티 라우트 블록 다음에 추가:

```typescript
// A_801/A_807 메이트 프로필 + 추천 (GG-MATCH-001/009/012, GG-PROFILE-001~005)
app.get(
  '/mate/profiles/me',
  (req, res, next) => requireAuth(req, res, next).catch(next),
  (req, res, next) => getMyMateProfile(req, res).catch(next),
);
app.post(
  '/mate/profiles',
  (req, res, next) => requireAuth(req, res, next).catch(next),
  (req, res, next) => upsertMateProfile(req, res).catch(next),
);
app.delete(
  '/mate/profiles/me',
  (req, res, next) => requireAuth(req, res, next).catch(next),
  (req, res, next) => deleteMateProfile(req, res).catch(next),
);
app.get(
  '/mate/profiles/:userId',
  (req, res, next) => resolveAuth(req, res, next).catch(next),
  (req, res, next) => getMateProfile(req, res).catch(next),
);
app.get(
  '/mate/recommendations',
  (req, res, next) => requireAuth(req, res, next).catch(next),
  (req, res, next) => fetchRecommendations(req, res).catch(next),
);
```

- [ ] **Step 3: typecheck**

```bash
cd apps/bff && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: commit**

```bash
git add apps/bff/src/routes/mate-profiles.ts apps/bff/src/app.ts
git commit -m "feat(bff): add mate-profiles routes (upsert/get/delete/recommendations)"
```

---

## Task 4: BFF in-process 검증 하니스 (`mate-eval.ts`)

**Files:**
- Create: `apps/bff/src/jobs/mate-eval.ts`
- Modify: `apps/bff/package.json`

- [ ] **Step 1: `apps/bff/src/jobs/mate-eval.ts` 생성**

```typescript
import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import {
  getMyMateProfile,
  upsertMateProfile,
  deleteMateProfile,
  fetchRecommendations,
} from '../routes/mate-profiles.js';

interface MockReq {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  auth?: { userId: bigint; nickname: string; activeRole: string };
}
interface Captured { status: number; json: unknown; }

function mockRes(): Response & { _c: Captured } {
  const c: Captured = { status: 200, json: undefined };
  const res = {
    _c: c,
    status(s: number) { c.status = s; return this; },
    json(b: unknown) { c.json = b; return this; },
  } as unknown as Response & { _c: Captured };
  return res;
}
function mockReq(r: MockReq): Request {
  return { params: r.params ?? {}, query: r.query ?? {}, body: r.body ?? {}, auth: r.auth } as unknown as Request;
}

interface CaseResult { id: string; pass: boolean; failures: string[]; }
const results: CaseResult[] = [];
function check(id: string, fn: () => Promise<string[]>) {
  return fn()
    .then((failures) => results.push({ id, pass: failures.length === 0, failures }))
    .catch((e) => results.push({ id, pass: false, failures: [`threw: ${String(e)}`] }));
}

async function main() {
  const u = await prisma.user.findFirst({
    where: { isDeleted: false },
    select: { userId: true, nickname: true, activeRole: true },
  });
  if (!u) { console.error('no user to test with'); process.exit(1); }
  const auth = { userId: u.userId, nickname: u.nickname, activeRole: u.activeRole };

  // 두 번째 유저 (추천 목록 후보 풀 테스트용)
  const u2 = await prisma.user.findFirst({
    where: { isDeleted: false, userId: { not: u.userId } },
    select: { userId: true, nickname: true, activeRole: true },
  });

  // 기존 픽스처 정리 (재실행 안전성)
  await prisma.mateProfile.deleteMany({ where: { userId: { in: [u.userId, ...(u2 ? [u2.userId] : [])] } } }).catch(() => {});
  await prisma.mateIndex.deleteMany({ where: { userId: { in: [u.userId, ...(u2 ? [u2.userId] : [])] } } }).catch(() => {});

  try {
    // CASE: 약관 동의 없이 생성 → 422 (GG-MATCH-009)
    await check('mate.upsert.no_consent', async () => {
      const res = mockRes();
      await upsertMateProfile(mockReq({ auth, body: { consentToMatching: false } }), res);
      return res._c.status === 422 ? [] : [`status ${res._c.status} != 422`];
    });

    // CASE: 잘못된 gender → 400
    await check('mate.upsert.bad_gender', async () => {
      const res = mockRes();
      await upsertMateProfile(mockReq({ auth, body: { consentToMatching: true, gender: 'X' } }), res);
      return res._c.status === 400 ? [] : [`status ${res._c.status} != 400`];
    });

    // CASE: 정상 생성 → 201 + profileId
    let createdProfile: { profileId?: string; mateIndex?: number } = {};
    await check('mate.upsert.ok', async () => {
      const res = mockRes();
      await upsertMateProfile(
        mockReq({
          auth,
          body: {
            consentToMatching: true,
            gender: 'M',
            ageRangeLower: 25,
            hasCar: false,
            nationality: 'KR',
            koreanSpeaking: true,
            prefGender: null,
            prefAgeRangeLower: null,
            prefAgeRangeUpper: null,
            prefRegionIds: [],
            prefHasCar: null,
            prefNationality: null,
            prefKoreanSpeaking: null,
            autoRecommend: true,
            acceptGroupInvites: false,
          },
        }),
        res,
      );
      const b = res._c.json as typeof createdProfile;
      const f: string[] = [];
      if (res._c.status !== 201) f.push(`status ${res._c.status} != 201`);
      if (!b?.profileId) f.push('no profileId');
      if (b?.mateIndex !== 50) f.push(`mateIndex ${b?.mateIndex} != 50`);
      createdProfile = b;
      return f;
    });

    // CASE: 본인 프로필 조회 → 200
    await check('mate.getMe.ok', async () => {
      const res = mockRes();
      await getMyMateProfile(mockReq({ auth }), res);
      const b = res._c.json as { mateIndex?: number; consentToMatching?: boolean };
      const f: string[] = [];
      if (res._c.status !== 200) f.push(`status ${res._c.status}`);
      if (b?.consentToMatching !== true) f.push('consentToMatching != true');
      if (b?.mateIndex !== 50) f.push(`mateIndex ${b?.mateIndex} != 50`);
      return f;
    });

    // CASE: upsert(재저장) → 201 (idempotent)
    await check('mate.upsert.idempotent', async () => {
      const res = mockRes();
      await upsertMateProfile(
        mockReq({ auth, body: { consentToMatching: true, gender: 'F', hasCar: true } }),
        res,
      );
      const b = res._c.json as { gender?: string };
      const f: string[] = [];
      if (res._c.status !== 201) f.push(`status ${res._c.status} != 201`);
      if (b?.gender !== 'F') f.push(`gender "${b?.gender}" != "F"`);
      return f;
    });

    // CASE: MateIndex 불변 검증 — 직접 수정 시도 (Slice 5까지 수정 금지)
    await check('mate.mateIndex.immutable', async () => {
      // upsert 후 mateIndex가 여전히 50인지 확인
      const res = mockRes();
      await getMyMateProfile(mockReq({ auth }), res);
      const b = res._c.json as { mateIndex?: number };
      return b?.mateIndex === 50 ? [] : [`mateIndex ${b?.mateIndex} != 50 after re-upsert`];
    });

    // CASE: 추천 목록 — 프로필 없는 경우 blind=true
    if (u2) {
      await check('mate.recommendations.blind_when_no_profile', async () => {
        // u2에 프로필 없는 상태에서 u2로 추천 조회
        const auth2 = { userId: u2.userId, nickname: u2.nickname, activeRole: u2.activeRole };
        const res = mockRes();
        await fetchRecommendations(mockReq({ auth: auth2 }), res);
        const b = res._c.json as { blind?: boolean; items?: unknown[] };
        const f: string[] = [];
        if (b?.blind !== true) f.push(`blind ${b?.blind} != true`);
        if (!Array.isArray(b?.items) || b.items.length !== 0) f.push('items should be empty');
        return f;
      });

      // CASE: 하드필터 — u2의 선호성별을 F로 설정, u1(M)은 필터 제외되어야 함
      await check('mate.recommendations.hard_filter', async () => {
        const auth2 = { userId: u2.userId, nickname: u2.nickname, activeRole: u2.activeRole };
        // u2 프로필 생성: prefGender=F (u1은 M이므로 제외 대상)
        const up = mockRes();
        await upsertMateProfile(
          mockReq({
            auth: auth2,
            body: {
              consentToMatching: true,
              gender: 'F',
              ageRangeLower: 20,
              hasCar: false,
              nationality: 'KR',
              koreanSpeaking: true,
              prefGender: 'F',  // F만 원함 — u1(현재 F로 재설정됨)은 통과, 원래 M일 경우 제외
              prefAgeRangeLower: null,
              prefAgeRangeUpper: null,
              prefRegionIds: [],
              prefHasCar: null,
              prefNationality: null,
              prefKoreanSpeaking: null,
              autoRecommend: true,
              acceptGroupInvites: false,
            },
          }),
          up,
        );
        if (up._c.status !== 201) return [`u2 upsert status ${up._c.status}`];

        // u1을 M으로 재설정
        const u1m = mockRes();
        await upsertMateProfile(
          mockReq({ auth, body: { consentToMatching: true, gender: 'M', hasCar: false, prefGender: null, prefAgeRangeLower: null, prefAgeRangeUpper: null, prefRegionIds: [], prefHasCar: null, prefNationality: null, prefKoreanSpeaking: null } }),
          u1m,
        );

        // u2의 추천 목록에 u1(M)이 포함되면 안 됨 (prefGender=F 하드필터)
        const reco = mockRes();
        await fetchRecommendations(mockReq({ auth: auth2 }), reco);
        const b = reco._c.json as { items?: Array<{ userId: string }> };
        const hasU1 = b?.items?.some((i) => i.userId === auth.userId.toString());
        return hasU1 ? ['u1(M) should be excluded by prefGender=F hard filter'] : [];
      });
    }

    // CASE: 프로필 삭제 → 404 조회
    await check('mate.delete.then404', async () => {
      const rd = mockRes();
      await deleteMateProfile(mockReq({ auth }), rd);
      const rg = mockRes();
      await getMyMateProfile(mockReq({ auth }), rg);
      const f: string[] = [];
      if (rd._c.status !== 200) f.push(`delete status ${rd._c.status}`);
      if (rg._c.status !== 404) f.push(`after-delete getMe ${rg._c.status} != 404`);
      return f;
    });
  } finally {
    // 픽스처 정리
    await prisma.mateProfile.deleteMany({
      where: { userId: { in: [u.userId, ...(u2 ? [u2.userId] : [])] } },
    }).catch(() => {});
    await prisma.mateIndex.deleteMany({
      where: { userId: { in: [u.userId, ...(u2 ? [u2.userId] : [])] } },
    }).catch(() => {});
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

- [ ] **Step 2: `apps/bff/package.json` 에 `mate:eval` 스크립트 추가**

`apps/bff/package.json` 의 `"scripts"` 블록 내 `"community:eval"` 줄 다음에:

```json
"mate:eval": "dotenv -e ../../.env -- tsx src/jobs/mate-eval.ts",
```

- [ ] **Step 3: typecheck 통과 확인**

```bash
cd apps/bff && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: eval 실행 (마이그레이션 적용 + prisma generate 완료 후)**

```bash
cd apps/bff && npm run mate:eval
```

Expected 출력:
```
PASS mate.upsert.no_consent
PASS mate.upsert.bad_gender
PASS mate.upsert.ok
PASS mate.getMe.ok
PASS mate.upsert.idempotent
PASS mate.mateIndex.immutable
PASS mate.recommendations.blind_when_no_profile
PASS mate.recommendations.hard_filter
PASS mate.delete.then404

9/9 passed
```

- [ ] **Step 5: commit**

```bash
git add apps/bff/src/jobs/mate-eval.ts apps/bff/package.json
git commit -m "test(bff): add mate-eval in-process harness (9 cases)"
```

---

## Task 5: Web API 클라이언트 (`lib/api/mate-profiles.ts`)

**Files:**
- Create: `apps/web/src/lib/api/mate-profiles.ts`

- [ ] **Step 1: `apps/web/src/lib/api/mate-profiles.ts` 생성**

```typescript
import { BFF_URL, withCredentials } from './client.js';

// 자기 속성
export type Gender = 'M' | 'F' | null;
export type AgeLower = 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | null;
export type Nationality = 'KR' | 'foreign' | null;

export interface MateProfileOut {
  profileId: string;
  userId: string;
  gender: Gender;
  ageRangeLower: AgeLower;
  regionId: string | null;
  regionLabel: string | null;
  hasCar: boolean;
  nationality: Nationality;
  koreanSpeaking: boolean | null;
  prefGender: Gender;
  prefAgeRangeLower: AgeLower;
  prefAgeRangeUpper: AgeLower;
  prefRegionIds: string[];
  prefHasCar: boolean | null;
  prefNationality: Nationality;
  prefKoreanSpeaking: boolean | null;
  consentToMatching: boolean;
  autoRecommend: boolean;
  acceptGroupInvites: boolean;
  mateIndex: number;
  updatedAt: string;
}

export interface MateProfilePublicOut {
  userId: string;
  mateIndex: number;
  prefGender: Gender;
  prefAgeRangeLower: AgeLower;
  prefAgeRangeUpper: AgeLower;
  prefRegionIds: string[];
  prefHasCar: boolean | null;
  prefNationality: Nationality;
  prefKoreanSpeaking: boolean | null;
  regionLabel: string | null;
  autoRecommend: boolean;
}

export interface UpsertMateProfileInput {
  consentToMatching: true;
  gender?: Gender;
  ageRangeLower?: AgeLower;
  regionId?: string | null;
  hasCar?: boolean;
  nationality?: Nationality;
  koreanSpeaking?: boolean | null;
  prefGender?: Gender;
  prefAgeRangeLower?: AgeLower;
  prefAgeRangeUpper?: AgeLower;
  prefRegionIds?: string[];
  prefHasCar?: boolean | null;
  prefNationality?: Nationality;
  prefKoreanSpeaking?: boolean | null;
  autoRecommend?: boolean;
  acceptGroupInvites?: boolean;
}

export interface RecommendationItem {
  userId: string;
  nickname: string;
  mateIndex: number;
  score: number;
}

export interface RecommendationsResponse {
  blind: boolean;
  items: RecommendationItem[];
}

export async function fetchMyMateProfile(signal?: AbortSignal): Promise<MateProfileOut | null> {
  const res = await fetch(
    `${BFF_URL}/mate/profiles/me`,
    withCredentials(signal != null ? { signal } : {}),
  );
  if (res.status === 404) return null;
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /mate/profiles/me ${res.status}`);
  return (await res.json()) as MateProfileOut;
}

export async function upsertMateProfile(input: UpsertMateProfileInput): Promise<MateProfileOut> {
  const res = await fetch(
    `${BFF_URL}/mate/profiles`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 422) throw new Error('CONSENT_REQUIRED');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`POST /mate/profiles ${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as MateProfileOut;
}

export async function deleteMateProfile(): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/mate/profiles/me`,
    withCredentials({ method: 'DELETE' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`DELETE /mate/profiles/me ${res.status}`);
}

export async function fetchMateProfile(userId: string, signal?: AbortSignal): Promise<MateProfilePublicOut | null> {
  const res = await fetch(
    `${BFF_URL}/mate/profiles/${encodeURIComponent(userId)}`,
    withCredentials(signal != null ? { signal } : {}),
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /mate/profiles/${userId} ${res.status}`);
  return (await res.json()) as MateProfilePublicOut;
}

export async function fetchRecommendations(signal?: AbortSignal): Promise<RecommendationsResponse> {
  const res = await fetch(
    `${BFF_URL}/mate/recommendations`,
    withCredentials(signal != null ? { signal } : {}),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /mate/recommendations ${res.status}`);
  return (await res.json()) as RecommendationsResponse;
}
```

- [ ] **Step 2: web typecheck**

```bash
cd apps/web && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: commit**

```bash
git add apps/web/src/lib/api/mate-profiles.ts
git commit -m "feat(web): add mate-profiles API client with typed DTOs"
```

---

## Task 6: Web 메이트 추천 받기 폼 페이지 (`MateFormPage`)

**Files:**
- Create: `apps/web/src/pages/MateFormPage/index.tsx`
- Create: `apps/web/src/pages/MateFormPage/parts/ConsentGate.tsx`

와이어 9-11: 성별/나이(5세단위)/지역/자차/국적/한국어 + 선호조건 각 항목 '상관없음' + 자동추천/그룹신청받기 + 약관 동의.

- [ ] **Step 1: ConsentGate 컴포넌트 생성**

`apps/web/src/pages/MateFormPage/parts/ConsentGate.tsx`:

```tsx
import { Checkbox } from 'seed-design/ui/checkbox';
import { ActionButton } from 'seed-design/ui/action-button';

/**
 * GG-MATCH-009/010: 개인정보 약관 동의 게이트.
 * 미동의 시 "메이트 추천 받기" 버튼 disabled.
 */
export function ConsentGate({
  consented,
  onToggle,
  onSubmit,
  loading,
}: {
  consented: boolean;
  onToggle: () => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-5">
      <p className="text-[14px] font-semibold">개인정보 수집 및 이용 동의</p>
      <p className="text-[13px] text-(--color-text-muted) leading-relaxed">
        메이트 매칭을 위해 성별, 연령대, 지역, 국적, 한국어 사용 여부를 수집합니다.
        수집된 정보는 메이트 추천에만 사용되며, 탈퇴 또는 동의 철회 시 즉시 파기됩니다.
      </p>
      <label className="flex cursor-pointer items-center gap-2 text-[13px]">
        <Checkbox
          checked={consented}
          onCheckedChange={onToggle}
          aria-label="개인정보 수집 및 이용에 동의합니다"
        />
        <span>개인정보 수집 및 이용에 동의합니다 (필수)</span>
      </label>
      <ActionButton
        variant="brandSolid"
        size="medium"
        disabled={!consented || loading}
        onClick={onSubmit}
        className="w-full"
        aria-disabled={!consented || loading}
      >
        {loading ? '저장 중...' : '메이트 추천 받기 시작'}
      </ActionButton>
    </div>
  );
}
```

- [ ] **Step 2: MateFormPage 생성**

`apps/web/src/pages/MateFormPage/index.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Header } from '../../layout/Header';
import { ActionButton } from 'seed-design/ui/action-button';
import { SegmentedControl, SegmentedControlItem } from 'seed-design/ui/segmented-control';
import { Checkbox } from 'seed-design/ui/checkbox';
import { ConsentGate } from './parts/ConsentGate';
import {
  fetchMyMateProfile,
  upsertMateProfile,
  deleteMateProfile,
  type Gender,
  type AgeLower,
  type Nationality,
  type MateProfileOut,
} from '../../lib/api/mate-profiles.js';
import { useCurrentUser } from '../../lib/auth-context';

const AGE_OPTIONS: { value: AgeLower; label: string }[] = [
  { value: 10, label: '10대' },
  { value: 15, label: '15~19세' },
  { value: 20, label: '20대 초' },
  { value: 25, label: '20대 후' },
  { value: 30, label: '30대 초' },
  { value: 35, label: '30대 후' },
  { value: 40, label: '40대 초' },
  { value: 45, label: '40대 후' },
  { value: 50, label: '50대 이상' },
];

function AgeSelect({
  value,
  onChange,
  label,
}: {
  value: AgeLower;
  onChange: (v: AgeLower) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] text-(--color-text-muted)">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : (Number(e.target.value) as AgeLower))}
        className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[14px]"
        aria-label={label}
      >
        <option value="">상관없음</option>
        {AGE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value ?? ''}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * MateFormPage — A_801 메이트 추천 받기 폼 (와이어 9-11).
 * GG-MATCH-001/009/010, GG-PROFILE-001~003.
 */
export function MateFormPage() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();

  const [existing, setExisting] = useState<MateProfileOut | null>(null);
  const [loadingInit, setLoadingInit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 자기 속성
  const [gender, setGender] = useState<Gender>(null);
  const [ageRangeLower, setAgeRangeLower] = useState<AgeLower>(null);
  const [hasCar, setHasCar] = useState(false);
  const [nationality, setNationality] = useState<Nationality>(null);
  const [koreanSpeaking, setKoreanSpeaking] = useState<boolean | null>(null);

  // 선호조건
  const [prefGender, setPrefGender] = useState<Gender>(null);
  const [prefAgeLower, setPrefAgeLower] = useState<AgeLower>(null);
  const [prefAgeUpper, setPrefAgeUpper] = useState<AgeLower>(null);
  const [prefHasCar, setPrefHasCar] = useState<boolean | null>(null);
  const [prefNationality, setPrefNationality] = useState<Nationality>(null);
  const [prefKoreanSpeaking, setPrefKoreanSpeaking] = useState<boolean | null>(null);

  // 설정
  const [autoRecommend, setAutoRecommend] = useState(true);
  const [acceptGroupInvites, setAcceptGroupInvites] = useState(false);
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    if (!user) { setLoadingInit(false); return; }
    const ac = new AbortController();
    fetchMyMateProfile(ac.signal)
      .then((p) => {
        if (p) {
          setExisting(p);
          setGender(p.gender);
          setAgeRangeLower(p.ageRangeLower);
          setHasCar(p.hasCar);
          setNationality(p.nationality);
          setKoreanSpeaking(p.koreanSpeaking);
          setPrefGender(p.prefGender);
          setPrefAgeLower(p.prefAgeRangeLower);
          setPrefAgeUpper(p.prefAgeRangeUpper);
          setPrefHasCar(p.prefHasCar);
          setPrefNationality(p.prefNationality);
          setPrefKoreanSpeaking(p.prefKoreanSpeaking);
          setAutoRecommend(p.autoRecommend);
          setAcceptGroupInvites(p.acceptGroupInvites);
          setConsented(true); // 기존 동의자
        }
        setLoadingInit(false);
      })
      .catch(() => setLoadingInit(false));
    return () => ac.abort();
  }, [user]);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      await upsertMateProfile({
        consentToMatching: true,
        gender,
        ageRangeLower,
        hasCar,
        nationality,
        koreanSpeaking,
        prefGender,
        prefAgeRangeLower: prefAgeLower,
        prefAgeRangeUpper: prefAgeUpper,
        prefRegionIds: [],
        prefHasCar,
        prefNationality,
        prefKoreanSpeaking,
        autoRecommend,
        acceptGroupInvites,
      });
      navigate('/mate/recommendations');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    if (!window.confirm('메이트 추천 받기를 중단하시겠어요? 프로필이 삭제됩니다.')) return;
    try {
      await deleteMateProfile();
      navigate('/community');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col bg-(--color-bg) text-(--color-text)">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[15px] text-(--color-text-muted)">로그인이 필요해요.</p>
        </div>
      </div>
    );
  }

  if (loadingInit) {
    return (
      <div className="flex h-screen flex-col bg-(--color-bg) text-(--color-text)">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[14px] text-(--color-text-muted)">불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] px-5 py-6">
          <div className="mb-5 flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="text-[13px] text-(--color-text-muted) hover:text-(--color-text)"
              aria-label="뒤로 가기"
            >
              ← 뒤로
            </button>
            <h1 className="text-(length:--text-h2) font-semibold">
              {existing ? '메이트 프로필 수정' : '메이트 추천 받기'}
            </h1>
          </div>

          {error && (
            <div className="mb-4 rounded-(--radius-md) bg-red-50 px-4 py-3 text-[13px] text-red-600">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-6">
            {/* 자기 속성 */}
            <section className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-5">
              <h2 className="mb-4 text-[15px] font-semibold">내 정보</h2>
              <div className="flex flex-col gap-4">
                {/* 성별 */}
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] text-(--color-text-muted)">성별</span>
                  <SegmentedControl
                    value={gender ?? 'none'}
                    onValueChange={(v) => setGender(v === 'none' ? null : (v as Gender))}
                  >
                    <SegmentedControlItem value="none">미입력</SegmentedControlItem>
                    <SegmentedControlItem value="M">남성</SegmentedControlItem>
                    <SegmentedControlItem value="F">여성</SegmentedControlItem>
                  </SegmentedControl>
                </div>

                {/* 연령대 */}
                <AgeSelect value={ageRangeLower} onChange={setAgeRangeLower} label="연령대 (5세 단위)" />

                {/* 자차 */}
                <label className="flex cursor-pointer items-center gap-2 text-[14px]">
                  <Checkbox
                    checked={hasCar}
                    onCheckedChange={(v) => setHasCar(v === true)}
                    aria-label="자차 보유"
                  />
                  <span>자차 보유</span>
                </label>

                {/* 국적 */}
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] text-(--color-text-muted)">국적</span>
                  <SegmentedControl
                    value={nationality ?? 'none'}
                    onValueChange={(v) => setNationality(v === 'none' ? null : (v as Nationality))}
                  >
                    <SegmentedControlItem value="none">미입력</SegmentedControlItem>
                    <SegmentedControlItem value="KR">한국</SegmentedControlItem>
                    <SegmentedControlItem value="foreign">외국</SegmentedControlItem>
                  </SegmentedControl>
                </div>

                {/* 한국어 */}
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] text-(--color-text-muted)">한국어 소통</span>
                  <SegmentedControl
                    value={koreanSpeaking === null ? 'none' : String(koreanSpeaking)}
                    onValueChange={(v) => setKoreanSpeaking(v === 'none' ? null : v === 'true')}
                  >
                    <SegmentedControlItem value="none">미입력</SegmentedControlItem>
                    <SegmentedControlItem value="true">가능</SegmentedControlItem>
                    <SegmentedControlItem value="false">불가</SegmentedControlItem>
                  </SegmentedControl>
                </div>
              </div>
            </section>

            {/* 선호 조건 */}
            <section className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-5">
              <h2 className="mb-4 text-[15px] font-semibold">메이트 선호 조건</h2>
              <p className="mb-3 text-[12px] text-(--color-text-muted)">
                선택하지 않은 항목은 '상관없음'으로 설정됩니다.
              </p>
              <div className="flex flex-col gap-4">
                {/* 선호 성별 */}
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] text-(--color-text-muted)">선호 성별</span>
                  <SegmentedControl
                    value={prefGender ?? 'none'}
                    onValueChange={(v) => setPrefGender(v === 'none' ? null : (v as Gender))}
                  >
                    <SegmentedControlItem value="none">상관없음</SegmentedControlItem>
                    <SegmentedControlItem value="M">남성</SegmentedControlItem>
                    <SegmentedControlItem value="F">여성</SegmentedControlItem>
                  </SegmentedControl>
                </div>

                {/* 선호 연령대 범위 */}
                <div className="flex gap-3">
                  <AgeSelect value={prefAgeLower} onChange={setPrefAgeLower} label="선호 연령 (하한)" />
                  <AgeSelect value={prefAgeUpper} onChange={setPrefAgeUpper} label="선호 연령 (상한)" />
                </div>

                {/* 자차 보유 여부 */}
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] text-(--color-text-muted)">자차 보유 여부</span>
                  <SegmentedControl
                    value={prefHasCar === null ? 'none' : String(prefHasCar)}
                    onValueChange={(v) => setPrefHasCar(v === 'none' ? null : v === 'true')}
                  >
                    <SegmentedControlItem value="none">상관없음</SegmentedControlItem>
                    <SegmentedControlItem value="true">있어야 함</SegmentedControlItem>
                    <SegmentedControlItem value="false">없어도 됨</SegmentedControlItem>
                  </SegmentedControl>
                </div>

                {/* 선호 국적 */}
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] text-(--color-text-muted)">선호 국적</span>
                  <SegmentedControl
                    value={prefNationality ?? 'none'}
                    onValueChange={(v) => setPrefNationality(v === 'none' ? null : (v as Nationality))}
                  >
                    <SegmentedControlItem value="none">상관없음</SegmentedControlItem>
                    <SegmentedControlItem value="KR">한국인</SegmentedControlItem>
                    <SegmentedControlItem value="foreign">외국인</SegmentedControlItem>
                  </SegmentedControl>
                </div>

                {/* 선호 한국어 */}
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] text-(--color-text-muted)">한국어 소통 여부</span>
                  <SegmentedControl
                    value={prefKoreanSpeaking === null ? 'none' : String(prefKoreanSpeaking)}
                    onValueChange={(v) => setPrefKoreanSpeaking(v === 'none' ? null : v === 'true')}
                  >
                    <SegmentedControlItem value="none">상관없음</SegmentedControlItem>
                    <SegmentedControlItem value="true">필수</SegmentedControlItem>
                    <SegmentedControlItem value="false">불필요</SegmentedControlItem>
                  </SegmentedControl>
                </div>
              </div>
            </section>

            {/* 매칭 설정 */}
            <section className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-5">
              <h2 className="mb-4 text-[15px] font-semibold">매칭 설정</h2>
              <div className="flex flex-col gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-[14px]">
                  <Checkbox
                    checked={autoRecommend}
                    onCheckedChange={(v) => setAutoRecommend(v === true)}
                    aria-label="자동 추천 목록에 노출"
                  />
                  <span>자동 추천 목록에 노출</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[14px]">
                  <Checkbox
                    checked={acceptGroupInvites}
                    onCheckedChange={(v) => setAcceptGroupInvites(v === true)}
                    aria-label="그룹 신청 받기"
                  />
                  <span>그룹 신청 받기</span>
                </label>
              </div>
            </section>

            {/* 약관 동의 게이트 */}
            <ConsentGate
              consented={consented}
              onToggle={() => setConsented((v) => !v)}
              onSubmit={handleSubmit}
              loading={saving}
            />

            {/* 기존 프로필 삭제 */}
            {existing && (
              <div className="flex justify-end">
                <ActionButton
                  variant="neutralOutline"
                  size="small"
                  onClick={handleDelete}
                >
                  메이트 추천 중단하기
                </ActionButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: web typecheck**

```bash
cd apps/web && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: commit**

```bash
git add apps/web/src/pages/MateFormPage/
git commit -m "feat(web): add MateFormPage with SEED segmented-control form (wire 9-11)"
```

---

## Task 7: Web 추천 목록 페이지 (`RecommendationsPage`) + BlindCard

**Files:**
- Create: `apps/web/src/pages/RecommendationsPage/index.tsx`
- Create: `apps/web/src/pages/RecommendationsPage/parts/BlindCard.tsx`

와이어 9-10/12/13/14: 추천목록 4상태 — blind(정보 미입력) / visible(목록 표시) / pass / request 버튼.
슬라이스 2 스코프: pass/request 버튼은 표시되지만 실제 신청 액션은 슬라이스 3에서 구현 → disabled + 준비 중 tooltip.

- [ ] **Step 1: BlindCard 생성**

`apps/web/src/pages/RecommendationsPage/parts/BlindCard.tsx`:

```tsx
import { Avatar } from 'seed-design/ui/avatar';
import { ActionButton } from 'seed-design/ui/action-button';
import type { RecommendationItem } from '../../../lib/api/mate-profiles.js';

/**
 * BlindCard — 추천 메이트 카드 (GG-COMM-007/008).
 *
 * 4상태:
 * - blind: 정보 미입력 → 닉네임 블러, 점수/지수 숨김
 * - visible: 정보 입력 완료 → 닉네임, 메이트 지수, 점수 표시
 *   - 버튼: "패스" (pass), "메이트 신청" (request)
 *   - 슬라이스 3까지 버튼은 disabled (신청 플로우 미구현)
 */
export function BlindCard({
  item,
  blind,
}: {
  item: RecommendationItem;
  blind: boolean;
}) {
  const initial = item.nickname.slice(0, 1);

  return (
    <div className="flex items-center gap-4 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) px-4 py-3">
      <Avatar
        fallback={blind ? '?' : initial}
        size="48"
        aria-label={blind ? '비공개 프로필' : `${item.nickname}의 프로필`}
        className={blind ? 'opacity-30' : ''}
      />

      <div className="min-w-0 flex-1">
        {blind ? (
          <div className="h-4 w-24 rounded bg-(--color-border) opacity-50" aria-hidden="true" />
        ) : (
          <p className="truncate text-[14px] font-medium">{item.nickname}</p>
        )}
        <div className="mt-1 flex items-center gap-2 text-[12px] text-(--color-text-muted)">
          {blind ? (
            <span>정보를 입력하면 추천 목록이 보여요</span>
          ) : (
            <>
              <span>메이트 지수 {item.mateIndex}</span>
              <span>·</span>
              <span>매칭점수 {item.score}</span>
            </>
          )}
        </div>
      </div>

      {!blind && (
        <div className="flex shrink-0 gap-2">
          <ActionButton
            variant="neutralOutline"
            size="small"
            disabled
            title="패스 (준비 중)"
            aria-label="패스 (슬라이스 3에서 구현)"
          >
            패스
          </ActionButton>
          <ActionButton
            variant="brandSolid"
            size="small"
            disabled
            title="메이트 신청 (준비 중)"
            aria-label="메이트 신청 (슬라이스 3에서 구현)"
          >
            신청
          </ActionButton>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: RecommendationsPage 생성**

`apps/web/src/pages/RecommendationsPage/index.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Header } from '../../layout/Header';
import { ActionButton } from 'seed-design/ui/action-button';
import { BlindCard } from './parts/BlindCard.js';
import { fetchRecommendations, type RecommendationItem } from '../../lib/api/mate-profiles.js';
import { useCurrentUser } from '../../lib/auth-context';

/**
 * RecommendationsPage — 메이트 추천 목록 (와이어 9-10/12/13/14).
 * GG-COMM-007/008, GG-MATCH-012.
 *
 * blind=true: 프로필 미입력 상태 → BlindCard placeholder + 폼 진입 유도.
 * blind=false: 점수순 목록 표시.
 * 슬라이스 3까지 신청 버튼은 disabled.
 */
export function RecommendationsPage() {
  const { user } = useCurrentUser();
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [blind, setBlind] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const ac = new AbortController();
    setLoading(true);
    fetchRecommendations(ac.signal)
      .then((r) => {
        setBlind(r.blind);
        setItems(r.items);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') {
          setError('추천 목록을 불러오지 못했어요.');
          setLoading(false);
        }
      });
    return () => ac.abort();
  }, [user]);

  if (!user) {
    return (
      <div className="flex h-screen flex-col bg-(--color-bg) text-(--color-text)">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[15px] text-(--color-text-muted)">로그인이 필요해요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] px-5 py-6">
          <div className="mb-5 flex items-center justify-between">
            <h1 className="text-(length:--text-h2) font-semibold">메이트 추천</h1>
            <Link to="/mate/form">
              <ActionButton variant="neutralOutline" size="small">
                프로필 설정
              </ActionButton>
            </Link>
          </div>

          {error && (
            <div className="mb-4 rounded-(--radius-md) bg-red-50 px-4 py-3 text-[13px] text-red-600">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <p className="text-[14px] text-(--color-text-muted)">불러오는 중...</p>
            </div>
          ) : blind ? (
            // GG-COMM-007: 정보 미입력 상태 — 블라인드 유도 UI
            <div className="flex flex-col gap-4">
              <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) px-5 py-6 text-center">
                <p className="mb-1 text-[15px] font-semibold">아직 메이트 프로필이 없어요</p>
                <p className="mb-4 text-[13px] text-(--color-text-muted)">
                  메이트 추천 받기 정보를 입력하면 나에게 맞는 동행 메이트를 추천해 드려요.
                </p>
                <Link to="/mate/form">
                  <ActionButton variant="brandSolid" size="medium">
                    메이트 추천 받기 시작
                  </ActionButton>
                </Link>
              </div>
              {/* GG-COMM-008: 블라인드 카드 3개 placeholder (미리보기) */}
              {[1, 2, 3].map((i) => (
                <BlindCard
                  key={i}
                  item={{ userId: String(i), nickname: '?', mateIndex: 50, score: 0 }}
                  blind
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) px-5 py-8 text-center">
              <p className="text-[14px] text-(--color-text-muted)">
                현재 조건에 맞는 메이트가 없어요. 선호조건을 완화해 보세요.
              </p>
              <div className="mt-3">
                <Link to="/mate/form">
                  <ActionButton variant="neutralOutline" size="small">
                    조건 수정하기
                  </ActionButton>
                </Link>
              </div>
            </div>
          ) : (
            // GG-COMM-007: 목록 표시
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-(--color-text-muted)">{items.length}명의 메이트가 추천됐어요</p>
              {items.map((item) => (
                <BlindCard key={item.userId} item={item} blind={false} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: web typecheck**

```bash
cd apps/web && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: commit**

```bash
git add apps/web/src/pages/RecommendationsPage/
git commit -m "feat(web): add RecommendationsPage with BlindCard 4-state (wire 9-10/12/13/14)"
```

---

## Task 8: main.tsx 라우트 등록 + 커뮤니티 레일 연결 + AuthorProfileModal 실데이터

**Files:**
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/pages/CommunityPage/parts/MateRecoPlaceholder.tsx`
- Modify: `apps/web/src/pages/PostDetailPage/parts/AuthorProfileModal.tsx`

- [ ] **Step 1: main.tsx에 2개 라우트 추가**

`apps/web/src/main.tsx` 에서 `import { PostDetailPage }` 줄 다음에 추가:

```tsx
import { MateFormPage } from './pages/MateFormPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
```

그리고 `<Route path="/community/posts/:id" element={<PostDetailPage />} />` 줄 다음에 추가:

```tsx
        <Route path="/mate/form" element={<MateFormPage />} />
        <Route path="/mate/recommendations" element={<RecommendationsPage />} />
```

- [ ] **Step 2: MateRecoPlaceholder 실 링크로 교체**

`apps/web/src/pages/CommunityPage/parts/MateRecoPlaceholder.tsx` 전체를 아래로 교체:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ActionButton } from 'seed-design/ui/action-button';
import { fetchMyMateProfile } from '../../../lib/api/mate-profiles.js';
import { useCurrentUser } from '../../../lib/auth-context';

/**
 * MateRecoPlaceholder — GG-COMM-006 우측 레일 메이트 추천 영역.
 * 슬라이스 2: 실 링크 + 프로필 여부 분기.
 * - 프로필 없음: "메이트 추천 받기" → /mate/form
 * - 프로필 있음: "추천 보기" → /mate/recommendations
 */
export function MateRecoPlaceholder() {
  const { user } = useCurrentUser();
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setHasProfile(false); return; }
    const ac = new AbortController();
    fetchMyMateProfile(ac.signal)
      .then((p) => setHasProfile(p !== null))
      .catch(() => setHasProfile(false));
    return () => ac.abort();
  }, [user]);

  return (
    <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
      <h2 className="mb-2 text-[15px] font-semibold">메이트 추천</h2>
      <p className="mb-3 text-[13px] text-(--color-text-muted)">
        {hasProfile
          ? '추천된 메이트를 확인해 보세요.'
          : '메이트 매칭 정보를 입력하면 추천 목록이 노출돼요.'}
      </p>
      {user ? (
        <Link to={hasProfile ? '/mate/recommendations' : '/mate/form'}>
          <ActionButton variant={hasProfile ? 'brandSolid' : 'neutralOutline'} size="small" className="w-full">
            {hasProfile ? '추천 보기' : '메이트 추천 받기'}
          </ActionButton>
        </Link>
      ) : (
        <ActionButton variant="neutralOutline" size="small" disabled className="w-full">
          로그인 후 이용 가능
        </ActionButton>
      )}
    </div>
  );
}
```

- [ ] **Step 3: AuthorProfileModal 메이트 지수 실데이터 연결**

`apps/web/src/pages/PostDetailPage/parts/AuthorProfileModal.tsx` 전체를 아래로 교체:

```tsx
import { useEffect, useState } from 'react';
import { Avatar } from 'seed-design/ui/avatar';
import * as Dialog from 'seed-design/ui/dialog';
import { ActionButton } from 'seed-design/ui/action-button';
import { fetchMateProfile } from '../../../lib/api/mate-profiles.js';

/**
 * GG-POST-008/009: 작성자 프로필 모달.
 * 슬라이스 2: 메이트 지수 실데이터 표시 (fetchMateProfile → mateIndex).
 * GG-POST-008 채팅신청은 슬라이스 5에서 구현.
 */
export function AuthorProfileModal({
  nickname,
  authorUserId,
  onClose,
}: {
  nickname: string;
  authorUserId: string;
  onClose: () => void;
}) {
  const [mateIndex, setMateIndex] = useState<number | null>(null);
  const [loadingIdx, setLoadingIdx] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    fetchMateProfile(authorUserId, ac.signal)
      .then((p) => {
        setMateIndex(p?.mateIndex ?? null);
        setLoadingIdx(false);
      })
      .catch(() => setLoadingIdx(false));
    return () => ac.abort();
  }, [authorUserId]);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content className="w-[320px] max-w-[92vw]">
          <Dialog.Header>
            <div className="flex items-center gap-3">
              <Avatar
                fallback={nickname.slice(0, 1)}
                size="64"
                aria-label={`${nickname}의 프로필 아바타`}
              />
              <Dialog.Title>{nickname}</Dialog.Title>
            </div>
          </Dialog.Header>

          <div className="flex flex-col gap-3 px-5 pb-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-(--color-text-muted)">메이트 지수</span>
              {loadingIdx ? (
                <span className="text-(--color-text-muted)">...</span>
              ) : mateIndex !== null ? (
                <span className="font-semibold text-(--seed-color-fg-brand)">{mateIndex}</span>
              ) : (
                <span className="text-(--color-text-muted)">미등록</span>
              )}
            </div>
          </div>

          <Dialog.Footer>
            <ActionButton variant="neutralOutline" size="medium" onClick={onClose}>
              닫기
            </ActionButton>
            {/* GG-POST-008: 채팅신청 — 슬라이스 5에서 실구현 */}
            <ActionButton
              variant="brandSolid"
              size="medium"
              disabled
              aria-label="채팅 신청하기 (준비 중)"
            >
              채팅 신청하기
            </ActionButton>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
```

> 주의: `AuthorProfileModal`이 현재 `nickname` prop만 받는다면, `PostDetailPage`에서 `authorUserId`도 전달하도록 수정해야 한다.

- [ ] **Step 4: PostDetailPage에서 AuthorProfileModal에 authorUserId 전달 확인**

`apps/web/src/pages/PostDetailPage/index.tsx` 를 열어 `AuthorProfileModal` 사용 부분을 찾는다. `authorUserId={post.authorUserId}` prop이 없으면 추가한다.

```tsx
{authorModalOpen && post && (
  <AuthorProfileModal
    nickname={post.authorNickname}
    authorUserId={post.authorUserId}
    onClose={() => setAuthorModalOpen(false)}
  />
)}
```

- [ ] **Step 5: web typecheck**

```bash
cd apps/web && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 6: web build**

```bash
cd apps/web && npm run build
```

Expected: Build succeeded, 0 errors.

- [ ] **Step 7: commit**

```bash
git add apps/web/src/main.tsx apps/web/src/pages/CommunityPage/parts/MateRecoPlaceholder.tsx apps/web/src/pages/PostDetailPage/parts/AuthorProfileModal.tsx apps/web/src/pages/PostDetailPage/index.tsx
git commit -m "feat(web): wire mate routes, MateRecoPlaceholder real link, AuthorProfileModal mateIndex live"
```

---

## Task 9: 전체 green 확인 + 최종 커밋

**Files:** 없음 (실행 전용)

- [ ] **Step 1: BFF typecheck**

```bash
cd apps/bff && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 2: BFF build**

```bash
cd apps/bff && npm run build
```

Expected: 0 errors.

- [ ] **Step 3: mate:eval (DB 가동 필요)**

```bash
cd apps/bff && npm run mate:eval
```

Expected: `9/9 passed`

- [ ] **Step 4: web build**

```bash
cd apps/web && npm run build
```

Expected: Build succeeded.

- [ ] **Step 5: 전체 green commit**

```bash
git add -A
git commit -m "chore: slice2 mate profile + recommendations — all green"
```

---

## Self-Review 체크

### 1. Spec 커버리지

| 요구사항 ID | 구현 위치 |
|---|---|
| GG-MATCH-001 (후보 풀 조회) | `fetchRecommendations` 라우트 — 같은 지역 + 동의 풀 |
| GG-MATCH-009 (약관 동의 게이트) | `upsertMateProfile` 422, `ConsentGate`, `mate-eval` 케이스 |
| GG-MATCH-010 (미동의 버튼 비활성) | `ConsentGate.tsx` disabled prop |
| GG-MATCH-012 (추천 목록 생성) | `fetchRecommendations` + `rankCandidates` |
| GG-PROFILE-001~003 (프로필 입력/수정/삭제) | `upsertMateProfile` / `deleteMateProfile` |
| GG-PROFILE-004 (메이트 지수 표시) | `MateIndex` 모델 + `AuthorProfileModal` 실데이터 |
| GG-PROFILE-005 (지수 수정 불가) | `upsertMateProfile`의 MateIndex upsert `update: {}` 패턴 + eval 케이스 |
| GG-COMM-006 (우측 레일) | `MateRecoPlaceholder` 실 링크 |
| GG-COMM-007/008 (블라인드 목록) | `RecommendationsPage` blind 분기 + `BlindCard` |
| ADR 0003 PII 마스킹 | `maskPii()` 헬퍼 + `serializePublicProfile` PII 숨김 |
| ADR 0007 결정 3 (LLM 미사용) | `mate-score.ts` 순수 TS, LLM import 없음 |
| ADR 0007 결정 4 (MateIndex) | `MateIndex` 모델 + 기본값 50 + update:{} 불변 패턴 |

### 2. Placeholder 스캔

- "TBD"/"TODO" 없음.
- 슬라이스 3 이후 기능(신청 버튼)은 `disabled` + `aria-label "준비 중"` 명시 — 의도된 defer이며 placeholder 아님.
- migration.sql은 HUMAN 적용 지시 포함 — 의도된 human-task.

### 3. 타입 일관성

- `parseBigId` — `posts.ts`와 `mate-profiles.ts` 모두 동일 구현 (공통 추출은 YAGNI — 사용처 2개).
- `RequesterPrefs` / `RequesterProfile` / `CandidateProfile` — `mate-score.ts`에서 export, `mate-profiles.ts`에서 import. Task 3 handler와 일치.
- `MateProfileOut.prefAgeRangeLower`의 타입 `AgeLower` (= `10|15|...|50|null`) — BFF 응답(`serializeProfile`)은 `number | null`을 그대로 반환하므로 web 측 타입 캐스트 없이 호환.
- `BlindCard` props `item: RecommendationItem` — `RecommendationsPage`의 `items: RecommendationItem[]`와 동일.
- `AuthorProfileModal`에 `authorUserId: string` prop 추가 — Task 8 Step 4에서 `PostDetailPage` 전달 포함.
