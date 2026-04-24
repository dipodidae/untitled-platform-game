// Left panel — tool palette, brush library, and material picker.
//
// Listens to state changes via state.listeners and rebuilds its own
// DOM on each dirty tick. Dead-simple, no virtual DOM.

import type { MaterialName } from '../../world/level'
import type { EditorState, Tool } from '../state'
import { BRUSH_CATEGORY_LABEL, BRUSHES } from '../brushes'
import { markDirty } from '../state'
import { showToast } from './toast'

const TOOLS: { id: Tool, label: string, hint: string, icon: string }[] = [
  { id: 'select', label: 'Select', hint: 'V', icon: 'mdi:cursor-default' },
  { id: 'polygon', label: 'Polygon', hint: 'P', icon: 'mdi:vector-polygon' },
  { id: 'rect', label: 'Rect', hint: 'R', icon: 'mdi:rectangle-outline' },
  { id: 'zone', label: 'Zone', hint: '', icon: 'mdi:shape-rectangle-plus' },
  { id: 'spawn', label: 'Spawn', hint: '', icon: 'mdi:flag' },
  { id: 'prowler', label: 'Prowler', hint: '', icon: 'mdi:spider' },
  { id: 'dummy', label: 'Dummy', hint: '', icon: 'mdi:target' },
  { id: 'pickup', label: 'Pickup', hint: '', icon: 'mdi:diamond-stone' },
]

const MATERIALS: MaterialName[] = ['bone', 'bone_fragile', 'glass', 'resonant', 'soft']

export function mountLeftPanel(host: HTMLElement, state: EditorState): void {
  const render = (): void => {
    host.innerHTML = ''
    host.appendChild(toolSection(state))
    host.appendChild(brushSection(state))
    host.appendChild(createSection(state))
  }
  state.listeners.add(render)
  render()
}

function section(title: string): HTMLElement {
  const s = document.createElement('div')
  s.className = 'section'
  const h = document.createElement('h3')
  h.textContent = title
  s.appendChild(h)
  return s
}

function row(labelText: string, input: HTMLElement): HTMLElement {
  const r = document.createElement('div')
  r.className = 'row'
  const l = document.createElement('label')
  l.textContent = labelText
  r.appendChild(l)
  r.appendChild(input)
  return r
}

function toolSection(state: EditorState): HTMLElement {
  const s = section('Tools')
  const grid = document.createElement('div')
  grid.className = 'button-row'
  for (const t of TOOLS) {
    const b = document.createElement('button')
    b.innerHTML = `<iconify-icon icon="${t.icon}"></iconify-icon><span>${t.hint ? `${t.label} (${t.hint})` : t.label}</span>`
    b.title = t.hint ? `${t.label} — shortcut ${t.hint}` : t.label
    if (state.tool === t.id)
      b.classList.add('active')
    b.onclick = () => {
      state.tool = t.id
      state.polyBuffer = null
      markDirty(state)
    }
    grid.appendChild(b)
  }
  s.appendChild(grid)
  return s
}

function brushSection(state: EditorState): HTMLElement {
  const s = section('Brushes')
  const cats = new Map<string, typeof BRUSHES>()
  for (const b of BRUSHES) {
    if (!cats.has(b.category))
      cats.set(b.category, [])
    cats.get(b.category)!.push(b)
  }
  for (const [cat, list] of cats) {
    const hdr = document.createElement('div')
    hdr.className = 'mono'
    hdr.style.marginTop = '4px'
    hdr.textContent = BRUSH_CATEGORY_LABEL[cat as keyof typeof BRUSH_CATEGORY_LABEL]
    s.appendChild(hdr)
    const grid = document.createElement('div')
    grid.className = 'button-row'
    for (const b of list) {
      const btn = document.createElement('button')
      btn.className = 'brush-btn'
      const suffix = b.live ? '' : ' *'
      btn.innerHTML = `<iconify-icon icon="${b.icon}"></iconify-icon><span>${b.label}${suffix}</span>`
      btn.title = b.summary + (b.live ? '' : ' (editor-only, runtime TODO)')
      if (!b.live)
        btn.classList.add('preview')
      btn.onclick = () => {
        if (!b.live)
          showToast(`${b.label}: no runtime effect yet`, 'err')
        b.apply(state)
        markDirty(state)
      }
      grid.appendChild(btn)
    }
    s.appendChild(grid)
  }
  const legend = document.createElement('div')
  legend.className = 'hint'
  legend.textContent = '* = editor-only (no runtime yet)'
  s.appendChild(legend)
  return s
}

function createSection(state: EditorState): HTMLElement {
  const s = section('New Shape Material')
  const sel = document.createElement('select')
  for (const m of MATERIALS) {
    const o = document.createElement('option')
    o.value = m
    o.textContent = m
    if (state.createMaterial === m)
      o.selected = true
    sel.appendChild(o)
  }
  sel.onchange = () => {
    state.createMaterial = sel.value as MaterialName
    markDirty(state)
  }
  s.appendChild(row('material', sel))
  return s
}
