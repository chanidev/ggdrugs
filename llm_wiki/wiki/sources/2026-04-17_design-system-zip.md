---
title: GGdrugs Design System.zip — DESIGN.md ingredient
type: source
created: 2026-04-26
updated: 2026-04-26
sources: []
related:
  - ../../../DESIGN.md
  - ../topics/ui-architecture.md
---

# GGdrugs Design System.zip

## Summary

DESIGN.md 정본의 원본 자료 묶음. 압축이 풀린 산출물은 `raw/design_handoff_alle_brand/` 에 존재 (자체 README.md 포함). zip 자체의 별도 위키 박제 가치는 낮음 — DESIGN.md 가 이미 토큰·서체·색·라운드·모션 결정을 정본으로 흡수.

## Key points

- 2026-04 Phase 1 디자인 컨설팅 산출물 (Pretendard / 버밀리언 accent / map-first hybrid layout).
- 풀린 산출물 위치: `llm_wiki/raw/design_handoff_alle_brand/` (자체 README.md 가 인덱스 역할).
- DESIGN.md (`/DESIGN.md`) 가 이 zip 의 결정 사항을 모두 토큰화해서 흡수 — UI 결정 시 DESIGN.md 만 참조하면 충분.
- zip 자체는 raw/ 에 1:1 invariant 보존용 archive — Tailwind v4 `@theme` 블록 (`apps/web/src/styles/index.css`) 이 토큰 매핑 정본.

## Open questions / contradictions

- 없음. DESIGN.md 가 single source of truth.

## References

- [DESIGN.md](../../../DESIGN.md)
- [ui-architecture.md](../topics/ui-architecture.md) §DESIGN.md 토큰 적용
- raw/design_handoff_alle_brand/README.md (zip 풀린 산출물 인덱스)
- [lint-report.md](../lint-report.md) §3 Orphans O-2
