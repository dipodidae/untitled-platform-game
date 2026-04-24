import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto(URL)
await page.waitForSelector('canvas')
await page.waitForFunction(() => !!window.__game)
await new Promise(r => setTimeout(r, 1500))

const info = await page.evaluate(() => {
  const g = window.__game
  const sk = g.renderCtx.charBridge.spine.skeleton
  const names = ['gun', 'gun-tip', 'muzzle', 'muzzle-ring', 'front-fist', 'front-bracer', 'crosshair']
  const bones = {}
  for (const n of names) {
    const b = sk.findBone(n)
    if (!b) continue
    bones[n] = { wx: b.worldX, wy: b.worldY, a: b.a, c: b.c, rot: b.getWorldRotationX?.() }
  }
  return {
    spineX: g.renderCtx.charBridge.spine.x,
    spineY: g.renderCtx.charBridge.spine.y,
    scaleX: g.renderCtx.charBridge.spine.scale.x,
    stance: g.renderCtx.charBridge.stance,
    bones,
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
