---
title: 전국 지역 확장 (Seoul guard 제거)
created: 2026-05-27
status: draft → user-review
owner: Backend Agent (주) + Frontend Agent + Infra Agent
related:
  - docs/decisions/0006-nationwide-region-expansion.md (작성 예정)
  - llm_wiki/wiki/topics/ingest-pipeline.md
  - apps/bff/src/jobs/ingest-common.ts
---

# 전국 지역 확장 설계서

## 1. 배경

`events` 데이터 도메인은 현재 서울 전용이다. `apps/bff/src/jobs/ingest-common.ts:96` 의 `isSeoulAddress()` 가드와 `resolveSeoulRegionId()` 의 `sidoName='서울'` 하드코딩이 TourAPI·KCISA 러너에서 비-서울 row 를 조기 skip 시키고 있다. `regions` 테이블 시드도 서울 25구만 district 레벨, 다른 광역시·도는 단일 row 만 존재한다 (`apps/bff/prisma/migrations/20260418140000_seed_regions/migration.sql`).

목표는 서울 외 지역 이벤트도 동일 파이프라인을 통해 수집·검색·필터되도록 도메인을 확장하는 것.

요구사항정의서 v5.0 은 서울 전용을 명시하지 않았으나 §3 필터 5종 중 "지역" 필터가 서울 25구 드릴다운으로 구현되어 있어 사실상 서울 한정 상태. 이번 변경은 도메인 확장이라 ADR 0006 으로 박제한다.

## 2. 스코프

포함:

- 백엔드 ingest 가드 제거 및 resolver 일반화
- `regions` 마스터 데이터: 17 광역시·도 + 약 230 시/군/구 시드 + center 좌표 채움
- BFF `GET /events/filters/regions` 트리 응답
- Web 지역 필터 cascading 드롭다운
- 비-서울 데이터 backfill (운영자 수동 1회)
- ADR 0006 작성

제외:

- 읍/면/동 레벨 시드 (향후 ADR 로 재검토)
- 다국어 지역명 (한국어만)
- 해외 이벤트 (정의 자체가 없음)
- daily scheduler 정책 변경 — forward-looking 유지

## 3. 아키텍처 변경 맵

```
[BFF jobs]
  ingest-common.ts
    - isSeoulAddress()          → 삭제
    - extractSeoulGu()          → 삭제 (호출처 0)
    - resolveSeoulRegionId()    → resolveRegionId() 로 교체
    + extractKoreanRegion()     → 신규: { sido, sigungu } 반환
  kcisa-ingest.ts
    - isSeoulAddress() 가드     → 삭제 (라인 117)
  tourapi-ingest.ts            → 변경 없음
  seoul-culture-ingest.ts      → 변경 없음 (소스 자체가 서울)
  run-ingest.ts                → --backfill 플래그 추가 (forward-looking 우회)

[DB schema/seed]
  prisma/migrations/20260527XXXXXX_seed_regions_nationwide/migration.sql
    - 시/군/구 약 230행 INSERT (광역 17행은 기존 row 유지)
  prisma/migrations/20260527YYYYYY_regions_center_coords_nationwide/migration.sql
    - 신규 시/군/구 row 의 center_lat/lng UPDATE

[BFF API]
  GET /events/filters/regions  → 신규 또는 확장: { sido: [{ ..., children: [...] }, ...] }

[Web]
  apps/web/src/.../RegionFilter.tsx (정확 위치는 구현 시 확정)
    - 단일 select(25구) → cascading (시/도 → 시/군/구)

[Docs]
  docs/decisions/0006-nationwide-region-expansion.md  (ADR)
  llm_wiki/wiki/topics/ingest-pipeline.md             (서울 필터 → 전국 표기 갱신)
```

## 4. 컴포넌트 상세

### 4.1 Regions 마스터 데이터

- **소스**: 행정안전부 표준 행정구역 코드 (2026 기준).
- **명명 정책**:
  - `sido_name`: 단축형 유지 — "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주" (17개).
  - `sigungu_name`: 일반시·군·자치구는 공식 표기 — "종로구", "수원시", "안동시", "양양군".
  - **자치구가 있는 일반시**: "수원시 영통구" 처럼 합성형으로 시드. 대상 8개 시: 수원·성남·고양·용인·청주·천안·전주·포항. 컬럼 추가 없이 합성 표기로 검색 매칭 일관성 유지.
  - **자치구 있는 일반시의 시 단위 row**: 위 8개 시는 자치구 row 외에 **"수원시" 같은 시 단위 row 1개씩 추가 시드** (sigungu_name="수원시", dong_name=NULL). 사용자가 "수원시 전체" 를 1단계에서 고르거나 주소에서 자치구 추출 실패한 경우의 fallback 용도. resolver 우선순위: (sido, "수원시 영통구") → (sido, "수원시") → (sido, NULL).
- **center coords**: 행정안전부 도로명주소 API 의 시군구 대표좌표를 정적 SQL 안에 인라인. 못 채운 행은 NULL 허용 (지도 anchor 는 시/도 fallback).
- **기존 row**: 광역시·도 17행은 그대로 둠. 4,111건 row 의 `region_id` 가 깨지지 않게 INSERT-only.

### 4.2 Address Resolver

```ts
// ingest-common.ts

const SIDO_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: '서울', re: /서울(?:특별시)?/ },
  { name: '부산', re: /부산(?:광역시)?/ },
  // ... 17개
];

export function extractKoreanRegion(
  addr: string | null | undefined,
): { sido: string; sigungu: string | null } | null {
  if (!addr) return null;
  // 1. sido 매칭 (위 17개 패턴 — first match)
  // 2. sigungu 매칭:
  //    - 자치구 있는 일반시: "수원시 영통구" 패턴 우선 캡처
  //    - 일반: "<n자>(시|군|구)" 단일 캡처
  //    - 매칭 없으면 sigungu=null (→ 광역 fallback)
}

export async function resolveRegionId(
  addr: string | null | undefined,
): Promise<bigint | null> {
  const r = extractKoreanRegion(addr);
  if (!r) return null;
  // 1. (sido, sigungu) exact match — 합성형 "수원시 영통구" 포함 → return regionId
  // 2. (sido, "<시>") — sigungu 가 합성형일 때 시 단위 fallback ("수원시 영통구" → "수원시")
  // 3. (sido, NULL) — 광역 단일 row
  // 4. 다 못 찾으면 null (호출자 upsert 에서 throw)
}
```

- `resolveSeoulRegionId` 는 새 alias 도 두지 않고 즉시 교체 (호출처 내부 1곳).
- `extractSeoulGu` 는 즉시 삭제 (호출처 없음, grep 검증 완료).

### 4.3 Ingest 러너 변경

- `kcisa-ingest.ts:117` 의 `if (!isSeoulAddress(item.EVENT_SITE)) return null;` 라인 제거.
- TourAPI: 변경 없음 (이미 전국 수신, address 그대로 전달).
- Seoul Culture: 변경 없음.

### 4.4 `run-ingest.ts --backfill` 플래그

- 기본 동작 (forward-looking) 은 유지.
- `--backfill` 지정 시:
  - TourAPI: `eventStartDate` floor 를 옵션 인자 `--from=YYYYMMDD` 로 사용자가 지정. 기본 `20200101`.
  - KCISA: `srchBegin/srchEnd` 동일 범위.
  - Seoul Culture: 영향 없음 (변경 없음 — 이미 서울 전부 수집됨).
- `pnpm ingest --backfill --from=20200101 --source=tourapi` 같이 source-scope 옵션도 받아 단계적 실행 가능.
- daily scheduler (`scheduler.ts::runAll`) 는 절대 backfill 모드 호출 안 함.

### 4.5 BFF `GET /events/filters/regions`

응답 트리:

```json
{
  "sido": [
    {
      "sido_name": "서울",
      "region_id": 1,
      "children": [
        { "region_id": 2, "sigungu_name": "종로구" },
        ...
      ]
    },
    ...
  ]
}
```

- 응답 캐싱: in-memory 1h TTL (시드 변경 잦지 않음).
- 정렬: sido 는 행정코드 순, sigungu 는 가나다순.

### 4.6 Web 지역 필터

- 1단 select: 시/도 (17개) — "전체" 옵션 포함.
- 2단 select: 시/군/구 — 1단 선택 시 활성화, "<시도> 전체" 옵션 포함.
- URL/state 키: `region=<regionId>` 1개 유지. 1단만 선택 시 광역 row 의 regionId, 2단까지 선택 시 시군구 row 의 regionId.
- chat anchor / map bbox / GPS anchor / Kakao Places anchor: 위경도 기반이라 자동 전국 작동. 검증 task 만 추가.

## 5. 데이터 흐름

### 5.1 신규 이벤트 (전국)

```
TourAPI/KCISA → fetch → normalize(addressText)
  → extractKoreanRegion(addr) → { sido: "경기", sigungu: "수원시 영통구" }
  → resolveRegionId() → regions 테이블 (sidoName="경기", sigunguName="수원시 영통구")
  → events.upsert (region_id = …)
  → 후속 4단계 (summary, news, embed, audit) — 변경 없음
```

### 5.2 Backfill

```
운영자 → pnpm ingest --backfill --from=20200101 --source=tourapi
  → forward-looking floor 우회
  → 약 30k row 예상 (대략 추정, 실측 필요)
  → quota-counter 가 80%/95% 경고
  → 후속 4단계 — OpenAI/Naver 호출 폭증
운영자가 source 별로 분할 실행 권장 (tourapi → kcisa → ...)
```

### 5.3 필터 UI

```
Web 로드 → GET /events/filters/regions → 캐시 1h
사용자: 시/도 선택 → children 동적 렌더 → 시/군/구 선택
  → ?region=<id> URL update
  → GET /events?region=<id>&... → BFF 가 region_id 로 events 필터
```

## 6. 에러 처리

- `extractKoreanRegion` 가 null 반환 (주소 텍스트 자체가 없거나 한국 행정구역 패턴 매칭 실패) → `upsertCrawledEvent` 에서 throw → 러너 단위 errors 카운터 증가 후 다음 row 진행. scheduler 는 죽지 않음.
- `resolveRegionId` 가 null 반환 (extract 했지만 regions 테이블에 행이 없음) → 동일하게 throw. 시드 누락 시 운영 알림 용도.
- BFF API `GET /events/filters/regions` 실패 시 Web 은 단일 select(시/도만) fallback. 2단은 비활성.

## 7. 테스트

- **단위 (Jest)** `apps/bff/test/jobs/ingest-common.test.ts`:
  - `extractKoreanRegion`: 7 케이스 — "서울특별시 종로구 …", "서울 강남구", "경기도 수원시 영통구 …", "경기 수원시 권선동", "부산 해운대구", "충청남도 천안시 동남구", null, "광주 동구".
  - `resolveRegionId`: 3 케이스 — 정확 매칭, sido-only fallback, 매칭 실패.
- **통합** `apps/bff/test/jobs/kcisa-ingest.integration.test.ts`:
  - 비-서울 fixture 1건이 upsert 까지 흐르는지 (인메모리 DB 또는 trans rollback).
- **수동 검증**:
  - `pnpm ingest --backfill --from=20260101 --source=tourapi` 5분 표본 run → `upserted` > 0, `errors` 비율 < 5%.
  - Web QA: 시/도 → 시/군/구 cascading 동작, URL 동기화.
- **회귀**:
  - `chat-rank-bench` 에 비-서울 쿼리 3건 추가 ("부산 불꽃축제", "수원 화성행궁", "강릉 커피축제") 후 P50 / P95 rank 측정.
  - 기존 서울 쿼리들의 rank 가 ±2 이내 유지되는지 확인.

## 8. 롤백 정책

- **코드 (resolver + 가드)**: `git revert` 만으로 OK.
- **regions 시드**: revert 하면 신규 시/군/구 row 가 남고, 이미 그 row 를 가리키는 신규 events 가 orphan 이 됨 → 마이그레이션 down 스크립트는 작성하지 않고, ADR 에 "한 번 시드 후 되돌리지 않음" 명시. 운영 사고로 데이터 자체를 되돌려야 할 경우 별도 `DELETE FROM events WHERE crawl_origin IN (...) AND region_id NOT IN (서울 26행)` 후 시드 row 삭제.
- **UI**: 단순 revert.

## 9. ADR 0006 핵심 결정 (작성 예정)

1. Phase 1.5 스코프 확장: Seoul-only → 전국.
2. Master data 깊이: 시/도 + 시/군/구 (읍/면/동 제외).
3. 자치구 있는 일반시는 합성형 (`"수원시 영통구"`) 으로 시드 — 스키마 변경 회피.
4. Backfill 정책: 운영자 수동 1회, scheduler 는 forward-looking 유지.
5. 후속 파이프라인 비용: 기존 quota-counter 정책으로 흡수, 운영자가 source 별 분할 실행 권장.
6. Trade-off: 데이터 변별력 ↑ / OpenAI·Naver API 비용 ↑ / 검색 품질 (서울 외 지역 뉴스 매핑 정확도 미검증) ↓.

## 10. 영향 받는 파일 (예상 변경 목록)

신규:
- `apps/bff/prisma/migrations/20260527XXXXXX_seed_regions_nationwide/migration.sql`
- `apps/bff/prisma/migrations/20260527YYYYYY_regions_center_coords_nationwide/migration.sql`
- `docs/decisions/0006-nationwide-region-expansion.md`
- `apps/bff/test/jobs/ingest-common.test.ts` (확장 또는 신규)

수정:
- `apps/bff/src/jobs/ingest-common.ts` — resolver 일반화, 가드 삭제
- `apps/bff/src/jobs/kcisa-ingest.ts` — 가드 호출 제거
- `apps/bff/src/jobs/run-ingest.ts` — `--backfill` 플래그
- `apps/bff/src/routes/...` — `GET /events/filters/regions` 신규/확장 (실제 라우트 위치는 구현 시 grep)
- `apps/web/src/.../RegionFilter.tsx` 또는 동등 위치 — cascading select
- `llm_wiki/wiki/topics/ingest-pipeline.md` — Seoul guard 문구 제거

미변경 (확인됨):
- `apps/bff/src/jobs/tourapi-ingest.ts`
- `apps/bff/src/jobs/seoul-culture-ingest.ts`
- `apps/bff/src/jobs/scheduler.ts` (forward-looking 정책 유지)
- 후속 4단계 (summary/news/embed/audit) — 인풋만 늘어남

## 11. 오픈 아이템

- `extractKoreanRegion` 의 합성형 캡처 정규식 — "수원시 영통구" 같이 공백 1개 또는 다수 케이스를 어떻게 정규화할지 구현 단계에서 확정. 테스트 케이스로 박제.
- 후속 파이프라인 비용 실측 — backfill 1차 실행 후 ADR 부록으로 수치 추가.
- region_id 가 null 인 events 가 생기는 케이스 (주소 자체가 부실한 row) 처리 — 현재 throw 정책 유지, 다만 KCISA 러너에서 errors 비율 모니터링 필요.
