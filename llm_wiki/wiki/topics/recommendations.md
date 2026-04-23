---
title: 추천 시스템 (taste profile 기반)
type: topic
created: 2026-04-23
updated: 2026-04-23
sources: [2026-04-17_requirements-v5]
related:
  - db-schema-overview.md
  - subscriptions-notifications.md
  - semantic-search.md
  - ingest-pipeline.md
---

# 추천 시스템 (taste profile 기반)

## Summary

사용자의 북마크/리뷰 시그널을 일일 집계해 `user_taste_profiles` 에 저장 → `/me/recommendations` 가
3 dimension 매칭으로 향후 이벤트 추천. 추천 인프라 ship 은 G-5 (lint queue) — `user_taste_profiles`
테이블이 04-17 schema ship 이후 처음으로 사용처를 갖게 됨.

요구사항 v5.0 명시 추천 use case 는 없지만, 메인 페이지 / 마이페이지 의 사용자 retention 보강
용도로 추가. user_taste_profiles 의 KV 모델 (dimension 별 단일 value) 한도 안에서 단순 SQL OR
매칭 — Qdrant 기반 personalized kNN 같은 무거운 추천은 미도입 (premature).

## 3 Dimensions

`user_taste_profiles.taste_dimension` (VARCHAR(30)) 의 enum 3종 + 각 dimension 별 단일
`taste_value` (VARCHAR(30)) — `@@unique([userId, tasteDimension])` 제약.

| dimension | value 형식 | 출처 |
|---|---|---|
| `preferred_category` | `events.category_code` (예: 'festival', 'exhibition') | bookmarks + reviews 중 가장 많이 본 카테고리 |
| `preferred_region` | `regions.region_id` (BigInt → string) | 가장 많이 본 region (sigungu 단위) |
| `preferred_vibe` | `event_vibes.vibe_id` (BigInt → string) | 매핑 카운트 가장 많은 vibe label |

TIES tiebreak: `COUNT DESC, MAX(signal.created_at) DESC` (raw SQL).

## 일일 집계 (`apps/bff/src/jobs/aggregate-taste-profiles.ts`)

- 활성 user 정의: 최근 30일 안에 북마크 또는 비삭제 리뷰 작성한 user (활동 없는 user 는 skip — 비용 절약).
- 각 active user 에 대해 3 dimensions 계산:
  - 시그널 존재 → upsert
  - 시그널 0 → 기존 행 deleteMany (stale 정리)
- 트리거:
  - `scheduler.ts::runAll()` 후속 단계 7번 (daily-batch 의 마지막)
  - `pnpm aggregate:taste` CLI (수동)
- 실패는 try/catch warn — 다음 라운드 재시도. 추천 endpoint 가 graceful degrade.

## `GET /me/recommendations?limit=10` (apps/bff/src/routes/me-recommendations.ts)

알고리즘:
1. `user_taste_profiles` where userId = me, all dimensions 조회
2. WHERE OR (categoryCode = preferred_category) (regionId = preferred_region) (has vibe = preferred_vibe)
3. AND `approvalStatus='approved' AND isDeleted=false AND phase != 'ended'`
4. ORDER BY `startDate ASC, eventId ASC` LIMIT N

응답:
```jsonc
{
  "items": [
    {
      "eventId": "1234",
      "title": "...",
      "posterImageUrl": "...",
      "startDate": "2026-05-15",   // YYYY-MM-DD (bookmarks 패턴)
      "endDate": "2026-05-15",
      "phase": "upcoming",
      "categoryName": "축제",
      "region": { "sidoName": "서울", "sigunguName": "종로구", "fullAddress": "..." },
      "matchedDimensions": ["category", "region"]   // UI tooltip 용 — UNION 대신 explicit
    }
  ],
  "tasteSignals": { "preferred_category": "festival", "preferred_region": "5", ... },
  "reason": null   // 'no_taste_signals' (북마크/리뷰 0) | 'no_valid_signals' (손상값 only) | null
}
```

`matchedDimensions` 는 UI 가 "왜 추천됐는지" 표시 (예: `✦ 관심 종류` 칩). UNION 쿼리 대신
fetch 후 client-side 마킹 — Prisma 의 OR 가 단일 row 에 어떤 절이 매칭됐는지 모르기 때문.

## UI (`apps/web/src/pages/MyPage.tsx::RecommendationsList`)

마이페이지 5번째 탭 "추천". empty state 분기:
- `reason === 'no_taste_signals'` → "북마크/리뷰 시그널이 부족" 안내 + 매일 자동 갱신 설명
- `reason === 'no_valid_signals'` → 동일 (손상 데이터 케이스, 거의 발생 안 함)
- `items.length === 0` → "조건 맞는 신규 이벤트 없음"
- 정상 → `RecommendedCard` 카드 list. matchedDimensions 칩 노출 (✦ 관심 종류 / 관심 지역 / 관심 성향)

## Open questions

- 시그널 가중치 — bookmarks 와 reviews 를 동등 처리. 리뷰가 더 강한 시그널 (시간 투자 큼) 일 수 있는데
  현재는 단순 UNION ALL.
- 시간 감쇠 (time decay) — 1년 전 북마크와 어제 북마크가 동등 weight. exponential decay 도입 검토 후보.
- 다중 매칭 우선순위 — matchedDimensions 가 2개인 이벤트 (category + region 둘 다 매칭) 가 1개 매칭
  보다 우선시되지 않음 (단순 startDate 순). score 기반 정렬 후보.
- Qdrant 기반 추천 — semantic-search 인프라가 이미 있음. 사용자 북마크 이벤트들의 embedding mean
  → kNN search 로 더 정교한 추천 가능. 현재는 SQL OR 매칭 simple 버전. 트리거 (만족도 측정 지표
  도입 후) 도래 시 ADR 로 재평가.

## References

- `apps/bff/src/jobs/aggregate-taste-profiles.ts` — 일일 집계 본체
- `apps/bff/src/jobs/scheduler.ts::runAll()` — 후속 파이프라인 7단계 통합
- `apps/bff/src/routes/me-recommendations.ts` — 추천 endpoint
- `apps/web/src/pages/MyPage.tsx::RecommendationsList` — UI
- `pnpm --filter bff aggregate:taste` — CLI
