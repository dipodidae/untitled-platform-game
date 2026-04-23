import { Application } from 'pixi.js'
import { CONFIG } from './config'
import { createGame, startLoop } from './game'
import { initInput } from './input'
import { PALETTE } from './render/palette'
import './style.css'

async function main(): Promise<void> {
  const mountEl = document.getElementById('app')
  if (!mountEl)
    throw new Error('Missing #app mount point')

  const app = new Application()
  await app.init({
    width: CONFIG.LOGICAL_WIDTH,
    height: CONFIG.LOGICAL_HEIGHT,
    background: PALETTE.skyTop,
    preference: 'webgl',
    antialias: true,
    roundPixels: false,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
  })
  mountEl.appendChild(app.canvas)

  // Fit-to-window while preserving aspect. No integer lock — antialiased
  // vector art scales cleanly at any size, and fractional scales give a
  // softer, more painterly edge that matches the FAULTLINE tone.
  const resize = (): void => {
    const sx = window.innerWidth / CONFIG.LOGICAL_WIDTH
    const sy = window.innerHeight / CONFIG.LOGICAL_HEIGHT
    const s = Math.max(1, Math.min(sx, sy))
    app.canvas.style.width = `${CONFIG.LOGICAL_WIDTH * s}px`
    app.canvas.style.height = `${CONFIG.LOGICAL_HEIGHT * s}px`
  }
  window.addEventListener('resize', resize)
  resize()

  initInput()
  const state = createGame(app)
  startLoop(state)

  // Expose game state for the smoke test. Harmless in prod; lets the
  // CI verify player motion without resorting to screenshot heuristics.
  ;(window as unknown as { __game: unknown }).__game = state
}

main().catch((err: unknown) => {
  console.error(err)
})
