// Results screen — pure HTML overlay shown when the player crosses a goal
// zone. Listens to `levelComplete` on the EventBus. Retry + Next buttons
// trigger callbacks supplied by main.ts (which holds the game state).
//
// Animation uses GSAP (already a dep):
//   - Panel fades + slides up (300ms).
//   - Stats count up sequentially — time first (easeOut 900ms), then deaths
//     (easeOut 600ms, after a 150ms beat).
//   - Grade letter (S/A/B/C) lands with a stamp animation: overshoots
//     and settles, plus a brief screen-flash behind it.
//   - Buttons stagger in last.
//
// Grade is computed from deaths + time against per-level pars. Pars are
// a coarse first pass — future: move into the level JSON for per-level
// tuning.

import { gsap } from 'gsap'
import type { EngineEvents } from '../session/eventBus'
import { on } from '../session/eventBus'
import { hasNextLevel, levelName } from '../session/levelManager'

export interface ResultsHandlers {
  onRetry: () => void
  onNext: () => void
}

export type Grade = 'S' | 'A' | 'B' | 'C'

// Per-level par values; fall back to generous defaults if the level isn't
// in the map. Time par is in milliseconds — beat it with zero deaths for S.
const PARS: Record<string, { timeMs: number, maxDeaths: number }> = {
  level1: { timeMs: 45_000, maxDeaths: 0 },
  level2: { timeMs: 60_000, maxDeaths: 0 },
}
const DEFAULT_PAR = { timeMs: 60_000, maxDeaths: 0 }

function computeGrade(levelId: string, timeMs: number, deaths: number): Grade {
  const par = PARS[levelId] ?? DEFAULT_PAR
  // S: beat time par with no deaths.
  if (deaths === 0 && timeMs <= par.timeMs) return 'S'
  // A: ≤1 death and within 1.3× par.
  if (deaths <= 1 && timeMs <= par.timeMs * 1.3) return 'A'
  // B: ≤3 deaths and within 1.8× par.
  if (deaths <= 3 && timeMs <= par.timeMs * 1.8) return 'B'
  return 'C'
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const s = (totalSeconds % 60).toString().padStart(2, '0')
  const hundredths = Math.floor((ms % 1000) / 10).toString().padStart(2, '0')
  return `${m}:${s}.${hundredths}`
}

export function mountResultsScreen(handlers: ResultsHandlers): () => void {
  const overlay = document.createElement('div')
  overlay.className = 'results-overlay'
  overlay.setAttribute('aria-hidden', 'true')
  overlay.innerHTML = `
    <div class="results-flash" data-slot="flash"></div>
    <div class="results-panel">
      <h1 class="results-title" data-slot="title">Level Complete</h1>
      <div class="results-subtitle" data-slot="subtitle"></div>
      <dl class="results-stats">
        <div class="results-stat">
          <dt>Time</dt>
          <dd data-slot="time">00:00.00</dd>
        </div>
        <div class="results-stat">
          <dt>Deaths</dt>
          <dd data-slot="deaths">0</dd>
        </div>
      </dl>
      <div class="results-grade" data-slot="grade" data-grade="C">
        <span class="results-grade-letter" data-slot="grade-letter">C</span>
        <span class="results-grade-label">grade</span>
      </div>
      <div class="results-actions" data-slot="actions">
        <button type="button" class="results-btn" data-slot="retry">Retry</button>
        <button type="button" class="results-btn primary" data-slot="next">Next Level</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const titleEl = overlay.querySelector<HTMLElement>('[data-slot="title"]')!
  const subtitleEl = overlay.querySelector<HTMLElement>('[data-slot="subtitle"]')!
  const timeEl = overlay.querySelector<HTMLElement>('[data-slot="time"]')!
  const deathsEl = overlay.querySelector<HTMLElement>('[data-slot="deaths"]')!
  const gradeEl = overlay.querySelector<HTMLElement>('[data-slot="grade"]')!
  const gradeLetterEl = overlay.querySelector<HTMLElement>('[data-slot="grade-letter"]')!
  const flashEl = overlay.querySelector<HTMLElement>('[data-slot="flash"]')!
  const actionsEl = overlay.querySelector<HTMLElement>('[data-slot="actions"]')!
  const retryBtn = overlay.querySelector<HTMLButtonElement>('[data-slot="retry"]')!
  const nextBtn = overlay.querySelector<HTMLButtonElement>('[data-slot="next"]')!

  retryBtn.onclick = () => {
    hide()
    handlers.onRetry()
  }
  nextBtn.onclick = () => {
    hide()
    handlers.onNext()
  }

  function show(e: EngineEvents['levelComplete']): void {
    const name = levelName(e.levelId)
    titleEl.textContent = hasNextLevel(e.levelId) ? 'Level Complete' : 'You finished!'
    subtitleEl.textContent = name
    nextBtn.hidden = !hasNextLevel(e.levelId)

    const grade = computeGrade(e.levelId, e.timeMs, e.deaths)

    // Initial state for the animation.
    timeEl.textContent = formatTime(0)
    deathsEl.textContent = '0'
    gradeEl.dataset.grade = grade
    gradeLetterEl.textContent = grade
    gsap.set(flashEl, { opacity: 0 })
    gsap.set(gradeEl, { opacity: 0, scale: 0 })
    gsap.set(actionsEl, { opacity: 0, y: 8 })

    overlay.setAttribute('aria-hidden', 'false')
    overlay.classList.add('visible')

    // Count-up proxies — animate a number and render it into the DOM
    // each tick. GSAP's `{ value: N }` pattern is the standard trick.
    const timeProxy = { ms: 0 }
    const deathsProxy = { count: 0 }

    const tl = gsap.timeline()
    tl.to(timeProxy, {
      ms: e.timeMs,
      duration: 0.9,
      ease: 'power2.out',
      onUpdate: () => { timeEl.textContent = formatTime(timeProxy.ms) },
    }, 0.25)
    tl.to(deathsProxy, {
      count: e.deaths,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: () => { deathsEl.textContent = String(Math.floor(deathsProxy.count)) },
    }, 0.9)
    // Grade stamp — overshoot then settle, backed by a screen flash.
    tl.to(flashEl, { opacity: 1, duration: 0.08 }, 1.35)
    tl.to(flashEl, { opacity: 0, duration: 0.4, ease: 'power2.out' }, 1.45)
    tl.to(gradeEl, {
      opacity: 1,
      scale: 1,
      duration: 0.55,
      ease: 'back.out(2.8)',
    }, 1.35)
    tl.to(actionsEl, {
      opacity: 1,
      y: 0,
      duration: 0.3,
      ease: 'power2.out',
    }, 1.9)
  }

  function hide(): void {
    overlay.classList.remove('visible')
    overlay.setAttribute('aria-hidden', 'true')
    gsap.killTweensOf([flashEl, gradeEl, actionsEl])
  }

  const offComplete = on('levelComplete', show)
  const offLoaded = on('levelLoaded', hide)

  return () => {
    offComplete()
    offLoaded()
    overlay.remove()
  }
}
