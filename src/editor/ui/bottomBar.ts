// Bottom bar — live entity counts. Undo strip is attached in a later task.

import type { EditorState } from '../state'

export function mountBottomBar(host: HTMLElement, state: EditorState): void {
  host.innerHTML = ''

  const stats = document.createElement('span')
  host.appendChild(stats)

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
  }
  state.listeners.add(render)
  render()
}
