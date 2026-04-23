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

import type { Polygon } from '../math/polygon'
import type { Vec2 } from '../math/vec2'
import { CONFIG } from '../config'
import { bounds, decompose } from '../math/polygon'

export type MaterialName = 'dirt' | 'stone' | 'steel' | 'hazard'

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
  damage: number // stone-chip counter; unused for other materials
  alive: boolean
}

export interface Level {
  colliders: Collider[]
  readonly pristineColliders: readonly PristineCollider[]
  readonly worldWidth: number
  readonly worldHeight: number
  readonly spawn: { readonly x: number, readonly y: number }
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
  }[]
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
    alive: true,
  }
  computeColliderBounds(c)
  return c
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
  const charMat: Record<string, MaterialName | null> = {
    '.': null,
    ' ': null,
    'd': 'dirt',
    '#': 'dirt',
    's': 'stone',
    'S': 'steel',
    'x': 'hazard',
    'X': 'hazard',
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
      growDown: while (y + rh < h) {
        for (let i = 0; i < rw; i++) {
          if (meshed[y + rh]![x + i]! || matAt(x + i, y + rh) !== mat)
            break growDown
        }
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
  const colliders: Collider[] = data.colliders.map(raw =>
    buildCollider(
      raw.id,
      raw.material,
      raw.vertices.map(([x, y]) => ({ x, y })),
      raw.oneWay ?? false,
    ))
  return {
    colliders,
    pristineColliders: snapshot(colliders),
    worldWidth: data.worldWidth,
    worldHeight: data.worldHeight,
    spawn: { x: data.spawn.x, y: data.spawn.y },
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
      existing.alive = true
      refreshCollider(existing)
      fresh.push(existing)
    }
    else {
      fresh.push(buildCollider(p.id, p.material, verts, p.oneWay))
    }
  }
  level.colliders = fresh
}
