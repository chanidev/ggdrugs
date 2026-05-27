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

## Appendix A: Backfill 가능성 검증 (2026-05-27)

운영 dev 환경 (`.env`) 상태 점검:

| Key | 상태 |
|---|---|
| `KCISA_API_KEY` | **empty** — runner `KCISA_API_KEY missing — skip` 로 정상 종료 |
| `TOUR_API_KEY` | set (94 chars) — TourAPI는 forward-only 응답이라 `tourapi 20260301` 호출 시 fetched=0 (과거 floor 무시) |
| `SEOUL_OPEN_API_KEY` | set — Seoul 전용이라 전국 검증 무관 |
| `OPENAI_API_KEY` | set (164 chars) — 후속 summary/embed 단계 사용 가능 |
| `NAVER_CLIENT_ID/SECRET` | set — 후속 news 매핑 사용 가능 |

**결론**: 실 전국 데이터 1회 도입은 KCISA 키 값 배포 후 운영자가 1회 실행하는 것으로 보류. 코드 경로 (가드 제거 → resolveRegionId → upsert) 는 27/27 resolver 케이스로 검증 완료, 실행만 남음.

**키 확보 후 운영 절차 (운영자용)**:

```bash
# 1) .env 에 KCISA_API_KEY 값 추가
# 2) sample run
pnpm --filter bff run ingest:kcisa:backfill   # --kcisa-max-pages 50 기본
# 3) sido 분포 확인
psql "$DATABASE_URL" -c "SELECT r.sido_name, COUNT(*) FROM events e JOIN regions r ON e.region_id=r.region_id WHERE e.crawl_origin='kcisa-culture' GROUP BY r.sido_name ORDER BY 2 DESC;"
# 4) 후속 단계 (선택)
pnpm --filter bff run backfill:summary
pnpm --filter bff run ingest:news -- --missing
pnpm --filter bff run embed:events:missing
```

비용 추정 (전체 backfill 시): KCISA `--kcisa-max-pages 50` 약 5000 row 예상. 후속 4단계 (summary/news/embed/audit) 별도 실행 시 OpenAI/Naver 호출 증가. 운영자 권장: source 별 분할 실행. quota-counter (80%/95% 경고) 가 가시화.

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
