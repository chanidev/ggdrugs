---
title: TourAPI (한국관광공사)
type: entity
created: 2026-04-19
updated: 2026-04-19
related:
  - ../topics/ingest-pipeline.md
---

# TourAPI — 한국관광공사

## 역할

Alle 이벤트 ingest 의 **전국 축제 소스** (카테고리 우선: festival). 공공데이터포털 경유 공식 API.

## 사용 엔드포인트

- **Base**: `https://apis.data.go.kr/B551011/KorService2/`
- **주로 사용**: `searchFestival2` (festival 전용, 기간 필터 지원)
  - `serviceKey` (URL-encoded — 공공데이터포털 발급값 그대로 사용)
  - `eventStartDate=YYYYMMDD` (forward floor)
  - `areaCode` — 파라미터화 (전국이 기본; 생략 시 전국). 과거엔 `areaCode=1` (서울) 하드코드라 비-서울 행이 서울로 잘못 태그되는 latent bug 였으나 ADR 0006 (2026-05-27, Appendix A) 으로 제거 — `--tourapi-backfill` 가 17 시/도 전수 커버.
  - `MobileOS=ETC`, `MobileApp=Alle`
  - `_type=json` 응답 요청

## 발급

https://www.data.go.kr/data/15101578/openapi.do → 활용신청 → **Encoding** 키 복사 (이미 URL-encoded).

## 환경변수

- `TOUR_API_KEY` (이미 encoded — `encodeURIComponent` 재적용 금지)

## 알려진 quirk

- fetchPage 를 수동 querystring 구성 — axios/fetch 자동 encoding 과 충돌 회피 (러너 주석 참조).
- `rawresponse` JSON 이지만 items 가 `{item: [...]}` vs `{item: {...}}` 단수/복수 분기 → 러너에서 배열 정규화.

## 장애 시 동작

- Key 부재: 러너 실행 시 skip (warn).
- 네트워크·HTTP 오류: 해당 페이지 skip, `errors` 카운터 증가. 배치 전체는 계속.

## 제한

- 일 호출 건수 제한 (공공데이터포털 활용신청 기준): 기본 1,000/day. forward 배치 1회에 20 페이지 정도라 충분.
- 데이터 갱신 주기는 불확실. upsert 전략이라 큰 문제 없음.
