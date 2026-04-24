// Right panel — world settings, selection inspector, grid/snap, save/load,
// and shortcuts. Listens to state changes via state.listeners and rebuilds
// its own DOM on each dirty tick.

import type { ItemKind } from '../../items/types'
import type { MaterialName } from '../../world/level'
import type { EditorState } from '../state'
import { markDirty, redo, toLevelJson, undo } from '../state'
import { showToast } from './toast'

const MATERIALS: MaterialName[] = ['bone', 'bone_fragile', 'glass', 'resonant', 'soft']
const ITEM_KINDS: ItemKind[] = ['bigShot']

export function mountRightPanel(
  host: HTMLElement,
  state: EditorState,
  opts: {
    onFrame: () => void
  },
): void {
  const render = (): void => {
    host.innerHTML = ''
    host.appendChild(worldSection(state))
    host.appendChild(gridSection(state))
    host.appendChild(selectionSection(state))
    host.appendChild(ioSection(state))
    host.appendChild(hintSection(opts))
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

function worldSection(state: EditorState): HTMLElement {
  const s = section('World Size')
  const w = numberInput(state.level.worldWidth, (v) => { state.level.worldWidth = v; markDirty(state) })
  const h = numberInput(state.level.worldHeight, (v) => { state.level.worldHeight = v; markDirty(state) })
  s.appendChild(row('worldWidth', w))
  s.appendChild(row('worldHeight', h))
  return s
}

function gridSection(state: EditorState): HTMLElement {
  const s = section('Grid / Snap')
  const snapIn = numberInput(state.snap, (v) => { state.snap = Math.max(0, v); markDirty(state) })
  s.appendChild(row('snap (px)', snapIn))
  const hint = document.createElement('div')
  hint.className = 'hint'
  hint.textContent = '0 = off'
  s.appendChild(hint)
  return s
}

function selectionSection(state: EditorState): HTMLElement {
  const sel = state.selection
  const s = section('Selection')
  if (!sel) {
    const m = document.createElement('div')
    m.className = 'hint'
    m.textContent = 'nothing selected'
    s.appendChild(m)
    return s
  }

  if (sel.kind === 'collider') {
    const c = state.level.colliders[sel.index]
    if (!c)
      return s
    const info = document.createElement('div'); info.className = 'hint'
    info.textContent = `collider #${c.id} · ${c.vertices.length} verts`
    s.appendChild(info)

    const matSel = document.createElement('select')
    for (const m of MATERIALS) {
      const o = document.createElement('option'); o.value = m; o.textContent = m
      if (c.material === m)
        o.selected = true
      matSel.appendChild(o)
    }
    matSel.onchange = () => { c.material = matSel.value as MaterialName; markDirty(state) }
    s.appendChild(row('material', matSel))

    const oneWay = document.createElement('input')
    oneWay.type = 'checkbox'
    oneWay.checked = !!c.oneWay
    oneWay.onchange = () => {
      if (oneWay.checked)
        c.oneWay = true; else delete c.oneWay
      markDirty(state)
    }
    s.appendChild(row('oneWay', oneWay))

    // Kinetic controls.
    const kinSel = document.createElement('select')
    const kindOpts: (string)[] = ['none', 'rotor', 'breather', 'spring']
    for (const k of kindOpts) {
      const o = document.createElement('option'); o.value = k; o.textContent = k
      if ((c.kinetic?.type ?? 'none') === k)
        o.selected = true
      kinSel.appendChild(o)
    }
    kinSel.onchange = () => {
      const v = kinSel.value
      if (v === 'none')
        delete c.kinetic
      else if (v === 'rotor')
        c.kinetic = { type: 'rotor', speed: 0.4 }
      else if (v === 'breather')
        c.kinetic = { type: 'breather', frequency: 0.6, amplitude: 2 }
      else if (v === 'spring')
        c.kinetic = { type: 'spring', stiffness: 180, damping: 8 }
      markDirty(state)
    }
    s.appendChild(row('kinetic', kinSel))
    if (c.kinetic) {
      for (const [key, val] of Object.entries(c.kinetic)) {
        if (key === 'type')
          continue
        if (Array.isArray(val)) {
          // Path for linear kinetic — expose as a textarea.
          const ta = document.createElement('textarea')
          ta.value = JSON.stringify(val)
          ta.rows = 2
          ta.style.flex = '1.4'
          ta.onchange = () => {
            try {
              const parsed = JSON.parse(ta.value) as [number, number][]
              ;(c.kinetic as unknown as Record<string, unknown>)[key] = parsed
              markDirty(state)
            }
            catch { /* ignore parse error until user fixes it */ }
          }
          s.appendChild(row(key, ta))
          continue
        }
        if (typeof val === 'string') {
          const inp = document.createElement('input')
          inp.type = 'text'
          inp.value = val
          inp.onchange = () => {
            ;(c.kinetic as unknown as Record<string, unknown>)[key] = inp.value
            markDirty(state)
          }
          s.appendChild(row(key, inp))
          continue
        }
        const n = numberInput(val as number, (nv) => {
          ;(c.kinetic as unknown as Record<string, unknown>)[key] = nv
          markDirty(state)
        })
        s.appendChild(row(key, n))
      }
    }

    // Surface motion (conveyor).
    const smOn = document.createElement('input')
    smOn.type = 'checkbox'
    smOn.checked = !!c.surfaceMotion && c.surfaceMotion.vx !== 0
    smOn.onchange = () => {
      if (smOn.checked)
        c.surfaceMotion = { vx: 80 }
      else delete c.surfaceMotion
      markDirty(state)
    }
    s.appendChild(row('conveyor', smOn))
    if (c.surfaceMotion && c.surfaceMotion.vx !== 0) {
      s.appendChild(row('surface vx', numberInput(c.surfaceMotion.vx, (v) => {
        c.surfaceMotion = { vx: v }
        markDirty(state)
      })))
    }

    // Launch pad.
    const padOn = document.createElement('input')
    padOn.type = 'checkbox'
    padOn.checked = !!c.launchPad
    padOn.onchange = () => {
      if (padOn.checked)
        c.launchPad = { force: 420, angle: 0 }
      else delete c.launchPad
      markDirty(state)
    }
    s.appendChild(row('launch pad', padOn))
    if (c.launchPad) {
      s.appendChild(row('force', numberInput(c.launchPad.force, (v) => {
        c.launchPad!.force = v; markDirty(state)
      })))
      s.appendChild(row('angle (rad)', numberInput(c.launchPad.angle ?? 0, (v) => {
        c.launchPad!.angle = v; markDirty(state)
      })))
    }
  }
  else if (sel.kind === 'zone') {
    const z = state.level.zones[sel.index]
    if (z) {
      const info = document.createElement('div'); info.className = 'hint'
      info.textContent = `zone #${z.id} · ${z.type}`
      s.appendChild(info)
      s.appendChild(row('x', numberInput(z.x, (v) => { z.x = v; markDirty(state) })))
      s.appendChild(row('y', numberInput(z.y, (v) => { z.y = v; markDirty(state) })))
      s.appendChild(row('w', numberInput(z.w, (v) => { z.w = v; markDirty(state) })))
      s.appendChild(row('h', numberInput(z.h, (v) => { z.h = v; markDirty(state) })))
      if (z.type === 'gravity') {
        s.appendChild(row('gravityScale', numberInput(z.gravityScale ?? 1, (v) => { z.gravityScale = v; markDirty(state) })))
        s.appendChild(row('airControlScale', numberInput(z.airControlScale ?? 1, (v) => { z.airControlScale = v; markDirty(state) })))
      }
      else if (z.type === 'wind') {
        s.appendChild(row('windVx', numberInput(z.windVx ?? 0, (v) => { z.windVx = v; markDirty(state) })))
        s.appendChild(row('windVy', numberInput(z.windVy ?? 0, (v) => { z.windVy = v; markDirty(state) })))
        s.appendChild(row('turbulence', numberInput(z.windTurbulence ?? 0, (v) => { z.windTurbulence = v; markDirty(state) })))
      }
      else if (z.type === 'hazard') {
        s.appendChild(row('hazardDamage', numberInput(z.hazardDamage ?? 0, (v) => { z.hazardDamage = v; markDirty(state) })))
      }
      else if (z.type === 'trigger') {
        const inp = document.createElement('input')
        inp.type = 'text'
        inp.value = z.triggerId ?? ''
        inp.onchange = () => { z.triggerId = inp.value; markDirty(state) }
        s.appendChild(row('triggerId', inp))
      }
    }
  }
  else if (sel.kind === 'spawn') {
    const x = numberInput(state.level.spawn.x, (v) => { state.level.spawn.x = v; markDirty(state) })
    const y = numberInput(state.level.spawn.y, (v) => { state.level.spawn.y = v; markDirty(state) })
    s.appendChild(row('spawn x', x))
    s.appendChild(row('spawn y', y))
  }
  else if (sel.kind === 'prowler') {
    const p = state.level.prowlers[sel.index]
    if (p) {
      s.appendChild(row('x', numberInput(p.x, (v) => { p.x = v; markDirty(state) })))
      s.appendChild(row('y', numberInput(p.y, (v) => { p.y = v; markDirty(state) })))
    }
  }
  else if (sel.kind === 'dummy') {
    const d = state.level.dummies[sel.index]
    if (d) {
      s.appendChild(row('x', numberInput(d.x, (v) => { d.x = v; markDirty(state) })))
      s.appendChild(row('y', numberInput(d.y, (v) => { d.y = v; markDirty(state) })))
      s.appendChild(row('hp', numberInput(d.hp ?? 1, (v) => {
        if (v === 1)
          delete d.hp; else d.hp = v
        markDirty(state)
      })))
    }
  }
  else if (sel.kind === 'pickup') {
    const p = state.level.pickups[sel.index]
    if (p) {
      s.appendChild(row('x', numberInput(p.x, (v) => { p.x = v; markDirty(state) })))
      s.appendChild(row('y', numberInput(p.y, (v) => { p.y = v; markDirty(state) })))
      const kindSel = document.createElement('select')
      for (const k of ITEM_KINDS) {
        const o = document.createElement('option'); o.value = k; o.textContent = k
        if (p.kind === k)
          o.selected = true
        kindSel.appendChild(o)
      }
      kindSel.onchange = () => { p.kind = kindSel.value as ItemKind; markDirty(state) }
      s.appendChild(row('kind', kindSel))
    }
  }

  const del = document.createElement('button')
  del.textContent = 'Delete'
  del.className = 'danger'
  del.onclick = () => {
    const sel2 = state.selection
    if (!sel2)
      return
    if (sel2.kind === 'collider')
      state.level.colliders.splice(sel2.index, 1)
    else if (sel2.kind === 'prowler')
      state.level.prowlers.splice(sel2.index, 1)
    else if (sel2.kind === 'dummy')
      state.level.dummies.splice(sel2.index, 1)
    else if (sel2.kind === 'pickup')
      state.level.pickups.splice(sel2.index, 1)
    // spawn is intentionally non-deletable
    if (sel2.kind !== 'spawn')
      state.selection = null
    markDirty(state)
  }
  if (sel.kind !== 'spawn')
    s.appendChild(del)
  return s
}

interface FSASupport {
  open: boolean
  save: boolean
}
function fsaSupport(): FSASupport {
  const w = window as unknown as { showOpenFilePicker?: unknown, showSaveFilePicker?: unknown }
  return {
    open: typeof w.showOpenFilePicker === 'function',
    save: typeof w.showSaveFilePicker === 'function',
  }
}

// Overwrite target labels. The handle route uses the File System Access API
// (Open File… flow). The preset route POSTs to the Vite dev middleware at
// /__editor/save?name=<preset>, which writes src/levels/<preset>.json.
function overwriteLabel(state: EditorState): string | null {
  if (state.activeFileName)
    return state.activeFileName
  if (state.activePresetName)
    return `${state.activePresetName}.json`
  return null
}

async function overwritePreset(state: EditorState, name: string): Promise<void> {
  const body = `${JSON.stringify(toLevelJson(state.level), null, 2)}\n`
  const res = await fetch(`/__editor/save?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${text || res.statusText}`)
  }
}

function ioSection(state: EditorState): HTMLElement {
  const s = section('Save / Load')
  const sup = fsaSupport()

  // Overwrite — writes back to the source the level came from:
  //   - File System Access handle (Open File… flow), OR
  //   - Bundled preset by name (preset dropdown flow, via dev server).
  // Always prompts for confirmation before writing.
  const row1 = document.createElement('div'); row1.className = 'button-row'
  const label = overwriteLabel(state)
  const overwrite = document.createElement('button')
  overwrite.innerHTML = `<iconify-icon icon="mdi:content-save-outline"></iconify-icon><span>${label ? `Overwrite (${label})` : 'Overwrite'}</span>`
  overwrite.disabled = label == null
  overwrite.title = label
    ? `Overwrite ${label}`
    : sup.save
      ? 'Load a bundled preset, or use File > "Open File…", before overwriting.'
      : 'Load a bundled preset before overwriting.'
  overwrite.className = 'primary'
  overwrite.onclick = async () => {
    const target = overwriteLabel(state)
    if (!target)
      return
    if (!confirm(`Overwrite ${target}? This cannot be undone.`))
      return
    try {
      if (state.activeFileHandle) {
        const writable = await state.activeFileHandle.createWritable()
        await writable.write(`${JSON.stringify(toLevelJson(state.level), null, 2)}\n`)
        await writable.close()
      }
      else if (state.activePresetName) {
        await overwritePreset(state, state.activePresetName)
      }
      showToast(`Saved ${target}`, 'ok')
    }
    catch (e) {
      console.error('overwrite failed', e)
      showToast(`Overwrite failed: ${String((e as Error).message ?? e)}`, 'err')
    }
  }
  row1.appendChild(overwrite)
  s.appendChild(row1)

  // Undo / redo row.
  const row2 = document.createElement('div'); row2.className = 'button-row'
  const undoBtn = document.createElement('button')
  undoBtn.innerHTML = `<iconify-icon icon="mdi:undo"></iconify-icon><span>Undo (${state.undoStack.length})</span>`
  undoBtn.disabled = state.undoStack.length === 0
  undoBtn.title = 'Ctrl+Z'
  undoBtn.onclick = () => undo(state)
  row2.appendChild(undoBtn)
  const redoBtn = document.createElement('button')
  redoBtn.innerHTML = `<iconify-icon icon="mdi:redo"></iconify-icon><span>Redo (${state.redoStack.length})</span>`
  redoBtn.disabled = state.redoStack.length === 0
  redoBtn.title = 'Ctrl+Shift+Z / Ctrl+Y'
  redoBtn.onclick = () => redo(state)
  row2.appendChild(redoBtn)
  s.appendChild(row2)

  return s
}

function hintSection(opts: { onFrame: () => void }): HTMLElement {
  const s = section('Shortcuts')
  const d = document.createElement('div')
  d.className = 'hint'
  d.innerHTML = [
    '<span class="kbd">Space</span>+drag: pan',
    '<span class="kbd">Wheel</span>: zoom',
    '<span class="kbd">F</span>: frame world',
    '<span class="kbd">Enter</span>: finish polygon',
    '<span class="kbd">Esc</span>: cancel',
    '<span class="kbd">Del</span>: delete selection',
    '<span class="kbd">Shift</span>+click vertex: delete',
    '<span class="kbd">Alt</span>+click edge: insert vertex',
    '<span class="kbd">G</span>: motion preview (hold)',
  ].join('<br>')
  s.appendChild(d)
  const frameBtn = document.createElement('button')
  frameBtn.textContent = 'Frame world'
  frameBtn.onclick = opts.onFrame
  s.appendChild(frameBtn)
  return s
}

function numberInput(initial: number, onChange: (v: number) => void): HTMLInputElement {
  const i = document.createElement('input')
  i.type = 'number'
  i.value = String(initial)
  i.onchange = () => {
    const n = Number(i.value)
    if (Number.isFinite(n))
      onChange(n)
  }
  return i
}
