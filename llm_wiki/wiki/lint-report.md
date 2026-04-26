# Wiki Lint Report

**Generated**: 2026-04-26 sprint sweep — chat v3.3 ~ v4 + Sprint A 후속
**Scope**: `wiki/` 전체 (4 sources + **22 topics** + 5 entities, index/log 제외) + `raw/` 1:1 invariant + GRAPH_REPORT.md cross-check
**이전 lint**: 2026-04-23 sprint 5 (chat v3 commit + Streaming SSE ship 직후)

---

## 요약

| 카테고리 | 이전 | 현재 |
|---|---|---|
| Contradictions | 0 | **0** |
| Stale refs | 0 | 0 |
| Orphans | 0 | **2** — `raw/error1.png` (신규) + `raw/GGdrugs Design System.zip` (사전 존재) |
| Gaps | 0 | **2** — `ui-architecture.md` stale (2026-04-17), `log.md` Sprint A 2026-04-26 미박제 |
| Over-large pages | 0 | 0 (log.md 905줄은 chronological append-only — 분할 비용 > 가치) |
| Index drift | — | **1** — `wiki/audit/` 디렉터리 index.md Meta 섹션 미언급 |
| Implementation status | 미착수 6행 | **미착수 5행** (chat v3.x + v4 + bench + Sprint A 6건 ship — close) |

**상태**: chat backend 도메인은 박제 완벽 (semantic-search.md v3.3 → v4 + bench A/B 결과 + redact + GIN 인덱스 모두 반영). UI 도메인 (ui-architecture.md) 은 2026-04-17 부터 정체 — 8 sprint drift. raw/ 와 sources/ 1:1 invariant 가 신규 파일 1건으로 깨짐 — 결정 필요.

---

## 1. Contradictions — ✅ 0건

이번 sweep 의 ship 6건 (v3.3, v3.4, v3.5, chat:eval, v4 reply_sealed, bench A/B, Sprint A) 의 wiki drift 점검:

| Commit | Drift 점검 | 박제 상태 |
|---|---|---|
| `dced509` chat v3.3 Hybrid (Qdrant + pg_trgm) | semantic-search.md §Hybrid search 박제 | ✅ |
| `7cef11c` chat v3.4 Prompt injection + AbortController | semantic-search.md §Prompt injection 방어 박제 | ✅ |
| `e94db57` chat v3.5 Grounded followup | semantic-search.md §Grounded followup 박제 | ✅ |
| `7097d45` chat:eval harness | semantic-search.md §Chat eval harness 박제 | ✅ |
| `1da8250` /chat/stream LLM 404 fallback | log.md 2026-04-25T17:00 박제 | ✅ |
| `99c2cd3` chat v4 reply_sealed + bench harness | semantic-search.md §POST /chat/stream + Hybrid score tuning OQ + audit cross-link 박제 | ✅ |
| `4ae7df1` Sprint A UI 폴리시 (typing dots / retreat fade / error retry / reduced-motion) | **drift 발견** — `ui-architecture.md` 미반영 (`TypingDots` / `RetreatMeta` / `ErrorRetryButton` / `streamFor` / `handleRetry` 박제 0). Sprint A plan/spec 은 `docs/superpowers/` 에 있으나 wiki 정본 페이지에는 미연결 | **gap** (§4 참조) |
| `bf5223f` chat:eval golden case +2 | semantic-search.md §Chat eval harness "현재 baseline 22/22" 박제 + redact 2건 추가 명시 | ✅ |
| `ee63ffc` docs/superpowers + audit + log 갱신 | 본 commit 자체가 박제 — log.md v4 reply_sealed + bench A/B 2 entry, audit/chat-rank-bench-2026-04-25.md 신설 | ✅ |

---

## 2. Stale refs — ✅ 0건

22 topic + 5 entity + 4 source 의 frontmatter `related:` 모두 resolve. 본 sweep 에서 추가된 cross-link `semantic-search.md → ../audit/chat-rank-bench-2026-04-25.md` 도 정상.

---

## 3. Orphans — 🟡 2건

### O-1. `raw/error1.png` (신규 — `ee63ffc` 커밋)
- 54839 bytes, 2026-04-26 commit 으로 raw/ 진입.
- `wiki/sources/2026-04-26_error1.md` **부재** — `raw/` ↔ `sources/` 1:1 invariant 위반 (schema.md §Invariants).
- 추정: 디버깅 스크린샷이 의도와 무관하게 raw/ 에 commit. 본문 확인 후 분류 필요:
  - (a) ingest 가치 있음 → `sources/2026-04-26_error1.md` 생성 + index.md 등재
  - (b) 디버깅 잔여물 → 다음 commit 에서 raw/ 에서 제거 (raw/ append-only invariant 가 이미 commit 진입한 파일에 충돌하지만, 의도 외 commit 은 정정 가능)

### O-2. `raw/GGdrugs Design System.zip` (사전 존재)
- DESIGN.md 자료 묶음. 사전 lint 시점부터 존재.
- 사용 분기: `raw/design_handoff_alle_brand/` 에 풀린 산출물 README.md 만 존재. zip 자체는 source 페이지 부재.
- 결정 보류 권장: DESIGN.md 가 사실상 정본 역할이라 zip 의 별도 source 페이지는 가치 낮음. raw/README.md 에 "이 zip 은 DESIGN.md 의 ingredient 로 풀려있고 추가 source 페이지 없음" 한 줄 박제로 해소 권장.

---

## 4. Gaps — 🟡 2건

### G-1. `ui-architecture.md` stale (8 sprint drift)
**최종 갱신**: 2026-04-17. 그 사이 ship 된 미반영 항목:
- 모바일: `MobileShell.tsx` + `BottomSheet.tsx` + `MobileChatTab` 3 snap 시트 (main-page-flow.md 에는 박제, ui-architecture.md 는 §"확장 패널(accordion)" 데스크톱 가정만 유지)
- ChatDock 컴포넌트 분해: `TypingDots`, `RetreatMeta`, `ErrorRetryButton`, `FollowupRow`, `SuggestionsRow` 5 sub-component (Sprint A 추가 3건 + 사전 2건)
- AppShell: `streamFor(history, placeholderIndex)` 헬퍼, `handleRetry`, `chatStreamAbortRef`, `replySealed` 플래그
- 컴포넌트 디렉터리: `EventSummaryPanel`, `ChatHelpPanel`, `OverlayPanel`, `NotificationBell`, `FilterSearchPanel`/`FullListPanel` 상세 누락
- v4 transient 필드: `ChatMessage` 인터페이스에 `streaming` / `overriding` / `meta` / `error` 4 필드 추가 — UI 시각 효과 (typing dots / fade / retreat 메타 / retry 버튼) 매핑

**조치 권장**: ui-architecture.md 전면 재작성 1 sprint. AppShell 의 state machine + ChatDock·MobileChatTab 의 v4-A 폴리시 + DESIGN.md 토큰 cross-link 강화. `apps/web/src/styles/index.css` 의 `alle-typing-wave` / `.alle-fade-text` / `prefers-reduced-motion` 분기도 박제.

### G-2. `log.md` Sprint A 2026-04-26 entry 부재
log.md 마지막 entry: 2026-04-25T19:30 Hybrid combiner A/B. 그 이후 ship:
- Sprint A 4 commits land (`99c2cd3` v4 + bench, `4ae7df1` Sprint A UI, `bf5223f` eval cases, `ee63ffc` docs)
- chat:eval 22/22 PASS 재확인 (avg 4622ms)
- 3-service health 200, manual 4 시나리오 PASS

log.md invariant: "ISO-8601 timestamp + append-only". 2026-04-26 entry 1건 추가로 해소.

---

## 5. Implementation Status

### sprint 5 → 본 sweep 변경

| 항목 | 이전 | 현재 | 근거 |
|---|---|---|---|
| chat v3 미커밋 | 🟡 코드 ship 완료 (미커밋) | ✅ ship 완료 (v3.3~3.5 모두 commit + main push) | `dced509` `7cef11c` `e94db57` |
| Streaming SSE | ✅ ship | ✅ + v4 reply_sealed 추가 | `99c2cd3` |
| Article RAG | ✅ ship (v3.2) | (변경 없음) | — |
| Hybrid search | ✅ ship (v3.3) | ✅ + GIN 인덱스 + bench A/B negative 결과 | `99c2cd3` 마이그레이션 `20260425085400_chat_keyword_trgm_gin` |
| Prompt injection 방어 | ✅ ship (v3.4) | ✅ + reply redact 2차 후처리 (`_redact_reply_text`) | `99c2cd3` openai_chain.py |
| Grounded followup | (sprint 5 직후 ship) | ✅ ship (v3.5) | `e94db57` |
| chat:eval harness | (없음) | ✅ ship + 22 case (redact 2건 추가) | `7097d45` `bf5223f` |
| /chat/stream LLM 404 fallback | (없음) | ✅ ship | `1da8250` |
| chat-rank-bench (combiner A/B) | (없음) | ✅ infra ship — bench 결과 max winner, default 무변경 | `99c2cd3` `chat-rank-bench-2026-04-25.md` |
| Streaming AbortController | ✅ ship (v3.4) | (변경 없음) | — |
| Chat UI 폴리시 — 4 항목 + reduced-motion | (없음) | ✅ ship | `4ae7df1` |

### 여전히 🔴 미착수 — Phase 2 또는 트리거 대기

| 항목 | 비고 |
|---|---|
| PostGIS geom 전환 | 지도 viewport bbox / 반경 검색 도입 결정 시 |
| 본인인증 prod (PASS/NICE/카카오) | ADR 0003 §개인 업로더 본인인증 후속 (인터페이스만 분리됨 — Phase 2 swap 1 지점) |
| 사업자번호 정부 API 검증 | ADR 0003 후속 |
| 서울 외 지역 확장 | UX 결정 |
| 클러스터 정렬 기준 (거리/인기/최신) | UX 결정 |
| Streaming reconnect | 네트워크 blip 시 last reply_delta 이후부터 이어받기 — semantic-search.md OQ |
| pg_trgm 한국어 recall 개선 | bench 가 노출시킨 인접 문제. word_similarity threshold 낮추거나 token-level 매칭 보강 — semantic-search.md OQ |

---

## 6. Over-large / low-confidence — ✅ 해당 없음

| 파일 | 줄 수 | 판정 |
|---|---|---|
| log.md | 905 | **분할 면제** — chronological append-only, 분할 비용 > 가치. yearly archive 는 2026-12 후보 |
| chat-rank-bench-2026-04-25.md | 292 | OK (audit 단일 sweep 산출물) |
| semantic-search.md | 283 | OK (단일 도메인 — chat 검색 결합) |
| 기타 topic | < 200 | OK |

graphify INFERRED 비율 6% (75 edges, avg 0.81 confidence) — schema 기준 0.6 미만 0건. clean.

---

## 7. Index drift — 🟡 1건

### I-1. `wiki/audit/` 디렉터리 index.md 미언급
- audit/chat-rank-bench-2026-04-25.md 가 sweep 산출물로 추가되었으나 index.md 의 Meta 섹션 또는 Topics 하위에 진입점 없음.
- semantic-search.md 가 inline cross-link 하므로 grpah orphan 은 아니나, schema.md §Invariants "index.md 는 single source of truth for top-level navigation" 형식 위배.
- **조치 권장**: index.md Meta 섹션에 한 줄:
  - `- [audit/](audit/) — 시간 박제 audit 리포트 (chat-rank-bench, chat-eval 트렌드 등 generated)`

---

## 권장 우선순위 (다음 sprint)

1. **P1**: `log.md` 2026-04-26 Sprint A entry 추가 (5분, 본 sweep 결과 박제 포함).
2. **P2**: `ui-architecture.md` 전면 갱신 — v3.x backend 결합 + v4 transient 필드 + Sprint A 폴리시 + MobileShell/BottomSheet (G-1 해소). 1 sprint 단독 작업.
3. **P3**: `index.md` Meta 섹션에 audit/ 디렉터리 진입점 1줄 (I-1 해소).
4. **P3**: `raw/error1.png` 분류 결정 (O-1) — source 페이지 생성 OR raw/ 정리. 가능하면 raw/README.md 에 "디버깅 스크린샷 분류 정책" 박제.
5. **P3**: `raw/GGdrugs Design System.zip` (O-2) — raw/README.md 에 "DESIGN.md ingredient, 별도 source 페이지 없음" 한 줄 박제.

---

## 향후 자동화 후보 (변동 없음)

- `lint-report.md` 를 CI 에 엮어서 new drift 있으면 PR comment.
- `auditMappingDistributionQuick` 로그 주기 리포트 → Slack/notion push.
- graphify `graph.json` 의 node count / edge count 트렌드를 log.md 에 자동 append.
- `admin_audit_logs` 의 daily summary (action 별 count + 최근 24h reason 샘플) → admin 모니터링.
- 추천 만족도 측정 (CTR / convert rate) — Qdrant 전환 트리거 신호.
- chat /chat → /events/rerank → /chat/compose-retreat → /judge/relevance 호출 카운트 + cost 로 LLM 운영 비용 dashboard.
- chat:eval baseline (22/22 PASS, avg 4622ms) → 주기 실행 + 회귀 PR comment.
- chat-rank-bench → 데이터 10× 성장 또는 새 신호 (사용자 클릭 로그) 도입 시 재실행 트리거.
