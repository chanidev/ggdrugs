# Handoff: Alle 브랜드 도입 + 디자인 시스템 정합

> **대상 레포**: `chanidev/ggdrugs` (branch: `main`)
> **작성 시점**: 2026-04
> **작업 지시 대상**: Claude Code 세션 (apps/web 프론트엔드에서 실행)

---

## TL;DR — Claude Code가 해야 할 일

1. 서비스 이름 **"GGdrugs" → "Alle"** 전면 교체 (제품 표기만; 레포/패키지/DB 이름은 건드리지 않음).
2. **Line Monogram 로고** 도입 (`assets/logo-mark.svg`, `favicon.svg`, `logo-lockup.svg` 3종).
3. 헤더·파비콘·`index.html` `<title>`·DESIGN.md 브랜드 섹션 업데이트.
4. `DESIGN.md`에 **Brand / Logo** 섹션 신설 (아래 스펙 그대로 붙여넣기).

**손대지 말 것**:
- `apps/web/src/styles/index.css`의 color/type/radius/shadow/motion 토큰 — 이미 정확함.
- 기존 컴포넌트 API 시그니처.
- Tailwind v4 `@theme` 구조.

---

## About these files

이 폴더에 들어있는 HTML/SVG/CSS는 **디자인 레퍼런스**입니다. 복붙용 프로덕션 코드가 아니라, 레포의 기존 패턴(Tailwind v4 + React 19 + `var(--color-*)` 토큰)으로 **재구현**할 대상입니다.

- `assets/` — 실제로 레포에 커밋할 SVG 3종. 이건 그대로 복사.
- `reference/*.html` — 최종 룩을 눈으로 확인하는 용도. React/TSX로 재작성.
- `DESIGN_patch.md` — `DESIGN.md`에 추가할 **Brand** 섹션 원문. 그대로 append.

---

## 1. 브랜드 네이밍

| before | after |
|---|---|
| GGdrugs | **Alle** |
| (없음) | 부제: `SEOUL` (JetBrains Mono, tracking 0.2em, `--text-subtle`) |

**서비스 정체성 문장** (README·헤더 tagline에 사용):
> 서울의 축제·박람회·심포지움·컨퍼런스를 지도 위에서.

**교체가 필요한 곳** (grep 결과 기준):
- `apps/web/index.html` `<title>` — "GGdrugs" → "Alle — 서울 이벤트·이슈 지도"
- `apps/web/src/layout/Header.tsx` — 텍스트 `GGdrugs` → 로고 컴포넌트 + `Alle` 워드마크
- `apps/web/package.json` `"description"` — `Alle` 로 업데이트 (package `name`은 `@ggdrugs/web` 유지)
- `README.md` 타이틀 — `# Alle` (설명 문단은 기존 유지)
- `DESIGN.md` 상단 `# Design System — GGdrugs` → `# Design System — Alle`

**건드리지 말 것**: 디렉터리/패키지 이름 (`@ggdrugs/web`, `ggdrugs` 레포명), DB 스키마, env 키. 코드 내부 식별자는 그대로 둠.

---

## 2. 로고 — Line Monogram

### 스펙

- viewBox: `0 0 84 84`
- 정사각 액자: `rect x=3 y=3 w=78 h=78 rx=2`, stroke `#1A1A1A`, stroke-width `2` (favicon은 `3`)
- 'A' 획: `path M22 64 L42 22 L62 64`, stroke `#1A1A1A`, stroke-width `2.5` (favicon `3.5`), `round` caps/joins
- 크로스바: `line x1=30 y1=48 x2=54 y2=48`, stroke **`#E8562D` (accent)**, stroke-width `2.5` (favicon `3.5`), `round` cap
- **채우기 없음** (`fill="none"` — 획만)

액자와 A 획은 **`currentColor`로 바꿔 사용** 권장. 크로스바만 `var(--color-accent)` 고정 → 다크모드에서 액자·A가 `--color-text`로 자동 반전됨.

### 파일 3종 (`assets/` 안에 포함)

1. **`logo-mark.svg`** — 정사각 마크 단독 (84×84)
2. **`favicon.svg`** — 마크와 동일하되 stroke 굵기 증가 (16px 렌더링 대비)
3. **`logo-lockup.svg`** — 마크 + `Alle` 워드마크 + `SEOUL` 서브 (260×84)

### React 컴포넌트 권장 구현

`apps/web/src/components/brand/Logo.tsx` 신설:

```tsx
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 84 84"
      fill="none"
      className={className}
      aria-label="Alle"
      role="img"
    >
      <rect x="3" y="3" width="78" height="78" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M22 64 L42 22 L62 64"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line
        x1="30" y1="48" x2="54" y2="48"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LogoLockup({ className = '' }: { className?: string }) {
  return (
    <a href="/" className={`flex items-center gap-2.5 ${className}`} aria-label="Alle, 서울 이벤트 지도">
      <LogoMark size={32} className="text-(--color-text)" />
      <span className="font-sans text-h3 font-bold tracking-tight">Alle</span>
      <span className="font-mono text-caption font-medium tracking-[0.2em] uppercase text-(--color-text-subtle)">
        Seoul
      </span>
    </a>
  );
}
```

### Header.tsx 교체

기존의 `<a href="/">GGdrugs</a>` 자리에 `<LogoLockup />` 삽입.

### `apps/web/index.html` 파비콘

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="mask-icon" href="/favicon.svg" color="#E8562D" />
```

`favicon.svg`는 `apps/web/public/` 혹은 Vite의 public 폴더 규약에 맞춰 배치.

---

## 3. DESIGN.md 패치 — Brand 섹션 추가

`DESIGN.md`에 다음 섹션을 **`## Product Context` 바로 아래**에 끼워넣는다:

```markdown
## Brand

- **서비스명**: Alle
- **부제 (lockup)**: SEOUL
- **보이스**: 에디토리얼, 여행 가이드의 종이 지도 감성 + 한국 편집부 감성.
- **태그라인**: 서울의 축제·박람회·심포지움·컨퍼런스를 지도 위에서.

### Logo — Line Monogram

- 정사각 액자 + A 획 + **버밀리언 크로스바**의 3요소 구조.
- **획만 사용** — fill 없음. 레이아웃 어디에 놓여도 배경을 먹지 않음.
- 마크 viewBox `84×84`, 프레임 `rect 3/3 78 78 rx 2`, A `M22 64 L42 22 L62 64`, crossbar `30,48 → 54,48`.
- 액자·A는 `currentColor` (다크모드에서 자동 반전), 크로스바는 **항상 `var(--color-accent)`**.
- 최소 사용 크기 **24px**. 그 이하에서는 획이 뭉개지므로 색 원(버밀리언 dot)으로 대체 가능.

### 사용 규칙

- **Don't**: 액자 제거하고 A만 쓰기, fill 채우기, 기울이기, 회전, 두 번째 액센트 색 얹기, 그림자.
- **Do**: `currentColor` 기반 색 상속, dark surface에서는 `--color-text: #F0EFEA` 로 자동 반전, 배경 `--color-surface` 또는 `--color-bg` 위에 얹기.
- 파비콘은 stroke-width를 2→3, 2.5→3.5로 늘린 전용 variant 사용.

### Wordmark

- **워드마크**: `Alle` — Pretendard Variable 700, tracking `-0.015em` (text-h3 기준).
- **서브**: `SEOUL` — JetBrains Mono 500, tracking `0.2em`, 크기 12px, 색 `--color-text-subtle`, 마크 오른쪽 8px 갭 + 워드마크 오른쪽 8px 갭.
- 표기 순서: `[마크] [Alle] [SEOUL]`. 모바일에서 `SEOUL`은 `hidden sm:inline`로 드롭 가능.
```

또한 `DESIGN.md`의 `# Design System — GGdrugs` 헤더를 `# Design System — Alle`로 변경.

---

## 4. 디자인 토큰 (기존 정합 확인)

이미 `apps/web/src/styles/index.css`에 이 값들이 **정확하게** 들어있음. 변경 불필요. 참고용 요약:

- `--color-accent: #E8562D` — 로고 크로스바·CTA·핀·활성 칩 전용
- `--color-text: #1A1A1A` (light), `#F0EFEA` (dark)
- `--color-bg: #FAFAF7` (light), `#131311` (dark)
- `--radius-md: 8px` (버튼·폼), `--radius-lg: 12px` (카드)
- `--shadow-pin: 0 2px 8px rgba(232,86,45,0.35)` — 버밀리언 aura

로고도 이 토큰 시스템을 그대로 쓰므로 새 CSS 변수 추가 없음.

---

## 5. 작업 체크리스트 (Claude Code에 그대로 넘기기 좋은 형태)

```
[ ] assets/logo-mark.svg, favicon.svg, logo-lockup.svg 를 apps/web/public/ 에 복사
[ ] apps/web/src/components/brand/Logo.tsx 신설 (LogoMark, LogoLockup)
[ ] apps/web/src/layout/Header.tsx — GGdrugs 텍스트를 <LogoLockup /> 으로 교체
[ ] apps/web/index.html
      <title>Alle — 서울 이벤트·이슈 지도</title>
      <link rel="icon" href="/favicon.svg" type="image/svg+xml">
[ ] apps/web/package.json description 갱신
[ ] README.md 제목 → # Alle
[ ] DESIGN.md
      - 제목 → # Design System — Alle
      - "Brand" 섹션을 Product Context 아래에 삽입 (위 원문)
[ ] grep "GGdrugs" 로 누락 확인 (내부 식별자는 두고, 사용자 대면 표기만)
[ ] pnpm -C apps/web typecheck & build 통과 확인
```

---

## 6. 레퍼런스 — 최종 룩

`reference/` 폴더의 HTML 파일들을 브라우저로 열어 확인:

- `reference/Logo Explorations.html` — 22가지 시안 중 **09 / Line Monogram**이 선정안
- `reference/ui_kit_web.html` — 헤더에 적용된 최종 모습
- `reference/brand-logo.html` — 마크 단독 + 파비콘 변형

이 파일들은 **시각 참조**이며, TSX로 재작성할 때 구조/픽셀값의 기준.

---

## 7. 묻지 말 것 / 확인할 것

**확정된 결정 (Claude Code가 다시 묻지 말 것)**:
- 서비스명 Alle로 고정. 영문 표기, 소문자 로고에서도 `Alle` (첫 글자만 대문자).
- 로고는 Line Monogram 단일안. A/B 대안 없음.
- 버밀리언(#E8562D)은 크로스바 전용 — 워드마크·액자에 쓰지 않음.

**Claude Code가 판단할 것**:
- `favicon.svg` 배치 경로 (Vite public 폴더 관례 확인).
- `@ggdrugs/web` 패키지 이름을 `@alle/web`으로 바꿀지 여부 — 기본은 **유지** (레포 전체 rename 유발 방지). 결정은 사용자에게 확인.
- `react-router` 설정상 루트 `href="/"`가 SPA 라우터와 충돌 안 하는지 `<Link>` 사용 여부 확인.
