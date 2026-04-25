import { gsap } from 'gsap'
import { Application } from 'pixi.js'
import { CONFIG } from './config'
import { initInput } from './input/input'
import { PALETTE } from './render/palette'
import { loadEnemyAssets } from './render/enemyAssets'
import { loadItemAssets } from './render/itemAssets'
import { loadSpineboyAssets } from './render/spineboy'
import { on } from './session/eventBus'
import { advanceLevel, createGame, reloadLevel, startLoop } from './session/game'
import { gameState as gameSession } from './session/gameState'
import { mountDamageVignette } from './ui/damageVignette'
import { playDropIn } from './ui/dropIn'
import { mountMainMenu } from './ui/mainMenu'
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

  // Block game boot on asset loads — no chance of first-frame visual
  // pop because sprites/skeleton weren't ready.
  await Promise.all([loadSpineboyAssets(), loadEnemyAssets(), loadItemAssets()])

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

  // Boot into the main menu. The loop is already running; fixedUpdate
  // bails out while phase is 'menu'. The menu lives inside the stage
  // (screenOverlay container) so the CRT filter applies to it; its own
  // backing rect provides the darken-the-world effect — no stage.alpha
  // dim needed (that would dim the menu too).
  gameSession.phase = 'menu'

  const dismissMenu = mountMainMenu(state.screenOverlay, {
    onPlay: () => {
      dismissMenu()
      // Hand off to the cinematic drop-in. Physics stay paused (fixedUpdate
      // gates on phase='dropIn'); the cinematic emits 'dropInComplete' when
      // the title card + letterbox have finished animating.
      gameSession.phase = 'dropIn'
      playDropIn(app, state.screenOverlay, { levelId: gameSession.currentLevelId || 'level1' })
    },
    onQuit: () => {
      // Browsers can't really "quit" a tab — close what we can, blank out
      // otherwise. Harmless stub for now.
      window.close()
    },
  })

  // When the drop-in cinematic finishes, control hands off to the player.
  on('dropInComplete', () => {
    gameSession.phase = 'gameplay'
  })

  // Damage vignette — red-edge pulse on player hits, baseline follows HP.
  mountDamageVignette(state.screenOverlay, () => state.player.hp / state.player.maxHp)

  // Chromatic-aberration pulse via the CRT shader. The filter multiplies
  // its base CA offset by (1 + uInstability * 3); we briefly pump the
  // uniform past the normal gameplay range on big events and ease it
  // back. Doesn't interfere with the gameplay-driven instability update
  // because that update runs every frame and overwrites us — so we pump
  // via a `_pulse` additive handled where the uniform is assigned.
  on('playerDied', () => {
    gsap.killTweensOf(state.crtFilter)
    gsap.fromTo(
      state.crtFilter,
      { instability: 0.95 },
      { instability: 0, duration: 0.8, ease: 'power2.out' },
    )
  })
  on('hitLanded', (e) => {
    if (e.target !== 'player')
      return
    gsap.killTweensOf(state.crtFilter)
    gsap.fromTo(
      state.crtFilter,
      { instability: 0.55 },
      { instability: 0, duration: 0.4, ease: 'power2.out' },
    )
  })

  // Also play the drop-in on every subsequent level load (after Retry /
  // Next). `levelLoaded` fires from game.ts#loadLevelAtIndex. Skip the
  // very first firing — that's the one that happens inside createGame
  // before the menu has even been shown.
  let suppressFirstLoad = true
  on('levelLoaded', (e) => {
    if (suppressFirstLoad) {
      suppressFirstLoad = false
      return
    }
    gameSession.phase = 'dropIn'
    playDropIn(app, state.screenOverlay, { levelId: e.levelId })
  })

  // Results-screen overlay listens for levelComplete and shows itself.
  // Retry re-enters the current level; Next advances. Both fade through
  // a 300ms out/in tween on the stage so the transition reads.
  mountResultsScreen(state.screenOverlay, {
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
