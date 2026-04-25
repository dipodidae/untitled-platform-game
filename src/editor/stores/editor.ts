// Pinia store for editor state — the level being edited plus all UI ephemera.
// Replaces the vanilla EditorState + markDirty/listeners pattern; Vue reactivity
// takes over notification. This store is the single source of truth for the
// Vue-based editor shell (Phase 3+). The legacy vanilla editor still uses
// src/editor/state.ts directly and is untouched by this module.

import type { ItemKind } from '../../shared-kernel/types'
import type { KineticJson } from '../../world/kinetic'
import type { LevelJson, MaterialName, ZoneJson, ZoneType } from '../../world/level'
import { defineStore } from 'pinia'
import { ref } from 'vue'

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
  // ─── specials (mechanics-driven) ───────────────────────────────────
  mirrors: { x: number, y: number }[]
  hushes: { x: number, y: number }[]
  candlewicks: { x: number, y: number }[]
  knights: { x: number, y: number }[]
  blooms: { x: number, y: number }[]
  echoes: { x: number, y: number }[]
  crows: { x: number, y: number, linkIdx?: number }[]
  carts: { x: number, y: number }[]
  shrines: { x: number, y: number }[]
  pilgrims: { x: number, y: number, toggles?: number[] }[]
  // ─── classics (classic-game inspired) ──────────────────────────────
  medusas: { x: number, y: number }[]
  beetles: { x: number, y: number }[]
  boos: { x: number, y: number }[]
  wallmasters: { x: number, y: number }[]
  stalkers: { x: number, y: number }[]
  wizards: { x: number, y: number }[]
  garpedes: { x0: number, y: number, x1: number, period?: number }[]
  ironKnuckles: { x: number, y: number, facing?: 1 | -1 }[]
  cagneys: { x: number, y: number }[]
  dryBones: { x: number, y: number }[]
  planteras: { x: number, y: number }[]
  hammerBros: { x: number, y: number, period?: number }[]
  mantisLords: { x: number, y: number }[]
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
    mirrors: [],
    hushes: [],
    candlewicks: [],
    knights: [],
    blooms: [],
    echoes: [],
    crows: [],
    carts: [],
    shrines: [],
    pilgrims: [],
    medusas: [],
    beetles: [],
    boos: [],
    wallmasters: [],
    stalkers: [],
    wizards: [],
    garpedes: [],
    ironKnuckles: [],
    cagneys: [],
    dryBones: [],
    planteras: [],
    hammerBros: [],
    mantisLords: [],
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
    mirrors: (data.mirrors ?? []).map(p => ({ x: p.x, y: p.y })),
    hushes: (data.hushes ?? []).map(p => ({ x: p.x, y: p.y })),
    candlewicks: (data.candlewicks ?? []).map(p => ({ x: p.x, y: p.y })),
    knights: (data.knights ?? []).map(p => ({ x: p.x, y: p.y })),
    blooms: (data.blooms ?? []).map(p => ({ x: p.x, y: p.y })),
    echoes: (data.echoes ?? []).map(p => ({ x: p.x, y: p.y })),
    crows: (data.crows ?? []).map(p => ({ x: p.x, y: p.y, linkIdx: p.linkIdx })),
    carts: (data.carts ?? []).map(p => ({ x: p.x, y: p.y })),
    shrines: (data.shrines ?? []).map(p => ({ x: p.x, y: p.y })),
    pilgrims: (data.pilgrims ?? []).map(p => ({ x: p.x, y: p.y, toggles: p.toggles ? [...p.toggles] : undefined })),
    medusas: (data.medusas ?? []).map(p => ({ x: p.x, y: p.y })),
    beetles: (data.beetles ?? []).map(p => ({ x: p.x, y: p.y })),
    boos: (data.boos ?? []).map(p => ({ x: p.x, y: p.y })),
    wallmasters: (data.wallmasters ?? []).map(p => ({ x: p.x, y: p.y })),
    stalkers: (data.stalkers ?? []).map(p => ({ x: p.x, y: p.y })),
    wizards: (data.wizards ?? []).map(p => ({ x: p.x, y: p.y })),
    garpedes: (data.garpedes ?? []).map(p => ({ x0: p.x0, y: p.y, x1: p.x1, period: p.period })),
    ironKnuckles: (data.ironKnuckles ?? []).map(p => ({ x: p.x, y: p.y, facing: p.facing })),
    cagneys: (data.cagneys ?? []).map(p => ({ x: p.x, y: p.y })),
    dryBones: (data.dryBones ?? []).map(p => ({ x: p.x, y: p.y })),
    planteras: (data.planteras ?? []).map(p => ({ x: p.x, y: p.y })),
    hammerBros: (data.hammerBros ?? []).map(p => ({ x: p.x, y: p.y, period: p.period })),
    mantisLords: (data.mantisLords ?? []).map(p => ({ x: p.x, y: p.y })),
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
  // Special + classic enemies — emit only when present so an empty editor
  // level still produces a tidy JSON payload.
  if (level.mirrors.length)
    out.mirrors = level.mirrors.map(p => ({ x: p.x, y: p.y }))
  if (level.hushes.length)
    out.hushes = level.hushes.map(p => ({ x: p.x, y: p.y }))
  if (level.candlewicks.length)
    out.candlewicks = level.candlewicks.map(p => ({ x: p.x, y: p.y }))
  if (level.knights.length)
    out.knights = level.knights.map(p => ({ x: p.x, y: p.y }))
  if (level.blooms.length)
    out.blooms = level.blooms.map(p => ({ x: p.x, y: p.y }))
  if (level.echoes.length)
    out.echoes = level.echoes.map(p => ({ x: p.x, y: p.y }))
  if (level.crows.length)
    out.crows = level.crows.map(p => p.linkIdx !== undefined ? { x: p.x, y: p.y, linkIdx: p.linkIdx } : { x: p.x, y: p.y })
  if (level.carts.length)
    out.carts = level.carts.map(p => ({ x: p.x, y: p.y }))
  if (level.shrines.length)
    out.shrines = level.shrines.map(p => ({ x: p.x, y: p.y }))
  if (level.pilgrims.length)
    out.pilgrims = level.pilgrims.map(p => p.toggles?.length ? { x: p.x, y: p.y, toggles: [...p.toggles] } : { x: p.x, y: p.y })
  if (level.medusas.length)
    out.medusas = level.medusas.map(p => ({ x: p.x, y: p.y }))
  if (level.beetles.length)
    out.beetles = level.beetles.map(p => ({ x: p.x, y: p.y }))
  if (level.boos.length)
    out.boos = level.boos.map(p => ({ x: p.x, y: p.y }))
  if (level.wallmasters.length)
    out.wallmasters = level.wallmasters.map(p => ({ x: p.x, y: p.y }))
  if (level.stalkers.length)
    out.stalkers = level.stalkers.map(p => ({ x: p.x, y: p.y }))
  if (level.wizards.length)
    out.wizards = level.wizards.map(p => ({ x: p.x, y: p.y }))
  if (level.garpedes.length)
    out.garpedes = level.garpedes.map(p => p.period !== undefined ? { x0: p.x0, y: p.y, x1: p.x1, period: p.period } : { x0: p.x0, y: p.y, x1: p.x1 })
  if (level.ironKnuckles.length)
    out.ironKnuckles = level.ironKnuckles.map(p => p.facing !== undefined ? { x: p.x, y: p.y, facing: p.facing } : { x: p.x, y: p.y })
  if (level.cagneys.length)
    out.cagneys = level.cagneys.map(p => ({ x: p.x, y: p.y }))
  if (level.dryBones.length)
    out.dryBones = level.dryBones.map(p => ({ x: p.x, y: p.y }))
  if (level.planteras.length)
    out.planteras = level.planteras.map(p => ({ x: p.x, y: p.y }))
  if (level.hammerBros.length)
    out.hammerBros = level.hammerBros.map(p => p.period !== undefined ? { x: p.x, y: p.y, period: p.period } : { x: p.x, y: p.y })
  if (level.mantisLords.length)
    out.mantisLords = level.mantisLords.map(p => ({ x: p.x, y: p.y }))
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
  /** Which item kind the pickup tool will place next. */
  const pendingPickupKind = ref<ItemKind>('coin')
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
    pendingPickupKind,
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
