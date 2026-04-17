# LLM Wiki

Implementation of [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

An LLM-maintained knowledge base that sits between you and raw sources. Instead of re-reading raw materials every query, the LLM incrementally maintains summary pages, entity pages, and cross-references.

## How to use

**Ingest a new source:**
> "Ingest `<path-to-file>` into the wiki."

Claude will copy it to `raw/`, create a source page, and update affected topic/entity pages per [schema.md](schema.md).

**Query:**
> "What does the wiki say about X?"

Claude searches `wiki/` first, cites pages, falls back to raw only when needed.

**Lint:**
> "Lint the wiki."

Claude scans for contradictions, orphans, stale refs, and gaps → writes `wiki/lint-report.md`.

## Layout

- `schema.md` — structure, conventions, workflows (read this first)
- `raw/` — immutable source documents
- `wiki/index.md` — top-level navigation
- `wiki/log.md` — chronological log
- `wiki/topics/`, `wiki/entities/`, `wiki/sources/` — the wiki itself
