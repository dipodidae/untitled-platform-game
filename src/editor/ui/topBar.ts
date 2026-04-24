// Top bar — File menu, bundled-preset dropdown, playtest link.
// Keeps frequent actions close at hand without cluttering the left panel.

import type { LevelJson } from '../../world/level'
import type { EditorState } from '../state'
import { fromLevelJson, markDirty, toLevelJson } from '../state'
import { showToast } from './toast'

interface BundledLevel {
  name: string
  data: LevelJson
}

export function mountTopBar(
  host: HTMLElement,
  state: EditorState,
  bundled: BundledLevel[],
): void {
  host.innerHTML = ''

  const fileMenu = buildFileMenu(state)
  host.appendChild(fileMenu)

  const viewMenu = buildViewMenu(state)
  host.appendChild(viewMenu)

  const presetSel = buildPresetSelect(state, bundled)
  host.appendChild(presetSel)

  const spacer = document.createElement('div')
  spacer.style.flex = '1'
  host.appendChild(spacer)

  const playtest = document.createElement('a')
  playtest.href = './'
  playtest.textContent = '← playtest'
  playtest.style.color = 'var(--dim)'
  host.appendChild(playtest)
}

function buildFileMenu(state: EditorState): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'topbar-menu'

  const btn = document.createElement('button')
  btn.textContent = 'File'
  wrap.appendChild(btn)

  const pop = document.createElement('div')
  pop.className = 'topbar-popover'
  pop.hidden = true
  wrap.appendChild(pop)

  btn.onclick = () => { pop.hidden = !pop.hidden }

  const newBlank = menuItem('New blank', () => {
    if (!confirm('Clear the current level and start blank?')) return
    state.level = fromLevelJson({
      spawn: { x: 80, y: 300 },
      worldWidth: 3200,
      worldHeight: 720,
      colliders: [
        { id: 1, material: 'bone', vertices: [[0, 500], [3200, 500], [3200, 600], [0, 600]] },
      ],
    })
    state.selection = null
    state.activeFileHandle = null
    state.activeFileName = null
    state.activePresetName = null
    markDirty(state)
    pop.hidden = true
  })
  pop.appendChild(newBlank)

  const open = menuItem('Open File…', async () => {
    pop.hidden = true
    const w = window as unknown as {
      showOpenFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle[]>
    }
    if (typeof w.showOpenFilePicker !== 'function') {
      openFallbackLoader(state)
      return
    }
    try {
      const [handle] = await w.showOpenFilePicker({
        types: [{ description: 'Level JSON', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      })
      if (!handle) return
      state.activeFileHandle = handle
      state.activeFileName = handle.name
      state.activePresetName = null
      const file = await handle.getFile()
      state.level = fromLevelJson(JSON.parse(await file.text()))
      state.selection = null
      state.undoStack.length = 0
      state.redoStack.length = 0
      markDirty(state)
    }
    catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return
      showToast(`Open failed: ${String((e as Error).message ?? e)}`, 'err')
    }
  })
  pop.appendChild(open)

  const download = menuItem('Download JSON', () => {
    const blob = new Blob([`${JSON.stringify(toLevelJson(state.level), null, 2)}\n`], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'level.json'
    a.click()
    URL.revokeObjectURL(url)
    pop.hidden = true
  })
  pop.appendChild(download)

  const copy = menuItem('Copy JSON', async () => {
    await navigator.clipboard.writeText(JSON.stringify(toLevelJson(state.level), null, 2))
    showToast('Copied to clipboard')
    pop.hidden = true
  })
  pop.appendChild(copy)

  // Close the popover when clicking outside it.
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) pop.hidden = true
  })

  return wrap
}

function buildViewMenu(state: EditorState): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'topbar-menu'

  const btn = document.createElement('button')
  btn.textContent = 'View'
  wrap.appendChild(btn)

  const pop = document.createElement('div')
  pop.className = 'topbar-popover'
  pop.hidden = true
  wrap.appendChild(pop)

  btn.onclick = () => { pop.hidden = !pop.hidden }

  const layers: [keyof EditorState['layers'], string][] = [
    ['colliders', 'Colliders'],
    ['zones', 'Zones'],
    ['wind', 'Wind arrows'],
    ['paths', 'Kinetic paths'],
    ['enemyRanges', 'Enemy ranges'],
    ['entityLabels', 'Entity labels'],
    ['grid', 'Grid'],
  ]

  for (const [key, label] of layers) {
    const row = document.createElement('label')
    row.className = 'topbar-menu-item'
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '6px'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = state.layers[key]
    cb.onchange = () => {
      state.layers[key] = cb.checked
      markDirty(state)
    }
    row.appendChild(cb)
    row.appendChild(document.createTextNode(label))
    pop.appendChild(row)
  }

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) pop.hidden = true
  })

  return wrap
}

function buildPresetSelect(state: EditorState, bundled: BundledLevel[]): HTMLElement {
  const sel = document.createElement('select')
  const def = document.createElement('option')
  def.value = ''
  def.textContent = '— load bundled —'
  def.disabled = true
  def.selected = true
  sel.appendChild(def)
  for (const b of bundled) {
    const o = document.createElement('option')
    o.value = b.name
    o.textContent = b.name
    sel.appendChild(o)
  }
  sel.onchange = () => {
    const chosen = bundled.find(b => b.name === sel.value)
    if (chosen) {
      state.level = fromLevelJson(chosen.data)
      state.selection = null
      state.activeFileHandle = null
      state.activeFileName = null
      state.activePresetName = chosen.name
      state.undoStack.length = 0
      state.redoStack.length = 0
      markDirty(state)
      showToast(`Loaded ${chosen.name}`)
    }
    sel.value = ''
  }
  return sel
}

function menuItem(label: string, onClick: () => void | Promise<void>): HTMLElement {
  const b = document.createElement('button')
  b.textContent = label
  b.className = 'topbar-menu-item'
  b.onclick = () => { void onClick() }
  return b
}

function openFallbackLoader(state: EditorState): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.onchange = async () => {
    const f = input.files?.[0]
    if (!f) return
    try {
      state.level = fromLevelJson(JSON.parse(await f.text()))
      state.selection = null
      markDirty(state)
    }
    catch (e) {
      showToast(`Failed to parse JSON: ${String(e)}`, 'err')
    }
  }
  input.click()
}
