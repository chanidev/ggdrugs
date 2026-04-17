# LLM Wiki + graphify 셋업 가이드

어떤 프로젝트 폴더에서든 **Karpathy식 LLM 위키 + graphify 지식 그래프** 시스템을 동일하게 구축하는 재현 가능한 레시피.

> 이 가이드는 `C:\Users\user\Desktop\real_Project` 에 실제 구축한 내역을 일반화한 것.

---

## 📋 사전 요구사항

- **Python 3.9+** (pip 사용 가능)
- **Claude Code** CLI (또는 Antigravity 등 파일 기반 LLM 에이전트)
- 대상 프로젝트 폴더 (빈 폴더여도 됨)

---

## 🛠️ 셋업 절차 (최초 1회)

### Step 1. graphify 설치

```bash
pip install graphifyy
python -c "import graphify; print('ok')"
```

`ok`가 찍히면 성공. (패키지 이름은 `graphifyy`, import 이름은 `graphify` — 주의)

### Step 2. 프로젝트에 llm_wiki 스캐폴드 생성

프로젝트 루트(예: `Desktop/my-project/`)에서:

```bash
mkdir -p llm_wiki/raw llm_wiki/wiki/topics llm_wiki/wiki/entities llm_wiki/wiki/sources
```

### Step 3. `llm_wiki/schema.md` 작성

아래 내용을 `llm_wiki/schema.md`로 저장.
(이 스키마가 LLM의 동작 규칙서임. 세션마다 Claude가 먼저 읽음)

```markdown
# LLM Wiki Schema

Configuration document defining wiki structure and workflows for this project.
Based on Karpathy's LLM Wiki pattern.

## Three-Layer Architecture

1. **Raw sources** (`raw/`) — immutable documents. Never edited after ingest.
2. **Wiki** (`wiki/`) — LLM-maintained markdown. Summaries + entity pages + cross-refs.
3. **Schema** (this file) — structure, conventions, and workflow definitions.

## Directory Layout

llm_wiki/
├── schema.md
├── raw/                   # immutable sources
├── wiki/
│   ├── index.md
│   ├── log.md
│   ├── topics/
│   ├── entities/
│   └── sources/
└── graphify-out/          # auto-generated

## Page Format

Every wiki page uses this frontmatter:

---
title: <human-readable title>
type: topic | entity | source
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: [<source-id>, ...]
related: [<wiki-path>, ...]
---

# Title

## Summary
<2–4 sentence tl;dr>

## Key points
- ...

## Open questions / contradictions
- ...

## References
- [<source-id>](../sources/<source-id>.md) — <quote>

## Naming Conventions

- Source IDs: YYYY-MM-DD_kebab-case-slug
- Wiki pages: kebab-case.md, one concept per file
- Every claim must cite a source

## Workflows

### 1. Ingest
1. Copy source to raw/ with canonical id (or `graphify add <url> --dir ./llm_wiki/raw`)
2. Run `/graphify ./llm_wiki --update`
3. Read `graphify-out/GRAPH_REPORT.md`
4. Create `wiki/sources/<id>.md`
5. Update 5–15 affected topic/entity pages
6. Append to `log.md`
7. Update `index.md`

### 2. Query
1. `graphify query "<question>"` first
2. Map nodes → wiki pages, read them
3. Answer with citations
4. `graphify save-result` to persist Q&A

### 3. Lint
Check: contradictions, orphans, stale refs, gaps, low-confidence inferences, oversized pages.
Output to `wiki/lint-report.md`.

## Invariants

- `raw/` is append-only
- Every `wiki/sources/*.md` maps 1:1 to `raw/`
- `log.md` is append-only with ISO-8601 timestamps
- `index.md` is the single navigation source
```

### Step 4. `llm_wiki/wiki/index.md` 생성

```markdown
# Wiki Index

Top-level navigation. See [schema.md](../schema.md) for structure.

## Topics
_(none yet — add on first ingest)_

## Entities
_(none yet)_

## Sources
_(none yet)_

## Meta
- [schema.md](../schema.md)
- [log.md](log.md)
- [lint-report.md](lint-report.md) (generated)
```

### Step 5. `llm_wiki/wiki/log.md` 생성

```markdown
# Wiki Log

Chronological, append-only record.
Format: `## YYYY-MM-DDTHH:MM  <action>  <target>`

---

## YYYY-MM-DDTHH:MM  init  schema
Initialized LLM Wiki per Karpathy's pattern.
```

### Step 6. 프로젝트 루트에 `CLAUDE.md` (또는 `AGENTS.md`) 생성

이 파일이 **모든 Claude 세션에서 자동 로드**됨. graphify 규칙을 여기 박아두면 매번 재지시 안 해도 됨.

```markdown
## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
```

Antigravity 쓰면 같은 내용을 `AGENTS.md`로도 복사.

### Step 7. Claude Code hook 등록 (선택, Claude Code 전용)

```bash
graphify claude install
```

이러면 `CLAUDE.md`에 graphify 섹션이 자동 추가되고, PreToolUse hook이 `GRAPH_REPORT.md`를 파일 검색 전에 자동 노출.

### Step 8. git hook (선택)

프로젝트가 git 저장소면:

```bash
git init   # 아직 없으면
graphify hook install
```

커밋마다 코드 파일 변경분 자동 재빌드.

---

## ✅ 셋업 완료 검증

```bash
ls llm_wiki/
# → raw/ schema.md wiki/ 가 있어야 함

python -c "from graphify.detect import detect; from pathlib import Path; print(detect(Path('llm_wiki')))"
# → {'total_files': 3, ...} 식으로 출력
```

---

## 🚀 최초 사용 시작

1. **`llm_wiki/raw/`에 소스 1개 이상 넣기** (비어있으면 그래프 의미 없음)
2. Claude에게:
   > "`llm_wiki/schema.md` 읽고 raw/의 파일들 ingest 해줘"
3. 그 뒤부터는 [사용법](llm_wiki/사용법.md) 대로.

---

## 🔄 다른 머신/폴더로 이식

1. `llm_wiki/` 폴더 통째로 복사 (`raw/` + `wiki/` + `schema.md`)
2. 새 환경에서 `pip install graphifyy`
3. 새 프로젝트 루트에 `CLAUDE.md`도 복사
4. 첫 쿼리 전에 한 번 `/graphify ./llm_wiki` 또는 `graphify update ./llm_wiki` 로 그래프 재빌드

---

## 🧩 툴별 호환성

| 환경 | 슬래시 커맨드 `/graphify` | CLI `graphify ...` | CLAUDE.md 인식 |
|---|---|---|---|
| Claude Code | ✅ | ✅ | ✅ |
| Antigravity | ⚠️ 스킬 재등록 필요 | ✅ | ⚠️ `AGENTS.md`로 복사 |
| Cursor / 기타 | ❌ | ✅ | 도구마다 다름 |

CLI는 어디서나 동작. 슬래시 커맨드는 Claude Code 스킬 시스템 전용.

---

## 📚 참고

- graphify: https://github.com/safishamsi/graphify
- Karpathy LLM Wiki 원본: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
