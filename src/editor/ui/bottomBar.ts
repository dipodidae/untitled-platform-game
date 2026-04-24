// Bottom bar — live entity counts + a horizontal strip of undo/redo cells.
// Click a past cell to jump back N steps; click a future cell to replay.

import type { EditorState } from '../state'
import { redo, undo } from '../state'

export function mountBottomBar(host: HTMLElement, state: EditorState): void {
  host.innerHTML = ''

  const stats = document.createElement('span')
  host.appendChild(stats)

  const strip = document.createElement('div')
  strip.className = 'undo-strip'
  host.appendChild(strip)

  const render = (): void => {
    const lv = state.level
    stats.textContent = [
      `colliders: ${lv.colliders.length}`,
      `zones: ${lv.zones.length}`,
      `prowlers: ${lv.prowlers.length}`,
      `dummies: ${lv.dummies.length}`,
      `pickups: ${lv.pickups.length}`,
      `world: ${lv.worldWidth}×${lv.worldHeight}`,
    ].join(' · ')

    strip.innerHTML = ''
    // Past entries — oldest to most recent.
    for (let i = 0; i < state.undoStack.length; i++) {
      const entry = state.undoStack[i]!
      const cell = document.createElement('div')
      cell.className = 'undo-cell past'
      cell.title = entry.label
      cell.onclick = () => {
        const steps = state.undoStack.length - i
        for (let k = 0; k < steps; k++) undo(state)
      }
      strip.appendChild(cell)
    }
    // Pivot cell — the current state.
    const pivot = document.createElement('div')
    pivot.className = 'undo-cell pivot'
    pivot.title = 'current state'
    strip.appendChild(pivot)
    // Future entries — most-recently-undone first in redoStack;
    // reverse for chronological order on screen.
    const redoCopy = state.redoStack.slice().reverse()
    for (let i = 0; i < redoCopy.length; i++) {
      const entry = redoCopy[i]!
      const cell = document.createElement('div')
      cell.className = 'undo-cell future'
      cell.title = entry.label
      cell.onclick = () => {
        for (let k = 0; k <= i; k++) redo(state)
      }
      strip.appendChild(cell)
    }
  }
  state.listeners.add(render)
  render()
}
