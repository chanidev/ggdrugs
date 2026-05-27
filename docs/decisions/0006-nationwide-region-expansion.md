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

## Appendix A: Backfill 표본 측정 (2026-05-27)

KCISA `--kcisa-max-pages 5` 표본 실행 결과:

운영 환경에 KCISA_API_KEY 미배포 — 표본 실행 보류, 키 확보 후 운영자 1회 실행 예정.

- fetched: N/A (키 없음)
- upserted: N/A
- skipped: N/A
- errors: N/A
- errors / fetched: N/A

Runner 실제 출력:
```
WARN: KCISA_API_KEY missing — skip
INFO: manual ingest completed  { fetched: 0, upserted: 0, skipped: 0, errors: 0 }
```

Sido 별 신규 events 분포: 키 확보 전까지 측정 불가.

비용 추정 (전체 backfill 시): KCISA `--kcisa-max-pages 50` 약 5000 row 예상. 후속 4단계 (summary/news/embed/audit) 별도 실행 시 OpenAI/Naver 호출 증가. 운영자 권장: source 별 분할 실행.

## References

- spec: `docs/superpowers/specs/2026-05-27-nationwide-region-expansion-design.md`
- plan: `docs/superpowers/plans/2026-05-27-nationwide-region-expansion.md`
- 행정안전부 행정구역 코드: https://www.mois.go.kr/frt/sub/a05/totalRegionalInformation/screen.do
