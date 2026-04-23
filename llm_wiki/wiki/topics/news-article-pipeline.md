---
title: 뉴스 기사 ingest 파이프라인
type: topic
created: 2026-04-21
updated: 2026-04-22
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

저장 threshold (커밋 `c5301c8`, 2026-04-22 상향):
- **`MIN_SCORE_WITH_EMBEDDING = 0.60`** — embedding 결합 정상 경로
- **`MIN_SCORE_KEYWORD_ONLY = 0.55`** — embedding 불가 fallback 경로

근거: 0.55-0.60 밴드를 샘플링한 결과 노이즈 비율 ~50%, drift 지표(avg shared tokens)가
`0.55-0.60` 밴드에서 0.0 → `0.90+` 밴드에서 4.33 으로 단조 증가해 밴드 경계가 실 관련성과
일치. 기존 DB 의 `< 0.60` 매핑 779 행 DELETE 정리 완료.

### Embedding unavailable fallback
probe 로 `/embed` 500 확인 시 keyword-only 모드로 자동 전환. threshold 0.55 사용. UI 는 변경 없음.

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

## 자동화 (4-갈래)

### 1. 승인 훅 (realtime, 업로더 이벤트)
`apps/bff/src/routes/admin-uploaders.ts::decideEventUpload` 에서 `action==='approved'` 시 `runNewsNaverIngest({ onlyEventId })` fire-and-forget. 알림 fan-out 과 동일 트리거에 걸려있음.

### 2. daily-batch 후속 훅 (realtime, 공공 소스 이벤트)
공공 소스 이벤트는 admin 승인을 거치지 않으므로 승인 훅을 안 탄다 — 대신 일일 ingest 직후
`scheduler.ts::runAll()` 이 `runNewsNaverIngest({ onlyMissing: true, eventLimit: 'all' })` 를
직접 호출. 신규 이벤트가 다음 ingest 라운드까지 매핑 공백을 갖지 않도록 하는 부분.
→ [ingest-pipeline.md §후속 파이프라인](ingest-pipeline.md) 참조.

### 3. incremental backfill (CLI)
`pnpm --filter bff ingest:news:missing` — `event_article_mappings` 가 0 건인 approved 이벤트만 처리.
**주의**: 인자 없이 단독 실행은 50건 배치 한정. 전체 backfill 은 `--all --missing` 조합 사용.

### 4. 전체 리프레시 (algorithm 변경 시)
`pnpm --filter bff ingest:news:all` — 전체 강제 재매핑. 각 이벤트 처리 시 해당 이벤트의 기존 매핑 deleteMany 후 재 insert (stale 매핑 제거 보장, `97a51ce` fix).

## BFF API

- `GET /events/:id/articles?limit=5&offset=0` — relevance_score DESC, matchedAt DESC tiebreak.
  공개 이벤트(approved · 미삭제)만. limit ∈ [1,20] (기본 5), offset ∈ [0, 10_000] (기본 0).
  Response: `{ items: Article[], total, limit, offset }`. payload: mappingId, title, sourceName
  (url 도메인 첫 label), authorName, articleCategory, originalUrl, summary, publishedAt,
  relevanceScore, matchedAt.
- 호출자: 요약 패널은 `limit=3` 단일 요청 (top-3 미니 리스트), 상세 페이지는 `limit=5` + offset
  페이지네이션 (`apps/web/src/lib/api.ts::fetchEventArticlesPage`).

## UI

- **EventDetailPage** `ArticlesSection` — MiniMap 과 ReviewsSection 사이. 매핑이 없으면 섹션 자체 hide (공간 낭비 방지).
- **EventSummaryPanel** (A_300 메인 요약) — vibe 태그 row 에 "N 관련 기사" 배지.
- **CalendarSummaryCard** (A_500 캘린더 팝업) — header 우측에 "N 관련 기사" 배지.

## Health / 운영

- `_count.articleMappings` 로 이벤트별 매핑 수 노출 (BFF `/events/:id`, `/me/bookmarks` 응답).
- Naver API 키 없으면 no-op (로그 warn, error 아님).
- 스팸 필터 부재 — 현 threshold 0.60 (embedding 결합) / 0.55 (keyword-only) 가 최소 방어.
  추가 필요 시 광고·스폰서드 도메인 blacklist 도입.

## 품질 감사

threshold 위에 자동·수동 감사를 한 단계 더 둠 — 알고리즘이 바뀌면 분포가 즉시 드리프트하므로
숫자만 보고 안심할 수 없다.

### 자동 (스케줄러 + ingest 직후)
`apps/bff/src/jobs/audit-news-mappings.ts::auditMappingDistributionQuick()`:
- 호출 위치: ① `scheduler.ts::runAll()` 후속 파이프라인 5단계, ② `news-naver-ingest` runner 직후
  (ingest 결과가 들어온 직후 즉시 sanity check).
- 산출: `{ total, perBand[], staleBelowThreshold }`. 밴드 edges: `[0.50, 0.55, 0.60, 0.65, 0.70, 0.80, 0.90, 1.01]`.
- 경보: `staleBelowThreshold > 0` (즉, `< MIN_SCORE_WITH_EMBEDDING=0.60`) 이면 logger `warn`,
  아니면 `info`. fire-and-forget — 감사 실패가 ingest 자체를 실패시키지 않음.

### 수동 (CLI, 풀 리포트)
`pnpm --filter bff audit:news-mappings [--samples N] [--bands 0.55,0.60,...]`:
- 분포 표 + 드리프트 지표(밴드별 avg shared tokens) + 밴드별 랜덤 샘플 6건/밴드 (기본).
- stdout 마크다운 → `> wiki/audit/news-mappings-YYYY-MM-DD.md` 등으로 파일 저장 권장.
- 알고리즘/가중치 조정 직후 또는 신규 소스 추가 시 1회 실행해 base profile 확보.

### 스테일 정리 운영
`MIN_SCORE_WITH_EMBEDDING` 을 다시 올리는 결정이 나오면 자동 정리는 안 됨 — 수동으로
`DELETE FROM event_article_mappings WHERE relevance_score < <new_min>` 후 다음 ingest 라운드
재매핑 (현 0.60 상향 시 779 행 정리한 전례).

## Open questions

- ~~전체 이벤트 최초 backfill 아직 미실행~~ → **해소** (2026-04-22): 1,810/4,111 = 44% 커버리지,
  최종 7,473 매핑 (threshold 0.60 정리 후). 잔여는 매칭 가능한 기사가 없는 이벤트.
- 기사 retention 정책 미정 — 이벤트 종료 6개월 후에도 유지?
- ~~Score drift — 동일 이벤트가 재매핑될 때 score 가 크게 흔들리지 않는지 eval 필요~~ →
  부분 해소: 자동 감사가 분포 드리프트를 감시. 단, 동일 (eventId, articleId) 쌍의 score
  trajectory 추적은 미구현 — 알고리즘 변경 시 before/after 비교는 수동.

## References

- `apps/bff/src/jobs/news-naver-ingest.ts` — V2 파이프라인 본체
- `apps/bff/src/jobs/audit-news-mappings.ts` — 품질 감사 (CLI + quick variant)
- `apps/bff/src/routes/event-articles.ts` — 공개 API
- `apps/web/src/pages/EventDetailPage.tsx::ArticlesSection` — UI 페이징
- `apps/web/src/components/EventSummaryPanel.tsx::ArticlesMiniList` — 요약 패널 top-3
- [ingest-pipeline.md](ingest-pipeline.md) — 이벤트 크롤 파이프라인 (별개) + 후속 파이프라인 진입점
- [semantic-search.md](semantic-search.md) — embedding 인프라 공유 + 실시간 동기화 3축
