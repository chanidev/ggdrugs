/**
 * chat:eval — /chat 엔드포인트 regression harness.
 *
 * 사용:
 *   pnpm -F bff chat:eval                     # 전체 실행
 *   pnpm -F bff chat:eval --id basic-today-minimal   # 단일 case
 *   pnpm -F bff chat:eval --verbose           # case 별 전체 응답 출력
 *   pnpm -F bff chat:eval --base http://localhost:3000  # BFF URL (기본)
 *
 * 사전조건: BFF + LLM 서비스 + Postgres + Qdrant 기동. `@ggdrugs/bff` dev 서버 띄운 상태.
 *
 * 출력:
 *   case 별 PASS / FAIL + 실패 사유. 종료 코드: 실패 있으면 1.
 *
 * 목적:
 *   - chat v3.x 변경 시 filter 추출 · grounded followup · injection 방어 · 기본
 *     UX 시나리오가 깨지지 않는지 자동 확인.
 *   - LLM-judge 없이 구조적 assertion 만 — 빠르고 결정적.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CASES_PATH = join(__dirname, 'chat-eval-cases.json');

interface Case {
  id: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; text: string }>;
  lastSuggestions?: Array<Record<string, unknown>>;
  expect: {
    filters?: Record<string, unknown>;
    specificDateExact?: string;
    referencesLast?: boolean;
    minSuggestions?: number;
    maxSuggestions?: number;
    replyForbidden?: string[];
    replyRequired?: string[];
  };
  skip?: boolean;
  note?: string;
}

interface ChatReply {
  reply: string;
  filters: {
    companions: string[];
    eventTypes: string[];
    periodKey: string | null;
    vibes: string[];
    regionHints: string[];
    regionIds: string[];
    vibeIds: string[];
  };
  specificDate: string | null;
  followups: string[];
  referencesLast?: boolean;
  suggestions: Array<{ eventId: string; title: string }>;
}

interface CaseResult {
  id: string;
  pass: boolean;
  failures: string[];
  reply?: ChatReply;
  elapsedMs: number;
}

interface Options {
  base: string;
  verbose: boolean;
  onlyId: string | null;
}

function parseArgs(argv: string[]): Options {
  const args = argv.slice(2);
  const opts: Options = {
    base: 'http://localhost:3000',
    verbose: false,
    onlyId: null,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--base') {
      const next = args[i + 1];
      if (next !== undefined) {
        opts.base = next;
        i++;
      }
    } else if (a === '--verbose') {
      opts.verbose = true;
    } else if (a === '--id') {
      const next = args[i + 1];
      if (next !== undefined) {
        opts.onlyId = next;
        i++;
      }
    }
  }
  return opts;
}

/**
 * 배열 필터 assertion — expected ⊆ actual (subset). LLM temperature 0.2 비결정성
 * 흡수: expected 에 명시한 축은 반드시 있어야 하되, 추가 축은 허용. 문서에서
 * "subset semantics" 로 일관.
 */
function arraySubset(expected: string[], actual: string[]): boolean {
  const setA = new Set(actual);
  for (const v of expected) if (!setA.has(v)) return false;
  return true;
}

function checkFilters(
  expected: Record<string, unknown>,
  actual: ChatReply['filters'],
): string[] {
  const failures: string[] = [];
  for (const [axis, exp] of Object.entries(expected)) {
    const act = (actual as unknown as Record<string, unknown>)[axis];
    if (Array.isArray(exp) && Array.isArray(act)) {
      if (!arraySubset(exp as string[], act as string[])) {
        failures.push(
          `filters.${axis}: expected ⊆ [${(exp as string[]).join(',')}], got [${(act as string[]).join(',')}]`,
        );
      }
    } else if (exp === null || typeof exp === 'string' || typeof exp === 'number') {
      if (exp !== act) {
        failures.push(`filters.${axis}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(act)}`);
      }
    }
  }
  return failures;
}

function checkCase(c: Case, reply: ChatReply): string[] {
  const failures: string[] = [];

  if (c.expect.filters) {
    failures.push(...checkFilters(c.expect.filters, reply.filters));
  }
  if (c.expect.specificDateExact !== undefined) {
    if (reply.specificDate !== c.expect.specificDateExact) {
      failures.push(
        `specificDate: expected ${c.expect.specificDateExact}, got ${reply.specificDate ?? 'null'}`,
      );
    }
  }
  if (c.expect.referencesLast !== undefined) {
    const actual = reply.referencesLast === true;
    if (actual !== c.expect.referencesLast) {
      failures.push(`referencesLast: expected ${c.expect.referencesLast}, got ${actual}`);
    }
  }
  if (c.expect.minSuggestions !== undefined) {
    if (reply.suggestions.length < c.expect.minSuggestions) {
      failures.push(
        `suggestions: min ${c.expect.minSuggestions}, got ${reply.suggestions.length}`,
      );
    }
  }
  if (c.expect.maxSuggestions !== undefined) {
    if (reply.suggestions.length > c.expect.maxSuggestions) {
      failures.push(
        `suggestions: max ${c.expect.maxSuggestions}, got ${reply.suggestions.length}`,
      );
    }
  }
  if (c.expect.replyForbidden) {
    const lower = reply.reply.toLowerCase();
    for (const sub of c.expect.replyForbidden) {
      if (lower.includes(sub.toLowerCase())) {
        failures.push(`reply contains forbidden: "${sub}" in: ${reply.reply.slice(0, 120)}`);
      }
    }
  }
  if (c.expect.replyRequired) {
    const lower = reply.reply.toLowerCase();
    for (const sub of c.expect.replyRequired) {
      if (!lower.includes(sub.toLowerCase())) {
        failures.push(`reply missing required: "${sub}" — got: ${reply.reply.slice(0, 120)}`);
      }
    }
  }
  return failures;
}

async function runCase(base: string, c: Case): Promise<CaseResult> {
  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(`${base}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        messages: c.messages,
        ...(c.lastSuggestions ? { last_suggestions: c.lastSuggestions } : {}),
      }),
    });
  } catch (err) {
    return {
      id: c.id,
      pass: false,
      failures: [`fetch failed: ${(err as Error).message}`],
      elapsedMs: Date.now() - start,
    };
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return {
      id: c.id,
      pass: false,
      failures: [`HTTP ${res.status}: ${txt.slice(0, 160)}`],
      elapsedMs: Date.now() - start,
    };
  }
  const reply = (await res.json()) as ChatReply;
  const failures = checkCase(c, reply);
  return {
    id: c.id,
    pass: failures.length === 0,
    failures,
    reply,
    elapsedMs: Date.now() - start,
  };
}

function statusBadge(pass: boolean): string {
  return pass ? 'PASS' : 'FAIL';
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  const raw = readFileSync(CASES_PATH, 'utf-8');
  const spec = JSON.parse(raw) as { cases: Case[] };
  const cases = spec.cases.filter((c) => !c.skip && (!opts.onlyId || c.id === opts.onlyId));

  if (cases.length === 0) {
    console.error(`no cases to run (filter: ${opts.onlyId ?? '(all)'})`);
    process.exit(2);
  }

  console.log(`chat:eval — ${cases.length} case(s) against ${opts.base}`);
  console.log('─'.repeat(72));

  const results: CaseResult[] = [];
  for (const c of cases) {
    const r = await runCase(opts.base, c);
    results.push(r);
    const tag = statusBadge(r.pass);
    console.log(
      `${tag}  ${r.id.padEnd(38)}  ${r.elapsedMs.toString().padStart(5)}ms` +
        (r.reply ? `  refLast=${r.reply.referencesLast === true} sugg=${r.reply.suggestions.length}` : ''),
    );
    if (!r.pass) {
      for (const f of r.failures) console.log(`      → ${f}`);
    } else if (opts.verbose && r.reply) {
      console.log(`      reply: ${r.reply.reply.slice(0, 120)}`);
      console.log(
        `      filters: ${JSON.stringify({
          companions: r.reply.filters.companions,
          eventTypes: r.reply.filters.eventTypes,
          periodKey: r.reply.filters.periodKey,
          vibes: r.reply.filters.vibes,
          regionHints: r.reply.filters.regionHints,
        })}`,
      );
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const totalMs = results.reduce((a, r) => a + r.elapsedMs, 0);
  const avgMs = Math.round(totalMs / Math.max(1, results.length));
  console.log('─'.repeat(72));
  console.log(
    `summary: ${passed}/${results.length} passed, ${failed} failed · avg ${avgMs}ms · total ${totalMs}ms`,
  );

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('chat:eval crashed:', err);
  process.exit(1);
});
