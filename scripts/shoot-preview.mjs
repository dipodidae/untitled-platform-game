// Drive shooting scenarios and capture frames showing:
//   1) bullet arc (mid-flight)
//   2) wall impact burst
//   3) dummy blood spray + hit flash
//   4) dummy after killed
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
const errors = []
page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
await page.goto(URL)
await page.waitForSelector('canvas')
await page.waitForFunction(() => !!window.__game)
await new Promise(r => setTimeout(r, 500))

async function fire() {
  await page.keyboard.down('KeyX')
  await new Promise(r => setTimeout(r, 20))
  await page.keyboard.up('KeyX')
}

// 1. Mid-flight arc — fire once and snap just after so the bullet is visibly
// in the air with some curve already present.
await fire()
await new Promise(r => setTimeout(r, 120))
await page.screenshot({ path: 'screenshots/screenshot-arc.png' })

// 2. Burst at dummy — pump several shots at it.
for (let i = 0; i < 5; i++) {
  await fire()
  await new Promise(r => setTimeout(r, 160))
}
await new Promise(r => setTimeout(r, 50))
await page.screenshot({ path: 'screenshots/screenshot-impact-dummy.png' })

// 3. Try to kill the dummy — dump the full clip.
for (let i = 0; i < 10; i++) {
  await fire()
  await new Promise(r => setTimeout(r, 160))
}
await new Promise(r => setTimeout(r, 400))
const dummyAlive = await page.evaluate(() => window.__game.dummies.map(d => ({ hp: d.hp, alive: d.alive })))
console.log('dummies:', JSON.stringify(dummyAlive))
await page.screenshot({ path: 'screenshots/screenshot-after-dummy.png' })

// 4. Fire upward into a wall (if any near) — forcing a wall-impact burst.
await page.keyboard.down('ArrowRight')
await new Promise(r => setTimeout(r, 400))
await page.keyboard.up('ArrowRight')
for (let i = 0; i < 4; i++) {
  await fire()
  await new Promise(r => setTimeout(r, 140))
}
await new Promise(r => setTimeout(r, 60))
await page.screenshot({ path: 'screenshots/screenshot-impact-wall.png' })

if (errors.length) {
  console.log('ERRORS:')
  for (const e of errors) console.log(' ', e)
  process.exit(1)
}
console.log('done')
await browser.close()
