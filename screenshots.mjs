// Take three gameplay screenshots using Playwright.
// Run: node screenshots.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = process.env.URL || 'http://localhost:5173';
mkdirSync('screenshots', { recursive: true });
const DELAY = ms => new Promise(r => setTimeout(r, ms));

// Helper: dispatch a real keyboard event on the page.
async function hold(page, code, ms) {
  await page.keyboard.down(code);
  await DELAY(ms);
  await page.keyboard.up(code);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(URL);

  // Wait for the PixiJS canvas to appear and the game to initialize.
  await page.waitForSelector('canvas', { timeout: 10000 });
  await DELAY(1500); // let a few frames render so the scene is stable

  // ── Screenshot 1: Level overview at spawn ──────────────────────────
  await page.screenshot({ path: 'screenshots/screenshot-1-spawn.png' });
  console.log('✓ screenshots/screenshot-1-spawn.png');

  // ── Screenshot 2: Mid-jump traversal ───────────────────────────────
  // Run right and jump to get the player airborne over interesting terrain.
  await hold(page, 'ArrowRight', 600);
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('Space');
  await DELAY(80);
  await page.keyboard.up('Space');
  await DELAY(250); // apex of jump
  await page.screenshot({ path: 'screenshots/screenshot-2-mid-jump.png' });
  console.log('✓ screenshots/screenshot-2-mid-jump.png');
  await page.keyboard.up('ArrowRight');
  await DELAY(400); // land

  // ── Screenshot 3: Further in the level with some instability ───────
  // Keep running right, jump a few more times to build instability.
  for (let i = 0; i < 3; i++) {
    await hold(page, 'ArrowRight', 500);
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('Space');
    await DELAY(80);
    await page.keyboard.up('Space');
    await DELAY(500);
    await page.keyboard.up('ArrowRight');
    await DELAY(200);
  }
  await DELAY(300);
  await page.screenshot({ path: 'screenshots/screenshot-3-gameplay.png' });
  console.log('✓ screenshots/screenshot-3-gameplay.png');

  await browser.close();
  console.log('Done — 3 screenshots saved.');
})();
