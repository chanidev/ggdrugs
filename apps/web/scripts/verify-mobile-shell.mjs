/**
 * Mobile main shell 검증 스크립트.
 *
 * Vite dev server (http://localhost:5173) 가 떠있어야 함.
 * Chromium 헤드리스 + iPhone 12 viewport (390x844, dpr 3).
 *
 * 시퀀스:
 *  1. 메인 진입 → 핸들 / 헤더 / 시트 peek 상태 캡쳐
 *  2. 핸들 탭 → full snap 확장 캡쳐
 *  3. 핸들 다시 탭 → peek 복귀 캡쳐
 *  4. 시트 탭: 필터 / 채팅 각각 캡쳐
 *  5. 핀 또는 목록 1번째 항목 탭 → SelectedEventView 캡쳐
 *  6. 콘솔/에러 수집해서 출력
 *
 * 결과: apps/web/.verify/*.png + 표준출력 리포트.
 */
import { chromium, devices } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = process.env.VERIFY_URL ?? 'http://localhost:5173';
const OUT_DIR = resolve(import.meta.dirname, '..', '.verify');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const log = (...a) => console.log('[verify]', ...a);
const errors = [];

function snapshot(page, name) {
  return page.screenshot({
    path: resolve(OUT_DIR, `${name}.png`),
    fullPage: false,
  });
}

const iPhone = devices['iPhone 12'];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...iPhone,
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (req) => {
  if (req.url().includes('localhost:5173') || req.url().includes('localhost:4000')) {
    errors.push(`[netfail] ${req.url()} — ${req.failure()?.errorText}`);
  }
});

log('navigating', BASE_URL);
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

// 카카오맵 + 시트 마운트 대기
await page.waitForSelector('[role="dialog"][aria-label="이벤트 시트"]', { timeout: 15000 });
log('sheet mounted');
await page.waitForTimeout(1500); // map tiles 로드 여유

// === 1. 초기 peek ===
const sheet = page.locator('[role="dialog"][aria-label="이벤트 시트"]');
const initialBox = await sheet.boundingBox();
log('initial sheet box', JSON.stringify(initialBox));
await snapshot(page, '01-initial-peek');

// 헤더 가시성 확인
const headerVisible = await page.locator('header[aria-label="Alle 홈"], header').first().isVisible();
log('header visible:', headerVisible);

// === 2. handle 탭 → full ===
const handle = sheet.locator('button').first();
await handle.click();
await page.waitForTimeout(500); // 320ms 트랜지션 + 여유
const fullBox = await sheet.boundingBox();
log('full sheet box', JSON.stringify(fullBox));
await snapshot(page, '02-full-snap');

// === 3. handle 탭 → peek 복귀 ===
await handle.click();
await page.waitForTimeout(500);
const peekBox = await sheet.boundingBox();
log('peek sheet box', JSON.stringify(peekBox));
await snapshot(page, '03-peek-return');

// === 4. 탭 전환: 필터 ===
await handle.click(); // full 로 펼친 후 탭 전환
await page.waitForTimeout(500);
const filterTab = page.getByRole('tab', { name: '필터' });
if (await filterTab.isVisible()) {
  await filterTab.click();
  await page.waitForTimeout(400);
  await snapshot(page, '04-tab-filter');
} else {
  errors.push('[ui] 필터 탭 button not visible');
}

// === 5. 탭 전환: 채팅 ===
const chatTab = page.getByRole('tab', { name: '채팅' });
if (await chatTab.isVisible()) {
  await chatTab.click();
  await page.waitForTimeout(400);
  await snapshot(page, '05-tab-chat');
} else {
  errors.push('[ui] 채팅 탭 button not visible');
}

// === 6. 목록 탭으로 돌아가서 첫 항목 클릭 → SelectedEventView ===
const listTab = page.getByRole('tab', { name: '목록' });
await listTab.click();
await page.waitForTimeout(800); // FullListPanel fetch

// EventCard 는 <button> with nested <h3>. 카테고리 chip 은 h3 없음.
const eventCard = sheet.locator('button:has(h3)').first();
const cardCount = await eventCard.count();
log('event card candidates:', cardCount);

if (cardCount > 0) {
  await eventCard.click().catch((e) => errors.push(`[ui] event card click failed: ${e.message}`));
  await page.waitForTimeout(800);
  const backBtn = page.getByRole('button', { name: /목록으로/ });
  const backVisible = await backBtn.isVisible().catch(() => false);
  log('selected event view ("목록으로" back btn) visible:', backVisible);
  await snapshot(page, '06-selected-event');

  if (backVisible) {
    await backBtn.click();
    await page.waitForTimeout(400);
    await snapshot(page, '07-back-to-list');
  }
} else {
  log('no event card found in list (likely empty fixture or fetch failed)');
  await snapshot(page, '06-list-empty');
}

// === 7. 드래그 시뮬레이션 (peek → full 위로 스와이프) ===
// 핸들 위에서 pointerdown → pointermove(-300) → pointerup
const handleBox = await handle.boundingBox();
if (handleBox) {
  const cx = handleBox.x + handleBox.width / 2;
  const cy = handleBox.y + handleBox.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  // 단계적 이동 — 자연스러운 드래그 시뮬
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(cx, cy - 50 * i, { steps: 4 });
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
  const draggedBox = await sheet.boundingBox();
  log('after drag-up sheet box', JSON.stringify(draggedBox));
  await snapshot(page, '08-after-drag-up');
}

await context.close();
await browser.close();

console.log('\n=== ERRORS / WARNINGS ===');
if (errors.length === 0) console.log('(none)');
else for (const e of errors) console.log('  -', e);

console.log('\n=== SCREENSHOTS ===');
console.log('  ', OUT_DIR);

process.exit(errors.length > 0 ? 1 : 0);
