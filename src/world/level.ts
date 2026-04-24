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

import type { ItemKind } from '../items/types'
import type { KineticJson, KineticState } from './kinetic'
import type { Polygon } from '../shared-kernel/polygon'
import type { Vec2 } from '../shared-kernel/vec2'
import { CONFIG } from '../config'
import { createKineticState } from './kinetic'
import { bounds, decompose } from '../shared-kernel/polygon'

// ─── zone schema (authored in LevelJson, consumed by player.ts at runtime) ─
//
// Zone types:
//   gravity    — multiplies player gravity + air control inside the volume
//   wind       — per-axis nudge + optional turbulence jitter
//   hazard     — damage-per-tick; 0 = instant kill
//   trigger    — opaque id forwarded to subscribers (dispatch is TBD)
//   goal       — player overlap emits levelComplete on the EventBus
//   spawnPoint — player overlap updates GameState.lastSpawnPoint (checkpoint)
export type ZoneType = 'gravity' | 'wind' | 'hazard' | 'trigger' | 'goal' | 'spawnPoint'

export interface ZoneJson {
  id: number
  type: ZoneType
  x: number
  y: number
  w: number
  h: number
  // gravity: gravityScale multiplies base gravity, airControlScale scales input.
  gravityScale?: number
  airControlScale?: number
  // wind: per-axis velocity nudge + turbulence jitter.
  windVx?: number
  windVy?: number
  windTurbulence?: number
  // hazard: 0 = instant kill on overlap, >0 = damage per physics tick.
  hazardDamage?: number
  // trigger: opaque id forwarded to a subscriber — runtime dispatch is TBD.
  triggerId?: string
}

// ─── materials ───────────────────────────────────────────────────────────
// Four authored materials, each producing its own kind of story:
//
//   glass        — breaks on a single rupture. Leaves SHARDS behind that kill
//                  on contact. Overzealous destruction becomes its own trap.
//   bone         — old, structural. Damage accumulates across ruptures
//                  (BONE_HITS before it fully collapses). The thing you
//                  primed earlier and forgot about.
//   bone_fragile — aging bone. Collapses after BONE_FRAGILE_COLLAPSE_TIME
//                  seconds of cumulative player contact. Timer persists
//                  across touches — once primed, it's counting down.
//   resonant     — indestructible. Rupture impulse compounds when you touch
//                  a chain of it — launches you farther than you meant.
//   soft         — solid but yielding. Dampens motion on contact; ruptures
//                  carve it at a reduced radius. Safe, but costly: you
//                  cannot keep your momentum here.
//
// `shard` is a runtime-only material spawned from broken glass. Never
// authored in a level file.
export type MaterialName = 'glass' | 'bone' | 'bone_fragile' | 'resonant' | 'soft' | 'shard'

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
}

interface PristineCollider {
  id: number
  material: MaterialName
  vertices: readonly Vec2[]
  oneWay: boolean
}

export interface LevelJson {
  spawn: { x: number, y: number }
  worldWidth: number
  worldHeight: number
  colliders: {
    id: number
    material: MaterialName
    vertices: [number, number][]
    oneWay?: boolean
    kinetic?: KineticJson
    // Conveyor-like surface: grounded player gets nudged by vx px/s.
    surfaceMotion?: { vx: number }
    // Launch pad: on contact, overwrites player vy with force along angle.
    launchPad?: { force: number, angle?: number }
  }[]
  prowlers?: { x: number, y: number }[]
  dummies?: { x: number, y: number, hp?: number }[]
  pickups?: { x: number, y: number, kind: ItemKind }[]
  zones?: ZoneJson[]
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
