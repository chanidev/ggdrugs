---
title: 뉴스 기사 ingest 파이프라인
type: topic
created: 2026-04-21
updated: 2026-04-21
sources: [2026-04-17_requirements-v5]
related:
  - ingest-pipeline.md
  - semantic-search.md
  - ai-enrichment.md
  - event-detail-review-flow.md
---

# 뉴스 기사 ingest 파이프라인 (A_400 관련 기사)

## Summary

이벤트 상세 페이지 "관련 기사" 섹션에 노출할 뉴스 기사를 자동 수집 + 이벤트와 매핑하는 파이프라인. GG-DETAIL-002 에서 "관련 기사·이슈 링크를 별도 섹션에 표시" 를 요구. 소스는 **네이버 뉴스 검색 API** 가 주력(국내 언론사 혼합 커버리지) + **Google News RSS** fallback (결과 부족 시 보강). embedding cosine rerank 로 노이즈를 걸러낸다.

## DB

- `news_articles` — originalUrl UNIQUE (여러 이벤트에 공유 가능)
- `event_article_mappings` — (eventId, articleId) UNIQUE + relevance_score DECIMAL(5,4)

## Scoring (V2, 2026-04-21)

### 1차: keyword overlap heuristic
- 1.0 — 이벤트 제목 정규화 문자열이 기사 제목에 포함
- 0.7 — 2+ significant token(2자+, stopword 제외) 겹침
- 0.4 — 1개 token 만 겹침
- 0.0 — 겹침 없음 (즉시 drop, embedding 비용 낭비 방지)

### 2차: embedding cosine rerank
`services/llm /embed` 배치 호출 — event(`title + aiSummary`) + candidates(`title + description`) → cosine similarity → [0, 1] clamp.

### Final score
`0.4 * kw_score + 0.6 * emb_score`

저장 threshold: **0.55** (embedding 결합 시), **0.5** (embedding 불가 시).

### Embedding unavailable fallback
probe 로 `/embed` 500 확인 시 keyword-only 모드로 자동 전환. threshold 0.5 사용. UI 는 변경 없음.

## Sources

### 1. Naver 뉴스 검색 API (주력)
- `X-Naver-Client-Id` + `X-Naver-Client-Secret` 헤더
- `?query="{title}"&display=20&sort=sim` — 정확 매치 우선, 비면 unquoted 재시도
- 일일 한도 25k calls, 10 req/s rate limit
- 결과 items: title, originallink, link, description, pubDate
- HTML 태그(`<b>` 하이라이트) stripHtml 로 제거

### 2. Google News RSS (fallback)
- `https://news.google.com/rss/search?q={query} when:30d&hl=ko&gl=KR&ceid=KR:ko`
- Naver pre-filter 결과 < 3 건일 때만 호출
- 간이 XML regex 파서 (외부 deps 회피) — Google News RSS 의 단순 구조에 충분
- 해외 언론사 + Naver 미색인 소스 보강

## 자동화 (3-갈래)

### 1. 승인 훅 (realtime)
`apps/bff/src/routes/admin-uploaders.ts::decideEventUpload` 에서 `action==='approved'` 시 `runNewsNaverIngest({ onlyEventId })` fire-and-forget. 알림 fan-out 과 동일 트리거에 걸려있음.

### 2. incremental backfill
`pnpm --filter bff ingest:news:missing` — `event_article_mappings` 가 0 건인 approved 이벤트만 처리. 주기 cron (예: 일 03:00) 으로 누락 방지.

### 3. 전체 리프레시 (algorithm 변경 시)
`pnpm --filter bff ingest:news:all` — 전체 강제 재매핑. 각 이벤트 처리 시 해당 이벤트의 기존 매핑 deleteMany 후 재 insert (stale 매핑 제거 보장, `97a51ce` fix).

## BFF API

- `GET /events/:id/articles?limit=5` — relevance_score DESC, 공개 이벤트만. payload: mappingId, title, sourceName (url 도메인 첫 label), authorName, articleCategory, originalUrl, summary, publishedAt, relevanceScore, matchedAt.

## UI

- **EventDetailPage** `ArticlesSection` — MiniMap 과 ReviewsSection 사이. 매핑이 없으면 섹션 자체 hide (공간 낭비 방지).
- **EventSummaryPanel** (A_300 메인 요약) — vibe 태그 row 에 "N 관련 기사" 배지.
- **CalendarSummaryCard** (A_500 캘린더 팝업) — header 우측에 "N 관련 기사" 배지.

## Health / 운영

- `_count.articleMappings` 로 이벤트별 매핑 수 노출 (BFF `/events/:id`, `/me/bookmarks` 응답).
- Naver API 키 없으면 no-op (로그 warn, error 아님).
- 스팸 필터 부재 — 현 threshold 0.55 가 최소 방어. 추가 필요 시 광고·스폰서드 도메인 blacklist 도입.

## Open questions

- 전체 이벤트 최초 backfill 아직 미실행(~90분). 메모리에 "News backfill pending" 로 기록됨.
- 기사 retention 정책 미정 — 이벤트 종료 6개월 후에도 유지?
- Score drift — 동일 이벤트가 재매핑될 때 score 가 크게 흔들리지 않는지 eval 필요.

## References

- `apps/bff/src/jobs/news-naver-ingest.ts` — V2 파이프라인 본체
- `apps/bff/src/routes/event-articles.ts` — 공개 API
- `apps/web/src/pages/EventDetailPage.tsx::ArticlesSection` — UI
- [ingest-pipeline.md](ingest-pipeline.md) — 이벤트 크롤 파이프라인 (별개)
- [semantic-search.md](semantic-search.md) — embedding 인프라 공유
