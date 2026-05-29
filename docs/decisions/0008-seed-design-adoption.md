# ADR 0008: SEED Design 채택 (Option B — SEED 컴포넌트 + Alle 테마)

- **Status**: Proposed (2026-05-29, 초안) — Orchestrator 승인 대기 (CLAUDE.md §8-1 / 금지 #1)
- **Context**: Phase 2 소셜 레이어(커뮤니티/메이트)는 당근식 동행 매칭 UX(와이어프레임의 "당근 온도"=메이트 지수)다. 사용자가 **전체 디자인을 당근 디자인 시스템 SEED Design 으로 진행**할 것을 지시(2026-05-29). 한편 기존 `DESIGN.md`는 Phase 1 에서 다져진 성숙한 **Alle 에디토리얼 브랜드**다 — 커스텀 CSS 변수 토큰 + Tailwind v4 핸드빌드 컴포넌트, 버밀리언 단일 accent(`#E8562D`), Pretendard 단일 패밀리, "여행 가이드 종이 지도 + 편집부" 톤, **anti-bubbly**(uniform 라운드 금지). SEED 는 React 컴포넌트 라이브러리(`@seed-design/react`) + CSS 토큰(`@seed-design/css`)이며 당근(carrot) 브랜드 중심의 시맨틱 토큰(`$color.fg.brand`=carrot 등) + light/dark 색모드(data 속성) 체계를 가진다.
- **Decision drivers**: 소셜 UI 를 검증된 컴포넌트로 빠르게 구축, 당근식 UX 친숙성, 그러나 Phase 1 Alle 브랜드 정체성(로고·버밀리언·Pretendard·에디토리얼)의 연속성 유지, CLAUDE.md 거버넌스 정합.

## Decision

**Option B 채택**: SEED Design 을 **컴포넌트/파운데이션 시스템**으로 도입하되, Alle 정체성(Pretendard · 버밀리언 accent · light/dark · anti-bubbly)을 **테마 오버라이드로 유지**한다. **신규 소셜 화면(커뮤니티/메이트)부터 SEED 로 구축**하고, 기존 발견(지도·검색)·업로더·관리자 화면은 당분간 기존 Alle UI 그대로 둔다(빅뱅 리스킨 안 함).

### 세부

1. **SEED 가 제공**: `@seed-design/react` 컴포넌트, `@seed-design/css` 토큰, light/dark 색모드(`data-seed-color-mode` / `data-seed-user-color-scheme`). 설치는 Vite 플러그인(`@seed-design/vite-plugin`) + (Vite 6 이므로) `vite-tsconfig-paths`, 엔트리에 **`@seed-design/css/all.css`** import(⚠️ base.css 는 토큰 전용 — 컴포넌트 스타일이 없어 모달/입력 등이 깨진다. all.css = 토큰+컴포넌트 스타일), `seed-design.json`(`npx @seed-design/cli init`), 스니펫은 `seed-design/` 디렉터리에 vendoring(`npx @seed-design/cli add ui:<component>`).
2. **Alle 가 유지**: Pretendard 단일 패밀리, 버밀리언 accent(`#E8562D` light / `#F27147` dark), light/dark 의도, anti-bubbly 라운드 정책, 에디토리얼 간격, **로고·워드마크·브랜드는 불변**.
3. **테마 브리지(핵심)**: `@seed-design/css/base.css` **이후**에 Alle 오버라이드 CSS 를 얹어
   - SEED 브랜드 시맨틱 토큰(`fg.brand` / `bg.brand-solid` / `bg.brand-weak` / `stroke.brand-*`)의 `--seed-*` CSS 변수를 **버밀리언으로 재정의**,
   - 폰트 스케일 토큰을 **Pretendard** 로 재정의,
   - SEED light/dark 색모드를 Alle light/dark 와 정렬.
   - **⚠️ 리스크**: SEED 의 브랜드 재색상화(carrot→버밀리언)는 **공식 문서화된 경로가 아님**(SEED 테마 문서는 light/dark 색모드만 다룸; carrot 브랜드 중심). 따라서 이 오버라이드의 **실제 가능 여부·범위를 설치 시 검증**한다. 검증 실패/부분 적용 시 폴백: (a) 폰트·중립 토큰만 Alle 로, accent 는 SEED 가 허용하는 범위까지, (b) 그래도 충돌하면 신규 소셜 화면은 SEED 기본 톤 유지 + Alle 로고/타이포로 최소 연결.
4. **스코프·롤아웃**: 슬라이스 1 의 UI Task **5b·6·7** 및 후속 메이트 슬라이스(2~8)의 UI 를 SEED 컴포넌트로 구축. **BFF/API(Task 2~5)는 디자인 무관 → 영향 없음.** 기존 Alle UI 와 **공존**하되, 공유 브리지 토큰(accent·폰트·색모드)으로 이질감 최소화. 기존 화면의 SEED 마이그레이션은 후속 결정.
5. **거버넌스**: 본 ADR + `DESIGN.md` 에 "SEED 채택(Option B)" 섹션(토큰 매핑·컴포넌트 사용 정책·anti-pattern 정합) 추가. CLAUDE.md §8-1.

## Consequences

- (+) 소셜 UI 를 검증된 SEED 컴포넌트로 빠르게·일관되게 구축. 당근식 UX 친숙성.
- (+) Alle 브랜드 정체성(로고·버밀리언·Pretendard) 연속성 유지.
- (+) 신규 화면 우선 도입이라 기존 안정 화면 리스크 없음.
- (−) **두 시스템 공존**(SEED + Alle 커스텀 토큰) — 일관성·중복 관리 비용. 장기적으로 수렴 필요.
- (−) **브랜드 재색상화 리스크**: SEED 가 carrot 중심이라 버밀리언 완전 재테마가 부분적일 수 있음(설치 시 검증).
- (−) SEED 스니펫 vendoring(`seed-design/` 디렉터리) + 의존성 추가, 학습/통합 오버헤드.
- (−) anti-bubbly 정책과 SEED 기본 라운드의 조정 필요(컴포넌트 변형 선택으로 완화).

## Alternatives considered

- **A. SEED 전면 채택(Alle 대체)**: 제품 전체를 SEED 룩으로. Phase 1 Alle 브랜드(로고·버밀리언·에디토리얼) 폐기 — 정체성 손실 과대. 기각.
- **C. 신규 화면만 SEED, 테마 없음**: SEED 기본 carrot 룩 그대로 + 기존은 Alle. 두 비주얼 존 이질감 큼. B 가 이를 브리지 토큰으로 완화하므로 B 채택(롤아웃은 C 처럼 신규 우선).

## Open items (설치/구현 시 확정)

- SEED `--seed-*` CSS 변수 **오버라이드 메커니즘·carrot→버밀리언 재테마 실제 가능 범위** 검증(테마 브리지 리스크).
- 라운드/간격: SEED 스케일 ↔ Alle 토큰 매핑(anti-bubbly 유지 위해 SEED 변형 선택 기준).
- 커뮤니티/메이트용 SEED 컴포넌트 인벤토리(ActionButton, TextField, Modal/BottomSheet, Avatar, Chip 등) 확정.
- 기존 발견/업로더/관리자 화면의 SEED 마이그레이션 시점(또는 영구 공존).
- dark mode 패리티(Alle dark 팔레트 ↔ SEED dark).

## References

- SEED Design: https://seed-design.io (foundation: design-token, color-role; React: getting-started/styling/theming)
- 기존 디자인 시스템: `DESIGN.md` (Alle 브랜드 — 버밀리언·Pretendard·anti-bubbly)
- 관련 ADR: [0007](0007-phase2-community-mate-matching.md)(Phase 2 커뮤니티/메이트)
- 구현 플랜: `docs/superpowers/plans/2026-05-29-phase2-slice1-community-board.md` (UI Task 5b/6/7 이 SEED 로 재계획 대상)
- 거버넌스: `.claude/CLAUDE.md` §8-1 (Design System)
