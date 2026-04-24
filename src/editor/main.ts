// Editor entry point.

import type { LevelJson } from '../world/level'
import level1 from '../levels/level1.json'
import level2 from '../levels/level2.json'
import { createCanvas, frameWorldViewport } from './canvas'
import { mountMinimap } from './minimap'
import { mountRightPanel } from './ui/rightPanel'
import { createEditorState, fromLevelJson, markDirty } from './state'
import { mountLeftPanel } from './ui/leftPanel'
import './style.css'

const BUNDLED: { name: string, data: LevelJson }[] = [
  { name: 'level1', data: level1 as LevelJson },
  { name: 'level2', data: level2 as LevelJson },
]

async function main(): Promise<void> {
  const leftPanelHost = document.getElementById('left-panel')!
  const rightPanelHost = document.getElementById('right-panel')!
  const canvasHost = document.getElementById('canvas-host')!
  const minimapHost = document.getElementById('minimap-host')!
  const bottomBarHost = document.getElementById('bottom-bar')!

  const state = createEditorState()
  // Start with level1 so there's something to play with. Tagging the preset
  // name here means "Overwrite (level1.json)" works on first launch without
  // the user having to re-select from the dropdown.
  state.level = fromLevelJson(BUNDLED[0]!.data)
  state.activePresetName = BUNDLED[0]!.name

  const canvas = await createCanvas(canvasHost, state)

  // Frame the world once the canvas is sized.
  requestAnimationFrame(() => {
    frameWorldViewport(canvas)
  })

  mountLeftPanel(leftPanelHost, state)
  mountRightPanel(rightPanelHost, state, {
    onFrame: () => frameWorldViewport(canvas),
  })

  mountMinimap(minimapHost, state, () => ({
    w: canvas.app.screen.width,
    h: canvas.app.screen.height,
  }))

  mountStatus(bottomBarHost, state, BUNDLED)

  // Make ResizeObserver re-frame if the layout changes significantly at startup.
  const ro = new ResizeObserver(() => markDirty(state))
  ro.observe(canvasHost)
}

function mountStatus(
  host: HTMLElement,
  state: import('./state').EditorState,
  bundled: { name: string, data: LevelJson }[],
): void {
  host.innerHTML = ''

  const loadSel = document.createElement('select')
  const optDefault = document.createElement('option')
  optDefault.value = ''
  optDefault.textContent = '— load bundled —'
  optDefault.disabled = true
  optDefault.selected = true
  loadSel.appendChild(optDefault)
  for (const b of bundled) {
    const o = document.createElement('option')
    o.value = b.name
    o.textContent = b.name
    loadSel.appendChild(o)
  }
  loadSel.onchange = () => {
    const chosen = bundled.find(b => b.name === loadSel.value)
    if (chosen) {
      state.level = fromLevelJson(chosen.data)
      state.selection = null
      state.activeFileHandle = null
      state.activeFileName = null
      state.activePresetName = chosen.name
      state.undoStack.length = 0
      state.redoStack.length = 0
      markDirty(state)
    }
    loadSel.value = ''
  }
  host.appendChild(loadSel)

  const stats = document.createElement('span')
  const updateStats = () => {
    stats.textContent = `colliders: ${state.level.colliders.length} · prowlers: ${state.level.prowlers.length} · dummies: ${state.level.dummies.length} · pickups: ${state.level.pickups.length} · world: ${state.level.worldWidth}×${state.level.worldHeight}`
  }
  state.listeners.add(updateStats)
  updateStats()
  host.appendChild(stats)

  const back = document.createElement('a')
  back.href = './'
  back.textContent = '← back to game'
  back.style.marginLeft = 'auto'
  back.style.color = 'var(--dim)'
  host.appendChild(back)
}

main().catch((err) => {
  console.error(err)
  document.body.innerHTML = `<pre style="color:#f88;padding:20px">${String(err?.stack ?? err)}</pre>`
})
