// Editor entry point.

import type { LevelJson } from '../world/level'
import level1 from '../levels/level1.json'
import level2 from '../levels/level2.json'
import { createCanvas, frameWorldViewport } from './canvas'
import { mountMinimap } from './minimap'
import { mountRightPanel } from './ui/rightPanel'
import { mountTopBar } from './ui/topBar'
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
  const topBarHost = document.getElementById('top-bar')!

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

  mountTopBar(topBarHost, state, BUNDLED)

  // Make ResizeObserver re-frame if the layout changes significantly at startup.
  const ro = new ResizeObserver(() => markDirty(state))
  ro.observe(canvasHost)
}

main().catch((err) => {
  console.error(err)
  document.body.innerHTML = `<pre style="color:#f88;padding:20px">${String(err?.stack ?? err)}</pre>`
})
