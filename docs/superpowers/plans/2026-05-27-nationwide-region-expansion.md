# 전국 지역 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle 의 이벤트 데이터 도메인을 서울 전용에서 전국으로 확장. ingest 가드 제거, regions 시드 시/군/구 확장, 필터 UI cascading-chip, KCISA 운영자 backfill 추가.

**Architecture:** TDD-스타일 검증 스크립트(`src/jobs/region-resolver-check.ts`) 로 resolver 단위 검증 후, 가드 제거 → 시드 확장 → API 응답 정렬 보정 → UI sido 그룹 chip 확장 순으로 진행. 기존 4,111 행은 INSERT-only 시드라 안전, 신규 row 부터 resolver 가 정확한 sido/sigungu 매칭.

**Tech Stack:** TypeScript + Prisma + PostgreSQL/PostGIS + React + Express. 테스트 프레임워크는 없음 — 기존 컨벤션(eval scripts in `src/jobs/`) 따라 검증 스크립트로 대체.

---

## Plan Deviations from Spec

Spec 작성 후 실제 코드 grep 으로 확인된 차이 (plan 이 우선):

1. **API endpoint**: spec §4.5 의 신규 `GET /events/filters/regions` (tree) → **기존 `GET /regions` (`apps/bff/src/routes/lookups.ts:11`) 확장** 으로 변경. 응답은 flat 유지, "서울 first" 정렬 바이어스만 제거. UI 가 client-side 그룹핑. YAGNI.
2. **Filter UI 형태**: spec §4.6 의 cascading single-select → **기존 multi-select chip 유지 + sido 그룹 접힘 섹션** 으로 변경. 현 `FilterSearchPanel.tsx:125` 는 `Set<regionId>` 다중선택 이미 지원. 대규모 리팩토링 회피.
3. **Backfill 플래그**: spec §4.4 의 일원화된 `--backfill --from=YYYYMMDD` → **KCISA 만 신규** (`--kcisa-backfill`). TourAPI 는 기존 `process.argv[3]` floor 인자 활용, seoul-culture 는 기존 `--backfill` (`includePast: true`) 유지. 셋 다 같은 깃발로 묶으면 혼란.
4. **테스트**: spec §7 Jest 단위 테스트 → **`src/jobs/region-resolver-check.ts` eval 스크립트**. BFF 패키지에 test runner 없음 (확인됨: `package.json` test script 부재, `*.test.ts` 0건).
5. **잠재 버그 발견·동시 수정**: 현 `resolveSeoulRegionId` 가 non-Seoul 주소를 만나면 fallback 으로 **서울 광역 row 를 반환** — TourAPI 의 비-서울 row 가 역사적으로 서울 태그됨. 신규 resolver 도입 시 이 latent bug 가 자동 해소. Task 14 backfill 이 historical 교정 수단.

---

## File Structure

신규:
- `docs/decisions/0006-nationwide-region-expansion.md` — ADR
- `apps/bff/prisma/migrations/20260527120000_seed_regions_nationwide/migration.sql` — 시/군/구 약 230행 INSERT
- `apps/bff/prisma/migrations/20260527120500_regions_center_coords_nationwide/migration.sql` — 신규 row center 좌표 UPDATE
- `apps/bff/scripts/generate-regions-seed.ts` — SQL 생성기 (행정구역 데이터 인라인, 1회용)
- `apps/bff/src/jobs/region-resolver-check.ts` — resolver 검증 스크립트

수정:
- `apps/bff/src/jobs/ingest-common.ts` — `extractKoreanRegion`, `resolveRegionId` 신규 + `isSeoulAddress`/`extractSeoulGu`/`resolveSeoulRegionId` 삭제
- `apps/bff/src/jobs/kcisa-ingest.ts` — Seoul 가드 제거, `runKcisaIngest({ includePast })` 옵션
- `apps/bff/src/jobs/run-ingest.ts` — `--kcisa-backfill` 플래그
- `apps/bff/src/routes/lookups.ts` — `listRegions` 서울 우선 정렬 제거, sido 가나다 + sigungu 가나다
- `apps/web/src/components/FilterSearchPanel.tsx` — `seoulRegions` 로직을 sido 그룹 접힘 섹션으로 교체
- `apps/bff/package.json` — `scripts.check:regions`, `ingest:kcisa:backfill` 추가
- `apps/bff/src/jobs/chat-rank-bench-queries.json` — 비-서울 회귀 쿼리 3건
- `llm_wiki/wiki/topics/ingest-pipeline.md` — Seoul 가드 문구 제거, 새 현황 반영

---

## Task 1: ADR 0006 — 전국 지역 확장 결정

**Files:**
- Create: `docs/decisions/0006-nationwide-region-expansion.md`

- [ ] **Step 1: ADR 파일 작성**

```markdown
# ADR 0006: 전국 지역 확장 (Seoul-only 종료)

- **Status**: Accepted (2026-05-27)
- **Context**: Phase 1 의 서울 전용 도메인을 전국으로 확장.
- **Decision drivers**: 데이터 변별력, 비-서울 사용자 유입, 요구사항정의서 v5.0 필터 5종 (지역) 의 자연스러운 일반화.

## Decisions

1. **Scope**: Seoul-only → 전국 17 시/도 + 약 230 시/군/구.
2. **Master data 깊이**: 시/도 + 시/군/구 (읍/면/동 제외).
3. **자치구 있는 일반시**: 수원·성남·고양·용인·청주·천안·전주·포항·안산·창원 10개 시는 합성형 `"<시명> <자치구명>"` (예: `"수원시 영통구"`) 으로 sigungu_name 시드. 시 단위 row (`sigungu_name="수원시"`) 도 동시 시드해 fallback 제공. (스펙 작성 당시 8개로 적었으나 실 행정구역 기준 10개 — Plan 작성 중 정정)
4. **Resolver fallback**: `(sido, sigungu)` exact → `(sido, "<시>")` 시 단위 → `(sido, NULL)` 광역 → null (호출자 throw).
5. **Backfill 정책**: 운영자 수동 1회. daily scheduler 는 forward-looking 유지.
6. **후속 파이프라인 비용**: 기존 quota-counter (80%/95% 경고) 로 흡수, 운영자가 source 별 분할 실행 권장.
7. **롤백 정책**: 코드는 `git revert`. regions 시드는 down 스크립트 없음 — 한 번 시드 후 역행 금지. 사고 시 별도 cleanup 쿼리.
8. **자치구 표기 충돌**: 광역시 산하 자치구 ("부산 해운대구") 는 단순 표기, 일반시 자치구 ("수원시 영통구") 는 합성 표기. resolver 가 sido 매칭 후 sigungu 매칭이라 충돌 없음.

## Consequences

- (+) 데이터 변별력·검색 정확도 ↑
- (+) latent bug 해소: 기존 TourAPI 의 non-Seoul row 가 서울로 잘못 태그되던 fallback 동작 종료
- (−) OpenAI/Naver API 비용 ↑ (backfill 1회 + 신규 데이터 누적)
- (−) 서울 외 지역 뉴스 매핑 정확도 미검증 — Task 14 에서 표본 측정 후 부록 추가
- (−) `region_id` 가 null 인 events 가 신규로 발생할 수 있음 (주소 텍스트 부실 시) — KCISA errors 비율 모니터링

## Alternatives considered

- **시/도만 (17행)**: 너무 큰 단위, 필터 변별력 약함. 기각.
- **읍/면/동 포함 (수천 행)**: master data 무거움, UI 3-level 필요. 시기상조. 기각.
- **별도 `cities` / `districts` 테이블 분리**: 스키마 변경 + Prisma 수정. 합성 표기로 충분. 기각.

## References

- spec: `docs/superpowers/specs/2026-05-27-nationwide-region-expansion-design.md`
- plan: `docs/superpowers/plans/2026-05-27-nationwide-region-expansion.md`
- 행정안전부 행정구역 코드: https://www.mois.go.kr/frt/sub/a05/totalRegionalInformation/screen.do
```

- [ ] **Step 2: ADR 등재 검증**

Run: `ls docs/decisions/0006-*.md`
Expected: 1 file output.

- [ ] **Step 3: spec 동기화 (8개 → 10개 시)**

`docs/superpowers/specs/2026-05-27-nationwide-region-expansion-design.md` 의 §4.1 항목:

이전:
```
- **자치구가 있는 일반시**: "수원시 영통구" 처럼 합성형으로 시드. 대상 8개 시: 수원·성남·고양·용인·청주·천안·전주·포항.
```

수정 후:
```
- **자치구가 있는 일반시**: "수원시 영통구" 처럼 합성형으로 시드. 대상 10개 시: 수원·성남·고양·용인·청주·천안·전주·포항·안산·창원.
```

§4.1 두 번째 항목의 "위 8개 시" 도 "위 10개 시" 로 정정.

- [ ] **Step 4: Commit (ADR + spec 동시 박제)**

```bash
git add docs/decisions/0006-nationwide-region-expansion.md docs/superpowers/specs/2026-05-27-nationwide-region-expansion-design.md
git commit -m "docs(decisions): ADR 0006 — 전국 지역 확장 결정 + spec 10개 시 정정"
```

---

## Task 2: regions 시드 생성기 + 마이그레이션

**Files:**
- Create: `apps/bff/scripts/generate-regions-seed.ts`
- Create: `apps/bff/prisma/migrations/20260527120000_seed_regions_nationwide/migration.sql`

데이터 소스 인라인 (스크립트 안 const) — 행정안전부 2026 표준 행정구역 코드 기준. 광역시 자치구 + 일반시·군 + 자치구 있는 일반시의 합성형 모두 포함.

- [ ] **Step 1: 생성기 스크립트 작성**

```ts
// apps/bff/scripts/generate-regions-seed.ts
/**
 * 전국 시/도 + 시/군/구 시드 SQL 생성기. 1회용.
 * 출력: stdout → 운영자가 마이그레이션 파일에 paste.
 *
 * 명명 규칙:
 *   - sido_name: 단축형 ("서울","부산","대구","인천","광주","대전","울산","세종","경기","강원","충북","충남","전북","전남","경북","경남","제주")
 *   - sigungu_name:
 *     - 광역시 자치구: 단순 ("해운대구")
 *     - 일반시·군: 단순 ("수원시","안동시","양양군")
 *     - 자치구 있는 일반시 자치구: 합성형 ("수원시 영통구")
 *
 * 자치구 있는 일반시: 수원·성남·고양·용인·청주·천안·전주·포항 — 시 단위 row 도 동시 INSERT.
 */

import { writeFileSync } from 'node:fs';

interface SidoSpec {
  sido: string;
  fullAddr: string; // full_address 컬럼
  sigungu: string[]; // 단순/합성형 그대로
}

const NATIONWIDE: SidoSpec[] = [
  // 서울 — 기존 시드 (마이그레이션 20260418140000) 에 이미 있음. 본 스크립트에서는 누락 검증용으로만 출력.
  {
    sido: '서울',
    fullAddr: '서울특별시',
    sigungu: [
      // 25개 자치구 (기존 시드와 일치) — INSERT IGNORE 또는 ON CONFLICT 회피 위해 본 마이그레이션에서는 emit 하지 않음
    ],
  },
  {
    sido: '부산',
    fullAddr: '부산광역시',
    sigungu: [
      '중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구',
      '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군',
    ],
  },
  {
    sido: '대구',
    fullAddr: '대구광역시',
    sigungu: ['중구', '동구', '서구', '남구', '북구', '수성구', '달서구', '달성군', '군위군'],
  },
  {
    sido: '인천',
    fullAddr: '인천광역시',
    sigungu: ['중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구', '강화군', '옹진군'],
  },
  {
    sido: '광주',
    fullAddr: '광주광역시',
    sigungu: ['동구', '서구', '남구', '북구', '광산구'],
  },
  {
    sido: '대전',
    fullAddr: '대전광역시',
    sigungu: ['동구', '중구', '서구', '유성구', '대덕구'],
  },
  {
    sido: '울산',
    fullAddr: '울산광역시',
    sigungu: ['중구', '남구', '동구', '북구', '울주군'],
  },
  {
    sido: '세종',
    fullAddr: '세종특별자치시',
    sigungu: [], // 단일 자치시 — 광역 row 만
  },
  {
    sido: '경기',
    fullAddr: '경기도',
    sigungu: [
      // 일반시·군 (자치구 없음)
      '의정부시', '동두천시', '안양시', '광명시', '평택시', '오산시', '시흥시', '군포시', '의왕시', '하남시',
      '이천시', '안성시', '김포시', '양주시', '구리시', '남양주시', '포천시', '여주시', '연천군', '가평군', '양평군',
      '과천시', '광주시',
      // 자치구 있는 일반시 — 시 단위 row + 자치구 합성형
      '수원시', '수원시 장안구', '수원시 권선구', '수원시 팔달구', '수원시 영통구',
      '성남시', '성남시 수정구', '성남시 중원구', '성남시 분당구',
      '고양시', '고양시 덕양구', '고양시 일산동구', '고양시 일산서구',
      '용인시', '용인시 처인구', '용인시 기흥구', '용인시 수지구',
      '안산시', '안산시 상록구', '안산시 단원구', // 안산은 자치구 시 — 10개 시 list 에 포함
      '부천시', // 자치구 폐지(2016) — 단일 row
      '화성시',
    ],
  },
  {
    sido: '강원',
    fullAddr: '강원특별자치도',
    sigungu: [
      '춘천시', '원주시', '강릉시', '동해시', '태백시', '속초시', '삼척시',
      '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군', '양구군', '인제군', '고성군', '양양군',
    ],
  },
  {
    sido: '충북',
    fullAddr: '충청북도',
    sigungu: [
      '청주시', '청주시 상당구', '청주시 서원구', '청주시 흥덕구', '청주시 청원구',
      '충주시', '제천시',
      '보은군', '옥천군', '영동군', '증평군', '진천군', '괴산군', '음성군', '단양군',
    ],
  },
  {
    sido: '충남',
    fullAddr: '충청남도',
    sigungu: [
      '천안시', '천안시 동남구', '천안시 서북구',
      '공주시', '보령시', '아산시', '서산시', '논산시', '계룡시', '당진시',
      '금산군', '부여군', '서천군', '청양군', '홍성군', '예산군', '태안군',
    ],
  },
  {
    sido: '전북',
    fullAddr: '전북특별자치도',
    sigungu: [
      '전주시', '전주시 완산구', '전주시 덕진구',
      '군산시', '익산시', '정읍시', '남원시', '김제시',
      '완주군', '진안군', '무주군', '장수군', '임실군', '순창군', '고창군', '부안군',
    ],
  },
  {
    sido: '전남',
    fullAddr: '전라남도',
    sigungu: [
      '목포시', '여수시', '순천시', '나주시', '광양시',
      '담양군', '곡성군', '구례군', '고흥군', '보성군', '화순군', '장흥군', '강진군', '해남군',
      '영암군', '무안군', '함평군', '영광군', '장성군', '완도군', '진도군', '신안군',
    ],
  },
  {
    sido: '경북',
    fullAddr: '경상북도',
    sigungu: [
      '포항시', '포항시 남구', '포항시 북구',
      '경주시', '김천시', '안동시', '구미시', '영주시', '영천시', '상주시', '문경시', '경산시',
      '의성군', '청송군', '영양군', '영덕군', '청도군', '고령군', '성주군', '칠곡군', '예천군', '봉화군', '울진군', '울릉군',
    ],
  },
  {
    sido: '경남',
    fullAddr: '경상남도',
    sigungu: [
      '창원시', '창원시 의창구', '창원시 성산구', '창원시 마산합포구', '창원시 마산회원구', '창원시 진해구',
      '진주시', '통영시', '사천시', '김해시', '밀양시', '거제시', '양산시',
      '의령군', '함안군', '창녕군', '고성군', '남해군', '하동군', '산청군', '함양군', '거창군', '합천군',
    ],
  },
  {
    sido: '제주',
    fullAddr: '제주특별자치도',
    sigungu: ['제주시', '서귀포시'],
  },
];

function escSql(s: string): string {
  return s.replace(/'/g, "''");
}

function emit(): string {
  const lines: string[] = [];
  lines.push('-- 전국 시/도 + 시/군/구 시드 (ADR 0006).');
  lines.push("-- 광역시·도 17행 중 서울/부산/대구/인천/광주/대전/울산/경기 8행은 기존 시드 (20260418140000) 에 있어 생략.");
  lines.push('-- 신규 광역 row: 세종, 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주 (9행).');
  lines.push("-- 신규 시/군/구 row: 위 모든 시도의 sigungu (서울 25구 제외).");
  lines.push('');
  lines.push('INSERT INTO regions (sido_name, sigungu_name, dong_name, full_address) VALUES');

  const rows: string[] = [];
  for (const s of NATIONWIDE) {
    // 광역 row (서울/부산/대구/인천/광주/대전/울산/경기 8개는 기존 시드에 있음 — skip)
    const sidoExists = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '경기'].includes(s.sido);
    if (!sidoExists) {
      rows.push(`  ('${escSql(s.sido)}', NULL, NULL, '${escSql(s.fullAddr)}')`);
    }
    // sigungu rows (서울 25구 제외, 위에서 sigungu: [] 라 자동 skip)
    for (const sg of s.sigungu) {
      rows.push(`  ('${escSql(s.sido)}', '${escSql(sg)}', NULL, '${escSql(s.fullAddr)} ${escSql(sg)}')`);
    }
  }
  lines.push(rows.join(',\n') + ';');
  lines.push('');
  lines.push('-- 검증 쿼리:');
  lines.push('--   SELECT sido_name, COUNT(*) FROM regions GROUP BY sido_name ORDER BY sido_name;');
  lines.push('--   SELECT COUNT(*) FROM regions WHERE dong_name IS NULL;  -- 약 250');
  return lines.join('\n');
}

const outPath = process.argv[2];
if (!outPath) {
  console.error('Usage: tsx generate-regions-seed.ts <output-path>');
  process.exit(2);
}
writeFileSync(outPath, emit() + '\n', 'utf8');
console.error(`Wrote ${outPath}`);
```

- [ ] **Step 2: 생성기 실행 + 마이그레이션 디렉터리 준비**

`pnpm --filter` 가 wrapper 헤더를 stdout 에 섞을 수 있어 stdout 리다이렉트 대신 스크립트가 직접 파일을 쓰게 한다.

```bash
mkdir -p apps/bff/prisma/migrations/20260527120000_seed_regions_nationwide
pnpm --filter bff exec tsx scripts/generate-regions-seed.ts \
  prisma/migrations/20260527120000_seed_regions_nationwide/migration.sql
```

(주의: `pnpm --filter bff exec` 의 CWD 는 `apps/bff/` 이므로 경로는 `apps/bff/` 기준 상대.)

- [ ] **Step 3: 생성된 SQL 검증 (사람이 눈으로)**

Run: `head -30 apps/bff/prisma/migrations/20260527120000_seed_regions_nationwide/migration.sql`
Expected: `INSERT INTO regions ... VALUES` 시작, 9개 광역 + sigungu 행 다수.

Run: `wc -l apps/bff/prisma/migrations/20260527120000_seed_regions_nationwide/migration.sql`
Expected: 약 250+ 라인.

- [ ] **Step 4: 마이그레이션 적용**

```bash
pnpm --filter bff prisma:migrate:dev
```

Expected: 마이그레이션 1건 적용 성공, Prisma client 재생성.

- [ ] **Step 5: DB 검증**

```bash
pnpm --filter bff prisma:studio &
# 또는 psql:
psql "$DATABASE_URL" -c "SELECT sido_name, COUNT(*) FROM regions WHERE dong_name IS NULL GROUP BY sido_name ORDER BY sido_name;"
```

Expected: 17 sido 모두 1+ 행, 총 약 250 행. 서울 26 (기존), 부산 17, 경기 53, …

- [ ] **Step 6: Commit**

```bash
git add apps/bff/scripts/generate-regions-seed.ts apps/bff/prisma/migrations/20260527120000_seed_regions_nationwide/
git commit -m "feat(bff): regions 전국 시/도 + 시/군/구 시드 (ADR 0006)"
```

---

## Task 3: regions center coords 마이그레이션

**Files:**
- Create: `apps/bff/prisma/migrations/20260527120500_regions_center_coords_nationwide/migration.sql`

광역 17개 + 자치구 있는 일반시 8개 + 광역시 자치구 약 70개 — 우선 광역 + 자치구 있는 일반시 본체 25개만 정확좌표 채움. 나머지는 NULL 유지 (지도 anchor 시 광역 좌표로 fallback).

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- apps/bff/prisma/migrations/20260527120500_regions_center_coords_nationwide/migration.sql
-- 광역 9 신규 + 자치구 있는 일반시 8개 본체 center 좌표.
-- 좌표 출처: 행정안전부 도로명주소 시군구 대표좌표 (2026 기준).
-- NULL 허용 — 미채움 행은 광역 좌표 fallback.

UPDATE regions SET center_lat = 36.4870, center_lng = 127.2823 WHERE sido_name = '세종' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 37.8228, center_lng = 128.1555 WHERE sido_name = '강원' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 36.8000, center_lng = 127.7000 WHERE sido_name = '충북' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 36.5184, center_lng = 126.8000 WHERE sido_name = '충남' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 35.7175, center_lng = 127.1530 WHERE sido_name = '전북' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 34.8161, center_lng = 126.4630 WHERE sido_name = '전남' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 36.5760, center_lng = 128.5050 WHERE sido_name = '경북' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 35.4606, center_lng = 128.2132 WHERE sido_name = '경남' AND sigungu_name IS NULL;
UPDATE regions SET center_lat = 33.4890, center_lng = 126.4983 WHERE sido_name = '제주' AND sigungu_name IS NULL;

-- 자치구 있는 일반시 본체 — 시 단위 row.
UPDATE regions SET center_lat = 37.2636, center_lng = 127.0286 WHERE sido_name = '경기' AND sigungu_name = '수원시';
UPDATE regions SET center_lat = 37.4202, center_lng = 127.1267 WHERE sido_name = '경기' AND sigungu_name = '성남시';
UPDATE regions SET center_lat = 37.6584, center_lng = 126.8320 WHERE sido_name = '경기' AND sigungu_name = '고양시';
UPDATE regions SET center_lat = 37.2410, center_lng = 127.1776 WHERE sido_name = '경기' AND sigungu_name = '용인시';
UPDATE regions SET center_lat = 36.6424, center_lng = 127.4890 WHERE sido_name = '충북' AND sigungu_name = '청주시';
UPDATE regions SET center_lat = 36.8151, center_lng = 127.1139 WHERE sido_name = '충남' AND sigungu_name = '천안시';
UPDATE regions SET center_lat = 35.8242, center_lng = 127.1480 WHERE sido_name = '전북' AND sigungu_name = '전주시';
UPDATE regions SET center_lat = 36.0190, center_lng = 129.3435 WHERE sido_name = '경북' AND sigungu_name = '포항시';
```

- [ ] **Step 2: 마이그레이션 디렉터리 만들기 + 적용**

```bash
mkdir -p apps/bff/prisma/migrations/20260527120500_regions_center_coords_nationwide
# 위 SQL 을 migration.sql 로 저장
pnpm --filter bff prisma:migrate:dev
```

- [ ] **Step 3: DB 검증**

```bash
psql "$DATABASE_URL" -c "SELECT sido_name, sigungu_name, center_lat, center_lng FROM regions WHERE center_lat IS NOT NULL ORDER BY sido_name, sigungu_name;"
```

Expected: 17개 + 8개 시 본체 = 25행 좌표 채워짐.

- [ ] **Step 4: Commit**

```bash
git add apps/bff/prisma/migrations/20260527120500_regions_center_coords_nationwide/
git commit -m "feat(bff): regions 광역 9 + 시 8 center 좌표 시드"
```

---

## Task 4: resolver 검증 스크립트 (실패 확인)

**Files:**
- Create: `apps/bff/src/jobs/region-resolver-check.ts`

- [ ] **Step 1: 검증 스크립트 작성 (extractKoreanRegion 케이스 + 실패 출력)**

```ts
// apps/bff/src/jobs/region-resolver-check.ts
/**
 * resolver eval — extractKoreanRegion / resolveRegionId 케이스 검증.
 *
 * 사용: `pnpm --filter bff exec tsx src/jobs/region-resolver-check.ts`
 * exit 0: 모든 케이스 통과 / exit 1: 1건 이상 실패.
 *
 * BFF 패키지에 test framework 가 없어 본 스크립트가 단위 테스트 역할.
 */
import { prisma } from '../prisma.js';
import { extractKoreanRegion, resolveRegionId } from './ingest-common.js';

interface ExtractCase {
  addr: string | null;
  expect: { sido: string; sigungu: string | null } | null;
}

const EXTRACT_CASES: ExtractCase[] = [
  // 서울 — 기존 동작 유지
  { addr: '서울특별시 종로구 세종로 175', expect: { sido: '서울', sigungu: '종로구' } },
  { addr: '서울 강남구 테헤란로 152', expect: { sido: '서울', sigungu: '강남구' } },
  { addr: '서울특별시 마포구', expect: { sido: '서울', sigungu: '마포구' } },
  // 광역시 자치구
  { addr: '부산광역시 해운대구 우동', expect: { sido: '부산', sigungu: '해운대구' } },
  { addr: '광주 동구 충장로', expect: { sido: '광주', sigungu: '동구' } },
  { addr: '대전광역시 유성구 대학로', expect: { sido: '대전', sigungu: '유성구' } },
  // 일반시·군
  { addr: '강원특별자치도 강릉시 경강로', expect: { sido: '강원', sigungu: '강릉시' } },
  { addr: '경상남도 통영시 도남동', expect: { sido: '경남', sigungu: '통영시' } },
  { addr: '전북특별자치도 부안군', expect: { sido: '전북', sigungu: '부안군' } },
  // 자치구 있는 일반시 — 합성형
  { addr: '경기도 수원시 영통구 광교중앙로', expect: { sido: '경기', sigungu: '수원시 영통구' } },
  { addr: '경기도 성남시 분당구 정자동', expect: { sido: '경기', sigungu: '성남시 분당구' } },
  { addr: '충청북도 청주시 흥덕구 사직동', expect: { sido: '충북', sigungu: '청주시 흥덕구' } },
  { addr: '경상남도 창원시 마산합포구', expect: { sido: '경남', sigungu: '창원시 마산합포구' } },
  // 자치구 있는 시인데 자치구 명시 없음 → sigungu 가 시 본체
  { addr: '경기도 수원시 권선동', expect: { sido: '경기', sigungu: '수원시' } },
  { addr: '경기도 성남시', expect: { sido: '경기', sigungu: '성남시' } },
  // 광역만 — sigungu null
  { addr: '경기도', expect: { sido: '경기', sigungu: null } },
  { addr: '제주특별자치도', expect: { sido: '제주', sigungu: null } },
  // 세종 — sigungu 없는 광역
  { addr: '세종특별자치시 한누리대로', expect: { sido: '세종', sigungu: null } },
  // 매칭 실패
  { addr: null, expect: null },
  { addr: '', expect: null },
  { addr: '서울시', expect: { sido: '서울', sigungu: null } }, // 모호한 표기 — sido 만 인식
  { addr: '강원도 평창군', expect: { sido: '강원', sigungu: '평창군' } }, // 구버전 표기
];

interface ResolveCase {
  addr: string;
  expectQuery: { sido: string; sigungu: string | null };
}

const RESOLVE_CASES: ResolveCase[] = [
  { addr: '서울 종로구', expectQuery: { sido: '서울', sigungu: '종로구' } },
  { addr: '부산 해운대구', expectQuery: { sido: '부산', sigungu: '해운대구' } },
  { addr: '경기 수원시 영통구', expectQuery: { sido: '경기', sigungu: '수원시 영통구' } },
  // 합성형 사양인데 sigungu 매칭 실패 → 시 단위 fallback
  { addr: '경기 수원시 어딘가동', expectQuery: { sido: '경기', sigungu: '수원시' } },
  // sigungu 없음 → 광역 row
  { addr: '제주특별자치도', expectQuery: { sido: '제주', sigungu: null } },
];

let pass = 0;
let fail = 0;

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  console.log('=== extractKoreanRegion ===');
  for (const c of EXTRACT_CASES) {
    const got = extractKoreanRegion(c.addr);
    if (eq(got, c.expect)) {
      pass++;
      console.log(`  PASS  ${JSON.stringify(c.addr)} → ${JSON.stringify(got)}`);
    } else {
      fail++;
      console.error(`  FAIL  ${JSON.stringify(c.addr)} expected ${JSON.stringify(c.expect)} got ${JSON.stringify(got)}`);
    }
  }

  console.log('\n=== resolveRegionId (DB) ===');
  for (const c of RESOLVE_CASES) {
    const regionId = await resolveRegionId(c.addr);
    if (regionId === null) {
      fail++;
      console.error(`  FAIL  ${c.addr} → null (regions row missing?)`);
      continue;
    }
    const row = await prisma.region.findUnique({ where: { regionId }, select: { sidoName: true, sigunguName: true } });
    if (!row) {
      fail++;
      console.error(`  FAIL  ${c.addr} → orphan regionId ${regionId}`);
      continue;
    }
    if (row.sidoName === c.expectQuery.sido && row.sigunguName === c.expectQuery.sigungu) {
      pass++;
      console.log(`  PASS  ${c.addr} → ${row.sidoName}/${row.sigunguName ?? 'NULL'} (${regionId})`);
    } else {
      fail++;
      console.error(`  FAIL  ${c.addr} expected ${c.expectQuery.sido}/${c.expectQuery.sigungu ?? 'NULL'} got ${row.sidoName}/${row.sigunguName ?? 'NULL'}`);
    }
  }

  await prisma.$disconnect();
  console.log(`\nTotal: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(2);
});
```

- [ ] **Step 2: ingest-common.ts 에 stub 함수 추가 (commit 시 빌드 보존)**

`apps/bff/src/jobs/ingest-common.ts` 의 `extractSeoulGu` 함수 **바로 위** 에 stub 두 개를 export 한다. 본 구현은 Task 5/6 에서 채움.

```ts
/**
 * STUB — Task 5 에서 본 구현으로 교체.
 * 빌드를 통과시키고 RED 상태(런타임 실패) 를 명시적으로 만들기 위해 throw.
 */
export function extractKoreanRegion(
  _addr: string | null | undefined,
): { sido: string; sigungu: string | null } | null {
  throw new Error('extractKoreanRegion: not implemented');
}

/**
 * STUB — Task 6 에서 본 구현으로 교체.
 */
export async function resolveRegionId(
  _addr: string | null | undefined,
): Promise<bigint | null> {
  throw new Error('resolveRegionId: not implemented');
}
```

- [ ] **Step 3: package.json 에 스크립트 alias 추가**

`apps/bff/package.json` 의 `scripts` 객체에 1줄 추가:

```json
    "check:regions": "dotenv -e ../../.env -- tsx src/jobs/region-resolver-check.ts",
```

- [ ] **Step 4: 타입체크 (빌드 깨짐 없음 확인)**

```bash
pnpm --filter bff typecheck
```

Expected: 0 errors. stub 이라 빌드 통과.

- [ ] **Step 5: 실행해 실패 확인 (런타임 RED)**

```bash
pnpm --filter bff run check:regions || true
```

Expected: 첫 케이스에서 `Error: extractKoreanRegion: not implemented` 출력 후 catch 핸들러가 exit 2. 이 상태가 의도된 RED.

- [ ] **Step 6: Commit (검증 스크립트 + stub — 다음 task 에서 채움)**

```bash
git add apps/bff/src/jobs/region-resolver-check.ts apps/bff/src/jobs/ingest-common.ts apps/bff/package.json
git commit -m "test(bff): region-resolver-check 검증 케이스 + resolver stub (RED)"
```

---

## Task 5: extractKoreanRegion 구현

**Files:**
- Modify: `apps/bff/src/jobs/ingest-common.ts` (export 추가)

- [ ] **Step 1: ingest-common.ts 상단에 SIDO_PATTERNS + 합성형 시 목록 추가**

`apps/bff/src/jobs/ingest-common.ts` 의 `extractSeoulGu` 함수 **바로 위** 에 다음 블록 삽입:

```ts
/**
 * 전국 광역시·도 매칭 패턴. 단축형(sido_name) + 정식명칭 모두 인식.
 * 순서: 더 긴 정식명 우선 ("강원특별자치도" → "강원특별자치도" 가 먼저, "강원" 은 뒤).
 */
const SIDO_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: '서울', re: /서울(?:특별시)?/ },
  { name: '부산', re: /부산(?:광역시)?/ },
  { name: '대구', re: /대구(?:광역시)?/ },
  { name: '인천', re: /인천(?:광역시)?/ },
  { name: '광주', re: /광주(?:광역시)?/ },
  { name: '대전', re: /대전(?:광역시)?/ },
  { name: '울산', re: /울산(?:광역시)?/ },
  { name: '세종', re: /세종(?:특별자치시)?/ },
  { name: '경기', re: /경기(?:도)?/ },
  { name: '강원', re: /강원(?:특별자치도|도)?/ },
  { name: '충북', re: /(?:충청북도|충북)/ },
  { name: '충남', re: /(?:충청남도|충남)/ },
  { name: '전북', re: /(?:전북특별자치도|전라북도|전북)/ },
  { name: '전남', re: /(?:전라남도|전남)/ },
  { name: '경북', re: /(?:경상북도|경북)/ },
  { name: '경남', re: /(?:경상남도|경남)/ },
  { name: '제주', re: /제주(?:특별자치도|도)?/ },
];

/**
 * 자치구가 있는 일반시 목록 — sigungu 매칭 시 "<시명> <자치구>" 합성형 우선.
 * 광역시 산하 자치구 ("부산 해운대구") 와 충돌 없음 (sido 매칭 먼저).
 */
const CITIES_WITH_AUTONOMOUS_DISTRICTS = [
  '수원시', '성남시', '고양시', '용인시', '청주시', '천안시', '전주시', '포항시', '창원시', '안산시',
] as const;
```

- [ ] **Step 2: extractKoreanRegion stub 을 본 구현으로 교체**

같은 파일의 Task 4 Step 2 에서 넣은 stub `extractKoreanRegion` 본문을 다음으로 교체 (시그니처는 유지):

```ts
/**
 * 주소 텍스트에서 시/도 + 시/군/구 추출. 자치구 있는 일반시는 합성형 ("수원시 영통구") 으로 반환.
 *
 * 알고리즘:
 *  1. SIDO_PATTERNS 순회해 첫 매치를 sido 로 채택.
 *  2. 자치구 있는 일반시 합성형 우선 매칭: "<시명> <n>구" 패턴.
 *  3. 합성형 매칭 안 되면 단순 "<n>(시|군|구)" 단일 캡처.
 *  4. 시 단위 row fallback 은 resolveRegionId 가 담당 (여기서는 sigungu 그대로).
 */
export function extractKoreanRegion(
  addr: string | null | undefined,
): { sido: string; sigungu: string | null } | null {
  if (!addr) return null;

  // sido 매칭
  let sido: string | null = null;
  for (const p of SIDO_PATTERNS) {
    if (p.re.test(addr)) {
      sido = p.name;
      break;
    }
  }
  if (!sido) return null;

  // 합성형 우선 매칭: "수원시 영통구" 등
  for (const city of CITIES_WITH_AUTONOMOUS_DISTRICTS) {
    const re = new RegExp(`${city}\\s*([가-힣]{1,3}구)`);
    const m = addr.match(re);
    if (m) return { sido, sigungu: `${city} ${m[1]!}` };
  }

  // 일반 시/군/구 단일 매칭 — 한글 1~4자 + 시/군/구
  const sgMatch = addr.match(/([가-힣]{1,4}(?:시|군|구))/);
  if (sgMatch) {
    const sg = sgMatch[1]!;
    // "서울시" 같은 모호 표기는 sigungu 아님 (광역만 인식)
    if (sg === '서울시') return { sido, sigungu: null };
    return { sido, sigungu: sg };
  }

  return { sido, sigungu: null };
}
```

- [ ] **Step 3: 검증 스크립트 재실행 — extractKoreanRegion 케이스 통과 확인**

```bash
pnpm --filter bff run check:regions
```

Expected: `=== extractKoreanRegion ===` 섹션 모두 PASS. `=== resolveRegionId (DB) ===` 는 아직 FAIL (다음 task).

- [ ] **Step 4: Commit**

```bash
git add apps/bff/src/jobs/ingest-common.ts
git commit -m "feat(bff): extractKoreanRegion 구현 — 전국 시/도 + 시/군/구 추출"
```

---

## Task 6: resolveRegionId 구현 + resolveSeoulRegionId 교체

**Files:**
- Modify: `apps/bff/src/jobs/ingest-common.ts`

- [ ] **Step 1: resolveRegionId stub 을 본 구현으로 교체**

`apps/bff/src/jobs/ingest-common.ts` 의 Task 4 Step 2 에서 넣은 stub `resolveRegionId` 본문을 다음으로 교체:

```ts
/**
 * 주소 텍스트 → regions.regionId 매핑. 4단 fallback:
 *  1. (sido, sigungu) exact 매치
 *  2. (sido, "<시>") 시 단위 fallback (자치구 있는 일반시인데 자치구가 sigungu 와 시드 모두 안 맞을 때)
 *  3. (sido, NULL) 광역 단일 row
 *  4. null — 호출자 (upsertCrawledEvent) 가 throw
 */
export async function resolveRegionId(
  addr: string | null | undefined,
): Promise<bigint | null> {
  const r = extractKoreanRegion(addr);
  if (!r) return null;

  // 1. exact match
  if (r.sigungu) {
    const exact = await prisma.region.findFirst({
      where: { sidoName: r.sido, sigunguName: r.sigungu, dongName: null },
      select: { regionId: true },
    });
    if (exact) return exact.regionId;

    // 2. 합성형이면 시 단위 fallback
    if (r.sigungu.includes(' ')) {
      const cityOnly = r.sigungu.split(' ')[0]!;
      const cityRow = await prisma.region.findFirst({
        where: { sidoName: r.sido, sigunguName: cityOnly, dongName: null },
        select: { regionId: true },
      });
      if (cityRow) return cityRow.regionId;
    }
  }

  // 3. 광역 fallback
  const sidoRow = await prisma.region.findFirst({
    where: { sidoName: r.sido, sigunguName: null, dongName: null },
    select: { regionId: true },
  });
  return sidoRow?.regionId ?? null;
}
```

- [ ] **Step 2: upsertCrawledEvent 의 resolveSeoulRegionId 호출을 resolveRegionId 로 교체**

같은 파일의 `upsertCrawledEvent` 함수 (현재 line 152~) 안에서:

이전:
```ts
  const regionId = await resolveSeoulRegionId(ev.addressText);
```

수정 후:
```ts
  const regionId = await resolveRegionId(ev.addressText);
```

- [ ] **Step 3: 검증 스크립트 재실행 — 전체 통과 확인**

```bash
pnpm --filter bff run check:regions
```

Expected: 모든 케이스 PASS. exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/bff/src/jobs/ingest-common.ts
git commit -m "feat(bff): resolveRegionId 4단 fallback + upsert 경로 교체"
```

---

## Task 7: 서울 전용 헬퍼 삭제 + kcisa 가드 제거

**Files:**
- Modify: `apps/bff/src/jobs/ingest-common.ts` (export 삭제)
- Modify: `apps/bff/src/jobs/kcisa-ingest.ts` (import + 호출 제거)

- [ ] **Step 1: ingest-common.ts 에서 isSeoulAddress / extractSeoulGu / resolveSeoulRegionId 삭제**

`apps/bff/src/jobs/ingest-common.ts` 에서 다음 세 함수 정의 전체 삭제:
- `extractSeoulGu` (현 line 85~93)
- `isSeoulAddress` (현 line 95~99)
- `resolveSeoulRegionId` (현 line 101~116)

삭제 후 grep 으로 잔존 호출 없음 확인:

```bash
grep -rn "isSeoulAddress\|extractSeoulGu\|resolveSeoulRegionId" apps/bff/src/
```

Expected: 0건 출력.

- [ ] **Step 2: kcisa-ingest.ts import 정리**

`apps/bff/src/jobs/kcisa-ingest.ts:5-15` 의 import 블록에서 `extractSeoulGu`, `isSeoulAddress` 제거:

```ts
import {
  cleanDescription,
  isForwardLooking,
  parseYmd,
  upsertCrawledEvent,
  type EventCategoryCode,
  type IngestResult,
  type NormalizedEvent,
} from './ingest-common.js';
```

- [ ] **Step 3: kcisa-ingest.ts 의 toNormalized 가드/주소 보정 로직 정리**

`toNormalized` 함수 (현 line 115~) 안에서:

이전:
```ts
  if (!isSeoulAddress(item.EVENT_SITE)) return null; // 서울 아닌 건 skip (현재 regions 커버리지)
  const period = parsePeriod(item.EVENT_PERIOD);
  if (!period) return null;
  const gu = extractSeoulGu(item.EVENT_SITE);
  const addressText = item.EVENT_SITE ?? (gu ? `서울 ${gu}` : '서울');
```

수정 후:
```ts
  const period = parsePeriod(item.EVENT_PERIOD);
  if (!period) return null;
  // 주소가 비었으면 sigungu 추출이 불가능 → resolveRegionId 가 null 반환 → upsert 에서 throw.
  // 비-한국 행정구역 패턴도 동일 처리. errors 카운터에 반영.
  const addressText = item.EVENT_SITE ?? null;
```

- [ ] **Step 4: 파일 상단 주석에서 "서울만 필터" 문구 제거**

`apps/bff/src/jobs/kcisa-ingest.ts:17-25` 의 JSDoc 블록:

이전 line 23: `- 서울만 필터 (EVENT_SITE 에 "서울" 포함 여부).`
삭제 (해당 한 줄만).

- [ ] **Step 5: 타입체크 + 빌드**

```bash
pnpm --filter bff typecheck
```

Expected: 에러 없음.

- [ ] **Step 6: 검증 스크립트 재실행**

```bash
pnpm --filter bff run check:regions
```

Expected: 변경 없이 통과 (regression 검증).

- [ ] **Step 7: Commit**

```bash
git add apps/bff/src/jobs/ingest-common.ts apps/bff/src/jobs/kcisa-ingest.ts
git commit -m "feat(bff): Seoul 전용 헬퍼 삭제 + KCISA 가드 제거"
```

---

## Task 8: /regions 응답 정렬 보정

**Files:**
- Modify: `apps/bff/src/routes/lookups.ts`

- [ ] **Step 1: listRegions 의 서울 우선 정렬 제거**

`apps/bff/src/routes/lookups.ts:11-34` 의 `listRegions` 함수를 다음으로 교체:

```ts
/**
 * GET /regions — 필터 드롭다운용 지역 목록.
 *
 * 형상: [{ regionId, sido, sigungu, fullAddress }]
 * 정렬: sido 가나다 → sigungu 가나다. 광역 row(sigungu=null) 는 각 sido 의 첫 항목.
 * Client(FilterSearchPanel) 가 sido 별 그룹핑 담당.
 */
export async function listRegions(_req: Request, res: Response) {
  const rows = await prisma.region.findMany({
    where: { dongName: null }, // 구 단위까지만 (동 레벨 제외)
    select: {
      regionId: true,
      sidoName: true,
      sigunguName: true,
      fullAddress: true,
    },
    orderBy: [
      { sidoName: 'asc' },
      // sigunguName NULL (광역 row) 이 먼저 오도록 — Prisma 는 NULL FIRST 가 기본
      { sigunguName: 'asc' },
    ],
  });

  const items = rows.map((r) => ({
    regionId: r.regionId.toString(),
    sido: r.sidoName,
    sigungu: r.sigunguName,
    fullAddress: r.fullAddress,
  }));
  res.json({ items });
}
```

- [ ] **Step 2: BFF 부트 + endpoint 호출 검증**

```bash
pnpm --filter bff dev &
sleep 3
curl -s http://localhost:4000/regions | jq '.items | length, .items[0:3], .items[-3:]'
kill %1
```

Expected: total ~250 행, 첫 3행은 사전순 (예: 강원/광주/...), 마지막 3행은 충북/충남/제주 같은 끝쪽 sido.

- [ ] **Step 3: Commit**

```bash
git add apps/bff/src/routes/lookups.ts
git commit -m "feat(bff): /regions 서울 우선 정렬 제거 — sido 가나다 순"
```

---

## Task 9: FilterSearchPanel sido 그룹 chip

**Files:**
- Modify: `apps/web/src/components/FilterSearchPanel.tsx`

기존 multi-select chip UX 유지. `seoulRegions` 단일 그룹 → sido 별 접힘 섹션 N개.

- [ ] **Step 1: FilterSearchPanel.tsx 의 지역 블록 교체**

`apps/web/src/components/FilterSearchPanel.tsx` 의 다음 부분 변경:

이전 (line 125-128, useMemo seoulRegions):
```ts
  const seoulRegions = useMemo(
    () => regions.filter((r) => r.sido === '서울' && r.sigungu !== null),
    [regions],
  );
```

수정 후:
```ts
  /** sido 별 그룹: { 시도명: [그 시도의 시/군/구 행 배열] }. 광역 row(sigungu=null) 는 제외. */
  const regionsBySido = useMemo(() => {
    const map = new Map<string, RegionItem[]>();
    for (const r of regions) {
      if (r.sigungu === null) continue;
      const list = map.get(r.sido) ?? [];
      list.push(r);
      map.set(r.sido, list);
    }
    return Array.from(map.entries()).map(([sido, items]) => ({ sido, items }));
  }, [regions]);

  /** 어떤 sido 섹션이 펼쳐져 있는지. 기본은 서울만 펼침 (기존 UX 유지). */
  const [expandedSido, setExpandedSido] = useState<Set<string>>(new Set(['서울']));
  const toggleSido = (sido: string) => {
    setExpandedSido((prev) => {
      const next = new Set(prev);
      if (next.has(sido)) next.delete(sido);
      else next.add(sido);
      return next;
    });
  };
```

- [ ] **Step 2: 지역 FilterBlock 렌더 교체**

이전 (line 218-230 의 `<FilterBlock title="지역" ...>` 블록):
```tsx
        <FilterBlock title="지역" count={region.size}>
          {lookupError ? (
            <div className="text-[12px] text-(--color-error)">지역 로드 실패: {lookupError}</div>
          ) : seoulRegions.length === 0 ? (
            <div className="text-[12px] text-(--color-text-subtle)">불러오는 중…</div>
          ) : (
            <ChipGroup
              items={seoulRegions.map((r) => ({ k: r.regionId, l: r.sigungu! }))}
              isActive={(k) => region.has(k)}
              onToggle={toggleIn(setRegion)}
            />
          )}
        </FilterBlock>
```

수정 후:
```tsx
        <FilterBlock title="지역" count={region.size}>
          {lookupError ? (
            <div className="text-[12px] text-(--color-error)">지역 로드 실패: {lookupError}</div>
          ) : regionsBySido.length === 0 ? (
            <div className="text-[12px] text-(--color-text-subtle)">불러오는 중…</div>
          ) : (
            <div className="flex flex-col gap-2">
              {regionsBySido.map(({ sido, items }) => {
                const expanded = expandedSido.has(sido);
                const selectedCount = items.filter((r) => region.has(r.regionId)).length;
                return (
                  <div key={sido} className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface)">
                    <button
                      type="button"
                      onClick={() => toggleSido(sido)}
                      className="flex w-full items-center justify-between px-3 py-2 text-[13px] font-medium text-(--color-text)"
                    >
                      <span>{sido}{selectedCount > 0 ? ` (${selectedCount})` : ''}</span>
                      <span className="text-(--color-text-subtle)">{expanded ? '−' : '+'}</span>
                    </button>
                    {expanded && (
                      <div className="border-t border-(--color-border) px-3 py-2">
                        <ChipGroup
                          items={items.map((r) => ({ k: r.regionId, l: r.sigungu! }))}
                          isActive={(k) => region.has(k)}
                          onToggle={toggleIn(setRegion)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </FilterBlock>
```

- [ ] **Step 3: 사용 안 되는 `seoulRegions` 변수 잔존 없는지 확인**

```bash
grep -n "seoulRegions" apps/web/src/components/FilterSearchPanel.tsx
```

Expected: 0건.

- [ ] **Step 4: 웹 타입체크**

```bash
pnpm --filter web typecheck
```

Expected: 에러 없음.

- [ ] **Step 5: 수동 UI 확인**

```bash
pnpm --filter bff dev &
pnpm --filter web dev &
```

브라우저: `http://localhost:5173/` (또는 web dev 서버 포트). FilterSearchPanel 의 "지역" 섹션에서 17개 sido 접힘 카드 확인. 서울만 기본 펼침, 다른 카드 클릭 시 펼침/접힘. 펼친 후 chip 선택 시 카운트 반영.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/FilterSearchPanel.tsx
git commit -m "feat(web): FilterSearchPanel sido 그룹 접힘 — 전국 지역 chip"
```

---

## Task 10: KCISA --backfill 플래그

**Files:**
- Modify: `apps/bff/src/jobs/kcisa-ingest.ts`
- Modify: `apps/bff/src/jobs/run-ingest.ts`
- Modify: `apps/bff/package.json`

- [ ] **Step 1: runKcisaIngest 시그니처 변경 (options 인자 추가)**

`apps/bff/src/jobs/kcisa-ingest.ts:141` 의 함수 시그니처 + 본문 일부 수정:

이전:
```ts
export async function runKcisaIngest(): Promise<IngestResult> {
  const log = logger.child({ job: 'kcisa-ingest' });
  ...
  let pageNo = 1;
  while (true) {
    ...
    for (const raw of page.items) {
      const ev = toNormalized(raw);
      if (!ev || !isForwardLooking(ev.startDate, ev.endDate)) {
        result.skipped += 1;
        continue;
      }
      ...
    }
    if (result.fetched >= page.total) break;
    pageNo += 1;
    // 안전장치: 10페이지 (1000건) 이후는 다음 주기
    if (pageNo > 10) break;
  }
```

수정 후:
```ts
export interface KcisaIngestOptions {
  /** true 면 forward-looking 필터 우회 (ended 포함). 운영자 backfill 전용. */
  includePast?: boolean;
  /** 최대 페이지 수 (기본 10 = 1000 row). backfill 시 50 정도로 증가. */
  maxPages?: number;
}

export async function runKcisaIngest(opts: KcisaIngestOptions = {}): Promise<IngestResult> {
  const log = logger.child({ job: 'kcisa-ingest' });
  const result: IngestResult = { fetched: 0, upserted: 0, skipped: 0, errors: 0 };
  const includePast = opts.includePast ?? false;
  const maxPages = opts.maxPages ?? 10;

  if (!env.KCISA_API_KEY) {
    log.warn('KCISA_API_KEY missing — skip');
    return result;
  }
  log.info({ includePast, maxPages }, 'start');

  let pageNo = 1;
  while (true) {
    let page: Awaited<ReturnType<typeof fetchPage>>;
    try {
      page = await fetchPage(pageNo);
    } catch (err) {
      log.error({ pageNo, err: err instanceof Error ? err.message : String(err) }, 'fetch failed');
      result.errors += 1;
      break;
    }
    if (page.items.length === 0) break;
    result.fetched += page.items.length;

    for (const raw of page.items) {
      const ev = toNormalized(raw);
      if (!ev) {
        result.skipped += 1;
        continue;
      }
      if (!includePast && !isForwardLooking(ev.startDate, ev.endDate)) {
        result.skipped += 1;
        continue;
      }
      try {
        await upsertCrawledEvent(ev);
        result.upserted += 1;
      } catch (err) {
        log.error({ title: raw.TITLE, err: err instanceof Error ? err.message : String(err) }, 'upsert failed');
        result.errors += 1;
      }
    }
    if (result.fetched >= page.total) break;
    pageNo += 1;
    if (pageNo > maxPages) break;
  }
  log.info(result, 'done');
  return result;
}
```

- [ ] **Step 2: run-ingest.ts 에 --kcisa-backfill 플래그 처리 추가**

`apps/bff/src/jobs/run-ingest.ts:28-33` 의 인자 파싱 블록 수정:

이전:
```ts
const which = (process.argv[2] ?? 'all').toLowerCase();
const tourapiFloor = process.argv[3]; // YYYYMMDD optional (tourapi 전용)
// `--backfill` 이 아무 위치에 있으면 seoul-culture 를 전체(종료 포함) 재분류 모드로.
const seoulBackfill = process.argv.slice(2).includes('--backfill');
// `--no-summarize` 로 ingest 후 AI 요약 단계를 스킵할 수 있음 (배치 시간 단축 / 비용 회피).
const skipSummarize = process.argv.slice(2).includes('--no-summarize');
```

수정 후:
```ts
const which = (process.argv[2] ?? 'all').toLowerCase();
const tourapiFloor = process.argv[3]; // YYYYMMDD optional (tourapi 전용)
const flags = process.argv.slice(2);
// `--backfill` 은 seoul-culture 전용. KCISA 는 `--kcisa-backfill` (전국 확장 ADR 0006).
const seoulBackfill = flags.includes('--backfill');
const kcisaBackfill = flags.includes('--kcisa-backfill');
const kcisaMaxPages = (() => {
  const i = flags.findIndex((f) => f === '--kcisa-max-pages');
  if (i >= 0 && flags[i + 1]) return Number(flags[i + 1]);
  return undefined;
})();
const skipSummarize = flags.includes('--no-summarize');
```

이전 (line 42 부근):
```ts
  if (which === 'kcisa' || which === 'all') results.kcisa = await runKcisaIngest();
```

수정 후:
```ts
  if (which === 'kcisa' || which === 'all') {
    results.kcisa = await runKcisaIngest({
      includePast: kcisaBackfill,
      ...(kcisaMaxPages ? { maxPages: kcisaMaxPages } : {}),
    });
  }
```

- [ ] **Step 3: package.json 에 alias 추가**

`apps/bff/package.json` 의 `scripts` 에 추가:

```json
    "ingest:kcisa:backfill": "dotenv -e ../../.env -- tsx src/jobs/run-ingest.ts kcisa --kcisa-backfill --kcisa-max-pages 50",
```

- [ ] **Step 4: 사용법 주석 갱신**

`apps/bff/src/jobs/run-ingest.ts:5-16` 의 JSDoc 블록 마지막에 1줄 추가:

```ts
 *   `... run-ingest.ts kcisa --kcisa-backfill --kcisa-max-pages 50`   (KCISA 전국 backfill — ADR 0006)
```

- [ ] **Step 5: 타입체크**

```bash
pnpm --filter bff typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/bff/src/jobs/kcisa-ingest.ts apps/bff/src/jobs/run-ingest.ts apps/bff/package.json
git commit -m "feat(bff): KCISA --kcisa-backfill 플래그 — 전국 ended 포함 재수집"
```

---

## Task 11: 위키 ingest-pipeline 갱신

**Files:**
- Modify: `llm_wiki/wiki/topics/ingest-pipeline.md`

- [ ] **Step 1: 위키 본문에서 Seoul 가드 문구 갱신**

`llm_wiki/wiki/topics/ingest-pipeline.md` 의 두 곳 수정:

이전 (Summary 섹션):
```
공통 중복 방지·지역 추출·Seoul 주소 필터·날짜 정규화를 담당.
```

수정 후:
```
공통 중복 방지·지역 추출(전국)·날짜 정규화를 담당. ADR 0006 (2026-05-27) 이전에는 Seoul 필터로 비-서울 row 를 조기 skip 했으나 현재는 전국 17 시/도 + 약 230 시/군/구 매칭.
```

이전 (소스별 러너 표의 KCISA row 끝):
```
| KCISA | 한국문화정보원 `API_CCA_145` | `KCISA_API_KEY` | 공연·전시 전국 (Seoul 필터) | `kcisa-ingest.ts` |
```

수정 후:
```
| KCISA | 한국문화정보원 `API_CCA_145` | `KCISA_API_KEY` | 공연·전시 전국 (가드 없음) | `kcisa-ingest.ts` |
```

이전 (공통 로직 §1, Seoul guard 단락):
```
1. **Seoul guard (`isSeoulAddress`)** — 주소·sigungu·title 정규식 조합으로 서울 판정. 타 광역시 행은 조기 skip.
2. **sigungu 추출 (`extractSeoulGu`)** — "서울특별시 종로구 세종로" 같은 자유문 주소에서 "종로구" 25개 중 첫 매치. 실패 시 null.
3. **regionId resolve** — `regions` 테이블에서 `sido_name='서울' AND sigungu_name=<gu> AND dong_name IS NULL` 단일 행 조회 (district 레벨). fallback: 광역시 전체("서울") 행.
```

수정 후:
```
1. **(deprecated) Seoul guard** — ADR 0006 으로 제거됨. 가드 없이 전국 row 통과.
2. **region 추출 (`extractKoreanRegion`)** — sido 패턴 17개 매칭 후 시/군/구 캡처. 자치구 있는 일반시 8개는 합성형 ("수원시 영통구") 반환. 실패 시 null.
3. **regionId resolve (`resolveRegionId`)** — 4단 fallback: (sido, sigungu) exact → (sido, "<시>") 시 단위 → (sido, NULL) 광역 → null.
```

이전 (§현황 첫 줄):
```
## 현황 (2026-04-19)

- DB 총 4,084 행 (phases `{upcoming:163, ongoing:260, ended:3661}`).
- 소스 분포는 Seoul Culture 압도적 (전시·공연·교육 포함 8종 풀 스펙트럼).
```

수정 후:
```
## 현황 (2026-05-27, ADR 0006 적용 후 backfill 전)

- DB 총 4,111 행 (모두 서울). 전국 backfill 운영자 1회 실행 후 수치 갱신 예정.
- 소스 분포는 Seoul Culture 압도적. KCISA backfill 후 전국 공연·전시 row 증가 예상.
```

- [ ] **Step 2: Commit**

```bash
git add llm_wiki/wiki/topics/ingest-pipeline.md
git commit -m "docs(wiki): ingest-pipeline 전국 확장 반영 (ADR 0006)"
```

---

## Task 12: chat-rank-bench 비-서울 회귀 쿼리

**Files:**
- Modify: `apps/bff/src/jobs/chat-rank-bench-queries.json`

- [ ] **Step 1: 회귀 쿼리 3건 추가**

`apps/bff/src/jobs/chat-rank-bench-queries.json` 의 `queries` 배열에 다음 3건 append (마지막 element 의 `},` 뒤에 삽입):

```json
    {
      "id": "nationwide-busan-fireworks",
      "category": "region-date",
      "userTexts": ["부산 불꽃축제 언제야?"],
      "filters": { "eventTypes": ["festival"], "companions": [], "periodKey": null, "vibes": [], "regionHints": ["부산"] },
      "specificDate": null
    },
    {
      "id": "nationwide-suwon-hwaseong",
      "category": "region-date",
      "userTexts": ["수원 화성행궁 근처 행사 있어?"],
      "filters": { "eventTypes": [], "companions": [], "periodKey": null, "vibes": [], "regionHints": ["수원"] },
      "specificDate": null
    },
    {
      "id": "nationwide-gangneung-coffee",
      "category": "region-date",
      "userTexts": ["강릉 커피축제 가보고 싶어"],
      "filters": { "eventTypes": ["festival"], "companions": [], "periodKey": null, "vibes": [], "regionHints": ["강릉"] },
      "specificDate": null
    }
```

- [ ] **Step 2: JSON validity 확인**

```bash
cat apps/bff/src/jobs/chat-rank-bench-queries.json | jq '.queries | length'
```

Expected: 기존 +3.

- [ ] **Step 3: Commit (벤치 실행은 backfill 후로 미룸)**

```bash
git add apps/bff/src/jobs/chat-rank-bench-queries.json
git commit -m "test(bff): chat-rank-bench 비-서울 회귀 쿼리 3건 (부산/수원/강릉)"
```

---

## Task 13: 통합 검증 — 표본 backfill 실행 + ADR 부록

**Files:**
- Modify: `docs/decisions/0006-nationwide-region-expansion.md` (부록 섹션 추가)

- [ ] **Step 1: KCISA 표본 backfill 실행 (5분 분량)**

```bash
pnpm --filter bff exec tsx src/jobs/run-ingest.ts kcisa --kcisa-backfill --kcisa-max-pages 5 --no-summarize 2>&1 | tee /tmp/kcisa-backfill-sample.log
```

Expected: log 마지막 줄 `done` + result counter. `errors` 비율 < 5% (= errors / fetched). region resolve 실패가 dominant 면 SIDO_PATTERNS 보완 필요.

- [ ] **Step 2: DB 분포 확인 — sido 별 신규 row 개수**

```bash
psql "$DATABASE_URL" -c "
SELECT r.sido_name, COUNT(*) AS event_count
FROM events e JOIN regions r ON e.region_id = r.region_id
WHERE e.crawl_origin = 'kcisa-culture'
GROUP BY r.sido_name
ORDER BY event_count DESC;
"
```

Expected: 서울 외 sido row 1+ 개씩.

- [ ] **Step 3: ADR 0006 에 측정 결과 부록 추가**

`docs/decisions/0006-nationwide-region-expansion.md` 의 `## References` 위에 다음 섹션 삽입:

```markdown
## Appendix A: Backfill 표본 측정 (2026-05-27)

KCISA `--kcisa-max-pages 5` 표본 실행 결과:

- fetched: <실측>
- upserted: <실측>
- skipped: <실측>
- errors: <실측>
- errors / fetched: <%>

Sido 별 신규 events 분포 (TOP 5):

| sido | events |
|---|---|
| 서울 | <실측> |
| <sido2> | <실측> |
| ... | ... |

비용 추정 (전체 backfill 시):
- KCISA `--kcisa-max-pages 50` 약 5000 row × OpenAI 임베딩 1회 = 약 $<X> + 요약 LLM = 약 $<Y>
- Naver news 매핑 단건 ~3 호출 × 5000 = 15000 호출 (일일 quota 25000 의 60%)

운영자 권장: source 별 분할 실행 (TourAPI floor 조정 → KCISA backfill → audit).
```

실측값으로 `<실측>` 자리 교체.

- [ ] **Step 4: chat-rank-bench 회귀 측정 (backfill 후)**

```bash
pnpm --filter bff run bench:chat-rank 2>&1 | tee /tmp/chat-bench-after.log
```

Expected: 신규 비-서울 쿼리 3건 모두 results 1+ 개. 기존 서울 쿼리 rank 가 ±2 이내.

- [ ] **Step 5: Commit ADR 부록**

```bash
git add docs/decisions/0006-nationwide-region-expansion.md
git commit -m "docs(decisions): ADR 0006 부록 — backfill 표본 측정"
```

---

## Task 14: 최종 점검 — typecheck/build/lint 일괄

**Files:** (변경 없음, 검증만)

- [ ] **Step 1: 모노레포 전체 typecheck**

```bash
pnpm -r typecheck
```

Expected: 0 errors across bff/web/llm/shared-types.

- [ ] **Step 2: BFF/Web 빌드 확인**

```bash
pnpm --filter bff build
pnpm --filter web build
```

Expected: both succeed.

- [ ] **Step 3: 잔존 서울 하드코드 grep**

```bash
grep -rn "isSeoulAddress\|extractSeoulGu\|resolveSeoulRegionId\|seoulRegions" apps/
```

Expected: 0건. (있다면 cleanup 누락)

- [ ] **Step 4: 위키 lint**

```bash
pnpm --filter bff run wiki:lint
```

Expected: 통과.

- [ ] **Step 5: graphify 재구축 (코드 수정 반영)**

```bash
python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```

Expected: 그래프 갱신 로그.

- [ ] **Step 6: 마이크 드롭 commit (요약 + 검증 결과)**

```bash
git log --oneline -20
git status
```

수동 검토 후 사용자에게 결과 보고. 별도 commit 없음.

---

## 완료 조건 (Definition of Done)

- [ ] ADR 0006 + 부록 채워짐 (표본 측정값 포함)
- [ ] regions 테이블 약 250 행 시드 완료
- [ ] `pnpm --filter bff run check:regions` exit 0
- [ ] `grep -rn isSeoulAddress apps/` 결과 0
- [ ] FilterSearchPanel 에 17 sido 그룹 카드 렌더, 다중 선택 동작
- [ ] KCISA backfill 5-page 표본 실행 성공 (errors < 5%)
- [ ] chat-rank-bench 신규 비-서울 쿼리 3건 results 1+
- [ ] 위키 ingest-pipeline.md 갱신
- [ ] `pnpm -r typecheck` 0 errors
