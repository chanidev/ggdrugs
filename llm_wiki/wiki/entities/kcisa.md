---
title: KCISA (한국문화정보원)
type: entity
created: 2026-04-19
updated: 2026-04-19
related:
  - ../topics/ingest-pipeline.md
---

# KCISA — 한국문화정보원

## 역할

Alle 이벤트 ingest 의 **공연·전시 전국 소스** (서울 외 주요 공연장 포함). Seoul Open Data 가 놓치는 영역 보완. 현재는 `KCISA_API_KEY` 미설정 → 실제로는 skip 상태.

## 사용 엔드포인트

- **Base**: `http://api.kcisa.kr/openapi/API_CCA_145/request`
- `serviceKey`, `numOfRows`, `pageNo`
- `from_date`, `to_date` (YYYYMMDD, forward floor)

## 발급

https://www.kcisa.kr → 공공누리 → API → 공연전시정보 (`API_CCA_145`) 활용신청. **URL-encoded 키** 제공 — TourAPI 와 동일 규약.

## 환경변수

- `KCISA_API_KEY` (encoded 보존)

## 지역 처리 (전국)

KCISA 응답은 전국 행사를 그대로 통과시킨다. 과거 러너에는 `isSeoulAddress(eventSite)` 가드로 서울만 남기는 필터가 있었으나 **ADR 0006 (2026-05-27) 으로 제거** — 현재는 가드 없이 전국 row 가 공통 ingest 경로의 `extractKoreanRegion` → `resolveRegionId` (전국 17 시/도 + 약 230 시/군/구) 를 탄다. 주소 필드명: `eventSite` (시설명), `place` (상세).

## 장애 시 동작

- Key 부재: 러너 시작 시 `skip` (warn: `KCISA_API_KEY missing — skip`).
- HTTP/JSON 오류: 해당 페이지 skip.

## 제한

- 일 호출 건수: 활용신청 레벨별 상이.
- 데이터 카테고리는 공연·전시 중심. 축제는 거의 없음 — TourAPI 와 역할 분담.
