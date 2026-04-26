---
title: 인증 흐름 (Auth Flow)
type: topic
created: 2026-04-19
updated: 2026-04-23
sources: [2026-04-17_requirements-v5]
related:
  - terminology-glossary.md
  - roles-and-active-role.md
  - db-schema-overview.md
  - ../../../docs/decisions/0004-session-invalidation-policy.md
  - ../entities/google.md
  - ../entities/kakao.md
---

# 인증 흐름 (A_100 / A_101)

## Summary

Alle 의 HTTP 세션은 **opaque random 쿠키 + DB `auth_sessions` 행** 으로 관리된다. OAuth provider 는 Google (authorization code flow + id_token tokeninfo 검증) 과 Kakao (authorization code + userinfo API) 두 개. 로컬 개발 편의를 위한 dev-login stub 이 `NODE_ENV != production` 일 때만 활성. BFF 는 `requireAuth` (필수) 와 `resolveAuth` (옵셔널) 미들웨어 두 종류로 공개/개인화 엔드포인트를 분기한다.

## 세션 저장소

**`auth_sessions`** (마이그레이션 `20260419200000_add_auth_sessions`):
- `session_id VARCHAR(128) PK` — `crypto.randomBytes(32).toString('base64url')` 로 생성. 쿠키에 그대로 들어간다.
- `user_id BIGINT FK users(user_id) ON DELETE CASCADE`.
- `expires_at TIMESTAMPTZ` — 기본 TTL 7일 (`SESSION_TTL_MS`).
- `last_seen_at TIMESTAMPTZ` — 요청마다 fire-and-forget 갱신 (sliding expiry 준비).
- 인덱스: `(user_id)`, `(expires_at)` (만료 스윕 용도).

**쿠키**: `alle_sid=<session_id>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`. `NODE_ENV=production` 에서 `Secure` 플래그 추가.

**same-origin 전략**: Web (`localhost:5173`) → Vite dev proxy `/api/*` → BFF (`localhost:3000`). 브라우저 기준 origin 은 5173 하나뿐이라 쿠키가 SameSite=Lax 로 매끄럽게 동작.

## 미들웨어 이원화 (`apps/bff/src/middleware/require-auth.ts`)

| 미들웨어 | 동작 | 사용처 |
|---|---|---|
| `requireAuth` | 쿠키 없으면 401, 만료/삭제 유저면 401. 성공 시 `req.auth = {userId, nickname, activeRole}` 주입 | POST /events/:id/reviews, DELETE /reviews/:id, POST/DELETE /events/:id/bookmark, GET /me/bookmarks, /me/reviews |
| `resolveAuth` | 쿠키 없거나 만료여도 next(). 성공 시 `req.auth` 주입. | GET /events/:id (isBookmarked 포함용) |

## Provider 별 흐름

### Google OAuth (`routes/auth.ts` startGoogle / googleCallback)

1. 브라우저 → GET `/api/auth/google?returnTo=<path>` (returnTo 옵셔널, A_100 자동 복귀)
2. BFF: CSRF state (24 byte random) 를 `alle_oauth_state` 쿠키 (10 분 TTL) 에 세팅. `?returnTo` 가 same-origin path 화이트리스트 통과하면 `alle_oauth_returnto` 쿠키도 같이 세팅 (동일 TTL).
3. 302 → `https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=${WEB_URL}/api/auth/google/callback&scope=openid+email+profile&state=...`
4. 사용자 동의
5. 302 → `GET /api/auth/google/callback?code=...&state=...` (Vite → BFF)
6. BFF: state 쿠키와 쿼리 state 비교 (CSRF 방어)
7. POST `https://oauth2.googleapis.com/token` (code → access_token + id_token)
8. GET `https://oauth2.googleapis.com/tokeninfo?id_token=...` (서명·aud·iss 검증)
9. `users.upsert` on (authProvider='google', socialUid=info.sub)
10. `auth_sessions.create` → Set-Cookie `alle_sid` + state/returnTo 쿠키 만료 → 302 `${WEB_URL}${returnTo ?? '/'}` — A_100 자동 복귀

### Kakao OAuth (startKakao / kakaoCallback)

1~6 동일 구조. 차이점:
- authorize: `https://kauth.kakao.com/oauth/authorize`
- token: `https://kauth.kakao.com/oauth/token` (client_secret 기본 미사용)
- 사용자 정보: `GET https://kapi.kakao.com/v2/user/me` with `Authorization: Bearer <access_token>` → `me.id`, `me.kakao_account.profile.nickname`
- nickname fallback: `kakao-<id-last6>` 가 유일한 경우.

### dev-login stub (devLogin)

```
POST /auth/dev-login {"nickname":"chan"}
```

- `NODE_ENV=production` 에서는 404.
- `user.upsert` on (authProvider='dev', socialUid=nickname). `chk_users_provider` 제약에 'dev' 추가됨 (마이그레이션 `20260419201000`).
- Google/Kakao 와 동일한 세션 쿠키 발급.
- UI 에서는 노출되지 않음. curl / QA 자동화에서만 사용.

### 공통 로그아웃 (`POST /auth/logout`)

- `parseSid` 로 쿠키에서 session_id 추출 → `auth_sessions.deleteMany({sessionId})` → 쿠키 만료 (`Max-Age=0`).

### `GET /auth/me`

- 쿠키 없으면 401 + `alle_sid=; Max-Age=0` (stale 쿠키 정리).
- 만료/deleted user 도 401 + 쿠키 정리.
- 성공 시 `{user: {userId, nickname, activeRole}}` + `last_seen_at` 갱신.

## Web 클라이언트 연결

- `AuthProvider` (`lib/auth-context.tsx`) 가 마운트 시 `/api/auth/me` 로 초기 세션 동기화 → `useCurrentUser()` 훅으로 `{user, loading, login, logout, refresh}` 제공.
- 모든 fetch 가 `withCredentials({ credentials: 'include' })` 로 쿠키 전송.
- Header (`layout/Header.tsx`) 로그인 버튼: `loginUrl('kakao')` + `loginUrl('google')` (auth-redirect.ts 헬퍼). 로그인 상태에선 nickname(→ `/me` 링크) + 로그아웃.

### A_100 자동 복귀 (`lib/auth-redirect.ts`)

`loginUrl(provider, returnTo?, useReturnTo=true)` — 현재 path+search+hash 를 `?returnTo=` 로
인코딩한 OAuth start URL 반환. `redirectToLogin(provider)` 은 `window.location.href` 직접 세팅.

진입점 5곳에서 사용:
- `Header` (Google/Kakao 두 버튼) — 현재 path 자동 보존
- `BookmarkButton` (UNAUTHENTICATED 시) — 이벤트 상세 path 보존 → 인증 후 동일 페이지 복귀
- `MyPage` LoginGate — `/me` 명시
- `NotificationsPage` LoginGate — `/notifications` 명시
- `UploaderPage` LoginGate — `/uploader` 명시
- `EventDetailPage` 리뷰 LoginGate — 현재 path 자동 보존

BFF `parseReturnTo(raw)` 화이트리스트:
- '/' 시작 (path 만, 절대 URL 거부)
- '//' 시작 거부 (protocol-relative URL 인젝션 방어)
- 안전한 path char 만 (`[/A-Za-z0-9\-_.~!$&'()*+,;=:@%?#]`)
- 길이 ≤ 500

## Session invalidation 정책 (ADR 0004 결정, 코드 ship 별도 PR)

본 §은 정책 박제 — 코드 적용은 별도 PR. 정책 본문 / 폐기 대안은 [ADR 0004](../../docs/decisions/0004-session-invalidation-policy.md).

| # | 영역 | 결정 | 코드 후속 |
|---|---|---|---|
| D-1 | Soft-delete 시 정리 | **활성화 (ADR 0005 E-5 ship)** — `users.update isDeleted=true` 트랜잭션에 `authSession.deleteMany({userId})` + `admin_audit_logs.action='user_soft_delete'` 동봉 | `POST /admin/users/:id/soft-delete` (admin-users.ts) |
| D-2 | 역할 토글 | 현행 유지 — `requireAuth`/`resolveAuth` 가 매 요청 user.activeRole 재조회로 즉시 반영 | 변경 없음 |
| D-3 | 로그아웃 범위 | 기존 `POST /auth/logout` (단일) + 신규 `POST /auth/logout-all` (전체 디바이스) 두 옵션. UI 에 두 버튼. | `routes/auth.ts` 핸들러 1건 추가 |
| D-4 | 만료 정책 | Hybrid: sliding 7d + absolute cap 30d. `expires_at = MIN(now()+7d, created_at+30d)` 매 요청 갱신. `auth_sessions.created_at` 은 이미 존재 — 마이그레이션 불필요 | middleware + `/me` update 식 변경 |
| D-5 | 만료 cleanup | `scheduler.ts::runAll()` 후속 단계로 `runSessionSweep()` 추가. `expires_at < now() - 7d` DELETE | `jobs/session-sweep.ts` 신설 |
| D-6 | Admin 강제 폐기 | `POST /admin/users/:id/revoke-sessions` (scope IN ('full','security') + reason 10~500자) + `admin_audit_logs` 기록. `security` scope 는 ADR 0005 E-3 에서 추가됨. | admin-users.ts `revokeUserSessions` |

**명명**: lint-report 가 사용했던 "JWT revoke" 표현은 부정확 — 본 시스템은 opaque random + DB
lookup. 본 ADR 부터 "session invalidation / revocation" 으로 통일.

## Open questions

- ~~**Session revocation**~~ → **해소 (ADR 0004 D-1, D-6)**: soft-delete 시 명시 deleteMany +
  admin 강제 폐기 API 신설.
- ~~**Sliding expiry 실제 동작**~~ → **해소 (ADR 0004 D-4)**: hybrid sliding 7d + cap 30d.
- ~~**`user_taste_profiles`** 사용처 미정~~ → **해소** (2026-04-23, G-5): 일일 집계 → `/me/recommendations` 추천 endpoint 활용. [recommendations.md](recommendations.md) 참조. 세션 레이어와 직접 결합 없음 — 단순 `requireAuth` 통과면 본인 taste 조회.
- **알림** 과 세션 레이어 관계 미정 — 푸시/이메일 발송 채널 미구현.
- **Admin 권한 세분화** — D-6 의 `scope='security'` 가 admin 권한 모델 ADR (별도) 의 결과에
  의존. 현재는 'full' 만 통과.

## References

- `apps/bff/src/routes/auth.ts` — 5개 핸들러 (devLogin, me, logout, startGoogle, googleCallback, startKakao, kakaoCallback)
- `apps/bff/src/middleware/require-auth.ts` — requireAuth / resolveAuth
- `apps/bff/prisma/migrations/20260419200000_add_auth_sessions/`
- `apps/bff/prisma/migrations/20260419201000_allow_dev_auth_provider/`
- 관련 커밋: `c2bd555` (Stage 1 + dev-login), `d29bec3` (Google), `a038626` (Kakao)
