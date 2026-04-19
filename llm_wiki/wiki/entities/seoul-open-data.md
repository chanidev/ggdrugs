---
title: 서울열린데이터광장 (Seoul Open Data)
type: entity
created: 2026-04-19
updated: 2026-04-19
related:
  - ../topics/ingest-pipeline.md
---

# 서울열린데이터광장

## 역할

Alle 의 **주 이벤트 소스** — 서울시 문화행사·전시·공연·교육 등 전 카테고리 공급. 현재 DB 4k 행의 대부분이 이 소스.

## 사용 엔드포인트

- **Base**: `http://openapi.seoul.go.kr:8088/<KEY>/json/culturalEventInfo/...`
- **Positional path 포맷**: 시작 offset / 끝 offset / CODENAME / TITLE / DATE 형태. 러너가 직접 URL 구성.

## 카테고리 매핑 (`classifyCategory` in `seoul-culture-ingest.ts`)

서울 API 의 `CODENAME` (예: "축제-시민화합", "전시/미술", "공연/클래식") → Alle 8종 `event_categories.category_code`:
- 축제·행사 → `festival`
- 박람회·교류회 → `expo`
- 심포지움·학술대회 → `symposium`
- 컨퍼런스·포럼 → `conference`
- 전시/미술·역사·과학 → `exhibition`
- 공연/콘서트·연극·뮤지컬 → `performance`
- 교육·강연·체험 → `education`
- 영화 → `movie`

## 발급

https://data.seoul.go.kr → 로그인 → 공공데이터 → **일반 인증키 발급**. 디코딩된 raw 값 사용 (TourAPI 와 달리 encoded 아님).

## 환경변수

- `SEOUL_OPEN_API_KEY` (디코딩된 raw — **URL-encoding 적용 금지**)

## 알려진 quirk

- 날짜 포맷이 `YYYY-MM-DD HH:MM:SS.0` 등 여러 variant → 러너에 정규화 로직 (커밋 `f927fe7`).
- 일부 행 `LAT/LOT` 좌표 누락 → 지도 핀에서 제외 (lat/lng null).

## 장애 시 동작

- Key 부재: 러너 skip.
- HTTP 오류: 페이지별 retry 없음, skip.

## 제한

- 일 호출 건수: 표준 1000/day, 신청 연장 가능.
- 데이터 갱신 주기: 부정기 (기관별로 다름).
