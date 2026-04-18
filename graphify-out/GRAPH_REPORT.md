# Graph Report - .  (2026-04-18)

## Corpus Check
- 0 files · ~0 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 439 nodes · 549 edges · 50 communities detected
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 91 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Admin Approval & Reviews|Admin Approval & Reviews]]
- [[_COMMUNITY_Alle Brand System|Alle Brand System]]
- [[_COMMUNITY_ADR 0001 & Terminology|ADR 0001 & Terminology]]
- [[_COMMUNITY_BFF Stack Decisions|BFF Stack Decisions]]
- [[_COMMUNITY_BFF API + CORS|BFF API + CORS]]
- [[_COMMUNITY_UI Wireframe Flows|UI Wireframe Flows]]
- [[_COMMUNITY_DB Schema & Review Flow|DB Schema & Review Flow]]
- [[_COMMUNITY_Brand Rationale (WHY)|Brand Rationale (WHY)]]
- [[_COMMUNITY_Env Schemas|Env Schemas]]
- [[_COMMUNITY_Alle Logo Geometry|Alle Logo Geometry]]
- [[_COMMUNITY_BFF Source Files|BFF Source Files]]
- [[_COMMUNITY_Event Approval Tables|Event Approval Tables]]
- [[_COMMUNITY_LLM Wiki Architecture|LLM Wiki Architecture]]
- [[_COMMUNITY_Config Package|Config Package]]
- [[_COMMUNITY_Kakao Dev Domain Config|Kakao Dev Domain Config]]
- [[_COMMUNITY_BFF Invariants (do-not-edit)|BFF Invariants (do-not-edit)]]
- [[_COMMUNITY_Event State & Terms|Event State & Terms]]
- [[_COMMUNITY_events table Unification (WHY)|events table Unification (WHY)]]
- [[_COMMUNITY_FilterSearchPanel|FilterSearchPanel]]
- [[_COMMUNITY_Header Component|Header Component]]
- [[_COMMUNITY_Event Subscriptions|Event Subscriptions]]
- [[_COMMUNITY_Source Documents|Source Documents]]
- [[_COMMUNITY_Logo.tsx AST|Logo.tsx AST]]
- [[_COMMUNITY_Filter 5 Unification (WHY)|Filter 5 Unification (WHY)]]
- [[_COMMUNITY_ChatDock|ChatDock]]
- [[_COMMUNITY_FullListPanel|FullListPanel]]
- [[_COMMUNITY_HealthBadge|HealthBadge]]
- [[_COMMUNITY_AppShell|AppShell]]
- [[_COMMUNITY_Sidebar|Sidebar]]
- [[_COMMUNITY_Vermilion Accent|Vermilion Accent]]
- [[_COMMUNITY_Naming Preservation|Naming Preservation]]
- [[_COMMUNITY_Event Vibe Rename|Event Vibe Rename]]
- [[_COMMUNITY_v5.0 Filter Revisions|v5.0 Filter Revisions]]
- [[_COMMUNITY_Three-Role Toggle (WHY)|Three-Role Toggle (WHY)]]
- [[_COMMUNITY_Vite Config|Vite Config]]
- [[_COMMUNITY_Web Entry Point|Web Entry Point]]
- [[_COMMUNITY_Vite Env Types|Vite Env Types]]
- [[_COMMUNITY_EventList|EventList]]
- [[_COMMUNITY_SeoulMap|SeoulMap]]
- [[_COMMUNITY_Vite Build Config|Vite Build Config]]
- [[_COMMUNITY_Graphify Rule|Graphify Rule]]
- [[_COMMUNITY_Gstack Workflow|Gstack Workflow]]
- [[_COMMUNITY_chat_messages|chat_messages]]
- [[_COMMUNITY_search_logs|search_logs]]
- [[_COMMUNITY_Term period|Term: period]]
- [[_COMMUNITY_Term companion_type|Term: companion_type]]
- [[_COMMUNITY_UI Draft God Node|UI Draft God Node]]
- [[_COMMUNITY_Served Logo Mark|Served Logo Mark]]
- [[_COMMUNITY_Served Favicon|Served Favicon]]
- [[_COMMUNITY_Served Logo Lockup|Served Logo Lockup]]

## God Nodes (most connected - your core abstractions)
1. `UI 플로우 와이어프레임 초안 (전체 문서)` - 23 edges
2. `ADR 0001 — DDL v3 ↔ Terminology v5 Reconciliation` - 18 edges
3. `Use Cases Index (A_100~A_700)` - 15 edges
4. `Tech Stack` - 12 edges
5. `UI Architecture (current)` - 11 edges
6. `listEvents (GET /events handler)` - 10 edges
7. `5 Filter Types` - 10 edges
8. `Roles & active_role` - 10 edges
9. `Line Monogram Logo (frame + A stroke + vermilion crossbar)` - 10 edges
10. `ADR 0001 Terminology Reconciliation` - 9 edges

## Surprising Connections (you probably didn't know these)
- `LogoMark (Line Monogram SVG component)` --semantically_similar_to--> `Alle Brand System (existing community)`  [INFERRED] [semantically similar]
  apps/web/src/components/brand/Logo.tsx → DESIGN.md
- `LogoLockup (mark + Alle + SEOUL)` --semantically_similar_to--> `Alle Brand System (existing community)`  [INFERRED] [semantically similar]
  apps/web/src/components/brand/Logo.tsx → DESIGN.md
- `Production Required Keys Guard` --semantically_similar_to--> `Tech Stack`  [INFERRED] [semantically similar]
  packages/config/README.md → llm_wiki/wiki/topics/tech-stack.md
- `listEvents (GET /events handler)` --implements--> `필터 5종 (region/period/companion/type/vibe)`  [INFERRED]
  apps\bff\src\routes\events.ts → CLAUDE.md
- `SeoulMap (Kakao Maps)` --implements--> `Map pin component tokens`  [INFERRED]
  apps\web\src\components\SeoulMap.tsx → DESIGN.md

## Hyperedges (group relationships)
- **Alle rebrand landing (files edited for GGdrugs→Alle rename)** — README_alle_title, apps_web_README_alle, claude_CLAUDE_alle_rebrand, DESIGN_brand_section, Header_Header [INFERRED 0.85]
- **Logo component ↔ SVG asset ↔ brand spec wiring** — Logo_LogoMark, public_logo_mark_svg, DESIGN_logo_line_monogram, DESIGN_brand_impl_refs [INFERRED 0.90]
- **Alle Brand System community — logo + wordmark + voice + impl refs** — DESIGN_logo_line_monogram, DESIGN_wordmark, DESIGN_voice_tagline, DESIGN_logo_usage_rules, DESIGN_brand_impl_refs, alle_brand_system_community [INFERRED 0.90]
- **Alle Brand Assets Served by Vite** — web_public_logo_mark, web_public_favicon, web_public_logo_lockup [EXTRACTED 0.95]

## Communities

### Community 0 - "Admin Approval & Reviews"
Cohesion: 0.06
Nodes (47): A_700 Dual-Tab Structure, Event Approval Queue, LLM Delegation Guardrail (CLAUDE.md §6-4), Admin Flow, Decision #2: users.active_role column, Decision #3: admin_profiles table, Decision #4: expected_companion rename, Rationale: Phase 1 22-table baseline (+39 more)

### Community 1 - "Alle Brand System"
Cohesion: 0.05
Nodes (46): Asset: favicon.svg (thicker strokes for 16px), Asset: logo-lockup.svg (260×84, mark + Alle + SEOUL), Asset: logo-mark.svg (84×84), Brand Name: Alle (replaces GGdrugs), Alle rollout checklist (8 items), LogoLockup (React component), LogoMark (React component), New component: apps/web/src/components/brand/Logo.tsx (+38 more)

### Community 2 - "ADR 0001 & Terminology"
Cohesion: 0.07
Nodes (43): Issue #1 approval_status enum unify, Issue #2 users.active_role column, Issue #3 admin_profiles table, Issue #4 expected_companion rename, Issue #5 event_vibes rename, Issue #6 review_photos table, Issue #7 event_subscriptions table, ADR 0001 — DDL v3 ↔ Terminology v5 Reconciliation (+35 more)

### Community 3 - "BFF Stack Decisions"
Cohesion: 0.06
Nodes (36): D-1 MinIO object storage, D-2 OpenAI single LLM provider, D-3 Qdrant single vector store, Rationale: S3-compat enables migration, Rejected: Anthropic (no embeddings), Rejected: pgvector single, BFF runtime dependencies, apps/bff README (+28 more)

### Community 4 - "BFF API + CORS"
Cohesion: 0.08
Nodes (35): createApp (Express factory), Express JSON error handler, GET /events endpoint, GET /health endpoint, 필터 5종 (region/period/companion/type/vibe), Aesthetic — editorial + map-first (no mall), 결정: 예약/결제 UI 제외 (v5.0), phase badge tokens (upcoming/ongoing/ended) (+27 more)

### Community 5 - "UI Wireframe Flows"
Cohesion: 0.11
Nodes (32): UI 컴포넌트: 자연어 채팅 검색 입력창, UI 컴포넌트: 이벤트 상세 카드, UI 컴포넌트: 필터 패널 (5종 필터), UI 컴포넌트: 카카오 지도 뷰 (행정구역 레이어), UI 컴포넌트: 지역 목록 사이드 패널, 플로우: 관리자 (이벤트 승인/반려/라벨 부여), 플로우: 일반 사용자 (지도 → 검색 → 상세 → 북마크), 플로우: 업로더 (역할 부여 → 이벤트 등록 → 승인 대기) (+24 more)

### Community 6 - "DB Schema & Review Flow"
Cohesion: 0.11
Nodes (24): Decision #6: review_photos table, review_photos table (new), reviews table, Event Detail & Review Flow, GG-REVIEW-001 (post-end activation), Main Page Flow, LLM: Review Sentiment Analysis, Kakao Maps / Kakao REST API (+16 more)

### Community 7 - "Brand Rationale (WHY)"
Cohesion: 0.12
Nodes (23): Brand implementation references (Logo.tsx + public SVGs + handoff), DESIGN.md Brand section, Logo spec — Line Monogram (frame + A + vermilion crossbar), Logo usage rules (Do/Don't, favicon stroke variant), WHY: stroke-only + currentColor so logo works on any surface and auto-inverts in dark mode, WHY: 24px min size — strokes blur below that, fallback to vermilion dot, WHY: Pretendard single family — Inter/Roboto breaks Noto Sans KR fallback weight/spacing, WHY: single vermilion accent (avoid AI slop, Korean traditional color, red-pin memorability) (+15 more)

### Community 8 - "Env Schemas"
Cohesion: 0.12
Nodes (19): EnvValidationError, coreSchema (NODE_ENV, LOG_LEVEL), databaseSchema (DATABASE_URL + postgres creds), externalApiSchema (Kakao/Google), fullSchema (all merged), loadEnv (full validation), loadPartial (per-service schema), openaiSchema (+11 more)

### Community 9 - "Alle Logo Geometry"
Cohesion: 0.16
Nodes (18): Ink Black #1A1A1A (Primary Stroke), Muted Gray #999999 (Locale Tag), Alle Orange #E8562D (Accent Crossbar), Alle Favicon (Bolder Stroke Variant), Locale Tag 'SEOUL' (JetBrains Mono 500, 14px, tracking 2), Lockup ViewBox 260x84 (horizontal composition), Alle Logo Lockup (Mark + Wordmark + Locale), A-Apex Path (M22 64 L42 22 L62 64) (+10 more)

### Community 10 - "BFF Source Files"
Cohesion: 0.28
Nodes (5): listEvents(), parseBigIntCsv(), parseCsv(), parseIntClamp(), parsePeriod()

### Community 11 - "Event Approval Tables"
Cohesion: 0.18
Nodes (12): Decision #1: on_hold → revision_requested, Decision #5: event_vibes rename, approval_status enum, approval_documents table, approval_logs table, event_vibe_assignments table, event_vibes table, events table (+4 more)

### Community 12 - "LLM Wiki Architecture"
Cohesion: 0.27
Nodes (10): Wiki invariants (raw append-only, 1:1 sources), LLM Wiki raw/ readme, LLM Wiki README, LLM Wiki Schema, LLM Wiki + graphify Setup Guide, Three-layer architecture (raw/wiki/schema), LLM Wiki 사용법, CLAUDE.md auto-load hook (+2 more)

### Community 13 - "Config Package"
Cohesion: 0.33
Nodes (1): EnvValidationError

### Community 14 - "Kakao Dev Domain Config"
Cohesion: 0.33
Nodes (6): Registered Domain: http://localhost:5173 (Vite dev server), Registered Domain: http://localhost:9999 (Primary / 기본), Domain-Only Registration Rule (paths stripped, e.g. https://www.example.com/mypage → https://example.com), Kakao Developers App Platform/Web Domain Settings (inferred), Primary Domain Badge (기본), Web Domain Configuration Panel

### Community 15 - "BFF Invariants (do-not-edit)"
Cohesion: 0.33
Nodes (6): Do-not-edit: DB schema, env keys, internal identifiers, cors middleware (BFF), createApp (Express factory), GET /health endpoint (BFF), Root endpoint service name 'ggdrugs-bff', DB v3: 20 tables (regions, users, uploader_profiles, events, ...)

### Community 16 - "Event State & Terms"
Cohesion: 0.4
Nodes (5): Event state machine (pending → approved → ended / rejected / revision_requested), Terminology — event/event_type/event_vibe/companion_type/expected_companion, event_tendency_labels — vibe master table, WHY: AI video generation removed in v5.0, 요구사항정의서 Ⅴ. 용어집 — canonical column/enum names

### Community 17 - "events table Unification (WHY)"
Cohesion: 0.5
Nodes (4): events table — unified crawled + uploaded via source_type, WHY: soft delete on users/events/reviews for recovery + partial index perf, WHY: single events table + source_type — avoids dual query paths, A_501 이벤트 리뷰 작성 — new review flow (wireframe 6-1)

### Community 18 - "FilterSearchPanel"
Cohesion: 0.67
Nodes (0): 

### Community 19 - "Header Component"
Cohesion: 0.67
Nodes (0): 

### Community 20 - "Event Subscriptions"
Cohesion: 0.67
Nodes (3): Decision #7: event_subscriptions table, event_subscriptions table (new), notifications table

### Community 21 - "Source Documents"
Cohesion: 1.0
Nodes (3): DB 설계 명세서 v3 (2026-04), God node: ADR 0001 DDL v3 ↔ Terminology v5 (18 edges), 요구사항정의서 v5.0 (장원팀, 2026-04)

### Community 22 - "Logo.tsx AST"
Cohesion: 0.67
Nodes (0): 

### Community 23 - "Filter 5 Unification (WHY)"
Cohesion: 0.67
Nodes (3): Filter 5 fixed — region/period/companion/event_type/event_vibe, WHY: filter 5 unified — region/period/companion/type/vibe (prevent ad-hoc filters), A_203 예정 이벤트 조회 — new upcoming-events tab

### Community 24 - "ChatDock"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "FullListPanel"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "HealthBadge"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "AppShell"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Sidebar"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Vermilion Accent"
Cohesion: 1.0
Nodes (2): Vermilion single accent (#E8562D), 결정: 버밀리언 단색 accent 근거

### Community 30 - "Naming Preservation"
Cohesion: 1.0
Nodes (2): Do-not-edit: package/repo names (@ggdrugs/web, ggdrugs repo), Rationale: skip repo/package rename to avoid full-repo churn

### Community 31 - "Event Vibe Rename"
Cohesion: 1.0
Nodes (2): DB v3 term: event_tendency_labels (renamed to event_vibes in ADR 0001), Term: event_vibe (event vibe labels, admin-assigned)

### Community 32 - "v5.0 Filter Revisions"
Cohesion: 1.0
Nodes (2): v5.0 changes: +A_203, +A_501, +용어집, filter-term unification, −AI video, Filter terminology: 지역/기간/인원구성/이벤트 종류/이벤트 성향

### Community 33 - "Three-Role Toggle (WHY)"
Cohesion: 1.0
Nodes (2): Three roles: user / uploader / admin with active_role toggle, users + uploader_profiles 1:1 — single-account multi-role

### Community 34 - "Vite Config"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Web Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Vite Env Types"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "EventList"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "SeoulMap"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Vite Build Config"
Cohesion: 1.0
Nodes (1): Vite config (React + Tailwind + BFF proxy)

### Community 40 - "Graphify Rule"
Cohesion: 1.0
Nodes (1): graphify rule: read GRAPH_REPORT first

### Community 41 - "Gstack Workflow"
Cohesion: 1.0
Nodes (1): gstack workflow Think→Plan→Build→Review→Test→Ship→Reflect

### Community 42 - "chat_messages"
Cohesion: 1.0
Nodes (1): chat_messages table

### Community 43 - "search_logs"
Cohesion: 1.0
Nodes (1): search_logs table

### Community 44 - "Term: period"
Cohesion: 1.0
Nodes (1): Term: period

### Community 45 - "Term: companion_type"
Cohesion: 1.0
Nodes (1): Term: companion_type {혼자, 연인, 친구, 가족}

### Community 46 - "UI Draft God Node"
Cohesion: 1.0
Nodes (1): God node: UI 플로우 와이어프레임 초안 (23 edges)

### Community 47 - "Served Logo Mark"
Cohesion: 1.0
Nodes (1): Alle Logo Mark (served, apps/web/public/)

### Community 48 - "Served Favicon"
Cohesion: 1.0
Nodes (1): Alle Favicon (served, apps/web/public/)

### Community 49 - "Served Logo Lockup"
Cohesion: 1.0
Nodes (1): Alle Logo Lockup (served, apps/web/public/)

## Knowledge Gaps
- **158 isolated node(s):** `Express JSON error handler`, `parseIntClamp helper`, `COMPANION_ENUM (solo/couple/friend/family)`, `PERIOD_ENUM (3m/6m/all/custom)`, `Vite config (React + Tailwind + BFF proxy)` (+153 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `ChatDock`** (2 nodes): `ChatDock.tsx`, `ChatDock()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `FullListPanel`** (2 nodes): `FullListPanel.tsx`, `FullListPanel()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HealthBadge`** (2 nodes): `HealthBadge.tsx`, `HealthBadge()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `AppShell`** (2 nodes): `AppShell.tsx`, `AppShell()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Sidebar`** (2 nodes): `Sidebar.tsx`, `toggle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vermilion Accent`** (2 nodes): `Vermilion single accent (#E8562D)`, `결정: 버밀리언 단색 accent 근거`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Naming Preservation`** (2 nodes): `Do-not-edit: package/repo names (@ggdrugs/web, ggdrugs repo)`, `Rationale: skip repo/package rename to avoid full-repo churn`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Event Vibe Rename`** (2 nodes): `DB v3 term: event_tendency_labels (renamed to event_vibes in ADR 0001)`, `Term: event_vibe (event vibe labels, admin-assigned)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `v5.0 Filter Revisions`** (2 nodes): `v5.0 changes: +A_203, +A_501, +용어집, filter-term unification, −AI video`, `Filter terminology: 지역/기간/인원구성/이벤트 종류/이벤트 성향`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Three-Role Toggle (WHY)`** (2 nodes): `Three roles: user / uploader / admin with active_role toggle`, `users + uploader_profiles 1:1 — single-account multi-role`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Web Entry Point`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Env Types`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `EventList`** (1 nodes): `EventList.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `SeoulMap`** (1 nodes): `SeoulMap.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Build Config`** (1 nodes): `Vite config (React + Tailwind + BFF proxy)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Graphify Rule`** (1 nodes): `graphify rule: read GRAPH_REPORT first`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Gstack Workflow`** (1 nodes): `gstack workflow Think→Plan→Build→Review→Test→Ship→Reflect`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `chat_messages`** (1 nodes): `chat_messages table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `search_logs`** (1 nodes): `search_logs table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Term: period`** (1 nodes): `Term: period`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Term: companion_type`** (1 nodes): `Term: companion_type {혼자, 연인, 친구, 가족}`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Draft God Node`** (1 nodes): `God node: UI 플로우 와이어프레임 초안 (23 edges)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Served Logo Mark`** (1 nodes): `Alle Logo Mark (served, apps/web/public/)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Served Favicon`** (1 nodes): `Alle Favicon (served, apps/web/public/)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Served Logo Lockup`** (1 nodes): `Alle Logo Lockup (served, apps/web/public/)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ADR 0002 — Stack Decisions (MinIO/OpenAI/Qdrant)` connect `ADR 0001 & Terminology` to `BFF Stack Decisions`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `Tech Stack` connect `Admin Approval & Reviews` to `BFF Stack Decisions`, `DB Schema & Review Flow`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **What connects `Express JSON error handler`, `parseIntClamp helper`, `COMPANION_ENUM (solo/couple/friend/family)` to the rest of the system?**
  _158 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Approval & Reviews` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Alle Brand System` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `ADR 0001 & Terminology` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `BFF Stack Decisions` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._