// Polygon-based world model (transitional — also carries the legacy tile
// grid until step 3 completes the physics port).
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
// outer ring so destruction can re-clip + re-decompose.

import type { MaterialId } from '../materials'
import type { Polygon } from '../math/polygon'
import type { Vec2 } from '../math/vec2'
import { CONFIG } from '../config'
import { charToMaterial, MAT_EMPTY } from '../materials'
import { bounds, decompose } from '../math/polygon'

export type MaterialName = 'dirt' | 'stone' | 'steel' | 'hazard'

export const MAT_ID: Record<MaterialName, number> = {
  dirt: 1,
  stone: 2,
  steel: 3,
  hazard: 4,
}

export const MAT_NAME: Record<number, MaterialName> = {
  1: 'dirt',
  2: 'stone',
  3: 'steel',
  4: 'hazard',
}

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
  // Polygon world (authoritative going forward).
  colliders: Collider[]
  readonly pristineColliders: readonly PristineCollider[]
  readonly worldWidth: number
  readonly worldHeight: number
  readonly spawn: { readonly x: number, readonly y: number }

  // Legacy tile grid (kept so the tile-based physics keeps running through
  // step 2; step 3 removes these three fields + the pristineTiles snapshot).
  readonly width: number
  readonly height: number
  tiles: MaterialId[][]
  damage: number[][]
  readonly pristineTiles: readonly (readonly MaterialId[])[]
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

// ─── tilemap → polygons (greedy rectangle meshing) ───────────────────────

// Merges adjacent same-material tiles into rectangles. CCW in screen-space
// (TL → TR → BR → BL) matches our positive-signed-area convention.
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

// ─── JSON loader ─────────────────────────────────────────────────────────

export function fromJson(data: LevelJson): Level {
  const colliders: Collider[] = data.colliders.map(raw =>
    buildCollider(
      raw.id,
      raw.material,
      raw.vertices.map(([x, y]) => ({ x, y })),
      raw.oneWay ?? false,
    ))
  // No tile grid for JSON-authored levels. Populate dummies so the
  // transitional tile-based physics bails out gracefully — step 3 removes
  // these entirely.
  return {
    colliders,
    pristineColliders: snapshot(colliders),
    worldWidth: data.worldWidth,
    worldHeight: data.worldHeight,
    spawn: { x: data.spawn.x, y: data.spawn.y },
    width: Math.ceil(data.worldWidth / CONFIG.TILE_SIZE),
    height: Math.ceil(data.worldHeight / CONFIG.TILE_SIZE),
    tiles: [],
    damage: [],
    pristineTiles: [],
  }
}

function snapshot(colliders: Collider[]): PristineCollider[] {
  return colliders.map(c => ({
    id: c.id,
    material: c.material,
    vertices: c.vertices.map(v => ({ x: v.x, y: v.y })),
    oneWay: c.oneWay,
  }))
}

// ─── legacy tile-string loader (default level through step 2–3) ──────────

const DEFAULT_LEVEL_STRINGS: readonly string[] = [
  '..................................................',
  '..................................................',
  '..................................................',
  '..........................................SSSS....',
  '..................................................',
  '..................ssssssss........................',
  '..................ssssssss........................',
  '..................ssssssss........................',
  '..................ssssssss........................',
  '.......dddddd.....ssssssss...............S........',
  '..................ssssssss...............S........',
  '................................dddddd...S........',
  '.........................................S........',
  '.........................................S........',
  '.....ddddddd..........xxxxxxx............S........',
  'dddddddddddddddddddddddxxxxxxxdddddddddddddddddddd',
  'ddddddddddddddddddddddd.......dddddddddddddddddddd',
  'ssssssssssssssssssssssssssssssssssssssssssssssssss',
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
]

export function createLevel(rows: readonly string[] = DEFAULT_LEVEL_STRINGS): Level {
  const width = rows[0]?.length ?? 0
  const height = rows.length
  const tiles: MaterialId[][] = rows.map((row, i) => {
    if (row.length !== width)
      throw new Error(`createLevel: row ${i} width ${row.length} !== ${width}`)
    return [...row].map(ch => charToMaterial(ch))
  })
  const damage: number[][] = Array.from({ length: height }, () =>
    Array.from<number>({ length: width }).fill(0))
  const pristineTiles: readonly (readonly MaterialId[])[] = tiles.map(r => r.slice())
  const colliders = tilemapToPolygons(rows)
  return {
    colliders,
    pristineColliders: snapshot(colliders),
    worldWidth: width * CONFIG.TILE_SIZE,
    worldHeight: height * CONFIG.TILE_SIZE,
    spawn: { x: CONFIG.SPAWN_X, y: CONFIG.SPAWN_Y },
    width,
    height,
    tiles,
    damage,
    pristineTiles,
  }
}

// Restore level to authored state. Resets both tile grid and collider list
// so existing references (render caches, physics reads) see the reset world.
export function resetLevel(level: Level): void {
  // Tile grid reset (step 3 will drop this branch).
  for (let y = 0; y < level.height; y++) {
    const pRow = level.pristineTiles[y]
    const tRow = level.tiles[y]
    const dRow = level.damage[y]
    if (!pRow || !tRow || !dRow)
      continue
    for (let x = 0; x < level.width; x++) {
      tRow[x] = pRow[x] ?? MAT_EMPTY
      dRow[x] = 0
    }
  }

  // Collider reset.
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
