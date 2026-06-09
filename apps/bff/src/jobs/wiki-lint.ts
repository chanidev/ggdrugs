/**
 * wiki:lint — llm_wiki invariant 정적 검증.
 *
 * 사용:
 *   pnpm -F bff wiki:lint
 *
 * 검증 항목 (lint-report.md §schema 기반):
 *   1. raw/<file> ↔ wiki/sources/<id>.md 1:1 매핑 (`.gitkeep` / `README.md` 제외).
 *   2. wiki/topics/**.md 의 frontmatter `related:` 링크 resolve.
 *   3. wiki/audit/**.md 의 frontmatter related: 링크 resolve.
 *   4. wiki/index.md 가 모든 topics + sources 를 등재.
 *
 * 종료 코드: drift 0 → exit 0, drift 1+ → exit 1 (CI gate).
 *
 * BFF/LLM/DB 의존 없음 — 파일시스템만. CI 에서 install 만 하면 즉시 실행 가능.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../../..');
const WIKI = join(REPO_ROOT, 'llm_wiki');
const RAW = join(WIKI, 'raw');
const TOPICS = join(WIKI, 'wiki', 'topics');
const SOURCES = join(WIKI, 'wiki', 'sources');
const AUDIT = join(WIKI, 'wiki', 'audit');
const INDEX = join(WIKI, 'wiki', 'index.md');

interface Drift {
  category: 'orphan' | 'stale_ref' | 'index_drift';
  detail: string;
}

function listFiles(dir: string, opts: { recurse?: boolean } = {}): string[] {
  try {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (opts.recurse) out.push(...listFiles(full, opts));
        continue;
      }
      out.push(full);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * raw/ ingest 대상에서 제외할 glob 패턴.
 * 소비 완료된 인테이크 원본이 orphan lint 를 영구히 빨갛게 만드는 것을 방지한다.
 * - `_*`              : `_`-프리픽스 추출물·스크래치 인테이크 (위키화 불필요)
 * - `*.zip` / `*.pdf` : 바이너리 원본 — wiki/sources/ 1:1 텍스트 페이지 대상이 아님
 */
const RAW_IGNORE_GLOBS = ['_*', '*.zip', '*.pdf'];

function matchesGlob(name: string, glob: string): boolean {
  const re = new RegExp(
    '^' + glob.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$',
    'i',
  );
  return re.test(name);
}

/** raw/ 의 ingest 대상 파일 (gitkeep / README.md / 무시 glob 제외). 폴더 (e.g. design_handoff_alle_brand/) 는 한 단위로 침. */
function rawIngestables(): string[] {
  const out: string[] = [];
  for (const e of readdirSync(RAW)) {
    if (e === '.gitkeep' || e === 'README.md') continue;
    if (RAW_IGNORE_GLOBS.some((g) => matchesGlob(e, g))) continue;
    out.push(e);
  }
  return out;
}

/** sources/ 페이지 한 개가 raw/ 의 어느 파일을 매핑하는지 — title / sources 프론트매터로는 명시 부족 → 휴리스틱: file content 안에서 raw/ 파일명 substring 매치. */
function sourceMapsRawItem(srcPath: string, rawItem: string): boolean {
  const text = readFileSync(srcPath, 'utf-8');
  // 정확 substring 매치. raw/foo.png 또는 raw/foo/bar 패턴 모두 포함.
  return text.includes(rawItem);
}

function checkOrphans(): Drift[] {
  const out: Drift[] = [];
  const sources = listFiles(SOURCES).filter((p) => p.endsWith('.md'));
  for (const item of rawIngestables()) {
    const matched = sources.some((s) => sourceMapsRawItem(s, item));
    if (!matched) {
      out.push({
        category: 'orphan',
        detail: `raw/${item} — wiki/sources/ 에 매핑 페이지 없음 (1:1 invariant 위반)`,
      });
    }
  }
  return out;
}

/** ---/related: 블록 추출. YAML 파서 회피 — 한 줄 한 항목 (`  - foo.md`) 가정. */
function extractRelated(mdPath: string): string[] {
  const text = readFileSync(mdPath, 'utf-8');
  if (!text.startsWith('---\n')) return [];
  const end = text.indexOf('\n---', 4);
  if (end < 0) return [];
  const fm = text.slice(4, end);
  const lines = fm.split(/\r?\n/);
  const out: string[] = [];
  let inRelated = false;
  for (const line of lines) {
    if (line.startsWith('related:')) {
      inRelated = true;
      // 인라인 list "[a, b]" 형태도 허용
      const m = line.match(/related:\s*\[(.*)\]/);
      if (m && m[1]) {
        out.push(...m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean));
        inRelated = false;
      }
      continue;
    }
    if (inRelated) {
      if (/^[a-zA-Z]/.test(line)) {
        inRelated = false; // 다른 키 시작
      } else {
        const m = line.match(/^\s*-\s*(.+?)\s*$/);
        if (m && m[1]) out.push(m[1].replace(/^['"]|['"]$/g, ''));
      }
    }
  }
  return out;
}

function checkStaleRefs(): Drift[] {
  const out: Drift[] = [];
  const dirs = [
    { label: 'topics', dir: TOPICS },
    { label: 'sources', dir: SOURCES },
    { label: 'audit', dir: AUDIT },
  ];
  for (const d of dirs) {
    const files = listFiles(d.dir).filter((p) => p.endsWith('.md'));
    for (const f of files) {
      const rels = extractRelated(f);
      for (const r of rels) {
        // 외부 (../../...) / 절대 / 상대 모두 체크. URL 은 skip.
        if (/^https?:\/\//.test(r)) continue;
        const target = resolve(dirname(f), r);
        try {
          statSync(target);
        } catch {
          out.push({
            category: 'stale_ref',
            detail: `${relative(REPO_ROOT, f)} → related: "${r}" — resolve 실패`,
          });
        }
      }
    }
  }
  return out;
}

function checkIndexCoverage(): Drift[] {
  const out: Drift[] = [];
  let indexText: string;
  try {
    indexText = readFileSync(INDEX, 'utf-8');
  } catch {
    return [{ category: 'index_drift', detail: 'wiki/index.md 부재' }];
  }
  // topics/sources 각 파일이 index 에 substring 으로 등장하는지 체크.
  const topicFiles = listFiles(TOPICS).filter((p) => p.endsWith('.md'));
  const sourceFiles = listFiles(SOURCES).filter((p) => p.endsWith('.md'));
  for (const f of [...topicFiles, ...sourceFiles]) {
    const rel = relative(WIKI, f).replace(/\\/g, '/'); // wiki/ 기준 — index.md 와 같은 prefix
    const indexRel = rel.replace(/^wiki\//, ''); // index.md 가 wiki/ 안이라 prefix 제거
    if (!indexText.includes(indexRel)) {
      out.push({
        category: 'index_drift',
        detail: `${rel} — index.md 미등재`,
      });
    }
  }
  return out;
}

function main(): void {
  const drifts = [...checkOrphans(), ...checkStaleRefs(), ...checkIndexCoverage()];
  console.log(`wiki:lint — ${drifts.length} drift(s)`);
  console.log('─'.repeat(72));
  if (drifts.length === 0) {
    console.log('OK — orphans 0 · stale refs 0 · index coverage 100%');
    process.exit(0);
  }
  const byCat = new Map<string, Drift[]>();
  for (const d of drifts) {
    const arr = byCat.get(d.category) ?? [];
    arr.push(d);
    byCat.set(d.category, arr);
  }
  for (const [cat, arr] of byCat) {
    console.log(`\n[${cat}] ${arr.length}건`);
    for (const d of arr) console.log(`  - ${d.detail}`);
  }
  console.log('\n→ 자세한 분류 / fix 권장은 llm_wiki/wiki/lint-report.md 참조.');
  process.exit(1);
}

main();
