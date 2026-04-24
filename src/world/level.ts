// Polygon-based world model.
//
// JSON SCHEMA (hand-authored levels — see src/levels/*.json):
//   {
//     "spawn":        { "x": 32, "y": 200 },
//     "worldWidth":   800,              // px. Camera clamps + fall-out use this.
//     "worldHeight":  320,
//     "colliders": [
//       {
//         "id":       1,
//         "material": "dirt",           // "dirt" | "stone" | "steel" | "hazard"
//         "vertices": [[x, y], ...],    // CCW ring, implicit close. Concave OK.
//         "oneWay":   true              // optional; collide only from above with vy ≥ 0
//       },
//       ...
//     ]
//   }
// Concave colliders get decomposed on load into convex pieces in
// `Collider.pieces` — SAT needs convex inputs. `vertices` stays as the
// outer ring so destruction can re-clip and re-decompose.
//
// `tilemapToPolygons` converts legacy tile-string levels into a collider
// list via greedy rectangle meshing; kept so old test layouts still load.

import type { KineticJson, KineticState } from './kinetic'
import type { Polygon } from '../shared-kernel/polygon'
import type { Vec2 } from '../shared-kernel/vec2'
import { CONFIG } from '../config'
import { createKineticState } from './kinetic'
import { bounds, decompose } from '../shared-kernel/polygon'

export type { LevelJson, MaterialName, ZoneJson, ZoneType } from '../shared-kernel/types'
import type { ItemKind, LevelJson, MaterialName, ZoneJson } from '../shared-kernel/types'

export interface Collider {
  id: number
  material: MaterialName
  vertices: Polygon
  pieces: Polygon[]
  oneWay: boolean
  minX: number
  minY: number
  maxX: number
  maxY: number
  damage: number // hit counter; consulted by bone (via BONE_HITS)
  contactTime: number // seconds player has stood on this; consulted by bone_fragile
  touched: boolean // true after first player ground contact; glass uses this for priming
  alive: boolean
  // Runtime-ephemeral colliders (shards). When set, collider is removed
  // once game time passes this value. null for authored colliders.
  expiresAt: number | null
  // Kinetic behavior — rotating, breathing, or spring physics.
  // null for static colliders. Set during level load from JSON.
  kinetic: KineticState | null
}

export interface Level {
  colliders: Collider[]
  readonly pristineColliders: readonly PristineCollider[]
  readonly worldWidth: number
  readonly worldHeight: number
  readonly spawn: { readonly x: number, readonly y: number }
  readonly prowlerSpawns: readonly { readonly x: number, readonly y: number }[]
  readonly dummySpawns: readonly { readonly x: number, readonly y: number, readonly hp?: number }[]
  readonly pickupSpawns: readonly { readonly x: number, readonly y: number, readonly kind: ItemKind }[]
  // Authored zones, consumed by player.ts each tick for goal/checkpoint
  // detection + per-type modifiers. See ZoneType above for semantics.
  readonly zones: readonly ZoneJson[]
  // Optional special-enemy spawn tables. Hydrated from LevelJson so the
  // game session can construct a SpecialsState without re-parsing JSON.
  readonly specialSpawns: SpecialSpawnTables
  readonly classicSpawns: ClassicSpawnTables
}

export interface SpecialSpawnTables {
  readonly mirrors: readonly { x: number, y: number }[]
  readonly hushes: readonly { x: number, y: number }[]
  readonly candlewicks: readonly { x: number, y: number }[]
  readonly knights: readonly { x: number, y: number }[]
  readonly blooms: readonly { x: number, y: number }[]
  readonly echoes: readonly { x: number, y: number }[]
  readonly crows: readonly { x: number, y: number, linkIdx?: number }[]
  readonly carts: readonly { x: number, y: number }[]
  readonly shrines: readonly { x: number, y: number }[]
  readonly pilgrims: readonly { x: number, y: number, toggles?: readonly number[] }[]
}

export interface ClassicSpawnTables {
  readonly medusas: readonly { x: number, y: number }[]
  readonly beetles: readonly { x: number, y: number }[]
  readonly boos: readonly { x: number, y: number }[]
  readonly wallmasters: readonly { x: number, y: number }[]
  readonly stalkers: readonly { x: number, y: number }[]
  readonly wizards: readonly { x: number, y: number }[]
  readonly garpedes: readonly { x0: number, y: number, x1: number, period?: number }[]
  readonly ironKnuckles: readonly { x: number, y: number, facing?: 1 | -1 }[]
  readonly cagneys: readonly { x: number, y: number }[]
  readonly dryBones: readonly { x: number, y: number }[]
  readonly planteras: readonly { x: number, y: number }[]
  readonly hammerBros: readonly { x: number, y: number, period?: number }[]
  readonly mantisLords: readonly { x: number, y: number }[]
}

interface PristineCollider {
  id: number
  material: MaterialName
  vertices: readonly Vec2[]
  oneWay: boolean
}

// ─── collider helpers ────────────────────────────────────────────────────

export function computeColliderBounds(c: Collider): void {
  const b = bounds(c.vertices)
  c.minX = b.minX
  c.minY = b.minY
  c.maxX = b.maxX
  c.maxY = b.maxY
}

export function buildCollider(
  id: number,
  material: MaterialName,
  vertices: Polygon,
  oneWay = false,
  expiresAt: number | null = null,
): Collider {
  const pieces = decompose(vertices)
  const c: Collider = {
    id,
    material,
    vertices,
    pieces,
    oneWay,
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    damage: 0,
    contactTime: 0,
    touched: false,
    alive: true,
    expiresAt,
    kinetic: null,
  }
  computeColliderBounds(c)
  return c
}

// Purge expired runtime colliders (shards). Called from the physics loop
// before building the broadphase so shards don't stick around past their
// lifetime.
export function tickEphemeral(level: Level, now: number): void {
  let write = 0
  const list = level.colliders
  for (let read = 0; read < list.length; read++) {
    const c = list[read]!
    if (c.expiresAt !== null && now >= c.expiresAt)
      continue
    list[write++] = c
  }
  list.length = write
}

export function refreshCollider(c: Collider): void {
  c.pieces = decompose(c.vertices)
  computeColliderBounds(c)
}

function snapshot(colliders: readonly Collider[]): PristineCollider[] {
  return colliders.map(c => ({
    id: c.id,
    material: c.material,
    vertices: c.vertices.map(v => ({ x: v.x, y: v.y })),
    oneWay: c.oneWay,
  }))
}

// ─── tilemap → polygons (greedy rectangle meshing) ───────────────────────

export function tilemapToPolygons(rows: readonly string[]): Collider[] {
  // Legacy glyphs map to the FAULTLINE taxonomy. Old "dirt" ground is
  // now bone; old "stone" reads as more bone; steel → resonant;
  // hazards from authored tile layouts become fixed-long-lifetime shards.
  const charMat: Record<string, MaterialName | null> = {
    '.': null,
    ' ': null,
    'd': 'bone',
    '#': 'bone',
    's': 'bone',
    'S': 'resonant',
    'x': 'shard',
    'X': 'shard',
    'f': 'bone_fragile',
  }
  const h = rows.length
  const w = rows[0]?.length ?? 0
  const TS = CONFIG.TILE_SIZE
  const meshed: boolean[][] = Array.from({ length: h }, () =>
    Array.from<boolean>({ length: w }).fill(false))

  function matAt(x: number, y: number): MaterialName | null {
    if (y < 0 || y >= h || x < 0 || x >= w)
      return null
    const ch = rows[y]![x] ?? '.'
    const m = charMat[ch]
    if (m === undefined)
      throw new Error(`tilemapToPolygons: unknown char '${ch}'`)
    return m
  }

  const out: Collider[] = []
  let nextId = 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (meshed[y]![x]!)
        continue
      const mat = matAt(x, y)
      if (mat === null)
        continue

      let rw = 1
      while (x + rw < w && !meshed[y]![x + rw]! && matAt(x + rw, y) === mat)
        rw++

      let rh = 1
      let canGrow = true
      while (canGrow && y + rh < h) {
        for (let i = 0; i < rw; i++) {
          if (meshed[y + rh]![x + i]! || matAt(x + i, y + rh) !== mat) {
            canGrow = false
            break
          }
        }
        if (canGrow)
          rh++
      }
      for (let yy = 0; yy < rh; yy++) {
        for (let xx = 0; xx < rw; xx++)
          meshed[y + yy]![x + xx] = true
      }

      const x0 = x * TS
      const y0 = y * TS
      const x1 = (x + rw) * TS
      const y1 = (y + rh) * TS
      // CCW in screen-space (TL → TR → BR → BL) gives positive signed area,
      // matching our poly-decomp convention.
      const verts: Polygon = [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ]
      out.push(buildCollider(nextId++, mat, verts, false))
    }
  }
  return out
}

// ─── loaders ─────────────────────────────────────────────────────────────

export function fromJson(data: LevelJson): Level {
  const colliders: Collider[] = data.colliders.map((raw) => {
    const verts = raw.vertices.map(([x, y]) => ({ x, y }))
    const c = buildCollider(raw.id, raw.material, verts, raw.oneWay ?? false)
    if (raw.kinetic) {
      c.kinetic = createKineticState(verts, raw.kinetic)
    }
    return c
  })
  return {
    colliders,
    pristineColliders: snapshot(colliders),
    worldWidth: data.worldWidth,
    worldHeight: data.worldHeight,
    spawn: { x: data.spawn.x, y: data.spawn.y },
    prowlerSpawns: (data.prowlers ?? []).map(p => ({ x: p.x, y: p.y })),
    dummySpawns: (data.dummies ?? []).map(d => ({ x: d.x, y: d.y, hp: d.hp })),
    pickupSpawns: (data.pickups ?? []).map(p => ({ x: p.x, y: p.y, kind: p.kind })),
    zones: (data.zones ?? []).map(z => ({ ...z })),
    specialSpawns: {
      mirrors: (data.mirrors ?? []).map(p => ({ x: p.x, y: p.y })),
      hushes: (data.hushes ?? []).map(p => ({ x: p.x, y: p.y })),
      candlewicks: (data.candlewicks ?? []).map(p => ({ x: p.x, y: p.y })),
      knights: (data.knights ?? []).map(p => ({ x: p.x, y: p.y })),
      blooms: (data.blooms ?? []).map(p => ({ x: p.x, y: p.y })),
      echoes: (data.echoes ?? []).map(p => ({ x: p.x, y: p.y })),
      crows: (data.crows ?? []).map(p => ({ x: p.x, y: p.y, linkIdx: p.linkIdx })),
      carts: (data.carts ?? []).map(p => ({ x: p.x, y: p.y })),
      shrines: (data.shrines ?? []).map(p => ({ x: p.x, y: p.y })),
      pilgrims: (data.pilgrims ?? []).map(p => ({ x: p.x, y: p.y, toggles: p.toggles })),
    },
    classicSpawns: {
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
    },
  }
}

export function fromTilemap(rows: readonly string[]): Level {
  const colliders = tilemapToPolygons(rows)
  const width = (rows[0]?.length ?? 0) * CONFIG.TILE_SIZE
  const height = rows.length * CONFIG.TILE_SIZE
  return {
    colliders,
    pristineColliders: snapshot(colliders),
    worldWidth: width,
    worldHeight: height,
    spawn: { x: CONFIG.SPAWN_X, y: CONFIG.SPAWN_Y },
    prowlerSpawns: [],
    dummySpawns: [],
    pickupSpawns: [],
    zones: [],
    specialSpawns: emptySpecialSpawns(),
    classicSpawns: emptyClassicSpawns(),
  }
}

function emptySpecialSpawns(): SpecialSpawnTables {
  return {
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
  }
}

function emptyClassicSpawns(): ClassicSpawnTables {
  return {
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

// Restore authored state. Rebuilds colliders in place from the pristine
// snapshot so existing references (renderer, physics) see the reset world.
export function resetLevel(level: Level): void {
  const byId = new Map<number, Collider>()
  for (const c of level.colliders)
    byId.set(c.id, c)

  const fresh: Collider[] = []
  for (const p of level.pristineColliders) {
    const verts: Polygon = p.vertices.map(v => ({ x: v.x, y: v.y }))
    const existing = byId.get(p.id)
    if (existing) {
      existing.vertices = verts
      existing.material = p.material
      existing.oneWay = p.oneWay
      existing.damage = 0
      existing.contactTime = 0
      existing.touched = false
      existing.alive = true
      // Re-create kinetic state from base vertices (resets angle/phase/offset)
      if (existing.kinetic) {
        existing.kinetic = createKineticState(verts, existing.kinetic as KineticJson)
      }
      refreshCollider(existing)
      fresh.push(existing)
    }
    else {
      fresh.push(buildCollider(p.id, p.material, verts, p.oneWay))
    }
  }
  level.colliders = fresh
}
