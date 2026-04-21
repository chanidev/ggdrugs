# News + Embed Ingest Pipeline

> 27 nodes · cohesion 0.11

## Key Concepts

- **news-naver-ingest.ts** (14 connections) — `apps\bff\src\jobs\news-naver-ingest.ts`
- **embed-events.ts** (7 connections) — `apps\bff\src\jobs\embed-events.ts`
- **run-ingest.ts** (7 connections) — `apps\bff\src\jobs\run-ingest.ts`
- **processEvent()** (7 connections) — `apps\bff\src\jobs\news-naver-ingest.ts`
- **runEmbedEvents()** (5 connections) — `apps\bff\src\jobs\embed-events.ts`
- **summarize-events.ts** (4 connections) — `apps\bff\src\jobs\summarize-events.ts`
- **computeRelevance()** (3 connections) — `apps\bff\src\jobs\news-naver-ingest.ts`
- **normalize()** (3 connections) — `apps\bff\src\jobs\news-naver-ingest.ts`
- **runNewsNaverIngest()** (3 connections) — `apps\bff\src\jobs\news-naver-ingest.ts`
- **buildPayload()** (2 connections) — `apps\bff\src\jobs\embed-events.ts`
- **callEmbed()** (2 connections) — `apps\bff\src\jobs\embed-events.ts`
- **callUpsert()** (2 connections) — `apps\bff\src\jobs\embed-events.ts`
- **fetchExistingIds()** (2 connections) — `apps\bff\src\jobs\embed-events.ts`
- **cosine()** (2 connections) — `apps\bff\src\jobs\news-naver-ingest.ts`
- **embedBatch()** (2 connections) — `apps\bff\src\jobs\news-naver-ingest.ts`
- **fetchGoogleNewsRss()** (2 connections) — `apps\bff\src\jobs\news-naver-ingest.ts`
- **fetchNaverNews()** (2 connections) — `apps\bff\src\jobs\news-naver-ingest.ts`
- **probeEmbedding()** (2 connections) — `apps\bff\src\jobs\news-naver-ingest.ts`
- **significantTokens()** (2 connections) — `apps\bff\src\jobs\news-naver-ingest.ts`
- **buildEmbedText()** (1 connections) — `apps\bff\src\jobs\embed-events.ts`
- **parsePubDate()** (1 connections) — `apps\bff\src\jobs\news-naver-ingest.ts`
- **sourceFromUrl()** (1 connections) — `apps\bff\src\jobs\news-naver-ingest.ts`
- **stripHtml()** (1 connections) — `apps\bff\src\jobs\news-naver-ingest.ts`
- **main()** (1 connections) — `apps\bff\src\jobs\run-ingest.ts`
- **descriptionMd5()** (1 connections) — `apps\bff\src\jobs\summarize-events.ts`
- *... and 2 more nodes in this community*

## Relationships

- [[Ingest Jobs]] (3 shared connections)

## Source Files

- `apps\bff\src\jobs\embed-events.ts`
- `apps\bff\src\jobs\news-naver-ingest.ts`
- `apps\bff\src\jobs\run-ingest.ts`
- `apps\bff\src\jobs\summarize-events.ts`

## Audit Trail

- EXTRACTED: 81 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*