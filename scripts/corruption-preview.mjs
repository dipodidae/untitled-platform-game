// One-off: force instability high and snap a frame so we can eyeball
// the per-pixel corruption tuning. Not part of the smoke suite.
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
await page.goto(URL)
await page.waitForSelector('canvas')
await page.waitForFunction(() => !!window.__game)

// Pin instability near max so the CRT corruption branches all fire.
await page.evaluate(() => {
  const g = window.__game
  g.player.instability.value = 85
})
await new Promise(r => setTimeout(r, 400))
await page.screenshot({ path: 'screenshots/screenshot-corruption.png' })
console.log('✓ screenshots/screenshot-corruption.png')
await browser.close()
