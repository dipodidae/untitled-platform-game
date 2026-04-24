// Tiny 2D vector helpers. Prefer functions over a class so vectors stay as
// plain `{ x, y }` records — cheap, destructurable, no prototype cost in
// hot loops.

export interface Vec2 {
  x: number
  y: number
}

export function v2(x: number, y: number): Vec2 {
  return { x, y }
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s }
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y)
}

export function normalize(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y)
  if (l < 1e-9)
    return { x: 0, y: 0 }
  return { x: a.x / l, y: a.y / l }
}

// Perpendicular (rotate 90° CCW). For edge (dx,dy) the outward normal on a
// CCW polygon is (dy, -dx) — callers pick which sign they want.
export function perp(a: Vec2): Vec2 {
  return { x: -a.y, y: a.x }
}
