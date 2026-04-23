# Wiki Lint Report

**Generated**: 2026-04-23 12:30 (Phase 1 마감 sweep — Audit 통합 + 쿨다운 + A_100 자동 복귀 + 정책 박제 + 추천 + fetchWithRetry sprint 후)
**Scope**: `wiki/` 전체 (4 sources + **22 topics** + 5 entities, index/log 제외) — admin-account-management + recommendations 추가
**Graphify cross-check**: `graphify-out/` **931 nodes / 1227 edges / 132 communities** (이전 905/1177/131 대비 +26/+50/+1)
**이전 lint**: 2026-04-23 sprint 2 (11:50) — Contradictions 0 / Gaps 0. 이후 5 commit ship 추가 (Audit 통합 / 쿨다운 / bulk action 박제 / A_100 자동 복귀 + G-2/3/4 박제 / G-5 추천 / fetchWithRetry).

---

## 요약

| 카테고리 | 이전(11:50) | 현재(12:30) |
|---|---|---|
| Contradictions | 0 | **0** — 본 sprint 의 모든 변경이 이미 wiki 본문에도 반영됨 (각 commit 의 "문서" 단계에서 함께 갱신) |
| Stale refs | 0 | 0 |
| Orphans | 0 | 0 — admin-account-management.md / recommendations.md 모두 index 등재 |
| Gaps | 0 | 0 |
| Over-large pages | 0 | 0 |
| Implementation status | 미착수 2행 (PostGIS / 모바일) | **미착수 2행 + 부분 해소 1** — 소스 쿼터·레이트리밋 transient retry ship, quota 카운트 추적은 미완 |

**상태**: Phase 1 lint queue 5개 모두 처리 완료. 현 sprint 의 모든 ship 항목이 commit 내 "문서" 단계에서 wiki 와 함께 갱신되어 후속 drift 없음. 잔여 미착수는 Phase 2 또는 운영 트리거 대기.

---

## 1. Contradictions — ✅ 0건

본 sprint 의 모든 ship 이 commit-단위 wiki 동시 갱신을 따름:

- **ADR 0004/0005 박제 + 코드 ship** (`9cafc2a`/`d023857`/`66b49aa`) — 전체 sweep 으로 정합
- **Audit 통합 뷰** (`f11c42d`) — admin-flow §Audit 본문 동시 갱신, OQ 해소
- **rejected 쿨다운** (`f2175bf`) — roles-and-active-role OQ #6 해소
- **bulk action 박제** (`83e858c`) — admin-flow OQ 해소
- **A_100 자동 복귀 + 정책 박제** (`6ec5884`) — auth-flow §A_100 + use-cases-index sweep + ingest/news-article OQ 박제
- **G-5 추천** (`27c2fb5`) — recommendations.md 신규 + auth-flow OQ 해소 + db-schema-overview user_taste_profiles 사용처 cross-ref (본 sweep 에서 추가)
- **fetchWithRetry** (`7d54020`) — ingest-pipeline OQ 부분 해소

---

## 2. Stale refs — ✅ 0건

---

## 3. Orphans — ✅ 0건

신규 topic 2건 모두 `wiki/index.md` 등재 (admin-account-management = 시스템 흐름 + ADR 색인, recommendations = 시스템 흐름).

---

## 4. Gaps — ✅ 0건

---

## 5. Implementation Status

### 본 sprint (04-23 sprint 2 → 3) 변경

| 항목 | 이전 | 현재 | 근거 |
|---|---|---|---|
| ADR 0004 D-1 user soft-delete 패턴 | 정책만 박제 | ✅ ADR 0005 E-5 ship | admin-users.ts softDeleteUser |
| ADR 0004 D-6 admin revoke scope | 'full' 만 | ✅ 'full' \| 'security' | ADR 0005 E-3 chk_admin_scope rebuild |
| `decideUploader` audit | 0 행 작성 | ✅ admin_audit_logs `uploader_decision` | ADR 0005 E-8 |
| 회원/admin 관리 UI | backend-only | ✅ Members 탭 (5 액션 + audit) | ADR 0005 E-7 정정 |
| 마이페이지 역할 전환 버튼 (GG-ROLE-001) | 미구현 | ✅ RoleToggleButton 5 상태 분기 | MyPage.tsx |
| Audit 탭 source toggle | approval_logs only | ✅ 이벤트 심사 / Admin 작업 토글 | AuditLogsTab.tsx |
| rejected uploader 재신청 쿨다운 | 없음 | ✅ 7d (uploader_profiles.updatedAt 기준) | applyUploader + RoleToggleButton |
| bulk action 정책 | 미정 (OQ) | ✅ 미지원 결정 박제 | admin-flow.md |
| A_100 원 액션 자동 복귀 | 미구현 | ✅ returnTo 쿠키 + parseReturnTo 화이트리스트 | auth.ts + auth-redirect.ts |
| ended 이벤트 retention | 미정 (OQ) | ✅ 유지 결정 박제 | ingest-pipeline.md |
| 기사 retention | 미정 (OQ) | ✅ 유지 결정 박제 | news-article-pipeline.md |
| admin scope content_only/uploader_review_only | placeholder | ✅ 의미 결정 박제 (분기 코드는 후속) | admin-account-management.md |
| user_taste_profiles 사용 (G-5) | 0 사용처 | ✅ 일일 집계 + /me/recommendations + 마이페이지 추천 탭 | aggregate-taste-profiles.ts + me-recommendations.ts |
| 소스 쿼터·레이트리밋 (transient) | 미구현 | ✅ fetchWithRetry (429/5xx/네트워크 retry + Retry-After) 4 runner 적용 | jobs/lib/fetch-with-retry.ts |

### 여전히 🔴 미착수 — Phase 2 또는 트리거 대기

| 항목 | 비고 |
|---|---|
| 일 quota 소진 카운트·임계 알림 | provider 별 quota 추적 미구현. 호출자 throw → scheduler Promise.allSettled source-level 격리만 |
| 모바일 메인 레이아웃 | rail+panel → 바텀시트 Phase 2. DESIGN.md review 후 |
| PostGIS geom 전환 | 지도 viewport bbox / 반경 검색 도입 결정 시 |
| 본인인증 prod (PASS/NICE/카카오) | ADR 0003 §개인 업로더 본인인증 후속 (현재 dev mock) |
| 사업자번호 정부 API 검증 | ADR 0003 후속 |
| 서울 외 지역 확장 | UX 결정 |
| 클러스터 정렬 기준 (거리/인기/최신) | UX 결정 |
| 추천 가중치·시간 감쇠·Qdrant 기반 personalized kNN | recommendations.md OQ — 만족도 측정 후 결정 |
| `admin_audit_logs` + `approval_logs` 통합 audit reporting | source toggle 은 ship, 통합 dashboard 는 별도 |

---

## 6. Over-large / low-confidence — 해당 없음

모든 topic 파일 < 250줄. graphify INFERRED 평균 confidence 0.81, < 0.6 zero — 조치 불필요.

---

## 권장 우선순위 (다음 sprint)

본 sprint 로 Phase 1 lint queue 전체 closed. 다음 sprint 후보:

1. **Phase 2 진입** — 모바일 메인 레이아웃 또는 본인인증 prod 통합 (둘 중 큰 영역)
2. **추천 시스템 정교화** — Qdrant 기반 personalized kNN (recommendations.md OQ)
3. **일 quota 추적·알림** — provider 별 일일 호출 카운트 + 임계 도달 시 warn
4. **admin Audit dashboard** — approval_logs + admin_audit_logs 통합 시각화 (source toggle 은 ship)

---

## 향후 자동화 후보 (변동 없음)

- `lint-report.md` 를 CI 에 엮어서 new drift 있으면 PR comment.
- `auditMappingDistributionQuick` 로그를 주기 리포트로 aggregate → Slack/notion push.
- graphify `graph.json` 의 node count / edge count 트렌드를 log.md 에 자동 append.
- `admin_audit_logs` 의 daily summary (action 별 count + 최근 24h reason 샘플) → admin 모니터링.
- 추천 만족도 측정 (CTR / convert rate) — Qdrant 전환 트리거 신호.
