// Geometry helpers for the editor — pure functions with no store dependency.
// Imported by canvas.ts, minimap.ts, and the Pinia store.

// Rotate a polygon's vertices around an anchor by `angle` radians.
// Used by the transform gizmo's rotation handle. Returns a new array.
export function rotatePolygon(
  verts: [number, number][],
  anchorX: number,
  anchorY: number,
  angle: number,
): [number, number][] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return verts.map(([x, y]) => {
    const dx = x - anchorX
    const dy = y - anchorY
    return [anchorX + dx * c - dy * s, anchorY + dx * s + dy * c] as [number, number]
  })
}

// Bounding rectangle of a polygon in world space.
export function polygonBounds(verts: [number, number][]): { minX: number, minY: number, maxX: number, maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of verts) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

// Center of a polygon's bounding box. Used as the rotation anchor.
export function polygonCenter(verts: [number, number][]): { cx: number, cy: number } {
  const b = polygonBounds(verts)
  return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 }
}

// Scale a polygon's vertices around an anchor point. Used by the
// drag-to-scale transform handles in the canvas.
export function scalePolygon(
  verts: [number, number][],
  anchorX: number,
  anchorY: number,
  sx: number,
  sy: number,
): [number, number][] {
  return verts.map(([x, y]) => [anchorX + (x - anchorX) * sx, anchorY + (y - anchorY) * sy])
}

// Snap a world-space value to the nearest `step` increment.
// Pass `store.snapStep` as the first argument. Returns `v` unchanged when step <= 0.
export function snap(step: number, v: number): number {
  if (step <= 0)
    return v
  return Math.round(v / step) * step
}
