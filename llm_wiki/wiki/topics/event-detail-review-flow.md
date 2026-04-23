---
title: 상세·예약 플로우
type: topic
created: 2026-04-17
updated: 2026-04-22
sources: [2026-04-17_ui-flow-draft, 2026-04-17_requirements-v5]
related:
  - ../sources/2026-04-17_ui-flow-draft.md
  - ../sources/2026-04-17_requirements-v5.md
  - main-page-flow.md
  - news-article-pipeline.md
  - use-cases-index.md
---

# 상세·리뷰 플로우

> ⚠ 초기 해석 오류 정정: 와이어프레임의 "예약 페이지"는 실제로는 **마이페이지(A_500) 캘린더 + 리뷰 작성(A_501)** 화면이다. GGdrugs는 **예약/결제 기능 없음** — 요구사항정의서 v5.0에 예약·결제 유스케이스 부재 확인됨. 북마크(찜)만 존재.

## Summary

이벤트 상세 페이지(A_400) → 북마크 → 마이페이지 캘린더(A_500) → 리뷰 작성(A_501)의 사용자 전환 경로. 와이어프레임상 "예약 페이지"로 보이는 화면은 실제로는 마이페이지 캘린더의 이벤트 요약 팝업이다(와이어프레임 6-1).

## Key points

- **상세 페이지(A_400)** — 구현 완료:
  - 최상단 포스터 + 북마크 버튼.
  - 개요 / AI 요약 / mini map / **관련 기사 섹션** / 리뷰 섹션.
  - AI 비디오 섹션은 v5.0에서 제거됨.
  - 관련 기사 ingest: Naver 뉴스 검색 + Google News RSS fallback + embedding cosine rerank → `news-article-pipeline.md` 참조.
- **마이페이지 캘린더(A_500)** — 스펙 충족 구현(2026-04-21, `9fc959e`):
  - 월간 캘린더에 저장된 이벤트 배지. phase 별 점 색상 구분.
  - 배지 클릭 → 우측 팝업 `CalendarSummaryCard` 에 **이벤트명·장소·기간·가격·대상·요약(aiSummary)** 6필드 전부 노출.
  - 추가 UX 힌트: **관련 기사 N건** 배지 (articleCount > 0 일 때만, 스펙 밖).
  - 팝업 내 '상세 보기' → `/events/:id`, '리뷰 작성/수정' → `/events/:id#review` (리뷰 섹션으로 스크롤 + composer focus). GG-REVIEW-001 따라 phase==='ended' 일 때만 활성, 기존 리뷰 있으면 '수정' 레이블.
- **리뷰 작성(A_501)** — v5.0 신규:
  - **이벤트 종료일 이후에만 활성화** (GG-REVIEW-001).
  - 별점 1~5 필수 (GG-REVIEW-002).
  - 텍스트 필수, 최소 10자 권장 (GG-REVIEW-003).
  - 사진 ≤5장, JPG/PNG, 각 10MB 이하 (GG-REVIEW-004).
  - 1인 1이벤트 1리뷰, 수정·삭제 가능 (GG-REVIEW-005).
  - 상세페이지 사용자 리뷰 섹션에 노출 (GG-REVIEW-006).

## 관련 기사 노출 (UI, 2026-04-22 ship)

요약 패널 (A_300 사이드 패널) 과 상세 페이지 (A_400) 가 노출 깊이를 달리해 뉴스 매핑을 보여준다.
상세 파이프라인은 [news-article-pipeline.md](news-article-pipeline.md) — 여기서는 UI 면.

| 화면 | 컴포넌트 | 호출 | 노출 | 출처 |
|---|---|---|---|---|
| 메인 요약 패널 (A_300) | `ArticlesMiniList` (`apps/web/src/components/EventSummaryPanel.tsx`) | `fetchEventArticlesPage(id, { limit: 3, offset: 0 })` | top-3 미니 카드, total > 3 시 "전체 N건 보기" → 상세 이동 | 커밋 `03da473` |
| 이벤트 상세 (A_400) | `ArticlesSection` (`apps/web/src/pages/EventDetailPage/sections/ArticlesSection.tsx`) | `fetchEventArticlesPage(id, { limit: 5, offset: page*5 })` | 페이지당 5건 + 이전/다음 버튼 + total 배지 | 커밋 `03da473` |
| 캘린더 팝업 (A_500) | `CalendarSummaryCard` header 우측 | `_count.articleMappings` (이벤트 detail 응답에 동봉) | 배지 (count > 0 일 때만) | 기존 |

API 시그니처 (요약):
```
GET /events/:id/articles?limit=5&offset=0
→ { items: Article[], total, limit, offset }
  Article: { mappingId, title, sourceName, authorName, articleCategory,
             originalUrl, summary, publishedAt, relevanceScore, matchedAt }
```
정렬은 `relevance_score DESC, matched_at DESC`. 비공개·삭제 이벤트는 404. 자세한 정의는
[news-article-pipeline.md §BFF API](news-article-pipeline.md) 참조.

매핑이 0 건이면 ArticlesSection / ArticlesMiniList 모두 섹션 자체를 hide — 빈 슬롯으로
공간을 낭비하지 않는다.

## Open questions / contradictions

- ~~리뷰 작성 시점~~ → **해소**: 이벤트 종료일 이후 활성화(GG-REVIEW-001).
- ~~"예약 페이지" 해석~~ → **해소**: 예약 개념은 본 서비스에 없음, 북마크 + 리뷰만 존재.
- ~~A_500 팝업 스펙 미충족~~ → **해소** (2026-04-21): 6필드 전부 + 분리 CTA ship.
- ~~사진 첨부 매핑~~ → **해소**: `review_photos` 테이블 (review_id FK) 로 1:N 매핑, MinIO presigned PUT + 5장 제한 구현.
- ~~리뷰 sentiment 분류 시점~~ → **해소**: 저장 직후 fire-and-forget 으로 services/llm `/sentiment` 호출. 실패해도 리뷰 저장엔 영향 없음.

## References

- [2026-04-17_requirements-v5](../sources/2026-04-17_requirements-v5.md) — A_400, A_500, A_501
- [2026-04-17_ui-flow-draft](../sources/2026-04-17_ui-flow-draft.md) — 섹션 5(상세), 섹션 6(마이페이지 캘린더 + 리뷰; 원본 이미지상 "예약"으로 보이던 영역)
