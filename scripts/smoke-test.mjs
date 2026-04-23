// Playwright smoke test — verifies boot + base mechanics.
//
// Mechanics checked:
//   1. page boots, canvas mounts, no console errors
//   2. render loop animates (wind motes alone keep the frame changing)
//   3. player settles on the ground (y stops changing, grounded = true)
//   4. jump moves the player up (vy turns negative + y decreases briefly)
//   5. right arrow moves the player right (x increases)
//
// Window exposes `__game` — see src/main.ts.

import { chromium } from 'playwright'

const URL = process.env.URL ?? 'http://localhost:5173'
const HEADLESS = !process.env.HEADFUL

const browser = await chromium.launch({ headless: HEADLESS })
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await context.newPage()

const errors = []
page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
page.on('console', msg => {
  if (msg.type() === 'error')
    errors.push(`console: ${msg.text()}`)
})

console.log(`navigating to ${URL}...`)
await page.goto(URL, { waitUntil: 'networkidle', timeout: 15_000 })
await page.waitForSelector('canvas', { timeout: 5000 })
const canvasBox = await page.locator('canvas').boundingBox()
console.log(`canvas: ${canvasBox?.width}x${canvasBox?.height}`)

// Wait for the game to attach its state.
await page.waitForFunction(() => !!(window).__game, null, { timeout: 5000 })

const snap = async () =>
  page.evaluate(() => {
    const g = (window).__game
    return {
      x: g.player.x,
      y: g.player.y,
      vx: g.player.vx,
      vy: g.player.vy,
      grounded: g.player.grounded,
      alive: g.player.alive,
      instability: g.player.instability.value,
    }
  })

// Animation via screenshot diff (WebGL canvas.toDataURL is blank w/o
// preserveDrawingBuffer).
const shot1 = await page.screenshot()
await page.waitForTimeout(250)
const shot2 = await page.screenshot()
const animating = shot1.length > 1000 && !shot1.equals(shot2)
console.log(`render loop animating: ${animating}`)

// 1. Settle — give the player ~1 s of real time to fall onto the floor.
await page.waitForTimeout(1000)
const rest = await snap()
console.log(`rest: x=${rest.x.toFixed(1)} y=${rest.y.toFixed(1)} grounded=${rest.grounded}`)

// 2. Jump.
const jumpTriggerY = rest.y
await page.keyboard.press('Space')
await page.waitForTimeout(60) // mid-ascent
const mid = await snap()
console.log(`mid-jump: y=${mid.y.toFixed(1)} vy=${mid.vy.toFixed(1)}`)
const jumped = mid.y < jumpTriggerY - 4 && mid.vy < 0

// 3. Horizontal move.
const startX = mid.x
await page.waitForTimeout(600) // land
await page.keyboard.down('ArrowRight')
await page.waitForTimeout(250)
await page.keyboard.up('ArrowRight')
const moved = await snap()
console.log(`post-move: x=${moved.x.toFixed(1)}`)
const movedRight = moved.x > startX + 5

await page.screenshot({ path: 'scripts/smoke.png' })

await browser.close()

const failures = []
if (errors.length > 0) failures.push(`page errors: ${errors.length}`)
if (!animating) failures.push('render loop not animating')
if (!rest.grounded) failures.push(`player did not settle on ground (y=${rest.y})`)
if (!jumped) failures.push(`jump did not raise player (y before=${jumpTriggerY.toFixed(1)}, after=${mid.y.toFixed(1)}, vy=${mid.vy.toFixed(1)})`)
if (!movedRight) failures.push(`right arrow did not move player right (dx=${(moved.x - startX).toFixed(1)})`)

if (failures.length > 0) {
  console.error('FAIL:')
  for (const f of failures) console.error(' -', f)
  if (errors.length > 0) {
    console.error('captured errors:')
    for (const e of errors) console.error(' -', e)
  }
  process.exit(1)
}
console.log('smoke test OK — boot, render, settle, jump, move right')
