---
title: 이벤트 Ingest 파이프라인
type: topic
created: 2026-04-19
updated: 2026-04-22
sources: []
related:
  - db-schema-overview.md
  - event-state-machine.md
  - news-article-pipeline.md
  - semantic-search.md
  - ai-enrichment.md
  - ../entities/tourapi.md
  - ../entities/seoul-open-data.md
  - ../entities/kcisa.md
---

# 이벤트 Ingest 파이프라인

## Summary

Alle 의 이벤트 데이터는 **3개 공공/문화 API 를 forward-looking 일일 배치** 로 수집한다. 각 소스는 독립 러너를 가지며, `ingest-common.ts` 가 공통 중복 방지·지역 추출·Seoul 주소 필터·날짜 정규화를 담당. 현재 DB 4,084 행이 이 파이프라인의 결과물. `events.source_type`·`crawl_origin`·`external_source_id` 세 컬럼이 프로비넌스 추적을 책임진다.

## 소스별 러너 (`apps/bff/src/jobs/`)

| 러너 | 엔드포인트 | 키 | 커버리지 | 파일 |
|---|---|---|---|---|
| TourAPI | 한국관광공사 `searchFestival2` | `TOUR_API_KEY` (URL-인코딩 보존) | 전국 축제, forward-looking | `tourapi-ingest.ts` |
| Seoul Culture | `data.seoul.go.kr culturalEventInfo` | `SEOUL_OPEN_API_KEY` | 서울 문화행사 전 카테고리 | `seoul-culture-ingest.ts` |
| KCISA | 한국문화정보원 `API_CCA_145` | `KCISA_API_KEY` | 공연·전시 전국 (Seoul 필터) | `kcisa-ingest.ts` |

스케줄러 (`scheduler.ts`): 부팅 후 2초 뒤 첫 실행, 이후 24h 주기. `run-ingest.ts` CLI 로 수동 실행 가능 (`pnpm ingest:seoul` 등).

## 공통 로직 (`ingest-common.ts`)

### `NormalizedEvent` → DB upsert

각 러너가 원본 payload 를 `NormalizedEvent` 로 정규화 → 공통 upsert 경로로 전달. 다음 단계를 거친다:

1. **Seoul guard (`isSeoulAddress`)** — 주소·sigungu·title 정규식 조합으로 서울 판정. 타 광역시 행은 조기 skip.
2. **sigungu 추출 (`extractSeoulGu`)** — "서울특별시 종로구 세종로" 같은 자유문 주소에서 "종로구" 25개 중 첫 매치. 실패 시 null.
3. **regionId resolve** — `regions` 테이블에서 `sido_name='서울' AND sigungu_name=<gu> AND dong_name IS NULL` 단일 행 조회 (district 레벨). fallback: 광역시 전체("서울") 행.
4. **category 매핑 (`classifyCategory`)** — Seoul CODENAME ("축제/자연(하천)", "공연/클래식" 등) → 8종 event_category 매핑. TourAPI·KCISA 는 각 소스의 `cat1~3` 또는 `genreNm` 기반.
5. **중복 방지 (`existsInOtherOrigin`)** — 같은 외부 id 뿐 아니라 **다른 소스의 같은 이벤트** 까지 잡아냄. 현재는 제목·start_date 정확 일치 기준 (향후 pg_trgm similarity 강화 예정). 중복이면 skip, 원본 소스 정보만 유지.
6. **phase 계산** — `start_date`/`end_date` 기준 upcoming/ongoing/ended. 트리거 없이 매 쿼리·ingest 에서 재계산 안 하고 `events.phase` 컬럼에 저장 (계산 cache).
7. **approval_status = 'approved' (crawled)** — 수집 소스는 자동 승인 상태로 저장 (업로더 등록만 pending 시작).
8. **`prisma.event.upsert`** on `(source_type, external_source_id)` → insert or update (`title`, `description`, `start_date`, `end_date`, `poster_image_url`, `lat`, `lng` 등).

### `daily-batch` orchestrator (`run-ingest.ts` + `scheduler.ts::runAll`)

CLI `pnpm ingest` 는 tourapi → seoul-culture → kcisa 순차 실행. 각 러너 별도 카운터
`{fetched, upserted, skipped, errors}` 리턴, 최종 집계 log.

스케줄러 경로(`scheduler.ts::runAll()`) 는 3 소스를 **`Promise.allSettled` 병렬** 로 돌린 뒤
아래 §후속 파이프라인 4단계를 직렬로 추가 호출한다.

### 후속 파이프라인 (공공 소스 자동 매핑/임베딩, 커밋 `d289b9d`)

공공 소스 이벤트는 `approvalStatus='approved'` 로 바로 DB 인서트 — admin 승인 훅이 안 탄다.
이 갭을 메우기 위해 ingest 직후 동일 워커 안에서 4단계를 직렬 실행. 각 단계는 독립 try/catch
로 감싸져 있어 한 단계가 실패해도 다음 단계는 진행되고, scheduler 자체는 죽지 않음.

| 단계 | 호출 | 효과 | 실패 정책 |
|---|---|---|---|
| 1 | `runBackfillSummaries({})` | aiSummary 비어있는 신규 행에 gpt-4o-mini 요약 부여 | warn 로그, 다음 단계 진행 |
| 2 | `runNewsNaverIngest({ onlyMissing: true, eventLimit: 'all' })` | 매핑 0 인 approved 이벤트에 Naver 뉴스 매핑 | warn 로그, 다음 단계 진행 |
| 3 | `runEmbedEvents({ onlyMissing: true, eventLimit: 'all' })` | Qdrant `alle-events` 에 누락 포인트 upsert | warn 로그, 다음 단계 진행 |
| 4 | `auditMappingDistributionQuick()` | 분포 + `staleBelowThreshold` 집계 | `> 0` 이면 warn, 0 이면 info |

**왜 직렬인가**: 1단계가 만든 aiSummary 가 3단계 embed 텍스트의 핵심 입력이고, 2단계가 만든
매핑이 4단계 감사의 입력이기 때문. 동시성은 각 단계 내부 pool (summarize 5, news 4, embed 8)
로 흡수.

업로더 제출 이벤트는 별도 경로 — `admin-uploaders.ts` 승인 훅이 동일 2~3 단계를 단건 처리.
1단계(요약) 는 향후 옵션 (현재는 업로더가 직접 description 작성).

→ 검색 인덱스 동기화 전체 그림은 [semantic-search.md §실시간 동기화 (3축)](semantic-search.md) 참조.
→ 매핑 품질 감사 상세는 [news-article-pipeline.md §품질 감사](news-article-pipeline.md) 참조.

### forward-looking 전환 (2026-04-18 커밋 `95820e1`)

원래 전체 과거·미래를 긁던 배치를 "오늘 이후 시작일만" 으로 축소. floor = `todayYmd()`. KCISA / Seoul 공식 API 의 기간 파라미터에 그대로 전달. 이로 인해 daily 실행 비용 감소 + stale 데이터 갱신 방지.

## 프로비넌스 컬럼 (`events` 테이블)

- `source_type VARCHAR` — `'crawled'` | `'uploaded'`
- `crawl_origin VARCHAR` — `'tourapi'` | `'seoul-culture'` | `'kcisa'` | null (uploaded)
- `external_source_id VARCHAR` — 각 API 의 고유 id. `(source_type, crawl_origin, external_source_id)` 실질 유일성.

`GET /events/:id` 응답의 `source` 객체 + EventDetailPage `Provenance` 섹션에 노출.

## 현황 (2026-04-19)

- DB 총 4,084 행 (phases `{upcoming:163, ongoing:260, ended:3661}`).
- 소스 분포는 Seoul Culture 압도적 (전시·공연·교육 포함 8종 풀 스펙트럼).
- TourAPI: forward window 가 짧아 fetched=0 반복 (정상).
- KCISA: `KCISA_API_KEY` 미설정 시 러너 시작 시점 skip (warn 로그 1줄).

## Open questions

- **중복 방지 강화** — 현재 정확 일치만. pg_trgm similarity 점수 0.8 이상 → 동일 이벤트로 간주하는 정책 미도입.
- ~~**소스 쿼터·레이트리밋**~~ → **부분 해소** (2026-04-23): `apps/bff/src/jobs/lib/fetch-with-retry.ts` 헬퍼 신설 — 4 ingest runner (tourapi / seoul-culture / kcisa / news-naver) 의 fetch 가 429 / 5xx / 네트워크 에러에 exponential backoff (1s / 2s / 4s, max 8s) + Retry-After 헤더 존중 + 3회 재시도. 단순 transient 장애에 강해짐. **여전히 미해결**: 일 quota 소진 (4xx 일부) 은 retry 안 함 — 호출자가 받아 throw, scheduler 의 Promise.allSettled 가 source-level 격리. 일일 호출 카운트 추적·임계 알림은 별도 후속.
- ~~**과거 정리** — `ended` 이벤트 retention 미정~~ → **결정 박제 (2026-04-23)**: `ended` 이벤트 **유지** (archive 안 함). 근거: ① 캘린더 (A_500) 가 과거 참여 이벤트 기록을 보존해야 함 (리뷰 + 북마크 link), ② 검색에서 자동 제외 (`phase!='ended'` 필터 기본), ③ 4084 행 규모는 PostgreSQL 에 부담 없음 (rows < 100k). 트리거 (예: 100k 초과 + query 비용 측정) 도래 시 ADR 로 archive 정책 재검토. 코드 변경 없음.

## References

- `apps/bff/src/jobs/` — 3 러너 + ingest-common + run-ingest + scheduler
- 커밋: `87fa633` (multi-source 도입), `95820e1` (forward-looking 전환), `38b2727` (크로스 소스 중복방지)
