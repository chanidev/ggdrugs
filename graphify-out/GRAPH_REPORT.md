# Graph Report - .  (2026-04-19)

## Corpus Check
- 44 files · ~72,098 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 491 nodes · 608 edges · 71 communities detected
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 73 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]

## God Nodes (most connected - your core abstractions)
1. `UI 플로우 와이어프레임 초안 (전체 문서)` - 23 edges
2. `ADR 0001 — DDL v3 ↔ Terminology v5 Reconciliation` - 18 edges
3. `Use Cases Index (A_100~A_700)` - 15 edges
4. `Tech Stack` - 12 edges
5. `withCredentials()` - 11 edges
6. `UI Architecture (current)` - 11 edges
7. `5 Filter Types` - 10 edges
8. `Roles & active_role` - 10 edges
9. `Line Monogram Logo (frame + A stroke + vermilion crossbar)` - 10 edges
10. `ADR 0001 Terminology Reconciliation` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Tech Stack` --semantically_similar_to--> `Production Required Keys Guard`  [INFERRED] [semantically similar]
  llm_wiki/wiki/topics/tech-stack.md → packages/config/README.md
- `Alle Brand Handoff README` --semantically_similar_to--> `Community: UI Wireframe Flows (32 nodes, cohesion 0.11)`  [INFERRED] [semantically similar]
  llm_wiki\raw\design_handoff_alle_brand\README.md → graphify-out\GRAPH_REPORT.md
- `LLM Wiki + graphify Setup Guide` --semantically_similar_to--> `LLM Wiki 사용법`  [INFERRED] [semantically similar]
  llm_wiki_셋업가이드.md → llm_wiki/사용법.md
- `Rejected: Anthropic (no embeddings)` --semantically_similar_to--> `Provider Abstraction Layer`  [INFERRED] [semantically similar]
  llm_wiki/wiki/topics/adr-0002-stack-decisions.md → services/llm/README.md
- `Crossbar uses var(--color-accent) = #E8562D only` --semantically_similar_to--> `Vermilion single accent (#E8562D) — existing design token`  [INFERRED] [semantically similar]
  llm_wiki\raw\design_handoff_alle_brand\README.md → DESIGN.md

## Hyperedges (group relationships)
- **8-category taxonomy** — bff_type_EventCategoryCode, bff_event_type_enum_8, bff_fn_classifyCategory, bff_migration_expand_categories [EXTRACTED 0.95]
- **/events/:id detail response shape** — bff_fn_getEventDetail, bff_event_detail_response_shape, bff_event_detail_source_block, web_type_BffEventDetail [EXTRACTED 0.90]
- **Lookup endpoints for filter dropdowns** — bff_fn_listRegions, bff_fn_listVibes, web_filter_search_panel_bootstrap [EXTRACTED 0.90]
- **AppShell 3-state separation (mapFilter + highlightRegionIds + selectedEventId)** — state_map_filter, state_highlight_region_ids, state_selected_event_id, cb_on_applied, cb_on_region_sel_change [EXTRACTED 1.00]
- **Region polygon highlight pipeline (chip → callback → state → Polygon + pulse)** — cb_on_region_sel_change, state_highlight_region_ids, seoul_map_prop_highlight, polygon_highlight, polygon_pulse [EXTRACTED 1.00]
- **Event detail flow (card/pin click → navigate → fetchEventDetail → EventDetailPage)** — pin_popup_on_open, route_events_detail, api_fetch_event_detail, event_detail_page [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (43): Issue #1 approval_status enum unify, Issue #2 users.active_role column, Issue #3 admin_profiles table, Issue #4 expected_companion rename, Issue #5 event_vibes rename, Issue #6 review_photos table, Issue #7 event_subscriptions table, ADR 0001 — DDL v3 ↔ Terminology v5 Reconciliation (+35 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (37): A_700 Dual-Tab Structure, Event Approval Queue, LLM Delegation Guardrail (CLAUDE.md §6-4), Admin Flow, Decision #2: users.active_role column, Decision #3: admin_profiles table, Rationale: Phase 1 22-table baseline, ADR 0001 Terminology Reconciliation (+29 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (37): Decision #4: expected_companion rename, Decision #6: review_photos table, review_photos table (new), reviews table, Event Detail & Review Flow, Filter: companion_type, Filter: event_type, Filter: period (+29 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (36): Asset: favicon.svg (thicker strokes for 16px), Asset: logo-lockup.svg (260×84, mark + Alle + SEOUL), Asset: logo-mark.svg (84×84), Brand Name: Alle (replaces GGdrugs), Alle rollout checklist (8 items), DESIGN.md patch — new Brand section under Product Context, Alle Brand Handoff README, Crossbar uses var(--color-accent) = #E8562D only (+28 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (33): D-1 MinIO object storage, D-2 OpenAI single LLM provider, D-3 Qdrant single vector store, Rationale: S3-compat enables migration, Rejected: Anthropic (no embeddings), Rejected: pgvector single, BFF runtime dependencies, apps/bff README (+25 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (32): UI 컴포넌트: 자연어 채팅 검색 입력창, UI 컴포넌트: 이벤트 상세 카드, UI 컴포넌트: 필터 패널 (5종 필터), UI 컴포넌트: 카카오 지도 뷰 (행정구역 레이어), UI 컴포넌트: 지역 목록 사이드 패널, 플로우: 관리자 (이벤트 승인/반려/라벨 부여), 플로우: 일반 사용자 (지도 → 검색 → 상세 → 북마크), 플로우: 업로더 (역할 부여 → 이벤트 등록 → 승인 대기) (+24 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (18): classifyCategory(), externalIdOf(), fetchPage(), parsePeriod(), parseResultCode(), parseTotalCount(), parseXmlItems(), runKcisaIngest() (+10 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (9): listEventReviews(), parseIntClamp(), listEvents(), parseBigIntCsv(), parseCsv(), parseIntClamp(), parsePeriod(), parseSid() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (18): Ink Black #1A1A1A (Primary Stroke), Muted Gray #999999 (Locale Tag), Alle Orange #E8562D (Accent Crossbar), Alle Favicon (Bolder Stroke Variant), Locale Tag 'SEOUL' (JetBrains Mono 500, 14px, tracking 2), Lockup ViewBox 260x84 (horizontal composition), Alle Logo Lockup (Mark + Wordmark + Locale), A-Apex Path (M22 64 L42 22 L62 64) (+10 more)

### Community 9 - "Community 9"
Cohesion: 0.15
Nodes (15): DESIGN.md Brand section, Logo spec — Line Monogram (frame + A + vermilion crossbar), Logo usage rules (Do/Don't, favicon stroke variant), WHY: stroke-only + currentColor so logo works on any surface and auto-inverts in dark mode, WHY: 24px min size — strokes blur below that, fallback to vermilion dot, WHY: Pretendard single family — Inter/Roboto breaks Noto Sans KR fallback weight/spacing, WHY: single vermilion accent (avoid AI slop, Korean traditional color, red-pin memorability), Brand voice + tagline (editorial, travel-guide paper map + Korean editorial) (+7 more)

### Community 10 - "Community 10"
Cohesion: 0.31
Nodes (12): clearSessionCookie(), devLogin(), googleCallback(), googleRedirectUri(), issueSessionAndRedirect(), logout(), makeSessionId(), me() (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.29
Nodes (12): buildQuery(), createEventReview(), devLogin(), fetchEventDetail(), fetchEventReviews(), fetchEvents(), fetchEventsStats(), fetchMe() (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (9): computePhase(), existsInOtherOrigin(), extractSeoulGu(), getCategoryId(), isForwardLooking(), resolveSeoulRegionId(), todayUtcMidnight(), todayYmd() (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (12): Decision #1: on_hold → revision_requested, Decision #5: event_vibes rename, approval_status enum, approval_documents table, approval_logs table, event_vibe_assignments table, event_vibes table, events table (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.27
Nodes (10): Wiki invariants (raw append-only, 1:1 sources), LLM Wiki raw/ readme, LLM Wiki README, LLM Wiki Schema, LLM Wiki + graphify Setup Guide, Three-layer architecture (raw/wiki/schema), LLM Wiki 사용법, CLAUDE.md auto-load hook (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.29
Nodes (2): onCreated(), submit()

### Community 16 - "Community 16"
Cohesion: 0.47
Nodes (3): apply(), computePeriodRange(), isoDate()

### Community 17 - "Community 17"
Cohesion: 0.53
Nodes (4): formatDateRange(), fromBffItem(), hashToColor(), shortRegion()

### Community 18 - "Community 18"
Cohesion: 0.4
Nodes (6): EnvValidationError, loadEnv (full validation), loadPartial (per-service schema), env (BffEnv instance), pino logger (env-aware), prisma (PrismaClient singleton)

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (6): Registered Domain: http://localhost:5173 (Vite dev server), Registered Domain: http://localhost:9999 (Primary / 기본), Domain-Only Registration Rule (paths stripped, e.g. https://www.example.com/mypage → https://example.com), Kakao Developers App Platform/Web Domain Settings (inferred), Primary Domain Badge (기본), Web Domain Configuration Panel

### Community 20 - "Community 20"
Cohesion: 0.4
Nodes (1): ErrorBoundary

### Community 21 - "Community 21"
Cohesion: 0.4
Nodes (5): Event state machine (pending → approved → ended / rejected / revision_requested), Terminology — event/event_type/event_vibe/companion_type/expected_companion, event_tendency_labels — vibe master table, WHY: AI video generation removed in v5.0, 요구사항정의서 Ⅴ. 용어집 — canonical column/enum names

### Community 22 - "Community 22"
Cohesion: 0.5
Nodes (4): Brand implementation references (Logo.tsx + public SVGs + handoff), apps/web/public/favicon.svg (thicker-stroke variant), apps/web/public/logo-lockup.svg (raw lockup asset), apps/web/public/logo-mark.svg (raw Line Monogram asset)

### Community 23 - "Community 23"
Cohesion: 0.5
Nodes (4): events table — unified crawled + uploaded via source_type, WHY: soft delete on users/events/reviews for recovery + partial index perf, WHY: single events table + source_type — avoids dual query paths, A_501 이벤트 리뷰 작성 — new review flow (wireframe 6-1)

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 0.67
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 0.67
Nodes (3): Aesthetic — editorial + map-first (no mall), 결정: 예약/결제 UI 제외 (v5.0), Pretendard 단일 패밀리 전략

### Community 30 - "Community 30"
Cohesion: 0.67
Nodes (3): Decision #7: event_subscriptions table, event_subscriptions table (new), notifications table

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (3): DB 설계 명세서 v3 (2026-04), God node: ADR 0001 DDL v3 ↔ Terminology v5 (18 edges), 요구사항정의서 v5.0 (장원팀, 2026-04)

### Community 32 - "Community 32"
Cohesion: 0.67
Nodes (3): Filter 5 fixed — region/period/companion/event_type/event_vibe, WHY: filter 5 unified — region/period/companion/type/vibe (prevent ad-hoc filters), A_203 예정 이벤트 조회 — new upcoming-events tab

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (2): /api → localhost:3000 proxy (rewrite strip), HealthBadge (BFF /api/health poll)

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (2): Map pin component tokens, Signature — 핀 클러스터 분해 애니메이션

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (2): Vermilion single accent (#E8562D), 결정: 버밀리언 단색 accent 근거

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (2): Do-not-edit: package/repo names (@ggdrugs/web, ggdrugs repo), Rationale: skip repo/package rename to avoid full-repo churn

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (2): Do-not-edit: DB schema, env keys, internal identifiers, DB v3: 20 tables (regions, users, uploader_profiles, events, ...)

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (2): v5.0 changes: +A_203, +A_501, +용어집, filter-term unification, −AI video, Filter terminology: 지역/기간/인원구성/이벤트 종류/이벤트 성향

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (2): DB v3 term: event_tendency_labels (renamed to event_vibes in ADR 0001), Term: event_vibe (event vibe labels, admin-assigned)

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (2): Three roles: user / uploader / admin with active_role toggle, users + uploader_profiles 1:1 — single-account multi-role

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (1): BFF env schema (merged)

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (1): Vite config (React + Tailwind + BFF proxy)

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (1): VITE_KAKAO_MAP_JS_KEY env typing

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (1): 필터 5종 (region/period/companion/type/vibe)

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (1): graphify rule: read GRAPH_REPORT first

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (1): gstack workflow Think→Plan→Build→Review→Test→Ship→Reflect

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (1): phase badge tokens (upcoming/ongoing/ended)

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (1): chat_messages table

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (1): search_logs table

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (1): Term: period

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (1): Do-not-edit: color/type/radius/shadow/motion tokens already correct

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (1): Pending decision: rename @ggdrugs/web → @alle/web? (default no)

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (1): Pending decision: href='/' vs react-router <Link> in Logo anchor

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (1): Term: companion_type {혼자, 연인, 친구, 가족}

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (1): God node: UI 플로우 와이어프레임 초안 (23 edges)

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (1): Alle Logo Mark (served, apps/web/public/)

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (1): Alle Favicon (served, apps/web/public/)

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (1): Alle Logo Lockup (served, apps/web/public/)

## Knowledge Gaps
- **154 isolated node(s):** `BFF env schema (merged)`, `pino logger (env-aware)`, `prisma (PrismaClient singleton)`, `Vite config (React + Tailwind + BFF proxy)`, `/api → localhost:3000 proxy (rewrite strip)` (+149 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 33`** (2 nodes): `/api → localhost:3000 proxy (rewrite strip)`, `HealthBadge (BFF /api/health poll)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (2 nodes): `ChatDock.tsx`, `ChatDock()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (2 nodes): `ChatHelpPanel.tsx`, `ChatHelpPanel()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `FullListPanel.tsx`, `phaseCount()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (2 nodes): `Icon.tsx`, `Icon()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (2 nodes): `OverlayPanel.tsx`, `OverlayPanel()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (2 nodes): `PhaseBadge.tsx`, `PhaseBadge()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `Map pin component tokens`, `Signature — 핀 클러스터 분해 애니메이션`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `Vermilion single accent (#E8562D)`, `결정: 버밀리언 단색 accent 근거`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (2 nodes): `Do-not-edit: package/repo names (@ggdrugs/web, ggdrugs repo)`, `Rationale: skip repo/package rename to avoid full-repo churn`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (2 nodes): `Do-not-edit: DB schema, env keys, internal identifiers`, `DB v3: 20 tables (regions, users, uploader_profiles, events, ...)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (2 nodes): `v5.0 changes: +A_203, +A_501, +용어집, filter-term unification, −AI video`, `Filter terminology: 지역/기간/인원구성/이벤트 종류/이벤트 성향`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `DB v3 term: event_tendency_labels (renamed to event_vibes in ADR 0001)`, `Term: event_vibe (event vibe labels, admin-assigned)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (2 nodes): `Three roles: user / uploader / admin with active_role toggle`, `users + uploader_profiles 1:1 — single-account multi-role`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `BFF env schema (merged)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `Vite config (React + Tailwind + BFF proxy)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `VITE_KAKAO_MAP_JS_KEY env typing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `EventList.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `Poster.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `mock.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `Header.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `필터 5종 (region/period/companion/type/vibe)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `graphify rule: read GRAPH_REPORT first`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `gstack workflow Think→Plan→Build→Review→Test→Ship→Reflect`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `phase badge tokens (upcoming/ongoing/ended)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `chat_messages table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `search_logs table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `Term: period`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `Do-not-edit: color/type/radius/shadow/motion tokens already correct`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `Pending decision: rename @ggdrugs/web → @alle/web? (default no)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `Pending decision: href='/' vs react-router <Link> in Logo anchor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `Term: companion_type {혼자, 연인, 친구, 가족}`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `God node: UI 플로우 와이어프레임 초안 (23 edges)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `Alle Logo Mark (served, apps/web/public/)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `Alle Favicon (served, apps/web/public/)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `Alle Logo Lockup (served, apps/web/public/)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ADR 0002 — Stack Decisions (MinIO/OpenAI/Qdrant)` connect `Community 0` to `Community 4`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `Tech Stack` connect `Community 1` to `Community 2`, `Community 4`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **What connects `BFF env schema (merged)`, `pino logger (env-aware)`, `prisma (PrismaClient singleton)` to the rest of the system?**
  _154 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._