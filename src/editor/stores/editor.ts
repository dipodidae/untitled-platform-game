// Pinia store for editor state — the level being edited plus all UI ephemera.
// Replaces the vanilla EditorState + markDirty/listeners pattern; Vue reactivity
// takes over notification. This store is the single source of truth for the
// Vue-based editor shell (Phase 3+). The legacy vanilla editor still uses
// src/editor/state.ts directly and is untouched by this module.

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ItemKind } from '../../items/types'
import type { KineticJson } from '../../world/kinetic'
import type { LevelJson, MaterialName, ZoneJson, ZoneType } from '../../world/level'

// ---------------------------------------------------------------------------
// Types (mirrored from state.ts — kept here so the store is self-contained)
// ---------------------------------------------------------------------------

export type ShapeIndex = number

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

export interface UndoEntry {
  snap: string
  label: string
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
  note?: string
}

// ---------------------------------------------------------------------------
// Helpers (serialization — pure functions)
// ---------------------------------------------------------------------------

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

function fromLevelJson(data: LevelJson): EditorLevel {
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
    if (z.id > maxId)
      maxId = z.id
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

function toLevelJson(level: EditorLevel): LevelJson {
  const out: LevelJson = {
    spawn: { x: level.spawn.x, y: level.spawn.y },
    worldWidth: level.worldWidth,
    worldHeight: level.worldHeight,
    colliders: level.colliders.map((c) => {
      const entry: LevelJson['colliders'][number] = {
        id: c.id,
        material: c.material,
        vertices: c.vertices.map(([x, y]) => [x, y] as [number, number]),
      }
      if (c.oneWay)
        entry.oneWay = true
      if (c.kinetic)
        entry.kinetic = c.kinetic
      if (c.surfaceMotion && c.surfaceMotion.vx !== 0)
        entry.surfaceMotion = { vx: c.surfaceMotion.vx }
      if (c.launchPad)
        entry.launchPad = c.launchPad
      return entry
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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const UNDO_LIMIT = 50

export const useEditorStore = defineStore('editor', () => {
  // ----- State -----

  const level = ref<EditorLevel>(createEmptyLevel())
  const tool = ref<Tool>('select')
  const selection = ref<Selection | null>(null)
  /** Material used when creating new colliders. */
  const createMaterial = ref<MaterialName>('bone')
  /** Camera (world → screen): screen = (world - camera.xy) * camera.zoom + viewportCenter */
  const camera = ref<{ x: number, y: number, zoom: number }>({ x: 0, y: 0, zoom: 0.5 })
  /**
   * Snap step in world units (0 = off). Applied on create + drag.
   * Named `snapStep` to avoid collision with the snap() geometry helper.
   */
  const snapStep = ref<number>(10)
  /** In-progress polygon creation buffer (world-space points). */
  const polyBuffer = ref<[number, number][] | null>(null)
  /** Brush arming — applied on the next shape/zone the user creates. */
  const pendingPreset = ref<PendingColliderPreset | null>(null)
  const pendingZone = ref<(Partial<ZoneJson> & { type: ZoneType }) | null>(null)
  /**
   * Undo/redo stacks — snapshots of serialized EditorLevel. Kept small (50
   * entries) to bound memory; levels are typically a few KB each.
   */
  const undoStack = ref<UndoEntry[]>([])
  const redoStack = ref<UndoEntry[]>([])
  /**
   * What "Overwrite" currently targets. Either a File System Access handle
   * (set by Open File…) or a bundled preset name (set by the status-bar
   * dropdown, saved via the dev server). Mutually exclusive — whichever is
   * set most recently clears the other.
   */
  const activeFileHandle = ref<FileSystemFileHandle | null>(null)
  const activeFileName = ref<string | null>(null)
  const activePresetName = ref<string | null>(null)
  /**
   * Layer-visibility flags. Each flag gates a category of canvas overlays.
   * All default to true (everything visible). Toggled via the View menu.
   */
  const layers = ref({
    colliders: true,
    zones: true,
    wind: true,
    enemyRanges: true,
    paths: true,
    entityLabels: true,
    grid: true,
  })

  // ----- Actions -----

  /**
   * Snapshot current level state onto the undo stack.
   * Call BEFORE mutating — e.g. on the first pointer-down of a drag,
   * before creating a shape, etc.
   */
  function pushUndo(label: string): void {
    const snap = JSON.stringify(toLevelJson(level.value))
    undoStack.value.push({ snap, label })
    if (undoStack.value.length > UNDO_LIMIT)
      undoStack.value.shift()
    // Any new edit invalidates the redo history.
    redoStack.value.length = 0
  }

  function undo(): void {
    const prev = undoStack.value.pop()
    if (!prev)
      return
    redoStack.value.push({
      snap: JSON.stringify(toLevelJson(level.value)),
      label: prev.label,
    })
    try {
      level.value = fromLevelJson(JSON.parse(prev.snap) as LevelJson)
      selection.value = null
    }
    catch (e) {
      console.error('undo failed', e)
    }
  }

  function redo(): void {
    const next = redoStack.value.pop()
    if (!next)
      return
    undoStack.value.push({
      snap: JSON.stringify(toLevelJson(level.value)),
      label: next.label,
    })
    try {
      level.value = fromLevelJson(JSON.parse(next.snap) as LevelJson)
      selection.value = null
    }
    catch (e) {
      console.error('redo failed', e)
    }
  }

  /**
   * Load a level from a LevelJson payload. Resets selection and clears
   * undo/redo history so the fresh load is the new baseline.
   */
  function loadFromJson(data: LevelJson): void {
    level.value = fromLevelJson(data)
    selection.value = null
    undoStack.value = []
    redoStack.value = []
  }

  /** Serialize the current level to LevelJson. */
  function toJson(): LevelJson {
    return toLevelJson(level.value)
  }

  /** Allocate a fresh collider/zone id by incrementing the level's counter. */
  function allocId(): number {
    return level.value.nextId++
  }

  return {
    // State
    level,
    tool,
    selection,
    createMaterial,
    camera,
    snapStep,
    polyBuffer,
    pendingPreset,
    pendingZone,
    undoStack,
    redoStack,
    activeFileHandle,
    activeFileName,
    activePresetName,
    layers,
    // Actions
    pushUndo,
    undo,
    redo,
    loadFromJson,
    toJson,
    allocId,
  }
})
