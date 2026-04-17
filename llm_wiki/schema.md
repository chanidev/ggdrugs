# LLM Wiki Schema

Configuration document defining wiki structure and workflows for this project.
Based on Karpathy's LLM Wiki pattern (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

## Three-Layer Architecture

1. **Raw sources** (`raw/`) — immutable documents. Never edited after ingest.
2. **Wiki** (`wiki/`) — LLM-maintained markdown. Summaries + entity pages + cross-refs.
3. **Schema** (this file) — structure, conventions, and workflow definitions.

## Directory Layout

```
llm_wiki/
├── schema.md              # this file
├── raw/                   # raw sources (immutable)
│   └── <source-id>.<ext>  # e.g. 2026-04-14_paper-title.pdf
├── wiki/
│   ├── index.md           # category-organized entry points
│   ├── log.md             # chronological log with timestamps
│   ├── topics/            # topic/concept pages
│   ├── entities/          # people, orgs, products, projects
│   └── sources/           # per-source summary pages (1:1 with raw/)
└── graphify-out/          # graphify artifacts (generated)
    ├── graph.json         # queryable knowledge graph
    ├── graph.html         # interactive visualization
    ├── GRAPH_REPORT.md    # god nodes, communities, recommendations
    ├── cache/             # SHA256-based incremental cache
    └── memory/            # saved Q&A feedback
```

## Page Format

Every wiki page uses this frontmatter:

```markdown
---
title: <human-readable title>
type: topic | entity | source
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: [<source-id>, ...]   # raw sources this page draws from
related: [<wiki-path>, ...]   # cross-references to other wiki pages
---

# <Title>

## Summary
<2–4 sentence tl;dr>

## Key points
- ...

## Open questions / contradictions
- ...

## References
- [<source-id>](../sources/<source-id>.md) — <quote or page anchor>
```

## Naming Conventions

- Source IDs: `YYYY-MM-DD_kebab-case-slug` (date = ingest date).
- Wiki pages: `kebab-case.md`, one concept per file.
- Cross-reference with relative markdown links: `[text](../topics/foo.md)`.
- Every claim in a wiki page must cite at least one source via `[^source-id]` or inline link.

## Workflows

### 1. Ingest

When a new raw source is added:

1. Copy the source into `raw/` with a canonical source-id.
   - Or use `graphify add <url> --dir ./llm_wiki/raw` to fetch remote URLs directly.
2. **Rebuild graph**: run `/graphify ./llm_wiki --update` (slash command in Claude Code) for multimodal semantic extraction, or `graphify update ./llm_wiki` for code-only incremental re-extraction.
3. Read `graphify-out/GRAPH_REPORT.md` — god nodes and communities indicate which topic/entity pages need new or updated wiki pages.
4. Create `wiki/sources/<source-id>.md` with frontmatter + summary + key extractions.
5. Identify 5–15 affected wiki pages (topics/entities). For each:
   - If the page exists → update it, add cross-reference to the new source, note contradictions inline as `> ⚠ contradicts <other-source>: ...`.
   - If the page doesn't exist → create it.
6. Append an entry to `log.md` with timestamp, source-id, and list of pages touched.
7. Update `index.md` if new categories/pages were introduced.

### 2. Query

When asked a question:

1. **Graph lookup first**: `graphify query "<question>"` — BFS traversal of `graph.json`, returns relevant nodes with ~70× token reduction vs raw.
   - `graphify path "A" "B"` — shortest path between two concepts.
   - `graphify explain "X"` — plain-language explanation of a node and its neighbors.
2. Map returned graph nodes → corresponding `wiki/` pages; read those pages.
3. Synthesize an answer citing wiki pages and, through them, raw sources.
4. If the wiki is insufficient, fall back to raw sources — and after answering, update the wiki so the next query doesn't require the fallback.
5. Call `graphify save-result --question ... --answer ... --nodes ...` to persist the Q&A for the graph feedback loop.

### 3. Lint

Periodic health check. Report:

- **Contradictions** — claims across pages that disagree without being flagged.
  - Cross-check with `graph.json` edges tagged `AMBIGUOUS` (graphify-flagged review candidates).
- **Orphans** — pages with no inbound links and not listed in `index.md`.
  - Cross-check with graph nodes that have no edges.
- **Stale refs** — broken `related:` links or missing source-ids.
- **Gaps** — entities/topics mentioned ≥3 times but lacking their own page.
  - Use `GRAPH_REPORT.md` god nodes: high-centrality nodes without a wiki page = top gap candidates.
- **Low-confidence inferences** — graph edges tagged `INFERRED` with confidence < 0.6.
- **Over-large pages** — >400 lines → candidate for splitting.

Output lint results to `wiki/lint-report.md` (overwritten each run).

## Graphify Integration

[graphify](https://github.com/safishamsi/graphify) builds a multimodal knowledge graph (code AST + document/image semantic extraction via Claude Vision) that backs the wiki's query and lint workflows.

**Status in this project:**
- ✅ `graphifyy` installed (pip)
- ✅ Claude Code PreToolUse hook registered (`graphify claude install`) — `GRAPH_REPORT.md` surfaces automatically before file searching
- ⚠ Git post-commit hook not installed (project is not a git repo — run `graphify hook install` after `git init` if desired)

**Commands (run from project root):**
- `/graphify ./llm_wiki` — full multimodal build (slash command in Claude Code). **Required for markdown/PDF/image extraction.**
- `graphify update ./llm_wiki` — code-only incremental update (no LLM calls).
- `graphify watch ./llm_wiki` — auto-rebuild on file changes.
- `graphify query "..."`, `graphify path "A" "B"`, `graphify explain "X"` — read existing graph.
- `graphify add <url> --dir ./llm_wiki/raw` — fetch URL into raw + update graph.
- `graphify cluster-only ./llm_wiki` — rerun clustering on existing graph.

**Export targets (optional):**
- `/graphify ./llm_wiki --obsidian` — Obsidian vault export.
- `/graphify ./llm_wiki --wiki` — alternative wiki (index.md + community docs). Redirect to a sibling dir to avoid overwriting this wiki.
- `/graphify ./llm_wiki --neo4j-push bolt://...` — push to Neo4j.
- `/graphify ./llm_wiki --mcp` — MCP stdio server.

## Invariants

- `raw/` is append-only. Never edit or delete raw sources.
- Every `wiki/sources/*.md` maps 1:1 to a file in `raw/`.
- Every `log.md` entry has an ISO-8601 timestamp and is append-only.
- `index.md` is the single source of truth for top-level navigation.
