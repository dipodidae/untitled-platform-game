import { Application } from 'pixi.js'
import { gsap } from 'gsap'
import { CONFIG } from './config'
import { advanceLevel, createGame, reloadLevel, startLoop } from './session/game'
import { initInput } from './input/input'
import { PALETTE } from './render/palette'
import { loadSpineboyAssets } from './render/spineboy'
import { mountResultsScreen } from './ui/resultsScreen'
import './style.css'

// Fade the Pixi stage out, run `swap` to rebuild the scene, fade back in.
// 300ms each way per the tier-1 spec. GSAP sequences tweens on the same
// target cleanly (no overlapping tween bugs) so we don't need a promise.
function fadeSwap(app: Application, swap: () => void): void {
  gsap.killTweensOf(app.stage)
  gsap.to(app.stage, {
    alpha: 0,
    duration: 0.3,
    ease: 'power1.out',
    onComplete: () => {
      swap()
      gsap.to(app.stage, { alpha: 1, duration: 0.3, ease: 'power1.in' })
    },
  })
}

function showLoadingScreen(mountEl: HTMLElement): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;inset:0;background:#000;color:#fff;font:14px monospace;display:flex;align-items:center;justify-content:center;letter-spacing:2px;z-index:9999'
  el.textContent = 'loading'
  mountEl.appendChild(el)
  return el
}

async function main(): Promise<void> {
  const mountEl = document.getElementById('app')
  if (!mountEl)
    throw new Error('Missing #app mount point')

  const loader = showLoadingScreen(mountEl)

  // Block game boot on Spineboy asset load — no chance of first-frame visual
  // pop because the skeleton wasn't ready.
  await loadSpineboyAssets()

  const app = new Application()
  await app.init({
    width: CONFIG.LOGICAL_WIDTH,
    height: CONFIG.LOGICAL_HEIGHT,
    background: PALETTE.skyTop,
    preference: 'webgl',
    antialias: true,
    roundPixels: false,
    autoDensity: true,
    resolution: 1, // initial; resize() bumps to match the displayed size
  })
  mountEl.appendChild(app.canvas)
  loader.remove()

  // Fit-to-window while preserving aspect. We set the internal renderer
  // resolution to match the on-screen CSS scale so the backing buffer has a
  // 1:1 pixel relationship with the displayed canvas — no secondary CSS
  // upscale, no blur. devicePixelRatio gets folded in for retina screens.
  // Capped at 4 so gigantic monitors don't allocate obscene buffers.
  //
  // `setProperty(..., 'important')` is used because Pixi's autoDensity resets
  // canvas.style.width/height inside renderer.resize() — without !important
  // our values get stomped on subsequent resize calls and the canvas stays
  // frozen at the init size.
  let _appliedRes = 0
  const resize = (): void => {
    const sx = window.innerWidth / CONFIG.LOGICAL_WIDTH
    const sy = window.innerHeight / CONFIG.LOGICAL_HEIGHT
    const s = Math.max(1, Math.min(sx, sy))
    const pr = window.devicePixelRatio || 1
    const targetRes = Math.min(4, Math.max(1, s * pr))
    if (Math.abs(targetRes - _appliedRes) > 0.01) {
      _appliedRes = targetRes
      app.renderer.resolution = targetRes
    }
    app.renderer.resize(CONFIG.LOGICAL_WIDTH, CONFIG.LOGICAL_HEIGHT)
    app.canvas.style.setProperty('width', `${CONFIG.LOGICAL_WIDTH * s}px`, 'important')
    app.canvas.style.setProperty('height', `${CONFIG.LOGICAL_HEIGHT * s}px`, 'important')
  }
  window.addEventListener('resize', resize)
  resize()

  initInput()
  const state = createGame(app)
  startLoop(state)

  // Results-screen overlay listens for levelComplete and shows itself.
  // Retry re-enters the current level; Next advances. Both fade through
  // a 300ms out/in tween on the stage so the transition reads.
  mountResultsScreen({
    onRetry: () => fadeSwap(app, () => reloadLevel(state)),
    onNext: () => fadeSwap(app, () => advanceLevel(state)),
  })

  // Expose game state for the smoke test. Harmless in prod; lets the
  // CI verify player motion without resorting to screenshot heuristics.
  ;(window as unknown as { __game: unknown }).__game = state
}

main().catch((err: unknown) => {
  console.error(err)
})
