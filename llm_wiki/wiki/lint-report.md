# Wiki Lint Report

**Generated**: 2026-04-23 sprint 5 (chat v3 commit + Streaming SSE ship 후)
**Scope**: `wiki/` 전체 (4 sources + **22 topics** + 5 entities, index/log 제외) + `DESIGN.md` 모바일 정책 cross-check
**이전 lint**: 2026-04-23 sprint 4 — 미커밋 v3 박제. sprint 5 에서 commit + Streaming SSE 추가 ship.

---

## 요약

| 카테고리 | 이전(12:30) | 현재 |
|---|---|---|
| Contradictions | 0 | **0** — 본 sprint 의 ship 6건 모두 wiki/DESIGN 동시 갱신 (이번 lint sweep 에서 drift 정리) |
| Stale refs | 0 | 0 |
| Orphans | 0 | 0 |
| Gaps | 0 | 0 |
| Over-large pages | 0 | 0 |
| Implementation status | 미착수 2행 + 부분 1 | **미착수 2행 (모바일 ship 으로 1건 close)** |

**상태**: 본 sprint 의 ship 항목 → 이번 lint sweep 에서 4 wiki 파일 갱신 (main-page-flow / ui-architecture / semantic-search / DESIGN). 잔여 미착수는 Phase 2 prod 통합 (KYC / 사업자번호) 또는 운영 트리거 대기.

---

## 1. Contradictions — ✅ 0건 (이번 sweep 에서 fix 4건)

본 sprint 8 commit 의 wiki drift 점검 + 정리:

| Commit | Drift 발견 | Fix 적용 |
|---|---|---|
| `6627d1f` quota-counter | ingest-pipeline.md 이미 박제 (이전 sprint sweep) | drift 없음 |
| `648e6da` 추천 hybrid | recommendations.md 이미 §Hybrid 박제 | drift 없음 |
| `663e571` admin Audit | admin-flow.md 갱신 완료 (이전 sprint) | drift 없음 |
| `3971220` DESIGN.md 모바일 박제 + KYC mock | DESIGN.md "코드 ship 미정" 표기 | **fix** — sprint 4 에서 ship 완료, "코드 ship 완료 `6747b88`" 로 갱신 |
| `6747b88` 모바일 BottomSheet shell | main-page-flow.md 가 2026-04-17 초기 상태 (BottomSheet 언급 0); ui-architecture.md "Phase 2 후보 유지" stale | **fix** — main-page-flow §Shell 분기 추가 (desktop+mobile 양 트리), ui-architecture §모바일 대응 "ship 완료" 갱신 |
| `b453817` playwright 검증 스크립트 | 신규 자산, 박제 필요 | DESIGN.md / ui-architecture / main-page-flow 에 검증 ref 추가 |
| `5e51503` chat ended leak fix | semantic-search.md 가 reply rule-based echo + suggestions filter 부재 상태로 stale | **fix** — semantic-search §결합 v3 재작성 (5-step 파이프라인) |
| `1995333` LLM prompt 강화 1차 | semantic-search OQ "rule-based echo" 미해소 | **fix** — OQ 해소 표기 + v3 followups/specificDate/retreat/rerank/personalization 박제 |

미커밋 (chat v3 — followups, specificDate, retreat endpoint, rerank, personalization, web UI 칩/matchReason) 도 위 semantic-search v3 재작성에 미리 박제. commit 시 "wiki 동시" 단계 생략 가능.

---

## 2. Stale refs — ✅ 0건

---

## 3. Orphans — ✅ 0건

신규 파일 0건 (모두 기존 topic 갱신). `MobileShell.tsx` / `BottomSheet.tsx` / `EventSummaryContent` 같은 코드 산출물은 main-page-flow + ui-architecture References 에 등재.

---

## 4. Gaps — ✅ 0건

---

## 5. Implementation Status

### sprint 3 → sprint 4 변경

| 항목 | 이전 | 현재 | 근거 |
|---|---|---|---|
| 모바일 메인 레이아웃 | 정책 박제 (DESIGN.md), 코드 미ship | ✅ ship 완료 | `6747b88` MobileShell + BottomSheet + AppShell 분기, `b453817` Playwright 검증 |
| chat suggestions ended leak | 종료 이벤트 leak | ✅ phase != ended + period 교집합 강제 | `5e51503` |
| chat reply LLM 위임 | rule-based echo | ✅ LLM 직접 생성 + few-shot 6개 + 오늘 날짜/요일/계절 컨텍스트 | `1995333` |
| chat v3 — followups + specificDate + retreat + rerank + personalization | 미구현 | 🟡 **코드 ship 완료 (미커밋)** | services/llm openai_chain.py + app.py + apps/bff/src/routes/chat.ts + apps/web 칩/matchReason UI |
| KYC mock 인터페이스 정리 | inline | ✅ `apps/web/src/lib/identity-verification.ts` 추출 (Phase 2 prod swap 단일 지점) | `3971220` |
| 추천 가중치 (bookmark 1.0 / review 1.5) + 시간 감쇠 (half-life 30d) | 균등 weight | ✅ `aggregate-taste-profiles.ts` SQL `SUM(weight * EXP(...))` | `3971220` |

### 여전히 🔴 미착수 — Phase 2 또는 트리거 대기

| 항목 | 비고 |
|---|---|
| ~~모바일 메인 레이아웃~~ | ✅ 본 sprint ship — close |
| PostGIS geom 전환 | 지도 viewport bbox / 반경 검색 도입 결정 시 |
| 본인인증 prod (PASS/NICE/카카오) | ADR 0003 §개인 업로더 본인인증 후속 (현재 dev mock, 인터페이스만 분리됨 — Phase 2 swap 1지점) |
| 사업자번호 정부 API 검증 | ADR 0003 후속 |
| 서울 외 지역 확장 | UX 결정 |
| 클러스터 정렬 기준 (거리/인기/최신) | UX 결정 |
| chat v3 — Streaming / Article RAG / Hybrid search / Grounded followup / Prompt injection 방어 | semantic-search.md OQ 후속 (v4 후보) |

---

## 6. Over-large / low-confidence — 해당 없음

모든 topic 파일 < 270줄. semantic-search.md 가 chat v3 추가로 길어졌으나 (118 → 150줄 예상) 단일 도메인 — 분할 불필요.

---

## 권장 우선순위 (다음 sprint)

1. ~~**chat v3 미커밋 commit**~~ ✅ 2026-04-23 sprint 4-commit (`c50c23d` + `c8338fa`).
2. ~~**Streaming SSE**~~ ✅ 2026-04-23 sprint 5 — `/chat/stream` SSE 3-tier 구현.
   LLM `_SCHEMA.reply` property-order 트릭 + `_extract_reply_progress` 이스케이프-aware 파서
   + BFF passthrough + Web `streamChat()` + AppShell placeholder 메시지 streaming.
   semantic-search.md §`POST /chat/stream` 박제.
3. **Article RAG** — 1810건 매핑된 기사 본문을 chat reply 근거로 인용 (event_article_mappings 활용).
4. **Hybrid search** — pg_trgm 키워드 검색 + vector 결합 (CLAUDE.md 에 pg_trgm 활성화 명시됨).
5. **Phase 2 prod 진입** — 본인인증 PASS/NICE/카카오 통합 (인터페이스 1지점만 swap).
6. **Prompt injection 방어** — 사용자 입력 sanitize + role isolation.
7. **Streaming 개선 후속** — AbortController 로 중복 submit 취소, retreat/delta 경합 UI edge, reconnect.

---

## 향후 자동화 후보 (변동 없음)

- `lint-report.md` 를 CI 에 엮어서 new drift 있으면 PR comment.
- `auditMappingDistributionQuick` 로그를 주기 리포트로 aggregate → Slack/notion push.
- graphify `graph.json` 의 node count / edge count 트렌드를 log.md 에 자동 append.
- `admin_audit_logs` 의 daily summary (action 별 count + 최근 24h reason 샘플) → admin 모니터링.
- 추천 만족도 측정 (CTR / convert rate) — Qdrant 전환 트리거 신호.
- chat /chat → /events/rerank → /chat/compose-retreat 호출 카운트 + cost 로 LLM 운영 비용 dashboard.
