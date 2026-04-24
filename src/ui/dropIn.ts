// Cinematic level drop-in — fade-to-black, title card, letterbox retract,
// HUD stagger. Plays while gameSession.phase === 'dropIn'; flips phase to
// 'gameplay' when the cinematic finishes.
//
// Timing (total ≈ 2.4s):
//   0.00 — black overlay opaque, level name fades in
//   0.80 — subtitle fades in
//   1.40 — fade-out black + title card, letterbox starts retracting
//   1.80 — HUD stagger begins (health, score/deaths, minimap/hint)
//   2.30 — "dropInComplete" emitted → main.ts flips to 'gameplay'
//
// Input is naturally suppressed because fixedUpdate gates on phase.

import { gsap } from 'gsap'
import type { Application } from 'pixi.js'
import { emit } from '../session/eventBus'
import { levelName } from '../session/levelManager'

export interface DropInOptions {
  levelId: string
  subtitle?: string
}

const SUBTITLES: Record<string, string> = {
  level1: 'the world does not forgive',
  level2: 'what you break stays broken',
}

function pickSubtitle(levelId: string, override: string | undefined): string {
  return override ?? SUBTITLES[levelId] ?? 'hold nothing back'
}

export function playDropIn(app: Application, opts: DropInOptions): void {
  // Build the overlay lazily so successive drop-ins don't stack on the DOM.
  const existing = document.querySelector('.dropin-overlay')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.className = 'dropin-overlay'
  overlay.innerHTML = `
    <div class="dropin-letterbox dropin-letterbox-top"></div>
    <div class="dropin-letterbox dropin-letterbox-bottom"></div>
    <div class="dropin-fade"></div>
    <div class="dropin-card">
      <div class="dropin-eyebrow" data-slot="eyebrow">Entering</div>
      <h1 class="dropin-title" data-slot="title">${levelName(opts.levelId)}</h1>
      <p class="dropin-subtitle" data-slot="subtitle">${pickSubtitle(opts.levelId, opts.subtitle)}</p>
    </div>
  `
  document.body.appendChild(overlay)

  const fadeEl = overlay.querySelector<HTMLElement>('.dropin-fade')!
  const cardEl = overlay.querySelector<HTMLElement>('.dropin-card')!
  const eyebrowEl = overlay.querySelector<HTMLElement>('[data-slot="eyebrow"]')!
  const titleEl = overlay.querySelector<HTMLElement>('[data-slot="title"]')!
  const subtitleEl = overlay.querySelector<HTMLElement>('[data-slot="subtitle"]')!
  const topBar = overlay.querySelector<HTMLElement>('.dropin-letterbox-top')!
  const botBar = overlay.querySelector<HTMLElement>('.dropin-letterbox-bottom')!

  // Initial state — opaque black, card invisible, letterbox bars extended
  // (each covering 12% of the viewport).
  gsap.set(fadeEl, { opacity: 1 })
  gsap.set(cardEl, { opacity: 0 })
  gsap.set(eyebrowEl, { opacity: 0, y: -6, letterSpacing: '0.6em' })
  gsap.set(titleEl, { opacity: 0, y: 8, letterSpacing: '0.5em' })
  gsap.set(subtitleEl, { opacity: 0, y: 6 })
  gsap.set([topBar, botBar], { height: '12vh' })

  // Slow-mo the stage for the first moment after control hands off.
  // Implemented as a ticker-side speed multiplier we'll install on
  // app.ticker — scaling deltaMS so fixedUpdate accumulates slower.
  // (See installSlowMo below.)
  const release = installSlowMo(app, 0.4, 0.9) // 40% speed for 0.9s after release

  const tl = gsap.timeline({
    onComplete: () => {
      overlay.remove()
      release()
      emit('dropInComplete', null)
    },
  })

  tl
    // 1. Card lands on a black field.
    .to(cardEl, { opacity: 1, duration: 0.2 }, 0)
    .to(eyebrowEl, { opacity: 1, y: 0, letterSpacing: '0.35em', duration: 0.4, ease: 'power2.out' }, 0.05)
    .to(titleEl, { opacity: 1, y: 0, letterSpacing: '0.2em', duration: 0.55, ease: 'power2.out' }, 0.15)
    .to(subtitleEl, { opacity: 1, y: 0, duration: 0.35 }, 0.4)
    // 2. Hold the title for a beat, then fade black away so the world shows.
    .to(fadeEl, { opacity: 0, duration: 0.5, ease: 'power1.inOut' }, 1.3)
    .to(cardEl, { opacity: 0, duration: 0.4, ease: 'power1.in' }, 1.4)
    // 3. Letterbox bars retract as control lands.
    .to([topBar, botBar], { height: '0vh', duration: 0.45, ease: 'power2.inOut' }, 1.6)
    // 4. Terminal hold so the letterbox finishes before we emit complete.
    .to({}, { duration: 0.15 }, 2.05)
}

// ─── slow-motion helper ─────────────────────────────────────────────────────
//
// Pixi's ticker exposes a `speed` multiplier that scales deltaTime
// downstream. Setting it to 0.4 makes everything — physics accumulator,
// render-tick particles, camera smoothing — run at 40% speed. We ramp it
// back to 1 over `rampSeconds` so the "bullet-time" is a real ease, not a
// hard snap.
function installSlowMo(app: Application, startSpeed: number, rampSeconds: number): () => void {
  app.ticker.speed = startSpeed
  const tween = gsap.to(app.ticker, {
    speed: 1,
    duration: rampSeconds,
    ease: 'power2.out',
  })
  return () => {
    tween.kill()
    app.ticker.speed = 1
  }
}
