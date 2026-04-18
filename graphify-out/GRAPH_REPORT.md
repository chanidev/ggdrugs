# Graph Report - .  (2026-04-18)

## Corpus Check
- Corpus is ~42,464 words - fits in a single context window. You may not need a graph.

## Summary
- 314 nodes · 415 edges · 33 communities detected
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 57 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_ADR 0001 & Terminology|ADR 0001 & Terminology]]
- [[_COMMUNITY_DB Schema & 5 Filters|DB Schema & 5 Filters]]
- [[_COMMUNITY_Admin Approval & Reviews|Admin Approval & Reviews]]
- [[_COMMUNITY_BFF Stack Decisions|BFF Stack Decisions]]
- [[_COMMUNITY_UI Wireframe Flows|UI Wireframe Flows]]
- [[_COMMUNITY_BFF events Endpoint|BFF /events Endpoint]]
- [[_COMMUNITY_Env Schemas|Env Schemas]]
- [[_COMMUNITY_BFF Source Files|BFF Source Files]]
- [[_COMMUNITY_Web App Shell|Web App Shell]]
- [[_COMMUNITY_Event Approval Tables|Event Approval Tables]]
- [[_COMMUNITY_LLM Wiki Architecture|LLM Wiki Architecture]]
- [[_COMMUNITY_Config Package|Config Package]]
- [[_COMMUNITY_Kakao Dev Domain Config|Kakao Dev Domain Config]]
- [[_COMMUNITY_FilterSearchPanel|FilterSearchPanel]]
- [[_COMMUNITY_Header Component|Header Component]]
- [[_COMMUNITY_Event Subscriptions|Event Subscriptions]]
- [[_COMMUNITY_ChatDock|ChatDock]]
- [[_COMMUNITY_FullListPanel|FullListPanel]]
- [[_COMMUNITY_HealthBadge|HealthBadge]]
- [[_COMMUNITY_AppShell|AppShell]]
- [[_COMMUNITY_Sidebar|Sidebar]]
- [[_COMMUNITY_Vermilion Accent|Vermilion Accent]]
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

## God Nodes (most connected - your core abstractions)
1. `UI 플로우 와이어프레임 초안 (전체 문서)` - 23 edges
2. `ADR 0001 — DDL v3 ↔ Terminology v5 Reconciliation` - 18 edges
3. `Use Cases Index (A_100~A_700)` - 15 edges
4. `Tech Stack` - 12 edges
5. `UI Architecture (current)` - 11 edges
6. `listEvents (GET /events handler)` - 10 edges
7. `5 Filter Types` - 10 edges
8. `Roles & active_role` - 10 edges
9. `ADR 0001 Terminology Reconciliation` - 9 edges
10. `BFF env schema (merged)` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Production Required Keys Guard` --semantically_similar_to--> `Tech Stack`  [INFERRED] [semantically similar]
  packages/config/README.md → llm_wiki/wiki/topics/tech-stack.md
- `listEvents (GET /events handler)` --implements--> `필터 5종 (region/period/companion/type/vibe)`  [INFERRED]
  apps\bff\src\routes\events.ts → CLAUDE.md
- `SeoulMap (Kakao Maps)` --implements--> `Map pin component tokens`  [INFERRED]
  apps\web\src\components\SeoulMap.tsx → DESIGN.md
- `FilterSearchPanel (A_202)` --implements--> `필터 5종 (region/period/companion/type/vibe)`  [INFERRED]
  apps\web\src\components\FilterSearchPanel.tsx → CLAUDE.md
- `ChatDock (A_201 placeholder)` --implements--> `Aesthetic — editorial + map-first (no mall)`  [INFERRED]
  apps\web\src\components\ChatDock.tsx → DESIGN.md

## Hyperedges (group relationships)
- **AppShell main regions (sidebar + map + chatdock + health)** — web_AppShell, web_Sidebar, web_SeoulMap, web_ChatDock, web_HealthBadge [EXTRACTED 1.00]
- **필터 5종 pipeline (enum → BFF handler → UI pills)** — concept_filterFiveTypes, events_listEvents, events_companionEnum, events_eventTypeEnum, events_periodEnum, web_FilterSearchPanel [INFERRED 0.85]
- **BFF config composition (all schemas merged)** — env_bffSchema, config_coreSchema, config_databaseSchema, config_redisSchema, config_qdrantSchema, config_s3Schema, config_serviceUrlsSchema, config_externalApiSchema, config_sessionSchema [EXTRACTED 1.00]
- **ADR 0001 seven-issue reconciliation** — adr_0001, adr0001_issue1_approval_status, adr0001_issue2_active_role, adr0001_issue3_admin_profiles, adr0001_issue4_companion_rename, adr0001_issue5_event_vibes, adr0001_issue6_review_photos, adr0001_issue7_event_subscriptions, ddl_v4_migration_preview [EXTRACTED 1.00]
- **ADR 0002 MinIO/OpenAI/Qdrant triad** — adr_0002, adr0002_d1_minio, adr0002_d2_openai, adr0002_d3_qdrant, entity_minio, entity_openai, entity_qdrant [EXTRACTED 1.00]
- **LLM Wiki three-layer pattern (raw/wiki/schema)** — llm_wiki_schema, llm_wiki_three_layer, llm_wiki_invariants, setup_karpathy_llm_wiki, llm_wiki_readme [EXTRACTED 0.95]
- **5 Filter Types Composition** — filter_region, filter_period, filter_companion_type, filter_event_type, filter_event_vibe [EXTRACTED 1.00]
- **ADR 0002 Three Stack Decisions** — adr0002_d1_minio, adr0002_d2_openai, adr0002_d3_qdrant [EXTRACTED 1.00]
- **1-Account Role Toggle Participants** — role_user, role_uploader, db_users_table, db_uploader_profiles, term_active_role [EXTRACTED 1.00]

## Communities

### Community 0 - "ADR 0001 & Terminology"
Cohesion: 0.07
Nodes (43): Issue #1 approval_status enum unify, Issue #2 users.active_role column, Issue #3 admin_profiles table, Issue #4 expected_companion rename, Issue #5 event_vibes rename, Issue #6 review_photos table, Issue #7 event_subscriptions table, ADR 0001 — DDL v3 ↔ Terminology v5 Reconciliation (+35 more)

### Community 1 - "DB Schema & 5 Filters"
Cohesion: 0.07
Nodes (39): Decision #4: expected_companion rename, Rationale: Phase 1 22-table baseline, ADR 0001 Terminology Reconciliation, Rationale: Minimize provider count, ADR 0002 Stack Decisions, PG Extensions (postgis, pg_trgm, unaccent, citext), DB Schema Overview (22 tables), Event State Machine (+31 more)

### Community 2 - "Admin Approval & Reviews"
Cohesion: 0.08
Nodes (35): A_700 Dual-Tab Structure, Event Approval Queue, LLM Delegation Guardrail (CLAUDE.md §6-4), Admin Flow, Decision #2: users.active_role column, Decision #3: admin_profiles table, Decision #6: review_photos table, admin_profiles table (new) (+27 more)

### Community 3 - "BFF Stack Decisions"
Cohesion: 0.07
Nodes (33): D-1 MinIO object storage, D-2 OpenAI single LLM provider, D-3 Qdrant single vector store, Rationale: S3-compat enables migration, Rejected: Anthropic (no embeddings), Rejected: pgvector single, BFF runtime dependencies, apps/bff README (+25 more)

### Community 4 - "UI Wireframe Flows"
Cohesion: 0.11
Nodes (32): UI 컴포넌트: 자연어 채팅 검색 입력창, UI 컴포넌트: 이벤트 상세 카드, UI 컴포넌트: 필터 패널 (5종 필터), UI 컴포넌트: 카카오 지도 뷰 (행정구역 레이어), UI 컴포넌트: 지역 목록 사이드 패널, 플로우: 관리자 (이벤트 승인/반려/라벨 부여), 플로우: 일반 사용자 (지도 → 검색 → 상세 → 북마크), 플로우: 업로더 (역할 부여 → 이벤트 등록 → 승인 대기) (+24 more)

### Community 5 - "BFF /events Endpoint"
Cohesion: 0.1
Nodes (28): createApp (Express factory), Express JSON error handler, GET /events endpoint, GET /health endpoint, 필터 5종 (region/period/companion/type/vibe), phase badge tokens (upcoming/ongoing/ended), env (BffEnv instance), COMPANION_ENUM (solo/couple/friend/family) (+20 more)

### Community 6 - "Env Schemas"
Cohesion: 0.16
Nodes (14): EnvValidationError, coreSchema (NODE_ENV, LOG_LEVEL), databaseSchema (DATABASE_URL + postgres creds), fullSchema (all merged), loadEnv (full validation), loadPartial (per-service schema), openaiSchema, productionRequiredKeys (+6 more)

### Community 7 - "BFF Source Files"
Cohesion: 0.32
Nodes (5): listEvents(), parseBigIntCsv(), parseCsv(), parseIntClamp(), parsePeriod()

### Community 8 - "Web App Shell"
Cohesion: 0.18
Nodes (12): externalApiSchema (Kakao/Google), Aesthetic — editorial + map-first (no mall), 결정: 예약/결제 UI 제외 (v5.0), Map pin component tokens, Signature — 핀 클러스터 분해 애니메이션, Pretendard 단일 패밀리 전략, AppShell (A_200 main layout), ChatDock (A_201 placeholder) (+4 more)

### Community 9 - "Event Approval Tables"
Cohesion: 0.18
Nodes (12): Decision #1: on_hold → revision_requested, Decision #5: event_vibes rename, approval_status enum, approval_documents table, approval_logs table, event_vibe_assignments table, event_vibes table, events table (+4 more)

### Community 10 - "LLM Wiki Architecture"
Cohesion: 0.27
Nodes (10): Wiki invariants (raw append-only, 1:1 sources), LLM Wiki raw/ readme, LLM Wiki README, LLM Wiki Schema, LLM Wiki + graphify Setup Guide, Three-layer architecture (raw/wiki/schema), LLM Wiki 사용법, CLAUDE.md auto-load hook (+2 more)

### Community 11 - "Config Package"
Cohesion: 0.33
Nodes (1): EnvValidationError

### Community 12 - "Kakao Dev Domain Config"
Cohesion: 0.33
Nodes (6): Registered Domain: http://localhost:5173 (Vite dev server), Registered Domain: http://localhost:9999 (Primary / 기본), Domain-Only Registration Rule (paths stripped, e.g. https://www.example.com/mypage → https://example.com), Kakao Developers App Platform/Web Domain Settings (inferred), Primary Domain Badge (기본), Web Domain Configuration Panel

### Community 13 - "FilterSearchPanel"
Cohesion: 0.67
Nodes (0): 

### Community 14 - "Header Component"
Cohesion: 0.67
Nodes (0): 

### Community 15 - "Event Subscriptions"
Cohesion: 0.67
Nodes (3): Decision #7: event_subscriptions table, event_subscriptions table (new), notifications table

### Community 16 - "ChatDock"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "FullListPanel"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "HealthBadge"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "AppShell"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Sidebar"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Vermilion Accent"
Cohesion: 1.0
Nodes (2): Vermilion single accent (#E8562D), 결정: 버밀리언 단색 accent 근거

### Community 22 - "Vite Config"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Web Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Vite Env Types"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "EventList"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "SeoulMap"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Vite Build Config"
Cohesion: 1.0
Nodes (1): Vite config (React + Tailwind + BFF proxy)

### Community 28 - "Graphify Rule"
Cohesion: 1.0
Nodes (1): graphify rule: read GRAPH_REPORT first

### Community 29 - "Gstack Workflow"
Cohesion: 1.0
Nodes (1): gstack workflow Think→Plan→Build→Review→Test→Ship→Reflect

### Community 30 - "chat_messages"
Cohesion: 1.0
Nodes (1): chat_messages table

### Community 31 - "search_logs"
Cohesion: 1.0
Nodes (1): search_logs table

### Community 32 - "Term: period"
Cohesion: 1.0
Nodes (1): Term: period

## Knowledge Gaps
- **97 isolated node(s):** `Express JSON error handler`, `parseIntClamp helper`, `COMPANION_ENUM (solo/couple/friend/family)`, `PERIOD_ENUM (3m/6m/all/custom)`, `Vite config (React + Tailwind + BFF proxy)` (+92 more)
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

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ADR 0002 — Stack Decisions (MinIO/OpenAI/Qdrant)` connect `ADR 0001 & Terminology` to `BFF Stack Decisions`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Why does `Tech Stack` connect `DB Schema & 5 Filters` to `BFF Stack Decisions`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **What connects `Express JSON error handler`, `parseIntClamp helper`, `COMPANION_ENUM (solo/couple/friend/family)` to the rest of the system?**
  _97 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ADR 0001 & Terminology` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `DB Schema & 5 Filters` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Admin Approval & Reviews` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `BFF Stack Decisions` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._