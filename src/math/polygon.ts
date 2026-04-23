// Polygon helpers: convex decomposition (via poly-decomp-es) and boolean
// ops (via polygon-clipping). We wrap both so the rest of the code uses a
// single `Vec2[]` shape instead of the libraries' `[x, y]` tuples.
//
// A Polygon here is an ordered ring of Vec2, implicitly closed (last vertex
// connects back to first). CCW winding is enforced by `decompose` before
// the library runs.

import type { Vec2 } from './vec2'
import * as clip from 'polygon-clipping'
import { makeCCW, quickDecomp } from 'poly-decomp-es'

export type Polygon = Vec2[]

// Signed area. Positive = CCW winding. Used for orientation checks and
// centroid weighting.
export function signedArea(poly: Polygon): number {
  let a = 0
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const p = poly[i]!
    const q = poly[(i + 1) % n]!
    a += p.x * q.y - q.x * p.y
  }
  return a * 0.5
}

export function area(poly: Polygon): number {
  return Math.abs(signedArea(poly))
}

export function centroid(poly: Polygon): Vec2 {
  let cx = 0
  let cy = 0
  let a = 0
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const p = poly[i]!
    const q = poly[(i + 1) % n]!
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
    a += f
  }
  if (Math.abs(a) < 1e-9)
    return { x: 0, y: 0 }
  a *= 0.5
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

// Axis-aligned bounding box of a polygon.
export function bounds(poly: Polygon): { minX: number, minY: number, maxX: number, maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of poly) {
    if (p.x < minX)
      minX = p.x
    if (p.y < minY)
      minY = p.y
    if (p.x > maxX)
      maxX = p.x
    if (p.y > maxY)
      maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

function toTuples(poly: Polygon): [number, number][] {
  return poly.map(p => [p.x, p.y] as [number, number])
}

function fromTuples(tuples: readonly (readonly [number, number])[]): Polygon {
  return tuples.map(([x, y]) => ({ x, y }))
}

// Decompose a concave polygon into convex pieces. Caller should pass a simple
// (non-self-intersecting) ring. Throws if poly-decomp rejects it.
export function decompose(poly: Polygon): Polygon[] {
  if (poly.length < 3)
    return []
  if (poly.length === 3)
    return [poly.slice()]

  const tuples = toTuples(poly)
  makeCCW(tuples) // mutates in place; returns whether a flip happened
  const parts = quickDecomp(tuples)
  if (!parts || parts.length === 0)
    return [fromTuples(tuples)]
  return parts.map(fromTuples)
}

// Boolean difference: subject − clippers. Returns the remaining polygons as a
// flat list of simple rings (outer rings only — we ignore holes, they'd
// complicate physics and we don't generate them in practice from a circular
// rupture clip).
export function polygonDifference(subject: Polygon, clippers: Polygon[]): Polygon[] {
  if (subject.length < 3 || clippers.length === 0)
    return [subject.slice()]

  const subjectRing: clip.Ring = toTuples(subject)
  const subjectPoly: clip.Polygon = [subjectRing]
  const clipPolys: clip.Polygon[] = clippers.map(c => [toTuples(c)])

  const result = clip.difference(subjectPoly, ...clipPolys)
  const out: Polygon[] = []
  for (const poly of result) {
    const outerRing = poly[0]
    if (!outerRing || outerRing.length < 4)
      continue
    // polygon-clipping closes rings explicitly (first == last); drop the
    // duplicate so our internal format stays implicit-close.
    const ring = outerRing.slice(0, -1)
    out.push(ring.map(([x, y]) => ({ x, y })))
  }
  return out
}

// Approximate a circle / ellipse as a closed polygon for clipping.
// Segment count scales with radius so small explosions don't over-sample.
export function circleToPolygon(cx: number, cy: number, rx: number, ry: number, angle = 0, segments?: number): Polygon {
  const maxR = Math.max(rx, ry)
  const n = segments ?? Math.max(12, Math.min(48, Math.round(maxR / 2)))
  const out: Polygon = []
  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    const lx = Math.cos(t) * rx
    const ly = Math.sin(t) * ry
    out.push({
      x: cx + lx * ca - ly * sa,
      y: cy + lx * sa + ly * ca,
    })
  }
  return out
}

// Is a point inside a polygon? Crossing-number test — works for any simple
// polygon (convex or not). Used by destruction to decide which colliders
// the rupture center sits inside.
export function pointInPolygon(poly: Polygon, p: Vec2): boolean {
  let inside = false
  const n = poly.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = poly[i]!
    const pj = poly[j]!
    const intersect
      = pi.y > p.y !== pj.y > p.y
      && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x
    if (intersect)
      inside = !inside
  }
  return inside
}
