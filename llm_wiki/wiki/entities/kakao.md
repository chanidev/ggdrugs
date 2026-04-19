---
title: Kakao
type: entity
created: 2026-04-19
updated: 2026-04-19
related:
  - ../topics/auth-flow.md
---

# Kakao

## 역할

이중 용도:
1. **Kakao Maps** — 메인 지도 렌더링 (공개 JS SDK).
2. **Kakao OAuth** — 소셜 로그인 provider (REST API 키).

## Kakao Maps

- **JS SDK**: `dapi.kakao.com/v2/maps/sdk.js?appkey=<VITE_KAKAO_MAP_JS_KEY>&libraries=services,clusterer`
- 컴포넌트: `react-kakao-maps-sdk` 래퍼 사용 (Map / MapMarker / MarkerClusterer / Polygon / CustomOverlayMap / useKakaoLoader).
- Kakao 개발자 콘솔에서 해당 앱의 **카카오맵 제품 활성화 + 허용 도메인** 등록 필수 (localhost:5173, 프로덕션 도메인).
- 장애: StrictMode dev 에서 MarkerClusterer race → `ErrorBoundary` + StrictMode 제거로 대응 (main.tsx 주석 참조).

## Kakao OAuth

- **Authorize**: `https://kauth.kakao.com/oauth/authorize`
- **Token**: `https://kauth.kakao.com/oauth/token` (grant_type=authorization_code, client_secret 기본 미사용)
- **User info**: `GET https://kapi.kakao.com/v2/user/me` with `Authorization: Bearer <access_token>`
  - `id` → `users.social_uid`
  - `kakao_account.profile.nickname` → `users.nickname` (fallback `properties.nickname`, 그 외 `kakao-<id-last6>`)

## 인증 설정

- **Client ID**: Kakao Developers console → 내 애플리케이션 → 앱 키 → **REST API 키** (`KAKAO_REST_API_KEY`)
- **Redirect URI**: `http://localhost:5173/api/auth/kakao/callback` (Vite 경유)
- Kakao login 활성 + 동의 항목: 프로필 정보(닉네임) 필수로.

## 환경변수

- `VITE_KAKAO_MAP_JS_KEY` — 브라우저 노출용 (지도)
- `KAKAO_REST_API_KEY` — 서버 전용 (OAuth + 향후 지오코딩)

## 장애 시 동작

- 지도 SDK 로드 실패 → `SeoulMap.LoaderErrorNotice` 가 친절한 안내 표시.
- OAuth 미설정 → `/auth/kakao` → 503.
- 사용자 거부 → `?error=...` 로 콜백 도착, BFF 가 홈으로 리다이렉트하며 `?auth_error=` 쿼리 전달.

## 제한

- Kakao Maps 일일 요청 제한: 공용 앱 기준 상당량 (수십만) — 탐색형 서비스에 충분.
- Kakao 공식 SDK 의 Korean-only 성격 → 향후 다국어 대응 시 대체 필요 가능.
