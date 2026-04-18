# Graph Report - .  (2026-04-18)

## Corpus Check
- 0 files · ~0 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 396 nodes · 506 edges · 40 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 74 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_DB Schema & Event Tables|DB Schema & Event Tables]]
- [[_COMMUNITY_Alle Brand System|Alle Brand System]]
- [[_COMMUNITY_ADR 0001 & Terminology|ADR 0001 & Terminology]]
- [[_COMMUNITY_BFF Stack Decisions|BFF Stack Decisions]]
- [[_COMMUNITY_BFF API + CORS|BFF API + CORS]]
- [[_COMMUNITY_Admin Approval & Reviews|Admin Approval & Reviews]]
- [[_COMMUNITY_UI Wireframe Flows|UI Wireframe Flows]]
- [[_COMMUNITY_Env Schemas|Env Schemas]]
- [[_COMMUNITY_Alle Logo Geometry|Alle Logo Geometry]]
- [[_COMMUNITY_BFF Source Files|BFF Source Files]]
- [[_COMMUNITY_LLM Wiki Architecture|LLM Wiki Architecture]]
- [[_COMMUNITY_Config Package|Config Package]]
- [[_COMMUNITY_Kakao Dev Domain Config|Kakao Dev Domain Config]]
- [[_COMMUNITY_BFF Invariants (do-not-edit)|BFF Invariants (do-not-edit)]]
- [[_COMMUNITY_FilterSearchPanel|FilterSearchPanel]]
- [[_COMMUNITY_Header Component|Header Component]]
- [[_COMMUNITY_Event Subscriptions|Event Subscriptions]]
- [[_COMMUNITY_Source Documents|Source Documents]]
- [[_COMMUNITY_ChatDock|ChatDock]]
- [[_COMMUNITY_FullListPanel|FullListPanel]]
- [[_COMMUNITY_HealthBadge|HealthBadge]]
- [[_COMMUNITY_AppShell|AppShell]]
- [[_COMMUNITY_Sidebar|Sidebar]]
- [[_COMMUNITY_Vermilion Accent|Vermilion Accent]]
- [[_COMMUNITY_Naming Preservation|Naming Preservation]]
- [[_COMMUNITY_v5.0 Filter Revisions|v5.0 Filter Revisions]]
- [[_COMMUNITY_Event Vibe Rename|Event Vibe Rename]]
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
- `Production Required Keys Guard` --semantically_similar_to--> `Tech Stack`  [INFERRED] [semantically similar]
  packages/config/README.md → llm_wiki/wiki/topics/tech-stack.md
- `listEvents (GET /events handler)` --implements--> `필터 5종 (region/period/companion/type/vibe)`  [INFERRED]
  apps\bff\src\routes\events.ts → CLAUDE.md
- `SeoulMap (Kakao Maps)` --implements--> `Map pin component tokens`  [INFERRED]
  apps\web\src\components\SeoulMap.tsx → DESIGN.md
- `Alle Brand Handoff README` --semantically_similar_to--> `Community: UI Wireframe Flows (32 nodes, cohesion 0.11)`  [INFERRED] [semantically similar]
  llm_wiki\raw\design_handoff_alle_brand\README.md → graphify-out\GRAPH_REPORT.md
- `FilterSearchPanel (A_202)` --implements--> `필터 5종 (region/period/companion/type/vibe)`  [INFERRED]
  apps\web\src\components\FilterSearchPanel.tsx → CLAUDE.md

## Hyperedges (group relationships)
- **Alle rename target set (files needing GGdrugs→Alle edits)** — alle_rename_target_index_html, alle_rename_target_Header, alle_rename_target_package_json, alle_rename_target_readme, alle_rename_target_design_md, existing_web_index_html, existing_web_Header_tsx, existing_web_package_json, existing_readme_md, existing_design_md [EXTRACTED 1.00]
- **Line Monogram 3-element composition (frame + A stroke + vermilion crossbar)** — alle_logo_line_monogram, alle_logo_spec_viewbox, alle_logo_currentcolor_rule, alle_logo_crossbar_accent, alle_logo_no_fill [EXTRACTED 1.00]
- **Logo asset → React component wiring (SVG 3-pack + LogoMark/LogoLockup)** — alle_asset_logo_mark_svg, alle_asset_favicon_svg, alle_asset_logo_lockup_svg, alle_component_logo_tsx, alle_component_LogoMark, alle_component_LogoLockup [INFERRED 0.90]
- **Alle Line Monogram Family** — logo_mark_svg, favicon_svg, logo_lockup_svg [EXTRACTED 0.95]
- **Alle Brand Color Palette** — color_ink_1a1a1a, color_orange_e8562d, color_muted_999999 [EXTRACTED 1.00]
- **Line Monogram Geometry (Frame + Apex + Crossbar)** — logo_mark_frame_rect, logo_mark_apex_path, logo_mark_crossbar_line [EXTRACTED 1.00]
- **Alle Lockup Typography (Pretendard + JetBrains Mono)** — typeface_pretendard, typeface_jetbrains_mono, wordmark_alle_text, locale_seoul_text [EXTRACTED 1.00]

## Communities

### Community 0 - "DB Schema & Event Tables"
Cohesion: 0.05
Nodes (48): Decision #1: on_hold → revision_requested, Decision #4: expected_companion rename, Decision #5: event_vibes rename, Rationale: Phase 1 22-table baseline, ADR 0001 Terminology Reconciliation, Rationale: Minimize provider count, ADR 0002 Stack Decisions, approval_status enum (+40 more)

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

### Community 5 - "Admin Approval & Reviews"
Cohesion: 0.08
Nodes (35): A_700 Dual-Tab Structure, Event Approval Queue, LLM Delegation Guardrail (CLAUDE.md §6-4), Admin Flow, Decision #2: users.active_role column, Decision #3: admin_profiles table, Decision #6: review_photos table, admin_profiles table (new) (+27 more)

### Community 6 - "UI Wireframe Flows"
Cohesion: 0.11
Nodes (32): UI 컴포넌트: 자연어 채팅 검색 입력창, UI 컴포넌트: 이벤트 상세 카드, UI 컴포넌트: 필터 패널 (5종 필터), UI 컴포넌트: 카카오 지도 뷰 (행정구역 레이어), UI 컴포넌트: 지역 목록 사이드 패널, 플로우: 관리자 (이벤트 승인/반려/라벨 부여), 플로우: 일반 사용자 (지도 → 검색 → 상세 → 북마크), 플로우: 업로더 (역할 부여 → 이벤트 등록 → 승인 대기) (+24 more)

### Community 7 - "Env Schemas"
Cohesion: 0.12
Nodes (19): EnvValidationError, coreSchema (NODE_ENV, LOG_LEVEL), databaseSchema (DATABASE_URL + postgres creds), externalApiSchema (Kakao/Google), fullSchema (all merged), loadEnv (full validation), loadPartial (per-service schema), openaiSchema (+11 more)

### Community 8 - "Alle Logo Geometry"
Cohesion: 0.16
Nodes (18): Ink Black #1A1A1A (Primary Stroke), Muted Gray #999999 (Locale Tag), Alle Orange #E8562D (Accent Crossbar), Alle Favicon (Bolder Stroke Variant), Locale Tag 'SEOUL' (JetBrains Mono 500, 14px, tracking 2), Lockup ViewBox 260x84 (horizontal composition), Alle Logo Lockup (Mark + Wordmark + Locale), A-Apex Path (M22 64 L42 22 L62 64) (+10 more)

### Community 9 - "BFF Source Files"
Cohesion: 0.28
Nodes (5): listEvents(), parseBigIntCsv(), parseCsv(), parseIntClamp(), parsePeriod()

### Community 10 - "LLM Wiki Architecture"
Cohesion: 0.27
Nodes (10): Wiki invariants (raw append-only, 1:1 sources), LLM Wiki raw/ readme, LLM Wiki README, LLM Wiki Schema, LLM Wiki + graphify Setup Guide, Three-layer architecture (raw/wiki/schema), LLM Wiki 사용법, CLAUDE.md auto-load hook (+2 more)

### Community 11 - "Config Package"
Cohesion: 0.33
Nodes (1): EnvValidationError

### Community 12 - "Kakao Dev Domain Config"
Cohesion: 0.33
Nodes (6): Registered Domain: http://localhost:5173 (Vite dev server), Registered Domain: http://localhost:9999 (Primary / 기본), Domain-Only Registration Rule (paths stripped, e.g. https://www.example.com/mypage → https://example.com), Kakao Developers App Platform/Web Domain Settings (inferred), Primary Domain Badge (기본), Web Domain Configuration Panel

### Community 13 - "BFF Invariants (do-not-edit)"
Cohesion: 0.33
Nodes (6): Do-not-edit: DB schema, env keys, internal identifiers, cors middleware (BFF), createApp (Express factory), GET /health endpoint (BFF), Root endpoint service name 'ggdrugs-bff', DB v3: 20 tables (regions, users, uploader_profiles, events, ...)

### Community 14 - "FilterSearchPanel"
Cohesion: 0.67
Nodes (0): 

### Community 15 - "Header Component"
Cohesion: 0.67
Nodes (0): 

### Community 16 - "Event Subscriptions"
Cohesion: 0.67
Nodes (3): Decision #7: event_subscriptions table, event_subscriptions table (new), notifications table

### Community 17 - "Source Documents"
Cohesion: 1.0
Nodes (3): DB 설계 명세서 v3 (2026-04), God node: ADR 0001 DDL v3 ↔ Terminology v5 (18 edges), 요구사항정의서 v5.0 (장원팀, 2026-04)

### Community 18 - "ChatDock"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "FullListPanel"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "HealthBadge"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "AppShell"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Sidebar"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Vermilion Accent"
Cohesion: 1.0
Nodes (2): Vermilion single accent (#E8562D), 결정: 버밀리언 단색 accent 근거

### Community 24 - "Naming Preservation"
Cohesion: 1.0
Nodes (2): Do-not-edit: package/repo names (@ggdrugs/web, ggdrugs repo), Rationale: skip repo/package rename to avoid full-repo churn

### Community 25 - "v5.0 Filter Revisions"
Cohesion: 1.0
Nodes (2): v5.0 changes: +A_203, +A_501, +용어집, filter-term unification, −AI video, Filter terminology: 지역/기간/인원구성/이벤트 종류/이벤트 성향

### Community 26 - "Event Vibe Rename"
Cohesion: 1.0
Nodes (2): DB v3 term: event_tendency_labels (renamed to event_vibes in ADR 0001), Term: event_vibe (event vibe labels, admin-assigned)

### Community 27 - "Vite Config"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Web Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Vite Env Types"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "EventList"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "SeoulMap"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Vite Build Config"
Cohesion: 1.0
Nodes (1): Vite config (React + Tailwind + BFF proxy)

### Community 33 - "Graphify Rule"
Cohesion: 1.0
Nodes (1): graphify rule: read GRAPH_REPORT first

### Community 34 - "Gstack Workflow"
Cohesion: 1.0
Nodes (1): gstack workflow Think→Plan→Build→Review→Test→Ship→Reflect

### Community 35 - "chat_messages"
Cohesion: 1.0
Nodes (1): chat_messages table

### Community 36 - "search_logs"
Cohesion: 1.0
Nodes (1): search_logs table

### Community 37 - "Term: period"
Cohesion: 1.0
Nodes (1): Term: period

### Community 38 - "Term: companion_type"
Cohesion: 1.0
Nodes (1): Term: companion_type {혼자, 연인, 친구, 가족}

### Community 39 - "UI Draft God Node"
Cohesion: 1.0
Nodes (1): God node: UI 플로우 와이어프레임 초안 (23 edges)

## Knowledge Gaps
- **135 isolated node(s):** `Express JSON error handler`, `parseIntClamp helper`, `COMPANION_ENUM (solo/couple/friend/family)`, `PERIOD_ENUM (3m/6m/all/custom)`, `Vite config (React + Tailwind + BFF proxy)` (+130 more)
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
- **Thin community `v5.0 Filter Revisions`** (2 nodes): `v5.0 changes: +A_203, +A_501, +용어집, filter-term unification, −AI video`, `Filter terminology: 지역/기간/인원구성/이벤트 종류/이벤트 성향`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Event Vibe Rename`** (2 nodes): `DB v3 term: event_tendency_labels (renamed to event_vibes in ADR 0001)`, `Term: event_vibe (event vibe labels, admin-assigned)`
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

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ADR 0002 — Stack Decisions (MinIO/OpenAI/Qdrant)` connect `ADR 0001 & Terminology` to `BFF Stack Decisions`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `Tech Stack` connect `DB Schema & Event Tables` to `BFF Stack Decisions`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **What connects `Express JSON error handler`, `parseIntClamp helper`, `COMPANION_ENUM (solo/couple/friend/family)` to the rest of the system?**
  _135 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DB Schema & Event Tables` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Alle Brand System` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `ADR 0001 & Terminology` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `BFF Stack Decisions` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._