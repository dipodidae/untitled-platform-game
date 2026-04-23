import { Application } from 'pixi.js'
import { CONFIG } from './config'
import { createGame, startLoop } from './game'
import { initInput } from './input'
import './style.css'

async function main(): Promise<void> {
  const mountEl = document.getElementById('app')
  if (!mountEl)
    throw new Error('Missing #app mount point')

  const app = new Application()
  await app.init({
    width: CONFIG.LOGICAL_WIDTH,
    height: CONFIG.LOGICAL_HEIGHT,
    background: CONFIG.COLOR_SKY,
    preference: 'webgl',
    antialias: false,
    roundPixels: true,
    resolution: 1,
    autoDensity: false,
  })
  mountEl.appendChild(app.canvas)

  // Integer CSS scaling + nearest-neighbor (via `image-rendering: pixelated`)
  // keeps 1 logical px = N screen px, so the pixel grid never smears.
  const resize = (): void => {
    const sx = Math.max(1, Math.floor(window.innerWidth / CONFIG.LOGICAL_WIDTH))
    const sy = Math.max(1, Math.floor(window.innerHeight / CONFIG.LOGICAL_HEIGHT))
    const s = Math.min(sx, sy)
    app.canvas.style.width = `${CONFIG.LOGICAL_WIDTH * s}px`
    app.canvas.style.height = `${CONFIG.LOGICAL_HEIGHT * s}px`
  }
  window.addEventListener('resize', resize)
  resize()

  initInput()
  const state = createGame(app)
  startLoop(state)
}

main().catch((err: unknown) => {
  console.error(err)
})
