// Playwright screenshot helper — boots a Chromium, navigates to the URL
// the caller passed, optionally runs a JS snippet, then saves a PNG.
//
//   node scripts/snapshot.mjs <url> <out.png> [--wait <ms>] [--eval <js>]

import { chromium } from 'playwright-core'

const args = process.argv.slice(2)
const url = args[0] ?? 'http://localhost:5173/'
const out = args[1] ?? '/tmp/screens/shot.png'
const waitIdx = args.indexOf('--wait')
const waitMs = waitIdx >= 0 ? Number(args[waitIdx + 1]) : 1500
const evalIdx = args.indexOf('--eval')
const evalSrc = evalIdx >= 0 ? args[evalIdx + 1] : null

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await ctx.newPage()

const consoleLog = []
page.on('console', (m) => { consoleLog.push(`[${m.type()}] ${m.text()}`) })
page.on('pageerror', (e) => { consoleLog.push(`[error] ${e.message}`) })

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(waitMs)

if (evalSrc)
  await page.evaluate(evalSrc)

await page.waitForTimeout(300)
await page.screenshot({ path: out, fullPage: false })

console.warn(`screenshot → ${out}`)
if (consoleLog.length) {
  console.warn('--- browser console ---')
  for (const l of consoleLog) console.warn(l)
}

await browser.close()
