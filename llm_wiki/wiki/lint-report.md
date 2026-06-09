# Wiki Lint Report — 의미적 점검

- **생성일**: 2026-06-09
- **점검 범위**: `wiki/index.md`, `wiki/topics/*.md` (22), `wiki/entities/*.md` (5)
- **방식**: 구조 lint(`wiki:lint`, 0 drift) 통과 후, LLM 의미적 점검 3축 병렬 — ①내부 모순·용어 ②위키↔실제 코드/ADR/스키마 괴리 ③구현됐으나 누락된 개념
- **대조 기준(ground truth)**: `apps/bff/prisma/schema.prisma`, `docs/decisions/0001~0010`, `docker-compose.yml`, 각 `package.json`/`requirements.txt`, `CLAUDE.md`
- **이전 리포트**: 2026-04-26 sprint sweep (구조 중심)

> **조치 현황 (2026-06-09)**: A(누락 토픽 8종) 신설 완료 · B(괴리 12건)·C(모순 8건) 패치 완료. 구조 lint 0 drift. 남은 권장: 루트 `CLAUDE.md` §2 Phase 상태 갱신(위키 범위 밖).

---

## 한 줄 진단

**위키는 Phase 1(2026-04, 서울 한정, 23테이블)에 동결됨.** 이후 출하된 ADR 0006(전국 확장), ADR 0007(Phase 2 커뮤니티+메이트 매칭, ~20개 신규 테이블), ADR 0008(SEED Design), 0009/0010, PostGIS 마이그레이션이 미반영. 일부 페이지(ingest, semantic-search, ai-enrichment, auth)는 패치됐으나 schema/UI/stack/use-case "척추" 페이지는 그대로.

---

## A. 누락 개념 — Phase 2 전체 미문서화 (가장 큰 구멍)

기존 22토픽은 Phase 0/1만 다룸. 아래 8개 서브시스템은 **코드로 출하됐으나 전용 위키 페이지 0개** (스키마·BFF 라우트의 약 절반).

| # | 심각도 | 기능 | 근거 (실제 파일) | 권장 페이지 |
|---|---|---|---|---|
| A1 | HIGH | 메이트 매칭 (일방 점수·메이트지수 0~100·동의 게이팅) | `routes/mate.ts`, `lib/mate-score.ts`, `lib/mate-index-updater.ts`, `jobs/mate-eval.ts`, `MateProfile`/`MateIndex`, ADR 0007 | `mate-matching.md` |
| A2 | HIGH | 메이트 채팅방 1:1/그룹 (Socket.IO·강퇴투표·타임아웃) — LLM 검색챗과 별개 | `routes/chat-room.ts`, `routes/match-request.ts`, `jobs/chat-room-eval.ts`, `chat-scheduler.ts`, `ChatRoom`/`ChatRoomMessage`/`MatchRequest`/`GroupMembership`, ADR 0007/0010 | `mate-chat-rooms.md` |
| A3 | HIGH | 커뮤니티 (게시글·댓글·좋아요·TTL) | `routes/posts.ts`, `jobs/community-eval.ts`, `Post`/`Comment`/`PostLike` | `community.md` |
| A4 | HIGH | 약속·캘린더 (제안/합의/역제안·+36h만료·단일거절 종료) | `routes/appointments.ts`, `Appointment`/`AppointmentVote`, ADR 0009 | `appointments-calendar.md` |
| A5 | HIGH | 메이트 평가·축제 리뷰/설문 (A_900/901) | `routes/evaluation.ts`, `jobs/slice5-eval.ts`, `MateEvaluation`/`FestivalSurvey`/`FestivalReview` | `mate-evaluation-festival-review.md` |
| A6 | MED | 크레딧/포인트 원장 (append-only, +10 적립) | `CreditLedger`, `routes/me.ts::listMyCredits`, ADR 0007 결정5 | `credits-ledger.md` |
| A7 | MED | 신고·차단 + 관리자 제재 (경고/정지) | `routes/reports.ts`, `routes/admin-reports.ts`, `jobs/report-eval.ts`/`notif-eval.ts`, `Report`/`Block` | `reports-blocking-moderation.md` |
| A8 | MED | i18n 다국어 6개 로케일 | `jobs/generate-i18n-bundles.ts`, `routes/translate.ts`, `lib/translation-cache.ts`, `web/public/locales/{ko,en,vi,zh,ja,fr}` | `i18n-multilingual.md` |

추가: taste-profile 집계(`aggregate-taste-profiles.ts`)는 `recommendations.md` 섹션으로 보강 가능(LOW). ADR 토픽은 0001/0002만 존재 — **0007/0009/0010이 핵심 미문서**(위 A1~A5가 커버).

**역점검(dead doc)**: 없음. 22토픽 전부 실제 코드에 매핑됨. 위키는 "틀린" 게 아니라 "Phase 1에서 멈춘" 것.

---

## B. 위키 ↔ 실제 코드/ADR 괴리 (낡은 사실)

| # | 심각도 | 위키 (낡은 진술) | 실제 (근거) | 조치 |
|---|---|---|---|---|
| B1 | HIGH | `db-schema-overview.md` "23 테이블" | `schema.prisma` ~43 모델 (Phase 2 ~20개 추가) | Phase 2 도메인 그룹 추가, 테이블 수 ~43으로 |
| B2 | HIGH | `events` lat/lng 컬럼 + `idx_events_geo` B-tree (schema/ingest 페이지) | `locationGeom geometry(Point,4326)`, lat/lng DROP (mig `20260426203000`) — semantic-search는 이미 반영 | `location_geom` + GiST 인덱스로, ingest step8을 `ST_SetSRID` 경로로 |
| B3 | HIGH | 서울 한정 (`main-page-flow.md` "서울시 자치구 지도", "서울 외 확장 대기") | ADR 0006 전국 17시도+~230시군구 | 전국으로, "확장 대기" 미결사항 제거 |
| B4 | HIGH | `kcisa.md` "Seoul 필터 가드 `isSeoulAddress()`" | ADR 0006으로 제거. 같은 위키 ingest 페이지도 "가드 없음"이라 **자기모순** | Seoul 필터 섹션 삭제 |
| B5 | HIGH | `tourapi.md` "`areaCode=1`(서울)" 현재 동작 | ADR 0006 Appendix A: 잠재버그로 제거, areaCode 파라미터화·전국 | areaCode 파라미터화(전국 기본)로 정정 |
| B6 | MED | UI/stack 페이지에 SEED Design·i18n·Socket.IO 누락 | `web/package.json`: `@seed-design/*`, `@karrotmarket/...`, `i18next`, `socket.io-client`; ADR 0008 | SEED Design 행 추가, i18n·Socket.IO 명시 |
| B7 | MED | Phase 1 상태 표기 (`tech-stack`, `ui-architecture`) | ADR 0007/0008/0009/0010 모두 Phase 2 출하 | Phase 2로 갱신 |
| B8 | MED | BFF "Express5+pino+Prisma, Node22", 실시간 계층 없음; "큐 BullMQ 유력/세션vsJWT 미결" | `bff/package.json`: `socket.io`+`@socket.io/redis-adapter`+`ioredis`; auth는 opaque-session 출하, BullMQ/TanStack 없음 | Socket.IO+Redis 추가, 해소된 "미결정" 목록 정리 |
| B9 | MED | `terminology-glossary`/`tech-stack` "LLM = LangChain, Stage2 예정/현재 Stage1 규칙기반" | `requirements.txt`: LangChain 없음, `openai>=2.32`; 직접 작성 체인(`openai_chain.py`); Stage2 출하 완료 | "OpenAI SDK(직접 체인)"으로, Stage2 출하로 |
| B10 | MED | `db-schema-overview` extensions에 `postgis_topology` | `schema.prisma` `extensions=[postgis,pg_trgm,unaccent,citext]` | `infra/db/init/01-postgis.sql` 확인 후 정합화 |
| B11 | LOW | `notifications` 구독 fan-out 필드만 | `Notification`에 `readAt`/`notificationType`(match_request|group_invite|appointment|kick_vote|mate_eval|chat_message)/`relatedEntityId/Type` | Phase 2 알림 컬럼 추가 |
| B12 | LOW | `users` 제재 필드 없음 | `User.sanctionStatus`(none|warned|suspended)/`sanctionExpiresAt`/`sanctionReason` | 제재 컬럼 명시 |

**미드리프트(검증 완료·정상)**: `event-state-machine`, `filters-5-types` enum, `adr-0002-stack-decisions`(MinIO/OpenAI/Qdrant v1.13.0, 포트 9000/9001/6333) — compose와 정확히 일치. `ingest-pipeline`/`news-article-pipeline`/`semantic-search`/`ai-enrichment`/`recommendations`/`auth-flow`/`subscriptions-notifications`는 잘 유지됨.

---

## C. 위키 내부 모순·용어 드리프트 (코드 무관, 페이지 간)

| # | 심각도 | 모순 | 조치 |
|---|---|---|---|
| C1 | HIGH | DB 테이블 수가 4가지로 진술됨 — `index.md:29`/`db-schema-overview` 제목 "20", 본문 "23", `adr-0001` "22" | 23으로 통일 (※B1에서 ~43으로 추가 갱신) |
| C2 | HIGH | A_300 카테고리 버튼 수: `filters-5-types`/`use-cases-index` "9버튼(전체/8종)" vs `ui-architecture:111` "5버튼" | ui-architecture를 "9버튼"으로 |
| C3 | MED | taste profile 차원: `recommendations`/`db-schema` 3차원 vs `semantic-search:46` 4차원(preferred_companion 포함) | semantic-search에서 preferred_companion 제거 |
| C4 | MED | `event_type` enum: CLAUDE.md 규칙 4종 vs 위키 전반 8종 — 위키 내부는 일관(8종)이나 `filters-5-types:39`가 8값 필터를 `event_type`으로 라벨 | 필터 계층은 `event_category`로 표기, 4종 규칙과 정합화 |
| C5 | MED | use-case 수: index/use-cases "13개" vs 표에 14 ID 나열 | 14개로 정정 또는 카운트 명확화 |
| C6 | LOW | 제품명 "GGdrugs"가 사용자대면 문맥 prose에 잔존 — `roles-and-active-role:22`, `event-detail-review-flow:17` | "Alle"로 교체(내부 코드명 지칭 시만 GGdrugs 유지) |
| C7 | LOW | chat-eval 케이스 수: `semantic-search` 22 vs `ai-enrichment` 42 (스냅샷 시점 차) | 단일 출처로 정합화 |
| C8 | LOW | `auth-flow` References "5개 핸들러"라 적고 7개 나열 | 7개로 |

---

## 우선순위 권장 (조치 순서)

1. **(최우선) Phase 2 토픽 8종 신설** — A1~A8. 위키 신뢰도 회복의 핵심. 패치가 아니라 신규 페이지 + `index.md`/`use-cases-index` 갱신.
2. **(HIGH) 척추 페이지 전국화·스키마 갱신** — B1·B2·B3·B4·B5 (서울→전국, lat/lng→PostGIS, 테이블 수).
3. **(MED) stack 페이지 현행화** — B6·B8·B9 (SEED Design/Socket.IO/i18n, LangChain→OpenAI, Phase 2 상태).
4. **(LOW) 내부 카운트·용어 정합** — C1·C2·C3·C5·C6 등.

> 참고: 루트 `CLAUDE.md` §2도 "Phase 1 진입 / approved 4,111건"으로 자체 낡음(코드는 Phase 2). 위키 범위 밖이지만 함께 갱신 권장. (`ingest-pipeline`은 4,084행으로 또 다른 수치)
