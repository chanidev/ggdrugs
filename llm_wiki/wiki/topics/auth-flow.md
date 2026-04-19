---
title: 인증 흐름 (Auth Flow)
type: topic
created: 2026-04-19
updated: 2026-04-19
sources: [2026-04-17_requirements-v5]
related:
  - terminology-glossary.md
  - roles-and-active-role.md
  - db-schema-overview.md
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

1. 브라우저 → GET `/api/auth/google`
2. BFF: CSRF state (24 byte random) 를 `alle_oauth_state` 쿠키 (10 분 TTL) 에 세팅
3. 302 → `https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=${WEB_URL}/api/auth/google/callback&scope=openid+email+profile&state=...`
4. 사용자 동의
5. 302 → `GET /api/auth/google/callback?code=...&state=...` (Vite → BFF)
6. BFF: state 쿠키와 쿼리 state 비교 (CSRF 방어)
7. POST `https://oauth2.googleapis.com/token` (code → access_token + id_token)
8. GET `https://oauth2.googleapis.com/tokeninfo?id_token=...` (서명·aud·iss 검증)
9. `users.upsert` on (authProvider='google', socialUid=info.sub)
10. `auth_sessions.create` → Set-Cookie `alle_sid` + state 쿠키 만료 → 302 `${WEB_URL}/`

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
- Header (`layout/Header.tsx`) 로그인 버튼: `<a href="/api/auth/kakao">` + `<a href="/api/auth/google">` 두 개. 로그인 상태에선 nickname(→ `/me` 링크) + 로그아웃.

## Open questions

- **Session revocation** — 관리자가 user 를 deleted 처리하면 기존 세션은 여전히 유효 (resolveAuth 에서 `isDeleted` 체크로 차단하지만 대부분 공개 엔드포인트는 resolveAuth 쓰지 않음). 차단 정책 확정 필요.
- **Sliding expiry 실제 동작** — `last_seen_at` 갱신은 있지만 `expires_at` 자체는 고정. 장기 활성 사용자 자동 연장이 되지 않음. 정책 결정 필요.
- **`user_taste_profiles`, 알림** 등과 세션 레이어 관계 미정.

## References

- `apps/bff/src/routes/auth.ts` — 5개 핸들러 (devLogin, me, logout, startGoogle, googleCallback, startKakao, kakaoCallback)
- `apps/bff/src/middleware/require-auth.ts` — requireAuth / resolveAuth
- `apps/bff/prisma/migrations/20260419200000_add_auth_sessions/`
- `apps/bff/prisma/migrations/20260419201000_allow_dev_auth_provider/`
- 관련 커밋: `c2bd555` (Stage 1 + dev-login), `d29bec3` (Google), `a038626` (Kakao)
