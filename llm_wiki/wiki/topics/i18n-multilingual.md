---
title: i18n 다국어 (6개 로케일)
type: topic
created: 2026-06-09
updated: 2026-06-09
related:
  - ui-architecture.md
  - semantic-search.md
  - ai-enrichment.md
  - db-schema-overview.md
  - tech-stack.md
---

# i18n 다국어 (6개 로케일)

## Summary

Alle 는 Phase 2 소셜 레이어(ADR 0007) 출하와 함께 **6개 로케일** 다국어를 갖췄다.
원본은 **한국어(ko)** 단일 소스이며, 거기서 **영어(en) · 베트남어(vi) · 중국어(zh, 간체) ·
일본어(ja) · 프랑스어(fr)** 5개 대상 언어를 파생한다. 모든 번역은 OpenAI `gpt-4o-mini`
로 생성하되, **두 개의 분리된 레이어**로 동작한다:

1. **빌드타임 정적 UI 번들** — 버튼/라벨/메뉴 등 고정 카피. `pnpm i18n:generate` 가
   ko JSON 을 읽어 5개 언어 JSON 을 미리 만들어 `apps/web/public/locales/` 에 커밋. 런타임 비용 0.
2. **런타임 온디맨드 콘텐츠 번역** — 사용자 생성 게시글 본문처럼 빌드 시점에 존재하지 않는
   텍스트. `POST /community/posts/:id/translate` 가 요청 시 LLM 을 호출하고 Redis 에 7일 캐시.

핵심 구분: **UI 카피는 빌드 산출물(파일)**, **콘텐츠는 런타임 산출물(Redis 캐시)**. 둘 다
같은 모델·같은 5개 대상 언어를 쓰지만 트리거·저장소·실패 모드가 전혀 다르다.

## 1. 로케일 집합

- 원본 소스: **ko (한국어)** — i18next `fallbackLng`. 번역 누락/로드 전엔 ko 원문 노출.
- 대상 5종: **en / vi / zh / ja / fr**.
- LLM 측 언어명 매핑(`services/llm/translate.py::LANGUAGE_NAMES`): en→English, vi→Vietnamese,
  zh→**Simplified Chinese**(간체 명시), ja→Japanese, fr→French.
- 웹 클라이언트 메타(`apps/web/src/lib/i18n.ts::SUPPORTED_LANGUAGES`)는 각 언어의 nativeLabel
  보유 — 한국어 / English / Tiếng Việt / 中文 / 日本語 / Français (LanguageToggle 표시용).
- BFF 콘텐츠 번역 라우트와 LLM 엔드포인트는 정규식 `^(en|vi|zh|ja|fr)$` 로 검증 — **ko 는
  대상에서 제외**(ko→ko 무의미). 웹 `translate.ts` 도 ko 호출 시 400 유발하므로 사전 필터.

## 2. 빌드타임 정적 UI 번들 (generate-i18n-bundles.ts)

- 스크립트: `apps/bff/src/jobs/generate-i18n-bundles.ts` (`pnpm i18n:generate`).
- **네임스페이스 8종** (`NAMESPACES`): `common`, `navigation`, `community`, `mate`, `chat`,
  `uploader`, `admin`, `mypage`. 화면 도메인 단위로 키를 분할 — 페이지가 자기 ns 만 로드.
- 흐름: ko/`{ns}.json` 을 읽어 → 각 대상 언어로 `LLM /translate-bundle` 1 호출(네임스페이스
  통째로) → `apps/web/public/locales/{lang}/{ns}.json` 으로 저장. 8 ns × 5 lang = 최대 40 파일.
- LLM 측(`translate.py::translate_bundle`): JSON **값만** 번역, **키 보존**, `{{variable}}`
  보간 플레이스홀더 보존, 마크다운 펜스 금지, temperature 0.1, max_tokens 8000. 반환 JSON 을
  파싱(코드펜스 자동 strip).
- 견고성: 호출 실패 시 1회 재시도(`RETRY=1`, 2.4s 백오프) 후 그래도 실패하면 **빈 객체 저장
  금지** — 실패 건수 집계 후 `process.exit(1)`. 호출 간 1.2s rate-limit 딜레이.
- 산출물은 정적 파일이므로 **런타임 번역 비용 0**, 모든 사용자에게 동일한 사전번역 카피 제공.

## 3. 런타임 온디맨드 콘텐츠 번역 (translate.ts + translation-cache.ts)

- 라우트: `POST /community/posts/:id/translate`, body `{ targetLanguage }` (en|vi|zh|ja|fr).
  핸들러 `apps/bff/src/routes/translate.ts::translatePost`. 비로그인도 호출 가능(resolveAuth).
- 흐름:
  1. 게시글 조회(`isDeleted=false` + `expiresAt > now`), 없으면 404.
  2. 본문 sha256 앞 16hex (`contentHash`) 계산 → 캐시 키 세그먼트.
  3. **Redis 캐시 확인** — hit 이면 `cached:true` 즉시 반환(LLM 미호출).
  4. miss 이면 `LLM /translate-post` 호출(`content`, `target_lang`).
  5. LLM 실패 시 **503 `translation service unavailable`** 반환(graceful degradation 아님,
     명시적 실패). 웹은 503 → `translateUnavailable` i18n 키 표시.
  6. 성공 시에만 캐시 저장 후 `cached:false` 반환.
- LLM 측(`translate.py::translate_post_content`): 단일 텍스트 번역, `{{placeholders}}` 보존,
  설명 없이 번역문만, temperature 0.2, max_tokens 4000.
- 웹 클라이언트: `apps/web/src/lib/api/translate.ts::translatePostContent` — 404→`POST_NOT_FOUND`,
  400→`INVALID_LANG`, 503→`LLM_UNAVAILABLE` 로 매핑.

## 4. 번역 캐시 전략 (translation-cache.ts)

- **저장소: Redis** (DB 아님 — Prisma 스키마 변경/마이그레이션 없음).
- 캐시 키: `post:translation:{postId}:{lang}:{contentHash}`, **TTL 7일**(604800s).
- contentHash 를 키에 포함하는 이유: 게시글 본문 수정 시 키가 바뀌어 자동 miss → 재번역.
  구 키는 TTL 만료로 자연 소멸. 해시 누락 시 최대 7일간 옛 번역을 노출하던 stale-serve 버그
  방어선.
- prefix 분리로 Socket.IO adapter 키(`socket.io#*`) 및 stream-cache 키와 충돌 없음.
- Redis 장애는 캐시 miss 로 간주하고 번역을 계속 진행(`.catch(() => null)`).

## 5. 웹 클라이언트 셋업 (i18next)

- 진입: `apps/web/src/lib/i18n.ts`. 플러그인 체인 — `HttpBackend` → `LanguageDetector` →
  `initReactI18next`. `main.tsx` 가 `I18nextProvider` 로 앱 래핑.
- 백엔드 로드: `loadPath: '/locales/{{lng}}/{{ns}}.json'` — 정적 번들을 lazy fetch.
- 언어 감지: `order: ['localStorage', 'navigator']`, `lookupLocalStorage: 'i18n_language'`,
  `caches: ['localStorage']`. 즉, 저장된 선택값 우선, 없으면 브라우저 언어.
- 설정: `fallbackLng: 'ko'`, `supportedLngs: [ko,en,vi,zh,ja,fr]`, `defaultNS: 'common'`,
  `ns` = 위 8종, `interpolation.escapeValue: false`.
- `react.useSuspense: false` — Suspense 경계 없이 번역 로드 전 ko 원문을 보여준 뒤 교체(빈
  화면/에러 방지).
- 전환 UI: `LanguageToggle.tsx` (GG-COMM-013) 드롭다운 → `useLanguage().setLanguage()` 가
  `i18n.changeLanguage()` + `localStorage('i18n_language')` 저장. 선택 즉시 전 서비스 반영.

## 6. 사용 모델

- 빌드타임·런타임 **양쪽 모두 OpenAI `gpt-4o-mini`** (`translate.py` 하드코딩). 채팅용 god
  체인과 동일 패밀리 — semantic-search.md / ai-enrichment.md 의 Stage 2 모델과 같음.
- 두 LLM 엔드포인트 공히 `_openai_available()` 게이트(키 보유 + 일일 예산 미초과) 통과 시에만
  호출, 아니면 503. ai-enrichment.md 의 비용 관측(cost_tracker)·예산 가드와 동일 인프라.

## References

- `apps/bff/src/jobs/generate-i18n-bundles.ts` — 빌드타임 번들 생성 (`pnpm i18n:generate`)
- `apps/bff/src/routes/translate.ts` — 런타임 게시글 번역 라우트 (캐시 + 503 폴백)
- `apps/bff/src/lib/translation-cache.ts` — Redis 캐시 helper (키·TTL·contentHash)
- `apps/web/src/lib/i18n.ts` — i18next init (HttpBackend + LanguageDetector + 8 ns)
- `apps/web/src/lib/useLanguage.ts` — 언어 전환 훅
- `apps/web/src/components/LanguageToggle.tsx` — 언어 선택 드롭다운 (GG-COMM-013)
- `apps/web/src/lib/api/translate.ts` — 웹 측 번역 호출 + 에러 매핑
- `apps/web/public/locales/{ko,en,vi,zh,ja,fr}/{common,navigation,community,mate,chat,uploader,admin,mypage}.json` — 로케일 번들
- `services/llm/translate.py` — `translate_bundle` / `translate_post_content` (gpt-4o-mini)
- `services/llm/app.py` — `/translate-bundle`, `/translate-post` 엔드포인트 (lang 정규식 검증 + 503/502)
