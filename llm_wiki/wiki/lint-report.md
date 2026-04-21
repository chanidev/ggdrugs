# Wiki Lint Report

**Generated**: 2026-04-21 (LLM 강화 + 요약 팝업 sprint 후)
**Scope**: `wiki/` 전체 (4 sources + **17 topics** + **5 entities**, index/log 제외)
**Graphify cross-check**: `graphify-out/` **844 nodes / 1081 edges / 121 communities** (2026-04-21 재빌드).
**이전 lint**: 2026-04-19 (491 nodes / 608 edges / 71 communities). 이후 **96 커밋** 반영 필요.

---

## 요약

| 카테고리 | 이전(04-19) | 현재(04-21) |
|---|---|---|
| Contradictions | 0 | **3** (C-7 / C-8 / C-9) |
| Stale refs | 0 | 1 (S-5) |
| Orphans | 0 | 0 |
| Gaps | 2 | **6** (G-8 ~ G-13 신규) |
| Over-large pages | 0 | 0 |
| Stale implementation status | — | ❌ **전면 재작성 필요** — 이전 sweep 의 `🔴 미착수` 행 대부분 이미 ship |

**상태**: Phase 1 후반 ~ AI 강화 sprint 동안 wiki 가 코드를 못 따라잡음. Ship 한 것:
A_203 구독·알림, A_400 관련기사, A_500 캘린더 팝업 전체 스펙, A_501 사진 업로드,
A_600~A_602 업로더 + 수정 재제출, A_700 관리자 콘솔 전탭, Qdrant 의미 검색,
embedding 재랭킹, 네이버+Google News 파이프라인, 이벤트 요약 팝업, ADR 0003 PII.

---

## 1. Contradictions — 🟡 3건 신규

### C-7. `topics/ui-architecture.md` §119 — 모바일 미구현 주장
원문: "모바일(≤640px) 대응 미구현. rail + panel 을 바텀시트로 전환해야 함. Phase 2 후보."

실제: 부분 반영됨 — `apps/web/src/pages/AdminEventsPage.tsx` 탭 subtitle `hidden sm:inline`,
`apps/web/src/pages/UploaderPage.tsx` ApprovedBody 툴바 `flex w-full gap-2 sm:w-auto`,
`apps/web/src/components/notifications/NotificationBell.tsx` 기본 responsive,
`ChatDock.tsx` `md:bottom-6 md:left-1/2` 포함 다중 미디어 쿼리.

수정: "바텀시트 전환" 을 "Phase 2 메인 탐색 레이아웃 재설계" 로 구체화하고,
**현재 = admin/uploader 핵심 플로우 sm 이상에서 동작, 메인 탐색은 rail+panel 유지** 로 표기.

### C-8. `topics/uploader-flow.md` §Open questions — "이벤트 수정 재제출 UI" 미확정
원문: "이벤트 수정(revision_requested → 재제출) UI가 업로드 페이지와 동일한지, 별도인지
확정 필요".

실제: `apps/web/src/pages/UploaderEventEditPage.tsx` 로 **별도 페이지** 로 ship
(`0691a68`, `5fdbb4e`). 공유 `EventFormFields` 컴포넌트로 필드는 공유하되 포스터/서류 교체
UX 는 edit 전용 (3-way poster edit: 유지/교체/제거, 서류 전체 교체 토글).

수정: Open questions 에서 제거하고 Key points 로 이동.

### C-9. `topics/event-detail-review-flow.md` — A_500 팝업 스펙 미충족으로 flagged
2026-04-17 draft: "배지 클릭 → 우측 팝업에 **이벤트명·장소·기간·가격·대상·요약** 정보 표시
… '상세 보기' / '리뷰 작성' 버튼 배치".

이전 상태: MyPage CalendarEventCard 가 title+date+phase 만.

현재 구현(`9fc959e`): `apps/web/src/pages/MyPage.tsx` 의 `CalendarSummaryCard` 가
스펙 6필드(+ 관련기사 카운트 힌트) 전부 렌더, 상세/리뷰 분리 CTA, 기존 리뷰 있으면 수정 레이블.
**스펙 충족** → Open questions 제거 가능.

---

## 2. Stale refs — 🟡 1건

### S-5. `docs/decisions/0003-uploader-pii-policy.md` 가 wiki 어디서도 링크 안 됨
ADR 0003 은 실제 파일 존재 + DB 마이그레이션 적용
(`apps/bff/prisma/migrations/20260421120000_uploader_pii_identity/`) + BFF
(`apps/bff/src/routes/uploader.ts` realName/bizRegNumber/ciHash) + Web
(`apps/web/src/pages/UploaderPage.tsx` ApplyForm identityKind).

`topics/adr-0001-terminology-reconciliation.md` §Future ADRs 목록, `topics/uploader-flow.md`
references 어디에도 링크 없음.

수정: `topics/uploader-flow.md` references 에 ADR 0003 추가 (또는 §G-11 신규 topic).

---

## 3. Gaps — 🔴 6건 신규 (G-8 ~ G-13)

### G-8. Qdrant 의미 검색 레이어 — topic 없음
Ship: `services/llm/qdrant_events.py` (`7e7112c`), `POST /events/search`,
`POST /events/upsert`, BFF `apps/bff/src/jobs/embed-events.ts` (`5c5c8c5`),
BFF `routes/chat.ts` 의 ChatSuggestion 주입.

기존 `adr-0002-stack-decisions.md` 가 Qdrant 를 "선택된 스택" 으로 언급하지만 실 파이프라인
/ 데이터 흐름 / collection 스펙(alle-events, 1536d cosine) / fallback 정책은 어디에도 없음.

필요: `topics/semantic-search.md` 신설 — collection 스펙, embed 전략(title+aiSummary),
score threshold, 필터 payload, /chat 결합, graceful degradation.

### G-9. 뉴스 기사 ingest 파이프라인 — topic 없음
Ship: `apps/bff/src/jobs/news-naver-ingest.ts` — Naver 뉴스 검색 API + Google News RSS fallback
+ embedding cosine 재랭킹 + stale 매핑 정리(`97a51ce`). `news_articles` +
`event_article_mappings` upsert.

기존 `topics/ingest-pipeline.md` 는 이벤트 소스(TourAPI / Seoul / KCISA) 만 다룸. 뉴스는 별개.

필요: `topics/news-article-pipeline.md` 신설 — scoring (V1 keyword → V2 embed rerank),
sources (Naver + Google), 자동화 3-갈래(승인 훅 / --missing / --all), rate limit.

### G-10. A_203 구독 + A_500 알림 센터 — topic 없음
Ship: `apps/bff/src/routes/subscriptions.ts` CRUD (`3e57fb1`),
`apps/bff/src/lib/subscription-match.ts` (중복 방지 포함, `1931072` fix),
`apps/bff/src/routes/notifications.ts`, Web `NotificationBell` + `/notifications` page +
MyPage 구독 탭 + FilterSearchPanel "이 조건 구독" CTA.

기존: `topics/filters-5-types.md`, `topics/use-cases-index.md` 가 A_203 을 체크리스트 항목
으로만 언급. Flow / DB 트리거 / dedup 로직 설명 없음.

필요: `topics/subscriptions-notifications.md` 신설 — 5축 매칭, 중복 방지 2단계
(in-run userId dedup + cross-run notification 존재 체크), 승인 훅 fan-out, read_at,
unread 배지 30초 폴링.

### G-11. 업로더 PII 정책 (ADR 0003) — topic 없음
Ship: `docs/decisions/0003-uploader-pii-policy.md` + 구현 전체.

주민등록번호 대신 사업자등록번호 XOR CI 해시 정책, admin.scope='full' 마스킹 규칙,
본인인증 CI 88자 Base64 저장.

필요: `topics/uploader-pii-policy.md` 또는 `topics/uploader-flow.md` 에 §PII identity
섹션 추가.

### G-12. 이벤트 수정 재제출 (A_601b) — topic 부분
Ship: `apps/web/src/pages/UploaderEventEditPage.tsx`, BFF `GET/PATCH /uploader/events/:id`
(`0691a68`, `5fdbb4e`). 포스터 3-way 편집, 서류 전체 교체 토글, 관리자 사유 상단 노출,
/events/:id/edit 라우트.

기존: `topics/uploader-flow.md` 에 Open question 으로만 남음 (C-8 참조).

필요: uploader-flow.md 본문 업데이트 (C-8 해소와 동시 처리).

### G-13. A_700 관리자 감사 로그 탭 — topic 없음
Ship: `apps/bff/src/routes/admin-audit.ts` (`3a84459`),
`apps/web/src/components/admin/AuditLogsTab.tsx` (`be3600c`). approval_logs 필터/검색,
삭제된 이벤트 타이틀 보존, 액션별 카운트.

기존: `topics/admin-flow.md` 에 승급 심사 + 이벤트 심사만 언급. 감사 로그 탭 없음.

필요: admin-flow.md 에 §Audit Logs 섹션 추가.

---

## 4. Implementation Status — 전면 재작성

### 유스케이스 구현 상태 (2026-04-21 기준)

| ID | 요구사항 | 상태 | 주요 커밋 |
|---|---|---|---|
| A_100 가입 | Google + Kakao 소셜 | ✅ 완료 | `d29bec3` + `a038626` |
| A_101 로그인 | 동 | ✅ | 동 |
| A_200 메인 | 지도 + 필터 + 목록 + ChatDock + 요약 패널 | ✅ | 다수 |
| A_201 채팅검색 | Stage 2 OpenAI + Qdrant kNN suggestions | ✅ **강화** | `5c5c8c5` + `d8a1b61` |
| A_202 필터검색 | 5종 다중 선택 + "조건 구독" CTA | ✅ | 초기 + T sprint |
| A_203 예정 이벤트 → 구독 | CRUD + 5축 매칭 + dedup | ✅ | T sprint + `1931072` |
| A_300 전체목록 | 8 카테고리 + phase 4탭 | ✅ | `35cd6f8` |
| A_400 상세 | Hero + 개요 + 관련 기사 + 북마크 + 리뷰 + mini map | ✅ **관련기사 완성** | `50dd597` + `97c5e33` |
| A_500 마이페이지 | 캘린더(스펙 6필드 팝업) + 북마크/리뷰/구독 탭 + 알림 센터 | ✅ **스펙 충족** | `9fc959e` |
| A_501 리뷰 작성 | 별점+텍스트+사진 5장, 종료일 이후만 (GG-REVIEW-001 복구) | ✅ | `052291c` |
| A_600 역할 승급 | realName / bizRegNumber XOR ciHash / docs | ✅ ADR 0003 | S sprint |
| A_601 업로더 메인 | 내 이벤트 목록 + 상태 탭 + 역할 토글 | ✅ | 초기 + 후속 |
| A_601b 이벤트 수정 재제출 | revision_requested / rejected 상태에서 편집 | ✅ **신규** | `0691a68` + `5fdbb4e` |
| A_602 이벤트 업로드 | 포스터 + 서류 2~5장 + 포괄 필드 | ✅ | 초기 |
| A_700 관리자 | 이벤트 심사 / 업로더 심사 / vibe 라벨 / 감사 로그 | ✅ **4탭 완성** | `3a84459` + `be3600c` |

### 추가 구현

| 항목 | 상태 | 비고 |
|---|---|---|
| 이벤트 요약 팝업(A_300) | ✅ 스펙 충족 | 시간·가격·대상 + aiSummary + 관련기사 배지 (`9fc959e`) |
| 리뷰 사진 업로드 | ✅ | MinIO presigned, 5장 제한 |
| 뉴스 기사 ingest | ✅ **V2 완성** | Naver + Google News + embedding rerank (`f250c11`, `6281c6a`, `97a51ce`) |
| 알림 배달 / 중복 방지 | ✅ | 승인 훅 fan-out, in-run + cross-run dedup (`1931072`) |
| AI 요약 (gpt-4o-mini) | ✅ | sanitize + 캐싱 + 비용 관측 + eval (`27f43d9`, `2d4c3ad`) |
| 리뷰 감성 분류 | ✅ | rule + LLM fallback |
| Qdrant 의미 검색 | ✅ **신규** | 1536d cosine, /chat suggestions (`7e7112c`) |
| 이벤트 embed 파이프라인 | 🟡 200/3700 | `pnpm embed:events:all` 로 전체 embed 가능 (~2분) |
| 모바일 반응형 | 🟡 부분 | admin 탭 / uploader 툴바 / 알림 벨 / chat dock. rail+panel 메인은 Phase 2 |
| PostGIS geom 전환 | 🔴 Phase 2 | 성능 프로파일링 후 |
| 세션 무효화 ADR | 🔴 미착수 | 역할 토글/로그아웃 세션 revoke 정책 |
| 관리자 계정 생성 ADR | 🔴 미착수 | ADR 0001 #2 후속 |
| 전체 이벤트 뉴스 backfill | 🔴 대기 중 | 메모리에 기록됨. `pnpm ingest:news:missing` ~90분 |

---

## 5. Over-large / low-confidence — 해당 없음

모든 topic 파일 < 200줄. `topics/ai-enrichment.md` (177줄) 가 가장 크나 enrichment
전체 파이프라인을 한 장에 정리한 것이라 분리 이점 낮음.

---

## 권장 우선 순서 (남은 wiki 작업)

1. **contradictions 해소** (30분) — C-7 ui-architecture 모바일 문구, C-8 uploader-flow
   open question, C-9 event-detail-review-flow 스펙 충족 노트.
2. **gap topics 신설** (1.5~2h) — 최소 제목+포인터+5~10줄 요약:
   - `topics/semantic-search.md` (G-8)
   - `topics/news-article-pipeline.md` (G-9)
   - `topics/subscriptions-notifications.md` (G-10)
   - uploader-flow.md 에 §PII identity 섹션 (G-11)
   - uploader-flow.md 에 §Event Edit 섹션 (G-12)
   - admin-flow.md §Audit Logs 섹션 (G-13, 짧게)
3. **stale ref 해소** (5분) — S-5: ADR 0003 링크 추가.
4. **graphify 재빌드** — wiki 수정 후 `_rebuild_code` + wiki regenerate.

---

## 향후 자동화 후보

- `lint` skill: graphify node 레이블 vs wiki H1 cross-check, orphan 자동 판별.
- 이벤트별 구독 알림 중복 방지 버그처럼 docstring ↔ 코드 drift 도 린트 대상.

---

*이 리포트는 `/lint` 또는 수동 재작성 시 덮어쓰기됩니다. — schema.md §3*
