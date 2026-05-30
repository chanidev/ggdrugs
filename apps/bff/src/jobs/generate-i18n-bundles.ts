/**
 * 빌드타임 i18n 번들 생성 스크립트.
 * 사용법: pnpm i18n:generate
 *
 * ko 원본을 읽어 en/vi/zh/ja/fr 각 언어로 번역. 실패 시 재시도 1회 후 프로세스 종료(빈 객체 금지).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, '../../../../apps/web/public/locales');
const NAMESPACES = ['common', 'navigation', 'community', 'mate', 'chat', 'uploader', 'admin', 'mypage'] as const;
const TARGET_LANGS = ['en', 'vi', 'zh', 'ja', 'fr'] as const;
const RETRY = 1;
const DELAY_MS = 1200;

async function translateBundle(namespace: string, lang: string, keys: unknown, attempt = 0): Promise<unknown> {
  const url = `${env.LLM_SERVICE_URL}/translate-bundle`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ namespace, lang, keys }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`LLM /translate-bundle ${res.status}: ${text.slice(0, 200)}`);
    if (attempt < RETRY) {
      console.warn(`  retry ${attempt + 1}/${RETRY} for ${lang}/${namespace}...`);
      await new Promise((r) => setTimeout(r, DELAY_MS * 2));
      return translateBundle(namespace, lang, keys, attempt + 1);
    }
    throw err;
  }
  const data = await res.json() as { translated: unknown };
  return data.translated;
}

async function main() {
  let failures = 0;
  for (const ns of NAMESPACES) {
    const koPath = join(LOCALES_DIR, 'ko', `${ns}.json`);
    let koData: unknown;
    try {
      koData = JSON.parse(await readFile(koPath, 'utf-8'));
    } catch {
      console.warn(`[skip] ko/${ns}.json not found`);
      continue;
    }

    for (const lang of TARGET_LANGS) {
      const outPath = join(LOCALES_DIR, lang, `${ns}.json`);
      console.log(`Translating ${ns} → ${lang}...`);
      try {
        const translated = await translateBundle(ns, lang, koData);
        await mkdir(join(LOCALES_DIR, lang), { recursive: true });
        await writeFile(outPath, JSON.stringify(translated, null, 2) + '\n', 'utf-8');
        console.log(`  ✓ saved ${lang}/${ns}.json`);
      } catch (err) {
        // [이슈 8] 빈 객체 저장 금지 — 실패는 즉시 에러 로그, 최종 집계 후 exit 1
        console.error(`  ✗ FAILED ${lang}/${ns}: ${(err as Error).message}`);
        failures++;
      }
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} translation(s) failed. Fix and re-run.`);
    process.exit(1);
  }
  console.log('All bundles generated successfully.');
}

main().catch((e) => { console.error(e); process.exit(1); });
