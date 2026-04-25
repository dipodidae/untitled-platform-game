// Playwright verification: do cosmetic parallax layers actually show up?
// Run: node scripts/verify-cosmetics.mjs

import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:5173'
mkdirSync('screenshots', { recursive: true })
const DELAY = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } })

  // Collect console messages for diagnostics
  const logs = []
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`))
  page.on('pageerror', err => logs.push(`[PAGE-ERROR] ${err.message}`))

  // Intercept cosmetic asset requests to verify they fire
  const cosmeticRequests = []
  page.on('request', req => {
    const url = req.url()
    if (url.includes('/assets/cosmetics/'))
      cosmeticRequests.push(url)
  })
  const cosmeticResponses = []
  page.on('response', res => {
    const url = res.url()
    if (url.includes('/assets/cosmetics/'))
      cosmeticResponses.push({ url, status: res.status() })
  })

  console.log(`Loading ${URL} ...`)
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 10000 })
  await DELAY(1500)

  // Get past any title / splash screen by clicking + pressing keys
  await page.click('canvas')
  await DELAY(200)
  await page.keyboard.press('Enter')
  await DELAY(200)
  await page.keyboard.press('Space')
  await DELAY(200)
  await page.keyboard.press('Enter')

  // Wait for cosmetic assets to load (they load async)
  await DELAY(3000)

  // ── Check 1: cosmetic asset requests ────────────────────────────
  console.log('\n── Cosmetic Asset Requests ──')
  if (cosmeticRequests.length === 0) {
    console.log('✗ NO cosmetic asset requests detected!')
  }
  else {
    for (const url of cosmeticRequests)
      console.log(`  → ${url}`)
  }

  console.log('\n── Cosmetic Asset Responses ──')
  let allOk = true
  for (const { url, status } of cosmeticResponses) {
    const ok = status >= 200 && status < 400
    console.log(`  ${ok ? '✓' : '✗'} ${status} ${url}`)
    if (!ok) allOk = false
  }
  if (cosmeticResponses.length === 0) {
    console.log('  (none)')
    allOk = false
  }

  // ── Check 2: screenshots ────────────────────────────────────────
  await page.screenshot({ path: 'screenshots/cosmetics-level1-spawn.png' })
  console.log('\n✓ screenshots/cosmetics-level1-spawn.png')

  // Move right to check parallax scrolling + prop visibility
  await page.keyboard.down('ArrowRight')
  await DELAY(1500)
  await page.keyboard.up('ArrowRight')
  await DELAY(300)
  await page.screenshot({ path: 'screenshots/cosmetics-level1-scrolled.png' })
  console.log('✓ screenshots/cosmetics-level1-scrolled.png')

  // ── Check 3: pixel sample the background area ───────────────────
  // Sample the top-left of the canvas (should have sky gradient, possibly
  // with parallax layers overlaid) vs if cosmetics were absent (just the
  // blue sky gradient alone). We check that the area isn't uniform.
  const pixelData = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return null
    // Read a strip of pixels from the lower-third of screen (where parallax lives)
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (gl) {
      // WebGL — read pixels
      const y = Math.floor(canvas.height * 0.3) // upper portion = ~30% from top
      const w = Math.min(canvas.width, 200)
      const h = 1
      const pixels = new Uint8Array(w * h * 4)
      gl.readPixels(0, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      // Check pixel variance
      let minR = 255, maxR = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < minR) minR = pixels[i]
        if (pixels[i] > maxR) maxR = pixels[i]
      }
      return { minR, maxR, variance: maxR - minR, samples: w }
    }
    return null
  })

  if (pixelData) {
    console.log(`\n── Pixel Variance (lower-third strip, R channel) ──`)
    console.log(`  R range: ${pixelData.minR}–${pixelData.maxR} (variance: ${pixelData.variance})`)
    if (pixelData.variance > 20)
      console.log(`  ✓ Non-uniform — cosmetic layers likely rendering`)
    else
      console.log(`  ⚠ Very uniform — cosmetics may not be visible`)
  }

  // ── Level 2 verification ───────────────────────────────────────
  // Clear tracked requests and load level 2 via a fresh page that
  // overrides the start index through an injected script.
  console.log('\n── Level 2 ──')
  const cosmeticRequests2 = []
  const cosmeticResponses2 = []
  const page2 = await browser.newPage({ viewport: { width: 640, height: 360 } })
  page2.on('request', req => {
    if (req.url().includes('/assets/cosmetics/'))
      cosmeticRequests2.push(req.url())
  })
  page2.on('response', res => {
    if (res.url().includes('/assets/cosmetics/'))
      cosmeticResponses2.push({ url: res.url(), status: res.status() })
  })

  // Inject a script before the app loads to patch levelIdAt so index 0 → level2
  await page2.addInitScript(() => {
    window.__FORCE_LEVEL = 'level2'
  })
  await page2.goto(URL, { waitUntil: 'domcontentloaded' })
  await page2.waitForSelector('canvas', { timeout: 10000 })
  await DELAY(1500)
  await page2.click('canvas')
  await DELAY(200)
  await page2.keyboard.press('Enter')
  await DELAY(200)
  await page2.keyboard.press('Space')
  await DELAY(200)
  await page2.keyboard.press('Enter')
  await DELAY(3000)

  for (const { url, status } of cosmeticResponses2) {
    const ok = status >= 200 && status < 400
    console.log(`  ${ok ? '✓' : '✗'} ${status} ${url}`)
    if (!ok) allOk = false
  }
  if (cosmeticResponses2.length === 0) {
    console.log('  (level2 cosmetics not loaded — may need manual test)')
  }

  await page2.screenshot({ path: 'screenshots/cosmetics-level2-spawn.png' })
  console.log('✓ screenshots/cosmetics-level2-spawn.png')

  await page2.keyboard.down('ArrowRight')
  await DELAY(1500)
  await page2.keyboard.up('ArrowRight')
  await DELAY(300)
  await page2.screenshot({ path: 'screenshots/cosmetics-level2-scrolled.png' })
  console.log('✓ screenshots/cosmetics-level2-scrolled.png')

  // ── Console errors ─────────────────────────────────────────────
  const errors = logs.filter(l => l.startsWith('[error]') || l.startsWith('[PAGE-ERROR]'))
  if (errors.length > 0) {
    console.log('\n── Console Errors ──')
    for (const e of errors) console.log(`  ${e}`)
  }

  console.log(`\n${'═'.repeat(50)}`)
  console.log(allOk && cosmeticResponses.length > 0
    ? '✓ PASS — cosmetic assets loaded successfully'
    : '✗ FAIL — cosmetic assets did not load as expected')

  await browser.close()
})()
