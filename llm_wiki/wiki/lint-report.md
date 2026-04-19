# Wiki Lint Report

**Generated**: 2026-04-19 (Phase 1 mid-sprint sweep)
**Scope**: `wiki/` 전체 (4 sources + 14 topics + 0 entities, index/log 제외)
**Graphify cross-check**: 가능 (`graphify-out/` 존재, 491 nodes / 608 edges / 71 communities, 2026-04-19 재빌드).

---

## 요약

| 카테고리 | 건수 | 심각도 |
|---|---|---|
| Contradictions | **2** | 🔴 event_type 4→8 수 드리프트 큼 |
| Stale refs | **2** | 🟡 Phase 0 프레이즈 잔존 |
| Orphans | 0 | — |
| Gaps | **4** | 🟡 Phase 1 구현 문서화 지체 |
| Over-large pages | 0 | — |
| Low-confidence inferences | 0 | graphify 재빌드 후 재검토 |

**상태**: Phase 1 코딩 속도가 위키 갱신 속도를 앞질렀음. 코드 fact 기준으로 4곳 업데이트 필요.

---

## 1. Contradictions — 🔴 2건

### C-5 [신규]. `event_type` 4종 → **8종** 확장이 wiki 에 미반영
- **실 사실**: DB `event_categories` 시드가 `{festival, expo, symposium, conference, exhibition, performance, education, movie}` (마이그레이션 `20260418180000_expand_event_categories` 적용). 커밋 `35cd6f8 feat(bff,web): 이벤트 카테고리 enum 세분화 (8종) + 재분류`. 라이브 `/events/stats` 도 8종 응답.
- **wiki 표기** (4종 남아있음):
  - `sources/2026-04-17_requirements-v5.md` L41 — "event_type은 {축제, 박람회, 심포지움, 컨퍼런스} 4종"
  - `topics/terminology-glossary.md` — event_type 섹션 (확인 필요)
  - `topics/filters-5-types.md` L40, L42 — "4종", "5개 버튼(전체/4종)"
  - `topics/db-schema-overview.md` L33 — "종류 마스터 (festival/expo/symposium/conference)"
  - `topics/use-cases-index.md` L41 (A_300) — "카테고리 5버튼(전체/4종)"
  - `sources/2026-04-17_ui-flow-draft.md` — UI 와이어프레임 4버튼 가정 (확인 필요)
- **조치**: 6개 파일 전부 8종 반영 + 확장 근거를 ADR 또는 terminology §event_type 변경이력으로 기록.

### C-6 [신규]. `auth_provider` 에 `'dev'` 허용값 추가
- **실 사실**: `chk_users_provider` 제약이 `{google, kakao, dev}` 로 확장 (마이그레이션 `20260419201000_allow_dev_auth_provider`).
- **wiki 표기**: `topics/terminology-glossary.md`, `topics/roles-and-active-role.md` 등에 여전히 `{google, kakao}` 로 기재.
- **배경**: Stage 1 dev-login stub 용 임시. Stage 2 Google OAuth 완료 후에도 dev 는 로컬 테스트 편의상 유지.
- **조치**: terminology 에 "dev (로컬 전용 stub, NODE_ENV=production 에서 POST /auth/dev-login 이 404)" 각주 추가.

---

## 2. Stale refs — 🟡 2건

### S-3 [신규]. "Phase 1 진입 전" 프레이즈 잔존
`topics/*.md` 여러 곳에서 "Phase 1 진입 조건" 혹은 "Phase 1 이후" 서술이 남아있음. 이미 Phase 1 중반 — 표현을 "Phase 1 현 단계" 혹은 "구현 완료 시점" 으로 교체.

### S-4 [신규]. `log.md` 의 "event_categories 4종 시드 완료" (2026-04-17T15:30)
- 역사적 기록이므로 log.md 본문은 append-only 보존.
- 단, **후속 로그 항목**에 "4종 → 8종 확장 (2026-04-18, 커밋 35cd6f8)" 기록 필요 (현재 누락).

---

## 3. Orphans — ✅ 0건

- 모든 topics/sources 가 `index.md` 에 등재.
- `entities/` 여전히 비어있음. Phase 1 외부 의존성이 급증(Google OAuth Stage 2, Kakao Maps, TourAPI, Seoul Open API, KCISA) — Gap 으로 분리 (G-4 참조).

---

## 4. Gaps — 🟡 4건

### G-3 [신규]. Auth 구현 문서화 없음
Stage 1 (dev-login + cookie session + AuthSession 모델) + Stage 2 (Google OAuth authorization code flow, tokeninfo 검증) 전부 구현됐으나 wiki 에 `topics/auth-flow.md` 없음. `event-state-machine` · `roles-and-active-role` 수준의 topic 문서 필요.

**핵심 내용 (초안)**:
- AuthSession 모델 (sessionId PK, userId FK CASCADE, expiresAt, lastSeenAt, TTL 7d)
- dev-login stub (NODE_ENV production 에서 404)
- Google OAuth 흐름 (state CSRF 쿠키 10m, redirect_uri=`{WEB_URL}/api/auth/google/callback`, tokeninfo 검증)
- requireAuth 미들웨어 (req.auth 주입)
- 쿠키 same-origin 전략 (Vite dev proxy `/api/*` 경유)
- Kakao OAuth 는 **아직 미구현** — A_100/A_101 완결 위해 필요.

### G-4 [신규]. 다중 소스 ingest 파이프라인 문서 없음
TourAPI (전국 축제) + Seoul Open API (문화행사) + KCISA (공연전시) + 공통 중복 방지 로직 + forward-looking 일일 배치. 현재 `apps/bff/src/jobs/` 에 구현됐고 log.md 에 단편적 기록만 있음. `topics/ingest-pipeline.md` 필요.

### G-5 [신규]. regions 시드 문서 없음
서울 25구 + 광역시 + 경기 (현재 regions 테이블 시드됨). `topics/regions-taxonomy.md` 또는 `db-schema-overview` 갱신.

### G-6. entities 레이어 착수 시기 도래
외부 의존성 5개 (Google / Kakao / TourAPI / Seoul Open Data / KCISA) — 각각 간단한 entities 페이지 권장 (API endpoint, 인증 방식, rate limit, 장애 시 대체 동작).

### ~~G-2. entities 레이어 미착수~~ → G-6 으로 업그레이드 (Phase 1 현재).

---

## 5. Over-large pages

**해당 없음.** 최장 `db-schema-overview.md` 여전히 ~110 lines.

---

## 6. Low-confidence inferences

`graphify-out/graph.json` 491 nodes / 73 INFERRED 엣지 (평균 confidence 0.81). 따로 떨어진 커뮤니티 (God node 근접 관계) 검토는 별도 세션에서 (시간 비용).

---

## 방향 점검 — 유스케이스 구현 상태 (2026-04-19)

| ID | 요구사항 | 실제 | Gap |
|---|---|---|---|
| A_100 가입 | Google + Kakao 소셜 | **Google OAuth 완료 (Stage 2)** | Kakao OAuth 추가 |
| A_101 로그인 | 동 | 동 | 동 |
| A_200 메인 | 사이드바 + 지도 + 채팅 + 상단 예정탭 | Layout / Filter / List / Map / ChatDock(mock) ✓ | 상단 "예정 이벤트" 헤더 탭 없음 (FullListPanel 내부 탭으로 흡수 — 의도적 결정이면 ADR 필요) |
| A_201 채팅검색 | LLM 5종 필터 자동 매핑 | ChatDock UI only, mock echo | **services/llm 빈 폴더** |
| A_202 필터검색 | 5종 다중 선택 + 적용 | ✓ | - |
| A_203 예정 이벤트 | 상단 탭, 3/6/전체 기간 | FullListPanel phase 탭에 "예정" 포함 | 기간 토글 (3/6/전체) 미구현 |
| A_300 전체목록 | 카테고리 5버튼 (전체/4종) | 8버튼 + phase 4탭 | 카테고리 확장으로 UI 재검토 |
| A_400 상세 | 포스터+북마크, 개요, 프로그램, 관련 기사 | Hero/meta/desc/minimap/리뷰/provenance | **북마크 미구현**, 프로그램 구조 · 관련 기사 없음 |
| A_500 마이페이지 | 월간 캘린더 + 저장 배지 + 역할전환 | **미착수 (0%)** | 전부 |
| A_501 리뷰 작성 | 별점+텍스트+사진 ≤5장, 종료일 이후 활성 | 별점+텍스트(2~2000자) ✓ | **사진 업로드 0**, **종료일 검증 0** |
| A_600 업로더 승급 | 역할 추가 신청 + 증명 업로드 | 미착수 | - |
| A_601 업로더 메인 | 본인 이벤트 그리드 | 미착수 | - |
| A_602 이벤트 업로드 | 서류 ≥2종, 기본정보, 종류, companion 2 | 미착수 | - |
| A_700 관리자 | 이벤트 승인 / 라벨 / 업로더 심사 | 미착수 | - |

### 추가 누락 (요구사항 외 구현 필요 기능)

| 항목 | 상태 | 우선 |
|---|---|---|
| 북마크 API / UI | 모델만 있고 API/UI 0 | 🔴 A_400·A_500 의존 |
| 뉴스 기사 ingest + 표시 | news_articles 테이블 있음, ingest 0 | 🟡 A_400 관련 기사용 |
| 알림 배달 로직 | notifications 테이블만 | 🟡 A_203 / A_500 연결 |
| 이벤트 구독 UI | event_subscriptions 테이블만 | 🟡 A_203 |
| 모바일 반응형 | 전무 (AppShell 데스크탑 고정) | 🟡 DESIGN.md §Layout 지시 |
| ChatDock LLM 연동 | mock echo | 🔴 A_201 |
| Kakao OAuth | 미구현 | 🟡 A_100/A_101 완결 |
| 사진 업로드 (리뷰 · 업로더 서류) | MinIO 버킷만 생성됨 | 🟡 A_501 · A_602 |

---

## 권장 우선 순서

1. **wiki 드리프트 정리** (event_type 4→8, auth_provider dev, topics/auth-flow 신설) — 30분, lint 재실행까지
2. **북마크 (A_302 parent)** — 모델 있음, API 2개 + UI 토글. 1~2시간.
3. **A_500 마이페이지 뼈대** — 내 리뷰 + 내 북마크 간단 리스트. 캘린더는 후속. 1~2시간.
4. **A_501 조건 보강** — 종료일 이후만 리뷰 작성 허용 (필수). 사진 업로드는 후속.
5. **services/llm 부트스트랩** — FastAPI + 기본 chain, ChatDock 실 연동. 2~3시간.
6. **업로더 / 관리자** — auth role toggle, 서류 업로드 → S3, approval flow. 다음 sprint.

---

*이 리포트는 `/lint` 또는 수동 재작성 시 덮어쓰기됩니다. — schema.md §3*
