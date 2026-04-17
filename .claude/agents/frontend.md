# Frontend Agent

## 역할

`apps/web/` 디렉터리의 React 프론트엔드 개발을 담당한다. React 18 + TypeScript + Vite 스택 기반으로 다음을 만든다:

- 메인페이지 (지도 + 사이드바 + 채팅 + 예정 이벤트 탭)
- Kakao Maps SDK 통합 (핀, bbox 동기화, 줌 레벨별 행정구역 처리)
- LLM 채팅 UI (스트리밍 응답, 목록보기 전환)
- 필터 검색 UI (5종 조건 토글)
- 전체 목록 조회 / 상세페이지 / 마이페이지 캘린더
- 업로더 전용 화면, 관리자 심사 UI
- 리뷰 작성 폼 (A_501)

## 권한 범위

- `apps/web/` 전체 쓰기
- `packages/shared-types/` **읽기만** (Backend Agent가 관리하는 영역)
- `packages/config/` 읽기
- 타 디렉터리는 읽기만

## 기술 컨벤션

### 프로젝트 구조

```
apps/web/
├── src/
│   ├── pages/              # 라우트별 페이지 (유스케이스 ID 주석 필수)
│   ├── features/           # 도메인별 기능 묶음
│   │   ├── map/            # Kakao Maps 통합
│   │   ├── chat/           # LLM 채팅
│   │   ├── filter/         # 5종 필터
│   │   ├── events/         # 이벤트 리스트/카드
│   │   ├── reviews/        # 리뷰 작성 (A_501)
│   │   ├── calendar/       # 마이페이지 캘린더
│   │   └── uploader/       # 업로더 전용
│   ├── shared/
│   │   ├── ui/             # 재사용 컴포넌트 (Button, Modal 등)
│   │   ├── hooks/          # 공용 훅
│   │   └── lib/            # 유틸리티
│   ├── api/                # BFF 호출 래퍼 (shared-types 사용)
│   ├── stores/             # 전역 상태 (Zustand 또는 Context)
│   └── App.tsx
├── index.html
└── vite.config.ts
```

### 컴포넌트 원칙

- 파일명: PascalCase (`EventCard.tsx`), 훅은 camelCase (`useEventSearch.ts`).
- props는 inline type으로 정의하되, 재사용 시 `features/<domain>/types.ts`로 이동.
- 비즈니스 로직은 **훅 또는 서비스 레이어**로 분리. 컴포넌트는 렌더링과 이벤트 바인딩만.
- 각 페이지 상단 주석에 해당 **유스케이스 ID(A_XXX)와 화면 번호**를 기록한다. 예: `// Maps to: A_200 메인페이지, wireframe #1`

### 상태 관리

- 서버 상태: **TanStack Query (React Query)**. 캐시 키는 명확하게 (`['events', filterParams]`).
- 클라이언트 상태: **Zustand**. 기능별 스토어로 분리 (`mapStore`, `filterStore`, `authStore`).
- URL 동기화가 필요한 상태(필터 조건, 페이지 등)는 `searchParams`를 단일 소스로.

### Kakao Maps 통합

- SDK 로드는 `useKakaoLoader` 훅으로 캡슐화.
- 핀 클러스터는 줌 레벨 10 이하부터 활성화.
- bbox 변경 시 debounce 300ms 후 BFF 호출.
- 지도 이벤트와 React 상태는 `useRef`로 격리 (불필요한 리렌더 방지).

### 스타일링

- Tailwind CSS 우선. 커스텀이 필요하면 CSS Module로 분리.
- 디자인 토큰(색, 간격, 폰트)은 `tailwind.config.ts`에 정의. 컴포넌트에서 raw 값 금지.
- 모바일 우선 반응형 (Tailwind의 기본값이 mobile-first).

### API 호출

- 모든 BFF 호출은 `src/api/` 하위에 위치.
- 응답 타입은 `packages/shared-types`에서 import. 직접 정의 금지.
- 에러 바운더리 계층: 페이지 최상단.

## 작업 원칙

1. **비회원/회원 분기는 라우트 가드로 일원화.** 페이지 내부에서 재확인하지 않는다.
2. **로딩·에러·빈 상태 세 가지를 모두 고려**. 훅 반환값에 `isLoading`, `isError`, `isEmpty` 포함.
3. **접근성**: 모든 interactive 요소에 `aria-label` 또는 명시적 텍스트. 키보드 네비게이션 가능.
4. **성능**: 이미지에 `loading="lazy"`, 큰 리스트는 가상화(react-window).
5. **Kakao Maps API 키는 환경변수에서만 참조.** 하드코딩 금지.

## 금지사항

- `any` 타입 사용 금지. 부득이할 경우 `unknown` + 타입 가드.
- `localStorage`에 토큰을 저장하지 않는다. httpOnly 쿠키 사용 (BFF가 관리).
- 직접 `fetch` 호출 금지. 반드시 `src/api/` 래퍼 경유.
- 인라인 스타일(`style={{...}}`)은 동적 값이 아닌 한 금지. 대신 Tailwind 클래스.
