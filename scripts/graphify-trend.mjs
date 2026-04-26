#!/usr/bin/env node
/**
 * graphify-trend — graphify-out/graph.json 의 트렌드 한 줄을 출력.
 *
 * 사용:
 *   node scripts/graphify-trend.mjs                      # stdout 한 줄 요약
 *   node scripts/graphify-trend.mjs --append-log         # llm_wiki/wiki/log.md 끝에 entry append
 *
 * 출력 예시:
 *   graph: 1024 nodes / 1248 edges / 178 communities (INFERRED 6.0% avg conf 0.81)
 *
 * --append-log 시 다음 형식으로 log.md 끝에 추가:
 *   ## YYYY-MM-DDTHH:MM  graph  trend
 *   - nodes 1024 · edges 1248 · communities 178
 *   - INFERRED edges 75 (avg conf 0.81), AMBIGUOUS 0
 *
 * 의존: 없음 (stdlib 만). cron 또는 post-commit hook 에서 호출 가능.
 */

import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const GRAPH = resolve(REPO_ROOT, 'graphify-out', 'graph.json');
const REPORT = resolve(REPO_ROOT, 'graphify-out', 'GRAPH_REPORT.md');
const LOG = resolve(REPO_ROOT, 'llm_wiki', 'wiki', 'log.md');

function loadGraph() {
  const raw = readFileSync(GRAPH, 'utf-8');
  const j = JSON.parse(raw);
  const nodes = Array.isArray(j.nodes) ? j.nodes.length : 0;
  const edges = Array.isArray(j.links) ? j.links.length : 0;

  // INFERRED / EXTRACTED / AMBIGUOUS — link 의 confidence 또는 graph.report 에서 추출.
  // avgConf 는 GRAPH_REPORT.md 의 "INFERRED 평균 confidence" 컨벤션 — INFERRED edges 만 평균.
  let inferred = 0;
  let ambiguous = 0;
  let extracted = 0;
  let inferredConfSum = 0;
  for (const e of j.links ?? []) {
    const conf = e.confidence ?? '';
    if (conf === 'INFERRED') {
      inferred++;
      if (typeof e.confidence_score === 'number') inferredConfSum += e.confidence_score;
    } else if (conf === 'AMBIGUOUS') ambiguous++;
    else if (conf === 'EXTRACTED') extracted++;
  }
  const avgConf = inferred > 0 ? (inferredConfSum / inferred).toFixed(2) : 'n/a';

  // communities 수는 graph.json 에 직접 없으므로 GRAPH_REPORT.md "communities detected" 라인에서 파싱.
  let communities = 0;
  try {
    const rep = readFileSync(REPORT, 'utf-8');
    const m = rep.match(/(\d+)\s*communities\s*detected/i);
    if (m) communities = Number.parseInt(m[1], 10);
  } catch {
    // optional
  }

  return { nodes, edges, communities, inferred, ambiguous, extracted, avgConf };
}

function isoMinute() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${dd}T${hh}:${mi}`;
}

function summarize(g) {
  const inferredPct = g.edges > 0 ? ((g.inferred / g.edges) * 100).toFixed(1) : '0.0';
  return `graph: ${g.nodes} nodes / ${g.edges} edges / ${g.communities} communities (INFERRED ${inferredPct}% avg conf ${g.avgConf})`;
}

function appendLog(g) {
  const ts = isoMinute();
  const inferredPct = g.edges > 0 ? ((g.inferred / g.edges) * 100).toFixed(1) : '0.0';
  const block = [
    '',
    `## ${ts}  graph  trend`,
    `- nodes ${g.nodes} · edges ${g.edges} · communities ${g.communities}`,
    `- INFERRED ${g.inferred} (${inferredPct}%, avg conf ${g.avgConf}) · AMBIGUOUS ${g.ambiguous} · EXTRACTED ${g.extracted}`,
    '',
  ].join('\n');
  appendFileSync(LOG, block, 'utf-8');
  console.log(`appended graph trend to ${LOG}`);
}

const args = process.argv.slice(2);
const g = loadGraph();
console.log(summarize(g));
if (args.includes('--append-log')) appendLog(g);
