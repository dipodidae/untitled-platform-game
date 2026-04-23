// Separating Axis Theorem for AABB vs. convex polygon.
//
// Returns the minimum translation vector (MTV) that separates the two
// shapes, or null if they're already disjoint. The MTV is expressed as a
// unit normal and a scalar penetration depth; the caller applies it
// directly to the AABB's position.
//
// Convention: the returned normal points AWAY from the polygon (i.e. the
// direction to push the AABB to resolve the overlap). `normal.y < 0` ⇒
// polygon is beneath the AABB ⇒ the AABB is standing on the polygon.

import type { Polygon } from './polygon'
import type { Vec2 } from './vec2'

export interface AABB {
  x: number
  y: number
  w: number
  h: number
}

export interface SatHit {
  normal: Vec2 // unit vector, points from polygon toward AABB (resolution direction)
  depth: number // penetration along normal; always ≥ 0
}

// Project a convex shape onto an axis, returning its [min, max] interval.
function projectPolygon(poly: Polygon, ax: number, ay: number): { min: number, max: number } {
  let min = Infinity
  let max = -Infinity
  for (const v of poly) {
    const p = v.x * ax + v.y * ay
    if (p < min)
      min = p
    if (p > max)
      max = p
  }
  return { min, max }
}

function projectAABB(box: AABB, ax: number, ay: number): { min: number, max: number } {
  const x0 = box.x
  const y0 = box.y
  const x1 = box.x + box.w
  const y1 = box.y + box.h
  const p0 = x0 * ax + y0 * ay
  const p1 = x1 * ax + y0 * ay
  const p2 = x1 * ax + y1 * ay
  const p3 = x0 * ax + y1 * ay
  return {
    min: Math.min(p0, p1, p2, p3),
    max: Math.max(p0, p1, p2, p3),
  }
}

// Try a single axis. Returns the signed overlap plus sign info, or null if
// there's a gap on this axis (meaning the shapes are separated).
function overlapOnAxis(
  box: AABB,
  poly: Polygon,
  ax: number,
  ay: number,
): { depth: number, flip: boolean } | null {
  const a = projectAABB(box, ax, ay)
  const b = projectPolygon(poly, ax, ay)
  if (a.max < b.min || b.max < a.min)
    return null
  // `left`  = magnitude of the AABB-displacement in the +axis direction that
  //           separates (pushes AABB until a.min > b.max).
  // `right` = magnitude of the -axis displacement that separates (pushes
  //           AABB until a.max < b.min).
  // The smaller is the cheaper resolution; its direction is the normal.
  const left = b.max - a.min
  const right = a.max - b.min
  if (left < right)
    return { depth: left, flip: false } // push along +axis; keep sign
  return { depth: right, flip: true } // push along -axis; caller negates
}

// SAT vs convex polygon. For a CONVEX poly the only axes we need are:
//   - the AABB's two axes (1,0) and (0,1)
//   - each edge-normal of the polygon
// If ANY axis has a gap, the shapes are disjoint.
export function satAabbPoly(box: AABB, poly: Polygon): SatHit | null {
  if (poly.length < 3)
    return null

  let bestDepth = Infinity
  let bestAx = 0
  let bestAy = 0
  let bestFlip = false

  const axes: [number, number][] = [
    [1, 0],
    [0, 1],
  ]

  const n = poly.length
  for (let i = 0; i < n; i++) {
    const p = poly[i]!
    const q = poly[(i + 1) % n]!
    const dx = q.x - p.x
    const dy = q.y - p.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-9)
      continue
    // Outward normal for CCW: (dy, -dx). Winding isn't enforced here —
    // `overlapOnAxis` picks the correct sign either way via the flip flag.
    axes.push([dy / len, -dx / len])
  }

  for (const [ax, ay] of axes) {
    const r = overlapOnAxis(box, poly, ax, ay)
    if (r === null)
      return null
    if (r.depth < bestDepth) {
      bestDepth = r.depth
      bestAx = ax
      bestAy = ay
      bestFlip = r.flip
    }
  }

  if (bestFlip) {
    bestAx = -bestAx
    bestAy = -bestAy
  }
  return { normal: { x: bestAx, y: bestAy }, depth: bestDepth }
}
