# Wiki Lint Report

**Generated**: 2026-04-19 (AI enrichment sprint 후)
**Scope**: `wiki/` 전체 (4 sources + **17 topics** + **5 entities**, index/log 제외)
**Graphify cross-check**: `graphify-out/` 491 nodes / 608 edges / 71 communities (2026-04-19 재빌드).

---

## 요약

| 카테고리 | 이전 | 현재 |
|---|---|---|
| Contradictions | 2 | ✅ **0** (C-5 event_type 8종 / C-6 auth_provider dev 모두 반영) |
| Stale refs | 1 | ✅ **0** (log.md 엔트리 추가로 S-4 해소) |
| Orphans | 0 | 0 |
| Gaps | 5 | 🟡 **2** (G-3·G-4 해소, G-6 해소, G-7 은 부분 해소 — 남은 2개는 아래 참조) |
| Over-large pages | 0 | 0 |
| 이전 오진 정정 | 1 | ℹ️ 완료 |

**상태**: 대청소 1회 완료. wiki 갱신이 code 진행을 따라잡음.

---

## 이전 lint 결과 정정 (2026-04-19 early)

### ℹ️ "regions 테이블 sigungu_name 중복" — 오진
초판 lint 보고에서 "종로구 regionId 3/5 중복" 이라 flag 했으나 실제는 **의도된 계층 구조**:
- `region_id=5` — 구(district) 레벨, `dong_name=null`, full_address="서울 종로구"
- `region_id=3` — 동(neighborhood) 레벨, `dong_name=세종로`, full_address="서울 종로구 세종로"

Prisma schema `regions` 는 sido / sigungu / dong 3단 계층 지원. `lookups.ts listRegions` 는 `dongName: null` 로 district 만 노출 중. 진짜 버그는 `chat.ts` regionHints resolver 에서 같은 필터를 빠뜨렸던 것 — 커밋 `9313be1` 에서 해소. 데이터 마이그레이션 불필요.

---

## 1. Contradictions — ✅ 0건 (전부 해소)

### ~~C-5. event_type 4종 → 8종~~ — ✅ 반영 완료
- `sources/2026-04-17_requirements-v5.md` L41, `topics/filters-5-types.md` §4, `topics/db-schema-overview.md` §2, `topics/use-cases-index.md` A_300 행, `topics/terminology-glossary.md` §1 모두 갱신.
- filters-5-types §4 에 8종 확장 근거 (Seoul/KCISA ingest 분포) 추가.

### ~~C-6. auth_provider dev + Kakao~~ — ✅ 반영 완료
- `topics/terminology-glossary.md` §7 인증 섹션 신설 (Google/Kakao/dev).
- 상세 흐름은 신규 `topics/auth-flow.md` 로 분리.

---

## (원본 스캔) 전 분석 기록 (보존용)

### C-5. `event_type` 4종 → **8종** 확장이 wiki 미반영
- **실 사실**: DB+API 에 8종 live (`festival, expo, symposium, conference, exhibition, performance, education, movie`, 마이그레이션 `20260418180000`).
- **wiki 표기 4종 잔존**:
  - `sources/2026-04-17_requirements-v5.md` L41
  - `topics/filters-5-types.md` L40, L42
  - `topics/db-schema-overview.md` L33
  - `topics/use-cases-index.md` L41 (A_300)
  - (확인 필요) `sources/2026-04-17_ui-flow-draft.md`, `topics/terminology-glossary.md`
- **조치**: 일괄 수정 + `terminology-glossary` 에 "event_type 확장 이력 (2026-04-18)" 기록 또는 ADR 0003 신설.

### C-6. `auth_provider` 에 `'dev'` 허용값 추가
- DB `chk_users_provider` 가 `{google, kakao, dev}` 허용 (마이그레이션 `20260419201000`).
- wiki 문서들은 `{google, kakao}` 만 기재.
- **조치**: `terminology-glossary.md` 에 dev provider 각주 — "로컬 dev-login stub. NODE_ENV=production 에서 POST /auth/dev-login 이 404".

---

## 2. Stale refs — ✅ 0건

### S-4. log.md `event_categories 4종 시드` 이후 8종 전환 기록 누락
역사적 append-only 로 원문 보존. 단, 최근 2주 활동(A_201~A_501 라이브) 전반에 대한 log 엔트리 자체가 적어 history gap 존재 — lint 범위 외지만 문서 유지 관리 리스크로 언급.

---

## 3. Orphans — ✅ 0건

`entities/` 여전히 빈 채 (G-6 참조).

---

## 4. Gaps — 🟡 2건 (3개 해소)

### ~~G-3. Auth 구현 문서화~~ — ✅ 해소
`topics/auth-flow.md` 신설 (Stage 1 dev-login + Google/Kakao OAuth + session 저장소 + 미들웨어 이원화 + same-origin 쿠키 전략).

### ~~G-4. Ingest 파이프라인 문서화~~ — ✅ 해소
`topics/ingest-pipeline.md` 신설 (3 러너 + ingest-common + 프로비넌스 컬럼).

### ~~G-6. Entities 레이어~~ — ✅ 착수 (5개)
`entities/{google, kakao, tourapi, seoul-open-data, kcisa}.md`. 외부 의존성 전부 커버.

### G-5. regions 계층 문서 (부분 해소)
`db-schema-overview.md` 에 auth_sessions 테이블 추가 + event_categories 8종 주석. regions sido/sigungu/dong 계층 설명은 `ingest-pipeline.md` §공통 로직 에 포함. 별도 topic 은 불필요로 판단.

### G-7. 최근 구현 기능 (A_302/A_500/A_501/A_201/A_200 요약패널) 전용 topic — 🟡 부분 해소
- auth / ingest 는 별도 topic 으로 분리 완료.
- 북마크 / 마이페이지 / 리뷰 쓰기 / 요약패널은 `use-cases-index.md` 상태 표 + `log.md` 2026-04-19 sprint 로그로 커버. 별도 topic 은 규모가 작아 보류 (사용자 플로우가 바뀌면 그때 작성).
- **잔여 gap**: EventSummaryPanel 같은 UI 원 설계 ↔ 실 구현 매핑 문서. `ui-architecture.md` 갱신 필요 (별건 후속).

### 기존 G-3. Auth 구현 문서화 — 🔴 확대
Stage 1 (dev-login + cookie session + AuthSession) + Stage 2 (Google OAuth) + **Kakao OAuth (신규)** 전부 라이브. `topics/auth-flow.md` 여전히 없음.

핵심 내용 (이번 lint 에 추가):
- AuthSession 모델 (TTL 7d, sliding expiry)
- dev-login stub (NODE_ENV check)
- Google OAuth authorization code flow (tokeninfo 검증)
- Kakao OAuth (kapi.kakao.com/v2/user/me, 토큰 교환)
- requireAuth / resolveAuth 미들웨어 이원화 (필수 vs 옵셔널)
- 쿠키 same-origin 전략 (Vite proxy 경유)

### G-4. 다중 소스 ingest 파이프라인 문서 없음
TourAPI + Seoul Open API + KCISA + forward-looking daily batch + ingest-common 중복방지. `topics/ingest-pipeline.md` 필요.

### G-5. regions 시드 계층 문서 없음
sido / sigungu / dong 3단 계층. listRegions 가 district 만 노출하는 규약. chat resolver 도 동일 규약 따라야 함.

### G-6. entities 레이어 착수 시기 초과
외부 의존성: Google OAuth / Kakao OAuth / Kakao Maps / TourAPI / Seoul Open Data / KCISA / OpenAI (Stage 2 예정). 각 1 페이지.

### G-7 [신규]. A_302 북마크 / A_500 마이페이지 / A_501 리뷰 쓰기 / A_201 LLM 실 연동 / A_200 EventSummaryPanel — 구현 문서화 zero
라이브 기능이지만 `topics/` 에 대응 페이지 없음. `topics/main-page-flow.md` · `topics/event-detail-review-flow.md` 는 요구사항 초안 기반이라 실구현 대응 문서가 별도 필요.

---

## 5~6. Over-large / low-confidence — 해당 없음

---

## 방향 점검 — 유스케이스 구현 상태 (2026-04-19 late)

| ID | 요구사항 | 상태 | 커밋 |
|---|---|---|---|
| A_100 가입 | Google + Kakao 소셜 | ✅ **완료** | `d29bec3` (Google) + `a038626` (Kakao) |
| A_101 로그인 | 동 | ✅ 완료 | 동 |
| A_200 메인 | 레이아웃 + 필터 + 목록 + 채팅 + 상단 예정 탭 | ✅ 핵심 완료 (상단 탭은 phase 탭으로 흡수) | 다수 |
| A_201 채팅검색 | LLM 5종 필터 자동 매핑 | ✅ Stage 1 (rule-based), ChatDock 실 연동 | `ff6548f` + `9313be1` |
| A_202 필터검색 | 5종 다중 선택 + 적용 | ✅ 완료 | 초기 |
| A_203 예정 이벤트 | 상단 탭 / 3·6·전체 기간 | ✅ FullListPanel phase 탭에 흡수 | `c19f231` |
| A_300 전체목록 | 카테고리 5버튼 | ✅ (8버튼 + phase 4탭) | `35cd6f8` |
| A_400 상세 | Hero + 개요 + 관련 기사 + 북마크 | ✅ 북마크 추가 / 관련 기사 미구현 | `1977225` + `30bf5d6` |
| A_500 마이페이지 | 월간 캘린더 + 저장 배지 + 역할전환 | 🟡 뼈대만 (내 북마크 + 내 리뷰 탭) | `30bf5d6` |
| A_501 리뷰 작성 | 별점+텍스트+사진 ≤5장, 종료일 이후 | 🟡 사진 제외 완료 (종료일 검증 ✓) | `e6ef2fe` + `052291c` |
| A_600~A_602 업로더 | 역할 승급 + 이벤트 등록 | 🔴 미착수 | — |
| A_700 관리자 | 이벤트 승인 + 라벨 부여 | 🔴 미착수 | — |

### 추가 구현 상태

| 항목 | 상태 | 비고 |
|---|---|---|
| 북마크 API / UI | ✅ 완료 | A_302 — event detail isBookmarked 포함 |
| MyPage 내 북마크/리뷰 | ✅ 뼈대 완료 | 캘린더는 후속 |
| 리뷰 본인 삭제 | ✅ 완료 | A_501 soft-delete |
| 지도 선택 핀 강조 | ✅ 완료 | vermilion pulse ring |
| EventSummaryPanel | ✅ 와이어프레임 동선 복원 | 북마크 + 상세 CTA |
| services/llm | ✅ Stage 1 (Python 3.14 호환) | rule-based, 8종 카테고리 매핑 |
| BFF /chat regionHints resolve | ✅ district-level only | `9313be1` |
| 모바일 반응형 | 🔴 미구현 | AppShell 3-col 데스크탑 고정 |
| 리뷰 사진 업로드 | 🔴 미구현 | MinIO 버킷만 |
| 뉴스 기사 ingest / A_400 관련기사 | 🔴 미구현 | news_articles 테이블만 |
| 알림 배달 / 이벤트 구독 UI | 🔴 미구현 | 테이블만 |
| Stage 2 LLM (OpenAI) | 🔴 미착수 | API 키 비용 |

---

## 권장 우선 순서 (남은 작업)

1. **wiki 드리프트 대청소** (1~1.5h) — C-5 / C-6 / S-4 / G-3~G-7. 7개 문서 손대고 `topics/auth-flow.md` + `topics/ingest-pipeline.md` + `entities/{google,kakao,tourapi,seoul-open-data,kcisa}.md` 신설
2. **모바일 반응형** (2~3h) — 사용자 환경 넓히기. 현재는 데스크탑만.
3. **리뷰 사진 업로드 (A_501)** (2h) — MinIO 프리사인드 URL, 이미지 리사이즈, 5장 제한. **업로더 서류 업로드와 같은 인프라** 재사용.
4. **업로더 플로우 (A_600~A_602)** (대) — role toggle + 이벤트 등록 + 서류 업로드 (S3 연동). 사진 업로드 코드 재사용.
5. **관리자 승인 (A_700)** (대) — approval queue + 라벨 부여 UI.
6. **Stage 2 LLM** (중) — OpenAI gpt-4o, API 키 발급 후.

---

*이 리포트는 `/lint` 또는 수동 재작성 시 덮어쓰기됩니다. — schema.md §3*
