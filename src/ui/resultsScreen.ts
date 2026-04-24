// Results screen — pure HTML overlay shown when the player crosses a goal
// zone. Listens to `levelComplete` on the EventBus. Retry + Next buttons
// trigger callbacks supplied by main.ts (which holds the game state).
//
// The overlay is a fixed-position full-screen panel layered above the Pixi
// canvas via z-index. All animation is CSS — fade + slide-up over 300ms.

import type { EngineEvents } from '../session/eventBus'
import { on } from '../session/eventBus'
import { hasNextLevel, levelName } from '../session/levelManager'

export interface ResultsHandlers {
  onRetry: () => void
  onNext: () => void
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
      <div class="results-actions">
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
    timeEl.textContent = formatTime(e.timeMs)
    deathsEl.textContent = String(e.deaths)
    nextBtn.hidden = !hasNextLevel(e.levelId)
    overlay.setAttribute('aria-hidden', 'false')
    overlay.classList.add('visible')
  }

  function hide(): void {
    overlay.classList.remove('visible')
    overlay.setAttribute('aria-hidden', 'true')
  }

  const offComplete = on('levelComplete', show)
  const offLoaded = on('levelLoaded', hide)

  return () => {
    offComplete()
    offLoaded()
    overlay.remove()
  }
}
