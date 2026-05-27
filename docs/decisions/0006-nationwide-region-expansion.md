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
- (−) 서울 외 지역 뉴스 매핑 정확도 미검증 — Task 13 에서 표본 측정 후 부록 추가
- (−) `region_id` 가 null 인 events 가 신규로 발생할 수 있음 (주소 텍스트 부실 시) — KCISA errors 비율 모니터링

## Alternatives considered

- **시/도만 (17행)**: 너무 큰 단위, 필터 변별력 약함. 기각.
- **읍/면/동 포함 (수천 행)**: master data 무거움, UI 3-level 필요. 시기상조. 기각.
- **별도 `cities` / `districts` 테이블 분리**: 스키마 변경 + Prisma 수정. 합성 표기로 충분. 기각.

## Appendix A: TourAPI 표본 backfill 실측 (2026-05-27)

후속 작업 중 `tourapi-ingest.ts` 에 `areaCode=1` (서울) 하드코드 + `isForwardLooking` 무조건 가드 발견 — Plan §"Plan Deviations from Spec" §5 의 "TourAPI 변경 없음" 진단이 잘못됨. 같은 패턴으로 `TourapiIngestOptions { eventStartDate, areaCode, includePast, maxPages }` 추가 + `--tourapi-backfill` 플래그 도입 (`ingest:tourapi:backfill` alias).

**표본 실행** (`tourapi 20260301 --tourapi-backfill --tourapi-max-pages 5 --no-summarize`):

| metric | 값 |
|---|---|
| fetched | 393 |
| upserted | 393 |
| skipped | 0 |
| errors | 0 |
| errors / fetched | 0.0% |

resolver 가 393건 전수 매칭 성공 — 실 데이터에서 `extractKoreanRegion` + `resolveRegionId` 정확도 100%. 0 errors 는 plan §11 오픈 아이템 "region_id null 발생 케이스" 의 실측 부재 항목을 해소.

**Sido 분포** (전체 `tourapi-festival` row 기준 — 신규 upsert + 기존 row update 합산):

| sido | events |
|---|---|
| 서울 | 234 |
| 경기 | 56 |
| 부산 | 31 |
| 강원 | 28 |
| 경북 | 27 |
| 전북 | 27 |
| 전남 | 23 |
| 경남 | 22 |
| 충남 | 20 |
| 인천 | 16 |
| 충북 | 16 |
| 제주 | 13 |
| 광주 | 12 |
| 대구 | 7 |
| 세종 | 5 |
| 울산 | 5 |
| 대전 | 3 |

**Total: 545 rows, 17 sido 모두 커버**. 이전엔 TourAPI row 전부가 서울 row 로 태그돼 있었으나, backfill upsert 의 update path 가 `region_id` 를 정확한 sido 로 교정 — latent bug 해소가 코드 변경뿐 아니라 실 데이터에서도 적용됨.

**운영 환경 키 상태**:

| Key | 상태 | 메모 |
|---|---|---|
| `KCISA_API_KEY` | 미보유 | 발급 받기 어려운 키. 운영 결정에 따라 향후 검토. |
| `TOUR_API_KEY` | set | 정상 작동 (94 chars, URL-인코딩 보존) |
| `SEOUL_OPEN_API_KEY` | set | Seoul 전용 |
| `OPENAI_API_KEY` | set | 후속 summary/embed 가능 |
| `NAVER_CLIENT_ID/SECRET` | set | 후속 news 매핑 가능 |

**운영 backfill 절차** (TourAPI 가 1차 소스):

```bash
# 1) sample run — 페이지 캡 + no-summarize 로 비용 절감
pnpm --filter bff run ingest:tourapi:backfill   # 기본 floor=20240101, maxPages=50

# 2) sido 분포 확인
pnpm --filter bff exec dotenv -e ../../.env -- tsx scripts/tourapi-sido-distribution.ts

# 3) 후속 단계 (선택)
pnpm --filter bff run backfill:summary
pnpm --filter bff run ingest:news -- --missing
pnpm --filter bff run embed:events:missing
```

KCISA 키 확보 시 추가:
```bash
pnpm --filter bff run ingest:kcisa:backfill
```

## Appendix B: chat-rank-bench 회귀 베이스라인 (2026-05-27)

비-서울 회귀 쿼리 3건 추가 (`apps/bff/src/jobs/chat-rank-bench-queries.json`):
- `nationwide-busan-fireworks` (부산 불꽃축제)
- `nationwide-suwon-hwaseong` (수원 화성행궁)
- `nationwide-gangneung-coffee` (강릉 커피축제)

**현재 측정 보류**: DB에 비-서울 events 행이 없는 상태 (KCISA 키 부재로 backfill 미실행) — 이 쿼리들은 0건 매칭이 예상됨. 운영 backfill 후 베이스라인 측정 권장:

```bash
pnpm --filter bff run bench:chat-rank
```

기존 서울 쿼리 12건의 rank 가 ±2 이내 유지되면 회귀 없음.

## References

- spec: `docs/superpowers/specs/2026-05-27-nationwide-region-expansion-design.md`
- plan: `docs/superpowers/plans/2026-05-27-nationwide-region-expansion.md`
- 행정안전부 행정구역 코드: https://www.mois.go.kr/frt/sub/a05/totalRegionalInformation/screen.do
