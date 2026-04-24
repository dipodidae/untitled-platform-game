// Shared helpers across kinetic types — base transform, vertex utilities,
// player overlap test. Anything that's common to more than one kinetic
// behaviour lives here; per-type logic lives in the neighbouring files.

import type { Polygon } from '../shared-kernel/polygon'
import type { Vec2 } from '../shared-kernel/vec2'
import type { Collider } from '../world/level'

export interface KineticBase {
  baseVertices: Polygon
  pivotX: number
  pivotY: number
}

export interface PlayerLike {
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  grounded: boolean
}

// ─── vertex transforms ────────────────────────────────────────────────────

export function rotateVertices(base: Polygon, pivotX: number, pivotY: number, angle: number): Polygon {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return base.map((v) => {
    const dx = v.x - pivotX
    const dy = v.y - pivotY
    return {
      x: pivotX + dx * c - dy * s,
      y: pivotY + dx * s + dy * c,
    }
  })
}

export function translateVertices(base: Polygon, ox: number, oy: number): Polygon {
  return base.map(v => ({ x: v.x + ox, y: v.y + oy }))
}

export function breatheVertices(base: Polygon, normals: Vec2[], t: number): Polygon {
  return base.map((v, i) => {
    const n = normals[i]!
    return {
      x: v.x + n.x * t,
      y: v.y + n.y * t,
    }
  })
}

// Outward-facing normals for each vertex — used by the breather to displace
// the polygon along its perimeter rather than in a fixed direction.
export function vertexNormals(poly: Polygon): Vec2[] {
  const n = poly.length
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]!
    const next = poly[(i + 1) % n]!
    let nx = -(next.y - prev.y)
    let ny = next.x - prev.x
    const len = Math.hypot(nx, ny) || 1
    nx /= len
    ny /= len
    out.push({ x: nx, y: ny })
  }
  return out
}

// ─── player detection ─────────────────────────────────────────────────────

export function playerOnCollider(p: PlayerLike, c: Collider): boolean {
  if (!p.grounded)
    return false
  const pBottom = p.y + p.h
  const pLeft = p.x
  const pRight = p.x + p.w
  return pBottom >= c.minY - 2 && pBottom <= c.minY + 6
    && pRight > c.minX && pLeft < c.maxX
}
