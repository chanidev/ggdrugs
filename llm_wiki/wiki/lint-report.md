# Wiki Lint Report

**Generated**: 2026-04-23 11:50 (ADR 0004 + 0005 ship + Members 탭 + RoleToggleButton sprint 후)
**Scope**: `wiki/` 전체 (4 sources + **21 topics** + 5 entities, index/log 제외) — admin-account-management.md 신규 추가
**Graphify cross-check**: `graphify-out/` **905 nodes / 1177 edges / 131 communities** (2026-04-23 재빌드 — 이전 847/1084/121 대비 +58/+93/+10)
**이전 lint**: 2026-04-23 (sprint 1) — Contradictions 0 / Gaps 0. 이후 ADR 0004/0005 + Members 탭 + RoleToggleButton ship → 새 drift 5건.

---

## 요약

| 카테고리 | 이전(04-23 sprint 1) | 현재(04-23 sprint 2) |
|---|---|---|
| Contradictions | 0 | **0** — C-13/14/15/16 본 sweep 에서 즉시 정리 |
| Stale refs | 0 | 0 |
| Orphans | 0 | 0 (admin-account-management.md index 등재 완료) |
| Gaps | 0 | **0** — G-16 본 sweep 에서 즉시 정리 (admin-flow.md §Members 탭 추가) |
| Over-large pages | 0 | 0 |
| Implementation status | 미착수 4행 | **미착수 2행** — 세션 무효화 ADR + 관리자 계정 ADR 둘 다 해소 |

**상태**: 두 ADR (0004 세션 무효화 + 0005 관리자 계정 관리) 코드 ship 완료 + wiki drift 5건 (C-13/14/15/16 + G-16) 모두 본 sweep 에서 정리. 잔여 미착수는 PostGIS / 모바일 레이아웃 (모두 Phase 2).

---

## 1. Contradictions — ✅ 0건 (4건 본 sweep 에서 정리)

### (해소) C-13. `topics/db-schema-overview.md` admin_audit_logs + scope 도메인
2026-04-23 본 sweep — §Summary 의 "22 테이블" → "23 테이블" 갱신 + 갱신 근거 (admin_audit_logs 신설) 명시. §1 의 admin_profiles.scope 도메인을 4종으로 확장 + 마이그레이션 링크. §3 (승인 흐름) 을 "2개" → "3개" 로 갱신 + admin_audit_logs 항목 신설 (action 6종 + payload 표준 cross-ref).

### (해소) C-14. `topics/admin-flow.md` 4 탭 → 5 탭 + Members 정의
2026-04-23 본 sweep — "**5개 탭**" 으로 갱신 + Members 탭 정의 추가 (5 액션 + audit 자동 기록). Uploaders 탭에도 reason textarea + audit (ADR 0005 E-8) 추가 표기. frontmatter `related:` 에 admin-account-management 추가.

### (해소) C-15. `topics/roles-and-active-role.md` Open questions
2026-04-23 본 sweep — #4 (관리자 계정 생성 플로우) 해소 표기 + ADR 0005 링크. #5 (양방향 토글) 도 RoleToggleButton 5 상태 분기 ship 으로 해소 표기. #6 (rejected 쿨다운) 은 현 정책 (쿨다운 없음) 명시.

### (해소) C-16. `topics/roles-and-active-role.md` 주민번호 표기
2026-04-23 본 sweep — §승급 플로우 L42 "주민등록번호" → "사업자등록번호 (10자) XOR CI 해시 (88자)" 로 갱신 + ADR 0003 근거 (개인정보보호법 §24-2) 본문에 명시. RoleToggleButton 진입 경로도 같이 정정.

---

## 2. Stale refs — ✅ 0건

---

## 3. Orphans — ✅ 0건

신규 `topics/admin-account-management.md` 는 `wiki/index.md` §시스템 흐름 + §아키텍처 결정 양쪽에 등재됨.

---

## 4. Gaps — ✅ 0건 (1건 본 sweep 에서 정리)

### (해소) G-16. `topics/admin-flow.md` Members 탭 / 5 액션 / admin_audit_logs 표
2026-04-23 본 sweep — `admin-flow.md` 에 §Members 탭 섹션 신설 (5 액션 표 + admin-account-management cross-ref). §Audit Logs 섹션 본문도 정정 — `approval_logs` (이벤트) 와 `admin_audit_logs` (admin 액션) 두 테이블 분리 노출 상태 명시 + 통합 뷰는 후속 sprint 명기.

---

## 5. Implementation Status — 🟢 큰 진전

### 2026-04-23 sprint 1 대비 변경된 행

| 항목 | 이전 | 현재 | 근거 |
|---|---|---|---|
| 세션 무효화 ADR | 🔴 미착수 | ✅ ADR 0004 박제 + 코드 ship (D-3/D-4/D-5/D-6) | docs/decisions/0004 + 코드 PR |
| 관리자 계정 생성 ADR | 🔴 미착수 | ✅ ADR 0005 박제 + 코드 ship (E-2/E-4/E-5/E-7/E-8) + Members 탭 UI | docs/decisions/0005 + admin-users.ts + MembersTab |

### 신규 행

| 항목 | 상태 | 비고 |
|---|---|---|
| `admin_audit_logs` 테이블 | ✅ ship | action ∈ {revoke_sessions, admin_promote, admin_demote, admin_scope_change, user_soft_delete, uploader_decision} |
| sliding+cap 세션 만료 | ✅ ship | `nextExpiresAt = MIN(now+7d, created+30d)` 매 요청 갱신 |
| session-sweep cron | ✅ ship | scheduler 후속 단계 6번, grace 7d |
| logout-all UI | ✅ ship | MyPage SessionFooter |
| RoleToggleButton (GG-ROLE-001) | ✅ ship | MyPage 우측 상단, 5 상태 분기 |
| Members 탭 (회원/admin 관리) | ✅ ship | Uploaders 탭 패턴 미러 — 5 액션 inline 폼 + reason 강제 + audit 자동 기록 |

### 여전히 🔴 미착수

| 항목 | 비고 |
|---|---|
| PostGIS geom 전환 | 트리거 조건 미충족 — 지도 viewport bbox / 반경 검색 미도입. 현재 `regionId` 필터만 사용. premature optimization 회피 권장 |
| 모바일 메인 레이아웃 | rail+panel → 바텀시트 전환 Phase 2 |

---

## 6. Over-large / low-confidence — 해당 없음

모든 topic 파일 < 220줄 (admin-account-management.md 가 최대 ~165줄). graphify INFERRED 평균 confidence 0.81, < 0.6 zero — 조치 불필요.

---

## 권장 우선 순서 (다음 sprint 후 재평가)

본 sweep 의 drift 5건 전부 해소. 다음 ship 후 재평가. 잔여 미착수 후보:

1. **`admin_audit_logs` + `approval_logs` 통합 Audit 탭** — 현재 두 테이블 별도. admin-flow.md OQ 에 명시.
2. **bulk action** — 일괄 승인/반려. admin-flow.md OQ.
3. **rejected uploader 재신청 쿨다운 정책** — roles-and-active-role.md OQ #6.
4. **PostGIS geom 전환** — 트리거 조건 미충족 (지도 viewport bbox / 반경 검색 미도입). premature optimization 회피.
5. **모바일 메인 레이아웃** — Phase 2.

---

## 향후 자동화 후보 (변동 없음)

- `lint-report.md` 를 CI 에 엮어서 new drift 있으면 PR comment.
- `auditMappingDistributionQuick` 로그를 주기 리포트로 aggregate → Slack/notion push.
- graphify `graph.json` 의 node count / edge count 트렌드를 log.md 에 자동 append.
- **신규**: `admin_audit_logs` 의 daily summary (action 별 count + 최근 24h reason 샘플) → admin 모니터링 대시보드.
