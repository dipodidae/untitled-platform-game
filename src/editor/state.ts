// Editor state — the level being edited and the current selection/tool.
// Kept as mutable plain records; a single `listeners` set lets the canvas,
// sidebar, and minimap subscribe to changes. We call markDirty() whenever
// the level or selection mutates so the UI re-renders on the next frame.

import type { ItemKind } from '../items/types'
import type { KineticJson } from '../kinetic'
import type { LevelJson, MaterialName, ZoneJson, ZoneType } from '../world/level'

export type ShapeIndex = number

// An editable copy of LevelJson with a stable collider id counter. We
// normalise `oneWay` and `kinetic` to absent-when-unset so serialisation
// matches the hand-authored JSON.
export interface EditorLevel {
  spawn: { x: number, y: number }
  worldWidth: number
  worldHeight: number
  colliders: EditorCollider[]
  prowlers: { x: number, y: number }[]
  dummies: { x: number, y: number, hp?: number }[]
  pickups: { x: number, y: number, kind: ItemKind }[]
  zones: ZoneJson[]
  nextId: number
}

export interface EditorCollider {
  id: number
  material: MaterialName
  vertices: [number, number][]
  oneWay?: boolean
  kinetic?: KineticJson
  surfaceMotion?: { vx: number }
  launchPad?: { force: number, angle?: number }
}

export type Tool = 'select' | 'polygon' | 'rect' | 'spawn' | 'prowler' | 'dummy' | 'pickup' | 'zone'

export interface Selection {
  kind: 'collider' | 'spawn' | 'prowler' | 'dummy' | 'pickup' | 'zone'
  index: number // index into the respective list (ignored for 'spawn')
}

// Brush-armed preset: the next shape placed with a create tool picks up
// these properties. Cleared after the placement commits.
export interface PendingColliderPreset {
  oneWay?: boolean
  kinetic?: KineticJson
  surfaceMotion?: { vx: number }
  launchPad?: { force: number, angle?: number }
  // Arbitrary editor-only tag (e.g. 'toggle:default-off'). Not serialized
  // into LevelJson — lives on EditorCollider.note for round-trip through
  // a future schema. Runtime ignores.
  note?: string
}

export interface EditorState {
  level: EditorLevel
  tool: Tool
  selection: Selection | null
  // Material used when creating new colliders.
  createMaterial: MaterialName
  // Camera (world → screen): screen = (world - camera.xy) * camera.zoom + viewportCenter
  camera: { x: number, y: number, zoom: number }
  // Snap step in world units (0 = off). Applied on create + drag.
  snap: number
  // In-progress polygon creation buffer (world-space points).
  polyBuffer: [number, number][] | null
  // Brush arming — applied on the next shape/zone the user creates.
  pendingPreset: PendingColliderPreset | null
  pendingZone: Partial<ZoneJson> & { type: ZoneType } | null
  // Undo/redo stack — snapshots of serialized EditorLevel. Kept small (50
  // entries) to bound memory; levels are typically a few KB each.
  undoStack: string[]
  redoStack: string[]
  // What "Overwrite" currently targets. Either a File System Access handle
  // (set by Open File…) or a bundled preset name (set by the status-bar
  // dropdown, saved via the dev server). Mutually exclusive — whichever is
  // set most recently clears the other.
  activeFileHandle: FileSystemFileHandle | null
  activeFileName: string | null
  activePresetName: string | null
  // Layer-visibility flags. Each flag gates a category of canvas overlays.
  // All default to true (everything visible). Toggled via the View menu.
  layers: {
    colliders: boolean
    zones: boolean
    wind: boolean
    enemyRanges: boolean
    paths: boolean
    entityLabels: boolean
    grid: boolean
  }
  // DOM listener set — anyone who reads state registers here.
  listeners: Set<() => void>
}

export function createEmptyLevel(): EditorLevel {
  return {
    spawn: { x: 80, y: 300 },
    worldWidth: 3200,
    worldHeight: 720,
    colliders: [
      {
        id: 1,
        material: 'bone',
        vertices: [[0, 500], [3200, 500], [3200, 600], [0, 600]],
      },
    ],
    prowlers: [],
    dummies: [],
    pickups: [],
    zones: [],
    nextId: 2,
  }
}

export function fromLevelJson(data: LevelJson): EditorLevel {
  let maxId = 0
  const colliders: EditorCollider[] = data.colliders.map((c) => {
    if (c.id > maxId)
      maxId = c.id
    const entry: EditorCollider = {
      id: c.id,
      material: c.material,
      vertices: c.vertices.map(([x, y]) => [x, y]),
    }
    if (c.oneWay)
      entry.oneWay = true
    if (c.kinetic)
      entry.kinetic = c.kinetic
    if (c.surfaceMotion)
      entry.surfaceMotion = { vx: c.surfaceMotion.vx }
    if (c.launchPad)
      entry.launchPad = { force: c.launchPad.force, angle: c.launchPad.angle }
    return entry
  })
  const zones: ZoneJson[] = (data.zones ?? []).map((z) => {
    if (z.id > maxId) maxId = z.id
    return { ...z }
  })
  return {
    spawn: { x: data.spawn.x, y: data.spawn.y },
    worldWidth: data.worldWidth,
    worldHeight: data.worldHeight,
    colliders,
    prowlers: (data.prowlers ?? []).map(p => ({ x: p.x, y: p.y })),
    dummies: (data.dummies ?? []).map(d => ({ x: d.x, y: d.y, hp: d.hp })),
    pickups: (data.pickups ?? []).map(p => ({ x: p.x, y: p.y, kind: p.kind })),
    zones,
    nextId: maxId + 1,
  }
}

export function toLevelJson(level: EditorLevel): LevelJson {
  const out: LevelJson = {
    spawn: { x: level.spawn.x, y: level.spawn.y },
    worldWidth: level.worldWidth,
    worldHeight: level.worldHeight,
    colliders: level.colliders.map((c) => {
      const out: LevelJson['colliders'][number] = {
        id: c.id,
        material: c.material,
        vertices: c.vertices.map(([x, y]) => [x, y] as [number, number]),
      }
      if (c.oneWay)
        out.oneWay = true
      if (c.kinetic)
        out.kinetic = c.kinetic
      if (c.surfaceMotion && c.surfaceMotion.vx !== 0)
        out.surfaceMotion = { vx: c.surfaceMotion.vx }
      if (c.launchPad)
        out.launchPad = c.launchPad
      return out
    }),
  }
  if (level.prowlers.length)
    out.prowlers = level.prowlers.map(p => ({ x: p.x, y: p.y }))
  if (level.dummies.length)
    out.dummies = level.dummies.map(d => d.hp != null ? { x: d.x, y: d.y, hp: d.hp } : { x: d.x, y: d.y })
  if (level.pickups.length)
    out.pickups = level.pickups.map(p => ({ x: p.x, y: p.y, kind: p.kind }))
  if (level.zones.length)
    out.zones = level.zones.map(z => ({ ...z }))
  return out
}

export function createEditorState(): EditorState {
  return {
    level: createEmptyLevel(),
    tool: 'select',
    selection: null,
    createMaterial: 'bone',
    camera: { x: 0, y: 0, zoom: 0.5 },
    snap: 10,
    polyBuffer: null,
    pendingPreset: null,
    pendingZone: null,
    undoStack: [],
    redoStack: [],
    activeFileHandle: null,
    activeFileName: null,
    activePresetName: null,
    layers: {
      colliders: true,
      zones: true,
      wind: true,
      enemyRanges: true,
      paths: true,
      entityLabels: true,
      grid: true,
    },
    listeners: new Set(),
  }
}

const UNDO_LIMIT = 50

// Snapshot current level state onto the undo stack. Call BEFORE mutating
// — e.g. on the first pointer-down of a drag, before creating a shape, etc.
export function pushUndo(state: EditorState): void {
  const snap = JSON.stringify(toLevelJson(state.level))
  state.undoStack.push(snap)
  if (state.undoStack.length > UNDO_LIMIT)
    state.undoStack.shift()
  // Any new edit invalidates the redo history.
  state.redoStack.length = 0
}

export function undo(state: EditorState): void {
  const prev = state.undoStack.pop()
  if (!prev) return
  state.redoStack.push(JSON.stringify(toLevelJson(state.level)))
  try {
    state.level = fromLevelJson(JSON.parse(prev) as LevelJson)
    state.selection = null
    markDirty(state)
  }
  catch (e) {
    console.error('undo failed', e)
  }
}

export function redo(state: EditorState): void {
  const next = state.redoStack.pop()
  if (!next) return
  state.undoStack.push(JSON.stringify(toLevelJson(state.level)))
  try {
    state.level = fromLevelJson(JSON.parse(next) as LevelJson)
    state.selection = null
    markDirty(state)
  }
  catch (e) {
    console.error('redo failed', e)
  }
}

export function markDirty(state: EditorState): void {
  for (const l of state.listeners) l()
}

export function allocId(state: EditorState): number {
  return state.level.nextId++
}

// Scale a polygon's vertices around an anchor point. Used by the
// drag-to-scale transform handles in the canvas.
export function scalePolygon(
  verts: [number, number][],
  anchorX: number,
  anchorY: number,
  sx: number,
  sy: number,
): [number, number][] {
  return verts.map(([x, y]) => [anchorX + (x - anchorX) * sx, anchorY + (y - anchorY) * sy])
}

// Bounding rectangle of a polygon in world space.
export function polygonBounds(verts: [number, number][]): { minX: number, minY: number, maxX: number, maxY: number } {
  let minX = Infinity; let minY = Infinity
  let maxX = -Infinity; let maxY = -Infinity
  for (const [x, y] of verts) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

export function snap(state: EditorState, v: number): number {
  if (state.snap <= 0)
    return v
  return Math.round(v / state.snap) * state.snap
}
