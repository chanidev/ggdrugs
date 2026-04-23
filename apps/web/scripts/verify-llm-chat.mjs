/**
 * LLM /chat 강화 prompt 검증 — 다양한 발화 패턴.
 *
 * 직접 BFF /chat (port 3000) 호출. LLM 서비스가 떠있어야 (8000), OPENAI_API_KEY 필요.
 *
 * 각 케이스 평가:
 *  - filters: 기대값과 비교 (없으면 추출 정확도만 표시)
 *  - reply: 금지어 ('오른쪽','왼쪽','상단','하단') 미포함, 길이, 톤 체크
 *  - suggestions: count + 모두 phase != ended 검증
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3000';
const OUT_DIR = resolve(import.meta.dirname, '..', '.verify');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const FORBIDDEN = ['오른쪽', '왼쪽', '상단', '하단', '지도 옆', '지도옆'];

const cases = [
  {
    name: 'today-family-festival',
    messages: [{ role: 'user', text: '오늘 가족이랑 갈 만한 축제 뭐 있어?' }],
    expect: { periodKey: 'today', companions: ['family'], eventTypes: ['festival'] },
  },
  {
    name: 'tomorrow-region-performance',
    messages: [{ role: 'user', text: '내일 종로구에서 공연 볼만한 거 있을까' }],
    expect: { periodKey: 'tomorrow', regionHints: ['종로구'], eventTypes: ['performance'] },
  },
  {
    name: 'gangnam-couple-exhibition-vibe',
    messages: [{ role: 'user', text: '강남 데이트하면서 볼만한 잔잔한 전시' }],
    expect: { regionHints: ['강남구'], companions: ['couple'], eventTypes: ['exhibition'], vibes: ['정적'] },
  },
  {
    name: 'multi-turn-reset',
    messages: [
      { role: 'user', text: '이번 주말 가족이랑 축제' },
      { role: 'assistant', text: '...' },
      { role: 'user', text: '가족 말고 친구랑' },
    ],
    expect: { periodKey: 'weekend', companions: ['friend'], eventTypes: ['festival'] },
  },
  {
    name: 'vague-input-no-filters',
    messages: [{ role: 'user', text: '추천해줘' }],
    expect: {},
  },
  {
    name: 'experience-vibe-popup',
    messages: [{ role: 'user', text: '이번 주말 친구들이랑 직접 만들어볼 수 있는 팝업' }],
    expect: { periodKey: 'weekend', companions: ['friend'], eventTypes: ['festival'], vibes: ['체험형'] },
  },
];

const results = [];
for (const c of cases) {
  process.stdout.write(`[${c.name}] ... `);
  let res;
  try {
    res = await fetch(`${BFF_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: c.messages }),
    });
  } catch (e) {
    console.log(`NETWORK FAIL: ${e.message}`);
    results.push({ name: c.name, ok: false, error: e.message });
    continue;
  }
  if (!res.ok) {
    console.log(`HTTP ${res.status}`);
    results.push({ name: c.name, ok: false, http: res.status });
    continue;
  }
  const data = await res.json();
  const f = data.filters ?? {};
  const reply = data.reply ?? '';
  const sugg = data.suggestions ?? [];

  const violations = [];
  for (const word of FORBIDDEN) {
    if (reply.includes(word)) violations.push(`reply contains forbidden word "${word}"`);
  }
  if (reply.length === 0) violations.push('reply empty');
  if (reply.length > 280) violations.push(`reply too long: ${reply.length}`);

  for (const [k, expected] of Object.entries(c.expect)) {
    const actual = f[k];
    if (Array.isArray(expected)) {
      const missing = expected.filter((v) => !(actual ?? []).includes(v));
      if (missing.length) violations.push(`filters.${k} missing ${JSON.stringify(missing)} (got ${JSON.stringify(actual)})`);
    } else if (expected !== actual) {
      violations.push(`filters.${k} expected "${expected}" got "${actual}"`);
    }
  }

  const endedSuggestions = sugg.filter((s) => s.phase === 'ended');
  if (endedSuggestions.length) violations.push(`${endedSuggestions.length} ended suggestions leaked`);

  const ok = violations.length === 0;
  console.log(ok ? 'PASS' : `FAIL (${violations.length})`);
  results.push({ name: c.name, ok, violations, reply, filters: f, suggestionsCount: sugg.length });
}

console.log('\n=== DETAIL ===');
for (const r of results) {
  console.log(`\n[${r.name}] ${r.ok ? 'OK' : 'FAIL'}`);
  if (r.reply) console.log('  reply:', r.reply);
  if (r.filters) console.log('  filters:', JSON.stringify(r.filters));
  if (r.suggestionsCount !== undefined) console.log('  suggestions:', r.suggestionsCount);
  if (r.violations?.length) for (const v of r.violations) console.log('   ✗', v);
}

writeFileSync(resolve(OUT_DIR, 'llm-chat-eval.json'), JSON.stringify(results, null, 2), 'utf8');
console.log('\nresults written:', resolve(OUT_DIR, 'llm-chat-eval.json'));

const failures = results.filter((r) => !r.ok).length;
console.log(`\n=== SUMMARY: ${results.length - failures}/${results.length} passed ===`);
process.exit(failures ? 1 : 0);
