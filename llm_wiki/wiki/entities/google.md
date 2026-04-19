---
title: Google
type: entity
created: 2026-04-19
updated: 2026-04-19
related:
  - ../topics/auth-flow.md
---

# Google

## 역할

Alle 의 **OAuth 2.0 소셜 로그인 provider**. A_100/A_101 유스케이스 중 하나.

## 사용 엔드포인트

- **Authorize**: `https://accounts.google.com/o/oauth2/v2/auth`
  - scope: `openid email profile`
  - response_type: `code`
  - access_type: `online`, prompt: `select_account`
- **Token exchange**: `https://oauth2.googleapis.com/token` (grant_type=authorization_code)
- **ID token 검증**: `https://oauth2.googleapis.com/tokeninfo?id_token=...`
  - `aud` 가 CLIENT_ID 와 일치 확인
  - `iss` 가 `accounts.google.com` 또는 `https://accounts.google.com`

## 인증 설정

- **Client**: Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application)
- **Redirect URI (dev)**: `http://localhost:5173/api/auth/google/callback` (Vite dev proxy 경유)
- **Redirect URI (prod)**: `https://<domain>/api/auth/google/callback`
- **OAuth consent screen**: External, scope `openid email profile` 만 사용 → non-sensitive, 심사 불필요

## 환경변수

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

미설정 시 `/auth/google` → 503 + 안내 메시지 (BFF `startGoogle`).

## 장애 시 동작

- 네트워크 오류: BFF callback 에서 token exchange 실패 시 400 + 에러 메시지.
- 사용자 거부: `?error=access_denied` → `/api/auth/google/callback` 으로 리다이렉트, BFF 가 `${WEB_URL}/?auth_error=access_denied` 로 전환해 웹 홈으로 복귀.

## 제한

- tokeninfo 엔드포인트 호출은 추가 round-trip. 향후 `jose` 로 로컬 JWT 검증 교체 검토.
- 공식 비율 제한은 낮음 (사용자 로그인 트래픽 기준) — 우려 없음.
