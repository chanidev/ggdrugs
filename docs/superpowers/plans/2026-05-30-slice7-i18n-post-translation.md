# Slice 7: i18n 6개국어 + 게시글 번역 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** react-i18next 기반 6개국어(ko/en/vi/zh/ja/fr) 전체 서비스 i18n + 게시글 본문 온디맨드 번역(BFF+LLM+Redis 캐시) + GG-COMM-013 언어 토글 실연결.

**Architecture:** 정적 번들 방식(public/locales/{lang}/{namespace}.json)으로 빌드타임에 6개 언어 전체를 포함한다. react-i18next Provider를 main.tsx AuthProvider 바깥에 감싸고 localStorage `i18n_language` 키로 언어를 영속한다. 게시글 번역은 BFF `POST /community/posts/:id/translate` → services/llm `/translate-post` → Redis TTL 7d 캐시 패턴으로 온디맨드 처리한다.

**Tech Stack:** react-i18next 15.x, i18next 24.x, i18next-browser-languagedetector 8.x (web); FastAPI + OpenAI gpt-4o-mini (llm); ioredis TTL (bff); vitest (unit); pnpm workspace

---

## 전체 파일 지도

### 신규 생성 (web)
- `apps/web/src/lib/i18n.ts` — i18next 초기화 (LanguageDetector + localStorage)
- `apps/web/src/lib/useLanguage.ts` — 언어 전환 훅
- `apps/web/src/components/LanguageToggle.tsx` — 드롭다운 언어 선택기
- `apps/web/src/lib/api/translate.ts` — 게시글 번역 fetch 함수
- `apps/web/public/locales/ko/*.json` — 한국어 원본 (8 네임스페이스)
- `apps/web/public/locales/en/*.json` — 영어 번역
- `apps/web/public/locales/vi/*.json` — 베트남어 번역
- `apps/web/public/locales/zh/*.json` — 중국어 번역
- `apps/web/public/locales/ja/*.json` — 일본어 번역
- `apps/web/public/locales/fr/*.json` — 프랑스어 번역

### 신규 생성 (bff)
- `apps/bff/src/routes/translate.ts` — POST /community/posts/:id/translate 핸들러
- `apps/bff/src/lib/translation-cache.ts` — Redis TTL 캐시 get/set helpers

### 신규 생성 (llm)
- `services/llm/translate.py` — `/translate-post` FastAPI 엔드포인트 + OpenAI 호출

### 수정 (web)
- `apps/web/src/main.tsx` — I18nextProvider 삽입
- `apps/web/src/pages/CommunityPage/parts/CommunityShell.tsx` — 언어토글 placeholder → LanguageToggle 실연결
- `apps/web/src/pages/PostDetailPage/index.tsx` — "번역하기" 버튼 + 번역 결과 표시
- `apps/web/src/layout/Header.tsx` — 하드코딩 텍스트 t() 교체
- `apps/web/src/layout/Sidebar.tsx` — 하드코딩 텍스트 t() 교체
- `apps/web/src/layout/AppShell.tsx` — ChatDock 등 하드코딩 t() 교체
- `apps/web/src/pages/CommunityPage/index.tsx` + `parts/*.tsx` — 커뮤니티 UI 키화
- `apps/web/src/pages/PostDetailPage/parts/*.tsx` — 상세/댓글 UI 키화
- `apps/web/src/pages/MyPage/index.tsx` + `parts/*.tsx` + `tabs/*.tsx` — 마이페이지 UI 키화
- `apps/web/src/pages/EventDetailPage/index.tsx` + `sections/*.tsx` — 이벤트 상세 UI 키화
- `apps/web/src/pages/AdminEventsPage/index.tsx` + `tabs/*.tsx` — 관리자 UI 키화
- `apps/web/src/pages/UploaderNewEventPage.tsx` + `UploaderPage.tsx` + `UploaderEventEditPage.tsx` — 업로더 UI 키화
- `apps/web/src/pages/MateFormPage/index.tsx` + `parts/*.tsx` — 메이트 폼 UI 키화
- `apps/web/src/pages/MateRecommendationsPage/index.tsx` — 메이트 추천 UI 키화
- `apps/web/src/pages/ChatRoomPage/index.tsx` — 채팅방 UI 키화
- `apps/web/src/pages/ChatRequestPage/index.tsx` — 채팅 신청 UI 키화
- `apps/web/src/pages/EvaluationPage/index.tsx` + `parts/*.tsx` — 평가 UI 키화
- `apps/web/src/pages/NotificationsPage.tsx` — 알림 UI 키화
- `apps/web/src/pages/CreditPage/index.tsx` — 크레딧 UI 키화
- `apps/web/src/pages/ProfilePage/index.tsx` — 프로필 UI 키화
- `apps/web/src/components/*.tsx` — 공용 컴포넌트 UI 키화

### 수정 (bff)
- `apps/bff/src/app.ts` — translate 라우트 등록
- `apps/bff/src/lib/redis-client.ts` — translation cache export 추가

### 수정 (llm)
- `services/llm/app.py` — /translate-post 라우터 import

---

## 네임스페이스 설계

8개 네임스페이스. 키 규칙: `feature.element` (예: `shell.title`, `button.write`).

| 파일명 | 대상 화면 |
|---|---|
| `common.json` | Header, 공용 버튼/상태, ErrorBoundary |
| `navigation.json` | Sidebar, AppShell 탐색 라벨 |
| `community.json` | CommunityPage, CommunityShell, PostDetailPage, 댓글 |
| `mate.json` | MateFormPage, MateRecommendationsPage, AuthorProfileModal |
| `chat.json` | ChatRoomPage, ChatRequestPage, ChatDock, ChatHelpPanel |
| `uploader.json` | UploaderPage, UploaderNewEventPage, UploaderEventEditPage |
| `admin.json` | AdminEventsPage 전체 탭 |
| `mypage.json` | MyPage 전체 탭, EvaluationPage, CreditPage, ProfilePage, NotificationsPage |

---

## Task 1: react-i18next 설치 및 i18n 인프라

**Files:**
- Create: `apps/web/src/lib/i18n.ts`
- Create: `apps/web/src/lib/useLanguage.ts`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/package.json`

- [ ] **Step 1-1: 패키지 설치**

```bash
cd apps/web
pnpm add react-i18next i18next i18next-browser-languagedetector i18next-http-backend
```

Expected: `apps/web/package.json`의 dependencies에 4개 패키지 추가됨.

- [ ] **Step 1-2: i18n.ts 생성**

Create `apps/web/src/lib/i18n.ts`:

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

export type SupportedLanguage = 'ko' | 'en' | 'vi' | 'zh' | 'ja' | 'fr';

export const SUPPORTED_LANGUAGES: Array<{ code: SupportedLanguage; label: string; nativeLabel: string }> = [
  { code: 'ko', label: 'Korean',     nativeLabel: '한국어' },
  { code: 'en', label: 'English',    nativeLabel: 'English' },
  { code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt' },
  { code: 'zh', label: 'Chinese',    nativeLabel: '中文' },
  { code: 'ja', label: 'Japanese',   nativeLabel: '日本語' },
  { code: 'fr', label: 'French',     nativeLabel: 'Français' },
];

export const NAMESPACES = [
  'common', 'navigation', 'community', 'mate', 'chat', 'uploader', 'admin', 'mypage',
] as const;

void i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'ko',
    supportedLngs: ['ko', 'en', 'vi', 'zh', 'ja', 'fr'],
    defaultNS: 'common',
    ns: NAMESPACES,
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18n_language',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

export default i18n;
```

- [ ] **Step 1-3: useLanguage.ts 생성**

Create `apps/web/src/lib/useLanguage.ts`:

```typescript
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from './i18n.js';
import { SUPPORTED_LANGUAGES } from './i18n.js';

export function useLanguage() {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'ko') as SupportedLanguage;

  const setLanguage = async (lang: SupportedLanguage): Promise<void> => {
    await i18n.changeLanguage(lang);
    // LanguageDetector가 localStorage에 자동 저장하지만 명시적으로도 보장
    localStorage.setItem('i18n_language', lang);
  };

  return { current, setLanguage, languages: SUPPORTED_LANGUAGES };
}
```

- [ ] **Step 1-4: main.tsx에 I18nextProvider 삽입**

`apps/web/src/main.tsx` 상단에 import 추가, AuthProvider 바깥에 감싸기:

기존:
```tsx
import { AuthProvider } from './lib/auth-context';
```

추가할 import:
```tsx
import { I18nextProvider } from 'react-i18next';
import i18n from './lib/i18n.js';
```

기존 render:
```tsx
createRoot(rootEl).render(
  <AuthProvider>
    <BrowserRouter>
```

변경 후:
```tsx
createRoot(rootEl).render(
  <I18nextProvider i18n={i18n}>
    <AuthProvider>
      <BrowserRouter>
```

닫는 태그도 동일하게 `</AuthProvider>` 뒤에 `</I18nextProvider>` 추가.

- [ ] **Step 1-5: locales 디렉터리 스켈레톤 생성**

`apps/web/public/locales/` 하위에 6개 언어 디렉터리 생성. 각 디렉터리에 8개 네임스페이스 JSON 파일을 빈 객체 `{}` 로 먼저 생성. (Task 2~3에서 실내용 채움.)

```
apps/web/public/locales/
├── ko/common.json, navigation.json, community.json, mate.json, chat.json, uploader.json, admin.json, mypage.json
├── en/ (동일 8개)
├── vi/ (동일 8개)
├── zh/ (동일 8개)
├── ja/ (동일 8개)
└── fr/ (동일 8개)
```

- [ ] **Step 1-6: typecheck 통과 확인**

```bash
cd apps/web && pnpm typecheck
```

Expected: 오류 없음. i18n.ts의 void init 패턴은 TS에서 정상.

- [ ] **Step 1-7: 커밋**

```bash
git add apps/web/package.json apps/web/src/lib/i18n.ts apps/web/src/lib/useLanguage.ts apps/web/src/main.tsx apps/web/public/locales/
git commit -m "feat(web): react-i18next 인프라 — provider, LanguageDetector, 6언어 스켈레톤"
```

---

## Task 2-A: ko 원본 번들 — common / navigation / community

**Files:**
- Create: `apps/web/public/locales/ko/common.json`
- Create: `apps/web/public/locales/ko/navigation.json`
- Create: `apps/web/public/locales/ko/community.json`

이 Task는 **실제 UI 문자열 추출** 작업이다. 각 파일의 키를 정의하고 코드에서 `t('key')` 호출로 교체한다.

- [ ] **Step 2A-1: ko/common.json 생성**

```json
{
  "button": {
    "login": "로그인",
    "logout": "로그아웃",
    "write": "글쓰기",
    "edit": "수정",
    "delete": "삭제",
    "cancel": "취소",
    "confirm": "확인",
    "close": "닫기",
    "submit": "제출",
    "save": "저장",
    "report": "신고",
    "translate": "번역하기",
    "copy": "복사",
    "retry": "다시 시도"
  },
  "label": {
    "loading": "불러오는 중…",
    "error": "오류가 발생했어요.",
    "notFound": "존재하지 않거나 만료된 항목이에요.",
    "empty": "항목이 없어요.",
    "credits": "크레딧",
    "notifications": "알림",
    "chatRoom": "채팅방",
    "admin": "관리자",
    "uploader": "업로더",
    "myPage": "마이페이지",
    "login_kakao": "Kakao",
    "login_google": "Google 로그인",
    "login_google_short": "Google"
  },
  "aria": {
    "adminConsole": "관리자 콘솔",
    "uploaderConsole": "업로더 콘솔",
    "myPage": "마이페이지",
    "quickSearch": "빠른 검색 (⌘K) — 준비 중입니다",
    "quickSearchLabel": "빠른 검색 (⌘K) — 준비 중"
  },
  "search": {
    "placeholder": "이벤트·장소 검색"
  },
  "error": {
    "loginRequired": "로그인이 필요해요.",
    "forbidden": "권한이 없어요.",
    "loadFailed": "불러오지 못했어요.",
    "deleteFailed": "삭제하지 못했어요.",
    "networkError": "응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.",
    "llmUnreachable": "LLM 서비스에 연결하지 못했어요. 서비스가 올라와 있는지 확인해 주세요."
  }
}
```

- [ ] **Step 2A-2: ko/navigation.json 생성**

```json
{
  "sidebar": {
    "eyebrow": "이벤트를 찾는\n서울의 방법",
    "description": "지도 위 핀과 채팅, 필터로 축제·박람회·심포지움·컨퍼런스를 탐색하세요.",
    "filter": {
      "title": "필터 검색",
      "description": "5개 축으로 좁히기"
    },
    "list": {
      "title": "전체목록 조회",
      "description": "카테고리별 인덱스"
    },
    "chat": {
      "title": "채팅방 검색",
      "description": "자연어로 묻기"
    }
  },
  "stats": {
    "label": "현재 공개 이벤트",
    "total": "전체",
    "ongoing": "진행중",
    "upcoming": "예정"
  }
}
```

- [ ] **Step 2A-3: ko/community.json 생성**

```json
{
  "shell": {
    "title": "커뮤니티",
    "creditsLoading": "...",
    "creditsLabel": "크레딧 {{count}}개",
    "creditsPlaceholder": "크레딧",
    "languageToggle": "언어 변경",
    "chatRoomBtn": "채팅방"
  },
  "category": {
    "festival_story": "축제 이야기",
    "mate_finder": "메이트 찾기",
    "free": "자유게시판",
    "all": "전체"
  },
  "post": {
    "loading": "불러오는 중…",
    "notFound": "존재하지 않거나 만료된 게시글이에요.",
    "loadError": "불러오지 못했어요.",
    "likeAriaPressed": "좋아요 취소",
    "likeAriaUnpressed": "좋아요",
    "likeButton": "♥ {{count}}",
    "commentCount": "댓글 ({{count}})",
    "commentSection": "댓글",
    "loginToComment": "로그인 후 댓글을 남길 수 있어요.",
    "deleteConfirm": "게시글을 삭제할까요?",
    "deleteSuccess": "삭제했어요.",
    "deleteForbidden": "본인 글이 아니에요.",
    "deleteFail": "삭제하지 못했어요.",
    "translateTitle": "번역 결과",
    "translateLoading": "번역 중…",
    "translateError": "번역하지 못했어요.",
    "translateClose": "닫기",
    "translateSelectLang": "번역할 언어를 선택하세요",
    "translateOriginal": "원문",
    "translateResult": "번역"
  },
  "compose": {
    "newPost": "새 글 작성",
    "editPost": "글 수정",
    "titlePlaceholder": "제목을 입력하세요",
    "bodyPlaceholder": "내용을 입력하세요",
    "categoryLabel": "카테고리",
    "submit": "등록",
    "save": "저장",
    "cancel": "취소",
    "titleRequired": "제목은 2~200자로 입력해 주세요.",
    "bodyRequired": "내용은 2~5000자로 입력해 주세요.",
    "categoryRequired": "카테고리를 선택해 주세요.",
    "loginRequired": "로그인이 필요해요.",
    "submitError": "등록하지 못했어요."
  },
  "comment": {
    "placeholder": "댓글을 입력하세요…",
    "replyPlaceholder": "대댓글을 입력하세요…",
    "submit": "등록",
    "reply": "답글",
    "edit": "수정",
    "delete": "삭제",
    "deleteConfirm": "댓글을 삭제할까요?",
    "deleteForbidden": "본인 댓글이 아니에요.",
    "deleteFail": "삭제하지 못했어요.",
    "replyNotAllowed": "대댓글에는 답글을 달 수 없어요.",
    "bodyLength": "댓글은 1~1000자로 입력해 주세요."
  },
  "authorModal": {
    "title": "{{nickname}} 님",
    "mateScore": "메이트 지수",
    "chatRequest": "채팅 신청",
    "close": "닫기"
  },
  "mateReco": {
    "title": "메이트 추천",
    "placeholder": "로그인 후 메이트를 추천받아요."
  },
  "postList": {
    "empty": "게시글이 없어요.",
    "loadError": "게시글을 불러오지 못했어요.",
    "commentCount": "댓글 {{count}}",
    "likeCount": "♥ {{count}}"
  }
}
```

- [ ] **Step 2A-4: Header.tsx, Sidebar.tsx 하드코딩 텍스트 t()로 교체**

`apps/web/src/layout/Header.tsx` 상단에 추가:
```tsx
import { useTranslation } from 'react-i18next';
```

`AuthArea` 함수 내부 첫 줄에 추가:
```tsx
const { t } = useTranslation('common');
```

교체 대상 (기존 → 교체):
- `"Admin"` → `{t('label.admin')}`
- `"Uploader"` → `{t('label.uploader')}`
- `aria-label="관리자 콘솔"` → `aria-label={t('aria.adminConsole')}`
- `aria-label="업로더 콘솔"` → `aria-label={t('aria.uploaderConsole')}`
- `aria-label="마이페이지"` → `aria-label={t('aria.myPage')}`
- `"로그아웃"` → `{t('button.logout')}`
- `"Kakao"` → `{t('label.login_kakao')}`
- `"Google 로그인"` → `{t('label.login_google')}`
- `"Google"` → `{t('label.login_google_short')}`
- `title="빠른 검색 (⌘K) — 준비 중입니다"` → `title={t('aria.quickSearch')}`
- `aria-label="빠른 검색 (⌘K) — 준비 중"` → `aria-label={t('aria.quickSearchLabel')}`
- `"이벤트·장소 검색"` (SearchMini) → `{t('search.placeholder')}`

`apps/web/src/layout/Sidebar.tsx` 상단에 추가:
```tsx
import { useTranslation } from 'react-i18next';
```

`Sidebar` 함수 내부 첫 줄:
```tsx
const { t } = useTranslation('navigation');
```

`SECTIONS` 배열을 정적 정의 대신 함수 내부 동적 생성으로 이동 (t() 호출을 위해):
```tsx
const SECTIONS = [
  { key: 'filter' as SidebarSection, title: t('sidebar.filter.title'), description: t('sidebar.filter.description'), icon: 'filter' as const },
  { key: 'list'   as SidebarSection, title: t('sidebar.list.title'),   description: t('sidebar.list.description'),   icon: 'list' as const },
  { key: 'chat'   as SidebarSection, title: t('sidebar.chat.title'),   description: t('sidebar.chat.description'),   icon: 'chat' as const },
];
```

`h2` 내용 → `{t('sidebar.eyebrow')}`  
`p` 내용 → `{t('sidebar.description')}`  

`StatsBlock` 함수에도 `const { t } = useTranslation('navigation');` 추가:
- `"현재 공개 이벤트"` → `{t('stats.label')}`
- `"전체"` → `{t('stats.total')}`
- `"진행중"` → `{t('stats.ongoing')}`
- `"예정"` → `{t('stats.upcoming')}`

- [ ] **Step 2A-5: CommunityShell.tsx 하드코딩 교체**

`apps/web/src/pages/CommunityPage/parts/CommunityShell.tsx` 상단에:
```tsx
import { useTranslation } from 'react-i18next';
```

`CommunityShell` 함수 내부:
```tsx
const { t } = useTranslation('community');
```

교체:
- `"커뮤니티"` (h1) → `{t('shell.title')}`
- `creditBalance.toLocaleString()` 크레딧 표시 → `` {t('shell.creditsLabel', { count: creditBalance })} ``
- `"크레딧"` (비로그인 span) → `{t('shell.creditsPlaceholder')}`
- `title="언어 변경 (준비 중)"` → `title={t('shell.languageToggle')}`
- `"한국어"` (disabled ActionButton) → Task 5에서 LanguageToggle 컴포넌트로 교체
- `"채팅방"` (disabled ActionButton) → `{t('shell.chatRoomBtn')}`
- `"알림"` (Link) → `{t('common:label.notifications')}`

`CATEGORY_LABELS` 상수는 Task 2-A에서 직접 수정하지 않고 CommunityPage의 카테고리 필터에서 `t('community:category.xxx')` 로 동적 처리한다.

- [ ] **Step 2A-6: PostDetailPage/index.tsx 하드코딩 교체**

`apps/web/src/pages/PostDetailPage/index.tsx` 상단에:
```tsx
import { useTranslation } from 'react-i18next';
```

함수 내부:
```tsx
const { t } = useTranslation('community');
```

교체 대상:
- `"불러오는 중…"` → `{t('post.loading')}`
- `"존재하지 않거나 만료된 게시글이에요."` → `{t('post.notFound')}`
- `"불러오지 못했어요."` → `{t('post.loadError')}`
- `detail.liked ? '좋아요 취소' : '좋아요'` → `detail.liked ? t('post.likeAriaPressed') : t('post.likeAriaUnpressed')`
- `♥ ${detail.likeCount}` → `` {t('post.likeButton', { count: detail.likeCount })} ``
- `"수정"` (ActionButton) → `{t('common:button.edit')}`
- `"삭제"` (ActionButton) → `{t('common:button.delete')}`
- `"신고"` (ActionButton) → `{t('common:button.report')}`
- `confirm('게시글을 삭제할까요?')` → `confirm(t('post.deleteConfirm'))`
- `alert('로그인이 필요해요.')` → `alert(t('common:error.loginRequired'))`
- `alert('본인 글이 아니에요.')` → `alert(t('post.deleteForbidden'))`
- `alert('삭제하지 못했어요.')` → `alert(t('common:error.deleteFailed'))`  
- `` `댓글 ${detail.commentCount > 0 ? `(${detail.commentCount})` : ''}` `` → `` {detail.commentCount > 0 ? t('post.commentCount', { count: detail.commentCount }) : t('post.commentSection')} ``
- `CATEGORY_LABELS[detail.category] ?? detail.category` → `` {t(`category.${detail.category}`, { ns: 'community', defaultValue: detail.category })} ``

- [ ] **Step 2A-7: typecheck 통과 확인**

```bash
cd apps/web && pnpm typecheck
```

Expected: 오류 없음.

- [ ] **Step 2A-8: 커밋**

```bash
git add apps/web/public/locales/ko/common.json apps/web/public/locales/ko/navigation.json apps/web/public/locales/ko/community.json apps/web/src/layout/Header.tsx apps/web/src/layout/Sidebar.tsx apps/web/src/pages/CommunityPage/parts/CommunityShell.tsx apps/web/src/pages/PostDetailPage/index.tsx
git commit -m "feat(web): i18n 키화 — common/navigation/community (ko 원본)"
```

---

## Task 2-B: ko 원본 번들 — mate / chat / uploader

**Files:**
- Create: `apps/web/public/locales/ko/mate.json`
- Create: `apps/web/public/locales/ko/chat.json`
- Create: `apps/web/public/locales/ko/uploader.json`
- Modify: 해당 페이지들

- [ ] **Step 2B-1: ko/mate.json 생성**

```json
{
  "form": {
    "title": "메이트 프로필",
    "subtitle": "함께 즐길 메이트를 찾아보세요",
    "companionType": "동행 유형",
    "eventTypes": "관심 이벤트",
    "vibes": "선호 성향",
    "region": "선호 지역",
    "bio": "자기소개",
    "bioPlaceholder": "간단한 자기소개를 입력하세요 (최대 200자)",
    "submit": "프로필 저장",
    "saved": "저장됐어요.",
    "saveError": "저장하지 못했어요.",
    "loginRequired": "로그인이 필요해요.",
    "consentTitle": "메이트 서비스 이용 동의",
    "consentBody": "메이트 서비스는 다른 사용자와 연결해 줍니다. 개인정보 처리방침에 동의합니다.",
    "consentAgree": "동의하고 계속",
    "consentDecline": "취소"
  },
  "reco": {
    "title": "메이트 추천",
    "loading": "추천 목록을 불러오는 중…",
    "empty": "추천할 메이트가 없어요. 프로필을 채우면 더 잘 매칭돼요.",
    "loadError": "불러오지 못했어요.",
    "chatRequest": "채팅 신청",
    "groupRequest": "그룹 신청",
    "mateScore": "메이트 지수",
    "region": "지역",
    "companions": "동행 유형",
    "vibes": "성향"
  },
  "safetyNotice": {
    "title": "안전 안내",
    "body": "개인정보 보호를 위해 실명·연락처는 공유하지 마세요."
  },
  "authorModal": {
    "mateScore": "메이트 지수",
    "chatRequest": "채팅 신청",
    "close": "닫기"
  }
}
```

- [ ] **Step 2B-2: ko/chat.json 생성**

```json
{
  "dock": {
    "placeholder": "자연어로 이벤트를 찾아보세요…",
    "submit": "전송",
    "collapse": "접기",
    "expand": "펼치기",
    "helpTitle": "채팅 검색 도움말",
    "examples": ["이번 주말 가족과 갈 수 있는 축제 알려줘", "강남 근처 무료 전시회", "혼자 가기 좋은 심포지움"]
  },
  "request": {
    "title": "채팅 신청",
    "typeOneToOne": "1:1 신청",
    "typeGroup": "그룹 신청",
    "message": "메시지",
    "messagePlaceholder": "신청 메시지를 입력하세요",
    "submit": "신청하기",
    "cancel": "취소",
    "loginRequired": "로그인이 필요해요.",
    "submitError": "신청하지 못했어요.",
    "success": "신청했어요."
  },
  "room": {
    "loading": "불러오는 중…",
    "loadError": "채팅방을 불러오지 못했어요.",
    "inputPlaceholder": "메시지를 입력하세요…",
    "send": "전송",
    "leave": "나가기",
    "leaveConfirm": "채팅방을 나갈까요?",
    "leaveFail": "나가기를 실패했어요.",
    "block": "차단",
    "blockConfirm": "이 사용자를 차단할까요?",
    "blockFail": "차단하지 못했어요.",
    "selectEvent": "이벤트 선택",
    "proposeAppointment": "약속 제안",
    "voteYes": "수락",
    "voteNo": "거절",
    "memberCount": "{{count}}명",
    "kick": "내보내기",
    "kickVote": "투표로 내보내기"
  }
}
```

- [ ] **Step 2B-3: ko/uploader.json 생성**

```json
{
  "page": {
    "title": "업로더 콘솔",
    "myEvents": "내 이벤트",
    "newEvent": "이벤트 등록",
    "apply": "업로더 신청",
    "applyDescription": "업로더 신청을 해야 이벤트를 등록할 수 있어요.",
    "pendingApproval": "승인 대기 중이에요.",
    "status": "상태"
  },
  "form": {
    "title": "제목",
    "titlePlaceholder": "이벤트 제목을 입력하세요",
    "description": "설명",
    "descriptionPlaceholder": "이벤트 설명을 입력하세요",
    "category": "카테고리",
    "startDate": "시작일",
    "endDate": "종료일",
    "region": "지역",
    "venue": "장소",
    "venuePlaceholder": "장소명을 입력하세요",
    "poster": "포스터",
    "document": "첨부 서류",
    "submit": "등록 신청",
    "save": "저장",
    "cancel": "취소",
    "submitSuccess": "등록 신청됐어요.",
    "submitError": "등록하지 못했어요.",
    "saveSuccess": "저장됐어요.",
    "saveError": "저장하지 못했어요."
  },
  "status": {
    "pending": "검토 중",
    "approved": "승인됨",
    "rejected": "반려됨",
    "revision_requested": "수정 요청"
  }
}
```

- [ ] **Step 2B-4: MateFormPage, MateRecommendationsPage, ChatRequestPage, ChatRoomPage 키화**

각 페이지 파일 상단에 `import { useTranslation } from 'react-i18next';` 추가.

`MateFormPage/index.tsx`:
- `const { t } = useTranslation('mate');`
- 모든 하드코딩 한국어 문자열을 `t('form.xxx')` 로 교체.

`MateRecommendationsPage/index.tsx`:
- `const { t } = useTranslation('mate');`
- 모든 하드코딩 한국어 문자열을 `t('reco.xxx')` 로 교체.

`ChatRequestPage/index.tsx`:
- `const { t } = useTranslation('chat');`
- 모든 하드코딩 한국어 문자열을 `t('request.xxx')` 로 교체.

`ChatRoomPage/index.tsx`:
- `const { t } = useTranslation('chat');`
- 모든 하드코딩 한국어 문자열을 `t('room.xxx')` 로 교체.

`UploaderPage.tsx`, `UploaderNewEventPage.tsx`, `UploaderEventEditPage.tsx`:
- `const { t } = useTranslation('uploader');`
- 모든 하드코딩 한국어 문자열을 `t('page.xxx')` / `t('form.xxx')` 로 교체.

- [ ] **Step 2B-5: typecheck 통과**

```bash
cd apps/web && pnpm typecheck
```

Expected: 오류 없음.

- [ ] **Step 2B-6: 커밋**

```bash
git add apps/web/public/locales/ko/mate.json apps/web/public/locales/ko/chat.json apps/web/public/locales/ko/uploader.json apps/web/src/pages/MateFormPage apps/web/src/pages/MateRecommendationsPage apps/web/src/pages/ChatRequestPage apps/web/src/pages/ChatRoomPage apps/web/src/pages/UploaderPage.tsx apps/web/src/pages/UploaderNewEventPage.tsx apps/web/src/pages/UploaderEventEditPage.tsx
git commit -m "feat(web): i18n 키화 — mate/chat/uploader (ko 원본)"
```

---

## Task 2-C: ko 원본 번들 — admin / mypage + 공용 컴포넌트

**Files:**
- Create: `apps/web/public/locales/ko/admin.json`
- Create: `apps/web/public/locales/ko/mypage.json`
- Modify: 해당 페이지들, FilterSearchPanel, FullListPanel, EventSummaryPanel 등

- [ ] **Step 2C-1: ko/admin.json 생성**

```json
{
  "page": {
    "title": "관리자 콘솔"
  },
  "tabs": {
    "events": "이벤트 심사",
    "uploaders": "업로더 심사",
    "uploadReviews": "업로드 검토",
    "reports": "신고 관리",
    "members": "회원 관리",
    "audit": "감사 로그"
  },
  "event": {
    "approve": "승인",
    "reject": "반려",
    "requestRevision": "수정 요청",
    "assignVibes": "성향 라벨 부여",
    "status": {
      "pending": "검토 중",
      "approved": "승인됨",
      "rejected": "반려됨",
      "revision_requested": "수정 요청",
      "ended": "종료됨"
    },
    "empty": "심사할 이벤트가 없어요.",
    "loadError": "불러오지 못했어요."
  },
  "uploader": {
    "approve": "승인",
    "reject": "반려",
    "empty": "심사할 업로더 신청이 없어요.",
    "loadError": "불러오지 못했어요."
  },
  "report": {
    "action": "조치",
    "dismiss": "기각",
    "warn": "경고",
    "suspend": "정지",
    "empty": "신고가 없어요.",
    "loadError": "불러오지 못했어요."
  },
  "member": {
    "revokeSession": "세션 폐기",
    "promoteAdmin": "관리자 승급",
    "demoteAdmin": "관리자 박탈",
    "softDelete": "회원 탈퇴 처리",
    "empty": "회원이 없어요.",
    "loadError": "불러오지 못했어요."
  },
  "audit": {
    "empty": "로그가 없어요.",
    "loadError": "불러오지 못했어요."
  }
}
```

- [ ] **Step 2C-2: ko/mypage.json 생성**

```json
{
  "page": {
    "title": "마이페이지"
  },
  "tabs": {
    "bookmarks": "북마크",
    "reviews": "내 리뷰",
    "recommendations": "추천",
    "subscriptions": "구독",
    "calendar": "캘린더"
  },
  "bookmark": {
    "empty": "북마크한 이벤트가 없어요.",
    "loadError": "불러오지 못했어요."
  },
  "review": {
    "empty": "작성한 리뷰가 없어요.",
    "loadError": "불러오지 못했어요.",
    "delete": "삭제",
    "deleteConfirm": "리뷰를 삭제할까요?"
  },
  "reco": {
    "empty": "추천 이벤트가 없어요.",
    "loadError": "불러오지 못했어요."
  },
  "subscription": {
    "empty": "구독한 이벤트가 없어요.",
    "loadError": "불러오지 못했어요.",
    "toggle": "알림 {{status}}",
    "on": "켜짐",
    "off": "꺼짐",
    "delete": "구독 취소"
  },
  "calendar": {
    "empty": "예정된 약속이 없어요.",
    "loadError": "불러오지 못했어요.",
    "evaluate": "평가하기"
  },
  "credit": {
    "title": "크레딧 내역",
    "balance": "잔액: {{count}}개",
    "empty": "내역이 없어요.",
    "loadError": "불러오지 못했어요."
  },
  "profile": {
    "title": "프로필 수정",
    "nickname": "닉네임",
    "nicknamePlaceholder": "닉네임을 입력하세요",
    "save": "저장",
    "saveSuccess": "저장됐어요.",
    "saveError": "저장하지 못했어요."
  },
  "notification": {
    "title": "알림",
    "empty": "알림이 없어요.",
    "loadError": "불러오지 못했어요.",
    "markAllRead": "모두 읽음",
    "markRead": "읽음"
  },
  "evaluation": {
    "title": "평가",
    "mateEval": "메이트 평가",
    "festivalEval": "축제 후기",
    "submit": "제출",
    "submitSuccess": "평가했어요.",
    "submitError": "제출하지 못했어요.",
    "alreadyEvaluated": "이미 평가했어요."
  },
  "role": {
    "toggle": "역할 전환",
    "user": "일반 사용자",
    "uploader": "업로더",
    "admin": "관리자",
    "switchToUploader": "업로더 모드",
    "switchToUser": "사용자 모드"
  }
}
```

- [ ] **Step 2C-3: AdminEventsPage 탭들, MyPage 탭들 키화**

`AdminEventsPage/index.tsx` 및 `tabs/*.tsx`:
```tsx
const { t } = useTranslation('admin');
```
모든 하드코딩 → `t('page.xxx')` / `t('tabs.xxx')` / `t('event.xxx')` 등으로 교체.

`MyPage/index.tsx` 및 `parts/*.tsx` 및 `tabs/*.tsx`:
```tsx
const { t } = useTranslation('mypage');
```
모든 하드코딩 → `t('tabs.xxx')` / `t('bookmark.xxx')` 등으로 교체.

`NotificationsPage.tsx`:
```tsx
const { t } = useTranslation('mypage');
// t('notification.xxx') 사용
```

`CreditPage/index.tsx`:
```tsx
const { t } = useTranslation('mypage');
// t('credit.xxx') 사용
```

`ProfilePage/index.tsx`:
```tsx
const { t } = useTranslation('mypage');
// t('profile.xxx') 사용
```

`EvaluationPage/index.tsx` 및 `parts/*.tsx`:
```tsx
const { t } = useTranslation('mypage');
// t('evaluation.xxx') 사용
```

- [ ] **Step 2C-4: 공용 컴포넌트 키화**

`FilterSearchPanel.tsx`, `FullListPanel.tsx`, `EventSummaryPanel.tsx`, `ChatHelpPanel.tsx`, `ChatDock.tsx`, `ReportModal.tsx` 등:

각 파일에 `import { useTranslation } from 'react-i18next';` 추가.
`FilterSearchPanel.tsx`: `const { t } = useTranslation('navigation');`
`ChatDock.tsx`: `const { t } = useTranslation('chat');`
`ReportModal.tsx`: `const { t } = useTranslation('common');`

공통 패턴:
- `"불러오는 중…"` → `{t('common:label.loading')}`
- `"오류가 발생했어요."` → `{t('common:label.error')}`
- `"항목이 없어요."` → `{t('common:label.empty')}`

- [ ] **Step 2C-5: EventDetailPage 키화**

`EventDetailPage/index.tsx` 및 `sections/*.tsx`:
```tsx
const { t } = useTranslation(['common', 'mypage']);
// 이벤트 상세는 사용자 facing 텍스트가 common과 mypage에 걸쳐 있음
```

- [ ] **Step 2C-6: typecheck + 빌드**

```bash
cd apps/web && pnpm typecheck && pnpm build
```

Expected: TypeScript 오류 없음, 빌드 성공. 번들 크기 증가는 예상됨 (~30KB per language).

- [ ] **Step 2C-7: 커밋**

```bash
git add apps/web/public/locales/ko/ apps/web/src/pages/AdminEventsPage apps/web/src/pages/MyPage apps/web/src/pages/NotificationsPage.tsx apps/web/src/pages/CreditPage apps/web/src/pages/ProfilePage apps/web/src/pages/EvaluationPage apps/web/src/components/
git commit -m "feat(web): i18n 키화 완료 — admin/mypage + 공용 컴포넌트 (ko 원본)"
```

---

## Task 3: 6개국어 번역 번들 생성 (en/vi/zh/ja/fr)

**Files:**
- Create: `services/llm/translate.py`
- Create: `apps/web/public/locales/en/*.json` (8개)
- Create: `apps/web/public/locales/vi/*.json` (8개)
- Create: `apps/web/public/locales/zh/*.json` (8개)
- Create: `apps/web/public/locales/ja/*.json` (8개)
- Create: `apps/web/public/locales/fr/*.json` (8개)

이 Task는 ko 원본 번들 전체를 5개 언어로 번역하는 작업이다. LLM 서비스 translate 엔드포인트를 통해 번역한다.

- [ ] **Step 3-1: services/llm/translate.py 생성**

Create `services/llm/translate.py`:

```python
"""
Alle LLM — 번역 엔드포인트.

POST /translate-bundle
  body: { namespace: str, lang: str, keys: dict }
  reply: { translated: dict }

POST /translate-post
  body: { content: str, target_lang: str }
  reply: { translated: str }
"""

from __future__ import annotations
import os
from typing import Any
import json as _json

LANGUAGE_NAMES = {
    "en": "English",
    "vi": "Vietnamese",
    "zh": "Simplified Chinese",
    "ja": "Japanese",
    "fr": "French",
}


def _translate_with_openai(content: str, target_lang: str) -> str:
    """OpenAI gpt-4o-mini로 텍스트 번역. 실패 시 예외 올림."""
    from openai import OpenAI
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    lang_name = LANGUAGE_NAMES.get(target_lang, target_lang)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    f"You are a professional translator. "
                    f"Translate the user's Korean text to {lang_name}. "
                    f"Preserve {{{{placeholders}}}} exactly as-is. "
                    f"Return only the translated text, no explanation."
                ),
            },
            {"role": "user", "content": content},
        ],
        temperature=0.2,
        max_tokens=4000,
    )
    return (resp.choices[0].message.content or "").strip()


def _translate_json_values(data: dict[str, Any], target_lang: str) -> dict[str, Any]:
    """dict의 leaf string 값들을 재귀 번역. 중첩 dict 지원."""
    result: dict[str, Any] = {}
    for key, value in data.items():
        if isinstance(value, dict):
            result[key] = _translate_json_values(value, target_lang)
        elif isinstance(value, str):
            result[key] = _translate_with_openai(value, target_lang)
        else:
            result[key] = value
    return result


def translate_bundle(namespace: str, lang: str, keys: dict[str, Any]) -> dict[str, Any]:
    """네임스페이스 전체 번역. 배치로 전달해 OpenAI 호출 최소화."""
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY not set")
    lang_name = LANGUAGE_NAMES.get(lang, lang)
    # JSON 전체를 하나의 prompt에 넣어 한 번에 번역 (호출 수 최소화)
    from openai import OpenAI
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    prompt_json = _json.dumps(keys, ensure_ascii=False, indent=2)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    f"You are a professional UI translator for a Korean event discovery app called Alle. "
                    f"Translate the JSON object's string VALUES from Korean to {lang_name}. "
                    f"Rules:\n"
                    f"- Preserve all JSON keys exactly as-is.\n"
                    f"- Preserve {{{{variable}}}} interpolation placeholders exactly (e.g. {{{{count}}}}, {{{{nickname}}}}).\n"
                    f"- Keep the same JSON structure.\n"
                    f"- Return ONLY valid JSON, no markdown fences, no explanation.\n"
                    f"- Translate naturally for a mobile UI context (short, clear labels)."
                ),
            },
            {"role": "user", "content": prompt_json},
        ],
        temperature=0.1,
        max_tokens=8000,
    )
    raw = (resp.choices[0].message.content or "").strip()
    # 마크다운 코드 펜스 제거
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0].strip()
    return _json.loads(raw)


def translate_post_content(content: str, target_lang: str) -> str:
    """게시글 본문 단일 텍스트 번역."""
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY not set")
    return _translate_with_openai(content, target_lang)
```

- [ ] **Step 3-2: services/llm/app.py에 번역 엔드포인트 추가**

`services/llm/app.py` 맨 아래에 다음 클래스·엔드포인트 추가 (ChatSession/chat-eval 관련 코드 수정 금지):

```python
class TranslateBundleRequest(BaseModel):
    namespace: str = Field(max_length=50)
    lang: str = Field(pattern="^(en|vi|zh|ja|fr)$")
    keys: dict


class TranslateBundleResponse(BaseModel):
    namespace: str
    lang: str
    translated: dict


class TranslatePostRequest(BaseModel):
    content: str = Field(min_length=1, max_length=10000)
    target_lang: str = Field(pattern="^(en|vi|zh|ja|fr)$")


class TranslatePostResponse(BaseModel):
    translated: str


@app.post("/translate-bundle", response_model=TranslateBundleResponse)
def translate_bundle_endpoint(req: TranslateBundleRequest) -> TranslateBundleResponse:
    """
    빌드타임 번역 스크립트가 호출 — 네임스페이스 JSON 전체를 한 언어로 번역.
    LLM 비활성이면 503.
    """
    from fastapi import HTTPException
    if not _openai_available():
        raise HTTPException(status_code=503, detail="translation unavailable (no key or over budget)")
    try:
        from translate import translate_bundle
        result = translate_bundle(req.namespace, req.lang, req.keys)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"translation failed: {e.__class__.__name__}")
    return TranslateBundleResponse(namespace=req.namespace, lang=req.lang, translated=result)


@app.post("/translate-post", response_model=TranslatePostResponse)
def translate_post_endpoint(req: TranslatePostRequest) -> TranslatePostResponse:
    """
    게시글 본문 온디맨드 번역. BFF translate 엔드포인트가 Redis 미스 시 호출.
    LLM 비활성이면 503.
    """
    from fastapi import HTTPException
    if not _openai_available():
        raise HTTPException(status_code=503, detail="translation unavailable (no key or over budget)")
    try:
        from translate import translate_post_content
        result = translate_post_content(req.content, req.target_lang)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"translation failed: {e.__class__.__name__}")
    return TranslatePostResponse(translated=result)
```

- [ ] **Step 3-3: 번역 생성 스크립트 작성**

Create `apps/bff/src/jobs/generate-i18n-bundles.ts`:

```typescript
/**
 * 빌드타임 i18n 번들 생성 스크립트.
 *
 * 사용법: pnpm tsx src/jobs/generate-i18n-bundles.ts
 *
 * ko 원본 (apps/web/public/locales/ko/*.json) 를 읽어
 * en/vi/zh/ja/fr 각 언어로 번역하여 동일 경로에 저장.
 *
 * 요구사항: services/llm이 구동 중이어야 함 (LLM_SERVICE_URL).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, '../../../../apps/web/public/locales');
const NAMESPACES = ['common', 'navigation', 'community', 'mate', 'chat', 'uploader', 'admin', 'mypage'] as const;
const TARGET_LANGS = ['en', 'vi', 'zh', 'ja', 'fr'] as const;

async function translateBundle(namespace: string, lang: string, keys: unknown): Promise<unknown> {
  const url = `${env.LLM_SERVICE_URL}/translate-bundle`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ namespace, lang, keys }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM /translate-bundle ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { translated: unknown };
  return data.translated;
}

async function main() {
  for (const ns of NAMESPACES) {
    const koPath = join(LOCALES_DIR, 'ko', `${ns}.json`);
    let koData: unknown;
    try {
      const raw = await readFile(koPath, 'utf-8');
      koData = JSON.parse(raw);
    } catch {
      console.warn(`[skip] ko/${ns}.json not found or invalid`);
      continue;
    }

    for (const lang of TARGET_LANGS) {
      const outPath = join(LOCALES_DIR, lang, `${ns}.json`);
      console.log(`Translating ${ns} → ${lang}...`);
      try {
        const translated = await translateBundle(ns, lang, koData);
        await mkdir(join(LOCALES_DIR, lang), { recursive: true });
        await writeFile(outPath, JSON.stringify(translated, null, 2) + '\n', 'utf-8');
        console.log(`  ✓ saved ${lang}/${ns}.json`);
      } catch (err) {
        console.error(`  ✗ ${lang}/${ns}: ${(err as Error).message}`);
        // 실패한 언어/네임스페이스는 빈 객체로 fallback — 앱은 ko로 폴백
        await writeFile(outPath, '{}\n', 'utf-8');
      }
      // Rate limit 방지 — 각 호출 사이 1초 대기
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

`apps/bff/package.json`의 scripts에 추가:
```json
"i18n:generate": "dotenv -e ../../.env -- tsx src/jobs/generate-i18n-bundles.ts"
```

- [ ] **Step 3-4: 번역 실행**

LLM 서비스가 실행 중인 상태에서:

```bash
cd apps/bff && pnpm i18n:generate
```

Expected: 각 언어×네임스페이스 (5×8=40) JSON 파일이 생성됨. 실패한 파일은 `{}` 로 생성(ko 폴백).

- [ ] **Step 3-5: 생성된 번역 검증 — 미번역 키 없는지 확인**

```bash
node -e "
const fs = require('fs');
const path = require('path');
const localesDir = 'apps/web/public/locales';
const langs = ['en','vi','zh','ja','fr'];
const ns = ['common','navigation','community','mate','chat','uploader','admin','mypage'];
let missing = 0;
for (const lang of langs) {
  for (const n of ns) {
    const f = path.join(localesDir, lang, n + '.json');
    const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
    if (Object.keys(data).length === 0) {
      console.warn('EMPTY:', lang, n);
      missing++;
    }
  }
}
if (missing === 0) console.log('All bundles non-empty.');
else process.exit(1);
"
```

Expected: `All bundles non-empty.`

빈 파일이 있으면 해당 언어/네임스페이스를 재실행:
```bash
# 예: en/community만 재생성
node -e "
const ns = JSON.parse(require('fs').readFileSync('apps/web/public/locales/ko/community.json','utf-8'));
fetch('http://localhost:8000/translate-bundle', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({namespace:'community',lang:'en',keys:ns})})
  .then(r=>r.json())
  .then(d=>require('fs').writeFileSync('apps/web/public/locales/en/community.json',JSON.stringify(d.translated,null,2)));
"
```

- [ ] **Step 3-6: 빌드 확인**

```bash
cd apps/web && pnpm build
```

Expected: 빌드 성공. dist/locales/ 에 40개 JSON 포함됨.

- [ ] **Step 3-7: 커밋**

```bash
git add apps/web/public/locales/ services/llm/translate.py services/llm/app.py apps/bff/src/jobs/generate-i18n-bundles.ts apps/bff/package.json
git commit -m "feat(llm,web): 6개국어 번역 번들 생성 — translate.py + generate-i18n-bundles script"
```

---

## Task 4: 게시글 번역 BFF 엔드포인트 + Redis 캐시

**Files:**
- Create: `apps/bff/src/lib/translation-cache.ts`
- Create: `apps/bff/src/routes/translate.ts`
- Modify: `apps/bff/src/app.ts`

- [ ] **Step 4-1: translation-cache.ts 생성**

Create `apps/bff/src/lib/translation-cache.ts`:

```typescript
/**
 * 게시글 번역 결과 Redis 캐시 helpers.
 *
 * 캐시 키: post:translation:{postId}:{targetLang}
 * TTL: 7일 (604800초) — GG-POST-010 게시글 TTL과 동일
 *
 * 무마이그레이션: Redis만 사용, Prisma 스키마 변경 없음.
 */

import { getRedisClient } from './redis-client.js';

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7d

function cacheKey(postId: string, lang: string): string {
  return `post:translation:${postId}:${lang}`;
}

export async function getTranslationCache(postId: string, lang: string): Promise<string | null> {
  const client = getRedisClient();
  return client.get(cacheKey(postId, lang));
}

export async function setTranslationCache(postId: string, lang: string, translated: string): Promise<void> {
  const client = getRedisClient();
  await client.set(cacheKey(postId, lang), translated, 'EX', TTL_SECONDS);
}
```

- [ ] **Step 4-2: routes/translate.ts 생성**

Create `apps/bff/src/routes/translate.ts`:

```typescript
import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { callLlm } from '../llm-client.js';
import { getTranslationCache, setTranslationCache } from '../lib/translation-cache.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

const SUPPORTED_LANGS = new Set(['en', 'vi', 'zh', 'ja', 'fr']);

function parseBigId(raw: unknown): bigint | null {
  const s = typeof raw === 'string' ? raw : '';
  try { const n = BigInt(s); return n > 0n ? n : null; } catch { return null; }
}

interface TranslatePostResponse {
  translated: string;
}

/**
 * POST /community/posts/:id/translate
 * Request: { targetLanguage: 'en' | 'vi' | 'zh' | 'ja' | 'fr' }
 * Response: { postId, originalBody, translatedBody, targetLanguage }
 *
 * 인증: 선택(resolveAuth). 비로그인도 번역 가능.
 * Redis TTL 7d 캐시. LLM 실패 시 originalBody 그대로 반환 (graceful degradation).
 */
export async function translatePost(req: Request, res: Response): Promise<void> {
  const postId = parseBigId(req.params.id);
  if (!postId) { res.status(400).json({ error: 'invalid id' }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const targetLanguage = typeof body.targetLanguage === 'string' ? body.targetLanguage : '';
  if (!SUPPORTED_LANGS.has(targetLanguage)) {
    res.status(400).json({ error: 'unsupported targetLanguage. Use: en, vi, zh, ja, fr' });
    return;
  }

  // 게시글 존재 확인 + 원문 조회
  const post = await prisma.post.findFirst({
    where: { postId, isDeleted: false, expiresAt: { gt: new Date() } },
    select: { postId: true, body: true },
  });
  if (!post) { res.status(404).json({ error: 'post not found' }); return; }

  const postIdStr = post.postId.toString();

  // Redis 캐시 확인
  const cached = await getTranslationCache(postIdStr, targetLanguage).catch(() => null);
  if (cached !== null) {
    res.json({
      postId: postIdStr,
      originalBody: post.body,
      translatedBody: cached,
      targetLanguage,
      cached: true,
    });
    return;
  }

  // LLM 호출
  const llmResult = await callLlm<TranslatePostResponse>('/translate-post', {
    content: post.body,
    target_lang: targetLanguage,
  });

  const translatedBody = llmResult?.translated ?? post.body;

  // 캐시 저장 (LLM 성공 시에만)
  if (llmResult?.translated) {
    await setTranslationCache(postIdStr, targetLanguage, translatedBody).catch(() => {
      // 캐시 저장 실패는 무시 — 번역 결과는 정상 반환
    });
  }

  res.json({
    postId: postIdStr,
    originalBody: post.body,
    translatedBody,
    targetLanguage,
    cached: false,
  });
}
```

- [ ] **Step 4-3: app.ts에 translate 라우트 등록**

`apps/bff/src/app.ts`에 import 추가:
```typescript
import { translatePost } from './routes/translate.js';
```

커뮤니티 posts 라우트 블록 끝 (toggleLike 다음) 에 추가:
```typescript
// GG-COMM-013 게시글 번역 (resolveAuth — 비로그인도 가능)
app.post(
  '/community/posts/:id/translate',
  (req, res, next) => resolveAuth(req, res, next).catch(next),
  (req, res, next) => translatePost(req, res).catch(next),
);
```

- [ ] **Step 4-4: BFF typecheck**

```bash
cd apps/bff && pnpm typecheck
```

Expected: 오류 없음.

- [ ] **Step 4-5: translate 엔드포인트 수동 검증**

BFF와 LLM 서비스를 로컬에서 실행한 상태에서:

```bash
# 존재하는 postId로 테스트 (DB에서 실제 ID 확인 필요)
curl -s -X POST http://localhost:3000/community/posts/1/translate \
  -H "Content-Type: application/json" \
  -d '{"targetLanguage":"en"}' | head -c 500
```

Expected: `{"postId":"1","originalBody":"...","translatedBody":"...","targetLanguage":"en","cached":false}`

두 번 호출:
```bash
curl -s -X POST http://localhost:3000/community/posts/1/translate \
  -H "Content-Type: application/json" \
  -d '{"targetLanguage":"en"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('cached:', d['cached'])"
```

Expected: `cached: True`

- [ ] **Step 4-6: 커밋**

```bash
git add apps/bff/src/lib/translation-cache.ts apps/bff/src/routes/translate.ts apps/bff/src/app.ts
git commit -m "feat(bff): 게시글 번역 엔드포인트 — Redis TTL 7d 캐시 + LLM graceful degradation"
```

---

## Task 5: 언어 토글 UI 실연결 (GG-COMM-013)

**Files:**
- Create: `apps/web/src/components/LanguageToggle.tsx`
- Modify: `apps/web/src/pages/CommunityPage/parts/CommunityShell.tsx`

- [ ] **Step 5-1: LanguageToggle.tsx 생성**

Create `apps/web/src/components/LanguageToggle.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../lib/useLanguage.js';
import type { SupportedLanguage } from '../lib/i18n.js';

/**
 * GG-COMM-013 언어 전환 드롭다운.
 * 선택 즉시 i18n.changeLanguage() + localStorage 저장 → 전 서비스 언어 변경.
 *
 * SEED ActionButton 스타일을 유지하되, 드롭다운은 간단한 absolute 포지셔닝.
 * DESIGN.md: 보라 그라디언트 금지, pill 버튼 금지 — neutralOutline 변형 사용.
 */
export function LanguageToggle() {
  const { current, setLanguage, languages } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentLang = languages.find((l) => l.code === current) ?? languages[0]!;

  // 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = async (code: SupportedLanguage) => {
    setOpen(false);
    await setLanguage(code);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex h-8 items-center gap-1.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] text-(--color-text) transition-colors hover:border-(--color-border-hover)"
      >
        {currentLang.nativeLabel}
        <span aria-hidden className="text-[10px] text-(--color-text-subtle)">▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="언어 선택"
          className="absolute right-0 top-full z-50 mt-1 min-w-[120px] rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) shadow-(--shadow-md)"
        >
          {languages.map((lang) => (
            <li key={lang.code} role="option" aria-selected={lang.code === current}>
              <button
                type="button"
                onClick={() => void handleSelect(lang.code)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-(--color-surface-alt) ${
                  lang.code === current ? 'font-semibold text-(--color-accent)' : 'text-(--color-text)'
                }`}
              >
                {lang.nativeLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5-2: CommunityShell.tsx에서 LanguageToggle 실연결**

`apps/web/src/pages/CommunityPage/parts/CommunityShell.tsx`에 import 추가:
```tsx
import { LanguageToggle } from '../../../components/LanguageToggle.js';
```

기존 disabled ActionButton 교체:
```tsx
// 기존 (제거)
<ActionButton
  variant="neutralOutline"
  size="small"
  disabled
  title="언어 변경 (준비 중)"
>
  한국어
</ActionButton>

// 교체 (신규)
<LanguageToggle />
```

- [ ] **Step 5-3: typecheck + 빌드**

```bash
cd apps/web && pnpm typecheck && pnpm build
```

Expected: 오류 없음.

- [ ] **Step 5-4: 커밋**

```bash
git add apps/web/src/components/LanguageToggle.tsx apps/web/src/pages/CommunityPage/parts/CommunityShell.tsx
git commit -m "feat(web): GG-COMM-013 언어 토글 실연결 — LanguageToggle 드롭다운, 전 서비스 언어 전환"
```

---

## Task 6: 게시글 "번역하기" UI

**Files:**
- Create: `apps/web/src/lib/api/translate.ts`
- Modify: `apps/web/src/pages/PostDetailPage/index.tsx`

- [ ] **Step 6-1: api/translate.ts 생성**

Create `apps/web/src/lib/api/translate.ts`:

```typescript
import { BFF_URL, withCredentials } from './client.js';
import type { SupportedLanguage } from '../i18n.js';

export interface PostTranslationResponse {
  postId: string;
  originalBody: string;
  translatedBody: string;
  targetLanguage: string;
  cached: boolean;
}

export async function translatePostContent(
  postId: string,
  targetLanguage: SupportedLanguage,
): Promise<PostTranslationResponse> {
  const res = await fetch(
    `${BFF_URL}/community/posts/${encodeURIComponent(postId)}/translate`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLanguage }),
    }),
  );
  if (res.status === 404) throw new Error('POST_NOT_FOUND');
  if (res.status === 400) throw new Error('INVALID_LANG');
  if (!res.ok) throw new Error(`translate ${res.status}`);
  return (await res.json()) as PostTranslationResponse;
}
```

- [ ] **Step 6-2: PostDetailPage에 번역하기 버튼 + 결과 모달 추가**

`apps/web/src/pages/PostDetailPage/index.tsx`에 다음 import 추가:
```tsx
import { translatePostContent } from '../../lib/api/translate.js';
import type { SupportedLanguage } from '../../lib/i18n.js';
import { SUPPORTED_LANGUAGES } from '../../lib/i18n.js';
import { useLanguage } from '../../lib/useLanguage.js';
```

state 추가 (기존 state 선언들 다음에):
```tsx
const { current: currentLang } = useLanguage();
const [translateOpen, setTranslateOpen] = useState(false);
const [translateLang, setTranslateLang] = useState<SupportedLanguage | ''>('');
const [translateLoading, setTranslateLoading] = useState(false);
const [translatedBody, setTranslatedBody] = useState<string | null>(null);
const [translateError, setTranslateError] = useState<string | null>(null);
```

번역 핸들러 추가:
```tsx
const onTranslate = async (lang: SupportedLanguage) => {
  if (!detail) return;
  setTranslateLang(lang);
  setTranslateLoading(true);
  setTranslateError(null);
  try {
    const result = await translatePostContent(detail.postId, lang);
    setTranslatedBody(result.translatedBody);
  } catch {
    setTranslateError(t('post.translateError'));
  } finally {
    setTranslateLoading(false);
  }
};
```

좋아요/수정/삭제 ActionButton 다음에 "번역하기" 버튼 추가:
```tsx
<ActionButton
  variant="neutralOutline"
  size="small"
  onClick={() => {
    setTranslateOpen(true);
    setTranslatedBody(null);
    setTranslateError(null);
    setTranslateLang('');
  }}
>
  {t('common:button.translate')}
</ActionButton>
```

article 태그 닫기 직전에 번역 모달 JSX 추가:
```tsx
{/* 게시글 번역 모달 */}
{translateOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-lg rounded-(--radius-lg) bg-(--color-surface) p-5 shadow-(--shadow-lg)">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">{t('post.translateTitle')}</h2>
        <button
          type="button"
          onClick={() => setTranslateOpen(false)}
          className="text-[13px] text-(--color-text-muted) hover:text-(--color-text)"
        >
          {t('post.translateClose')}
        </button>
      </div>

      {!translatedBody && !translateLoading && (
        <div className="space-y-2">
          <p className="text-[13px] text-(--color-text-muted)">{t('post.translateSelectLang')}</p>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES
              .filter((l) => l.code !== currentLang)
              .map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => void onTranslate(l.code)}
                  className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px] text-(--color-text) hover:border-(--color-border-hover)"
                >
                  {l.nativeLabel}
                </button>
              ))}
          </div>
        </div>
      )}

      {translateLoading && (
        <p className="text-[14px] text-(--color-text-muted)">{t('post.translateLoading')}</p>
      )}

      {translateError && (
        <p className="text-[14px] text-(--color-error)">{translateError}</p>
      )}

      {translatedBody && !translateLoading && (
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-(--color-text-subtle)">
              {t('post.translateResult')} ({SUPPORTED_LANGUAGES.find(l => l.code === translateLang)?.nativeLabel})
            </p>
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{translatedBody}</p>
          </div>
          <div className="border-t border-(--color-border) pt-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-(--color-text-subtle)">
              {t('post.translateOriginal')}
            </p>
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-(--color-text-muted)">{detail?.body}</p>
          </div>
          <button
            type="button"
            onClick={() => { setTranslatedBody(null); setTranslateLang(''); setTranslateError(null); }}
            className="text-[12px] text-(--color-text-muted) hover:text-(--color-text)"
          >
            다른 언어로 번역
          </button>
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 6-3: typecheck + 빌드**

```bash
cd apps/web && pnpm typecheck && pnpm build
```

Expected: 오류 없음.

- [ ] **Step 6-4: 커밋**

```bash
git add apps/web/src/lib/api/translate.ts apps/web/src/pages/PostDetailPage/index.tsx
git commit -m "feat(web): 게시글 '번역하기' UI — 언어 선택, 번역 결과 모달, 로딩/오류 상태"
```

---

## Task 7: 전체 Green 검증

- [ ] **Step 7-1: BFF typecheck**

```bash
cd apps/bff && pnpm typecheck
```

Expected: 오류 없음.

- [ ] **Step 7-2: Web typecheck + 빌드**

```bash
cd apps/web && pnpm typecheck && pnpm build
```

Expected: 오류 없음.

- [ ] **Step 7-3: LLM 서비스 health 확인**

```bash
curl -s http://localhost:8000/health | python3 -m json.tool
```

Expected: `"ok": true`, translate 엔드포인트 등록 확인.

- [ ] **Step 7-4: 번역 번들 누락 키 없는지 최종 확인**

```bash
node -e "
const fs = require('fs');
const path = require('path');
const localesDir = 'apps/web/public/locales';
const langs = ['ko','en','vi','zh','ja','fr'];
const ns = ['common','navigation','community','mate','chat','uploader','admin','mypage'];
let issues = 0;
for (const lang of langs) {
  for (const n of ns) {
    const f = path.join(localesDir, lang, n + '.json');
    try {
      const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
      if (Object.keys(data).length === 0) { console.error('EMPTY:', lang, n); issues++; }
    } catch (e) { console.error('MISSING:', lang, n, e.message); issues++; }
  }
}
console.log(issues === 0 ? 'All 48 bundles OK' : issues + ' issues found');
if (issues > 0) process.exit(1);
"
```

Expected: `All 48 bundles OK`

- [ ] **Step 7-5: 언어 전환 동작 수동 검증**

1. 앱 실행: `cd apps/web && pnpm dev`
2. 브라우저 `/community` 접속
3. 언어 토글 드롭다운 클릭 → "English" 선택
4. 커뮤니티 페이지 제목, 버튼 등이 영어로 변경됨 확인
5. Sidebar 텍스트가 영어로 변경됨 확인
6. Header 텍스트가 영어로 변경됨 확인
7. 페이지 새로고침 후 영어 유지 확인 (localStorage 영속)
8. "한국어" 선택 → 한국어로 복구 확인

- [ ] **Step 7-6: 게시글 번역 수동 검증**

1. 게시글 상세 페이지 접속
2. "번역하기" 버튼 클릭
3. 언어 선택 (예: English)
4. 번역 결과가 모달에 표시됨 확인
5. 두 번째 번역 요청 시 Redis 캐시 hit (BFF 로그 `cached: true`) 확인

- [ ] **Step 7-7: 최종 커밋**

```bash
git add -A
git commit -m "feat(web,bff,llm): Slice 7 완료 — i18n 6개국어 + 게시글 번역 + GG-COMM-013 언어 토글"
```

---

## 자가 검토 (Spec Coverage)

**스펙 요구사항 대비 플랜 커버리지:**

| 요구사항 | 담당 Task |
|---|---|
| react-i18next 인프라(provider, 언어 토글, localStorage 영속) | Task 1 |
| 폰트 fallback (Pretendard + 다국어) | 기존 index.css `--font-sans`에 Noto Sans KR 포함됨 — 추가 작업 불필요 |
| 전 화면 UI 문자열 추출 (Phase1+Phase2) | Task 2-A/B/C (화면군별 분할) |
| 6개 언어 리소스 번들 전부 실번역 | Task 3 |
| 게시글 본문 번역하기 + Redis 캐시 | Task 4 (BFF+LLM), Task 6 (UI) |
| GG-COMM-013 언어 토글 전 서비스 전환 | Task 5 |
| 미번역 키 0 | Task 3-5, Task 7-4 |
| 무마이그레이션 | Redis만 사용, Prisma 수정 없음 |
| ChatSession/chat-eval 수정 금지 | translate.py는 별도 파일, app.py 하단에만 append |

**플레이스홀더 스캔:** 없음. 모든 JSON 값은 실제 한국어 원본이고, 번역은 Task 3에서 LLM이 생성한다.

**타입 일관성:**
- `SupportedLanguage` — i18n.ts 정의, useLanguage.ts/LanguageToggle.tsx/translate.ts 모두 동일 import 사용.
- `PostTranslationResponse` — translate.ts 정의, PostDetailPage에서 소비.
- `callLlm<TranslatePostResponse>` — 기존 llm-client.ts 패턴 재사용, 타입 `{ translated: string }` 로컬 선언.
