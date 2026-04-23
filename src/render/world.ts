// Draws the polygon world. Step 2 keeps this intentionally simple —
// filled polygons + a top-edge highlight stripe. Step 6 (art pass) layers
// on edge lighting, soft AO, and a crack/rivet/spike texture pass.

import type { Graphics } from 'pixi.js'
import type { Collider, Level } from '../world/level'
import { activePalette } from './palette'

// CCW winding in screen-space (y-down) with our signed-area convention:
// a top-facing edge runs left→right (dx > 0, dy ≈ 0).  We only draw the
// highlight stripe on segments whose outward normal points up-ish.
function isTopFacing(ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax
  const dy = by - ay
  // Outward normal for our CCW convention: (dy, -dx). Top-facing ⇒ normal.y < -0.3.
  const ny = -dx
  const len = Math.hypot(dy, -dx)
  if (len < 1e-6)
    return false
  return ny / len < -0.3
}

function pathPolygon(g: Graphics, verts: readonly { x: number, y: number }[]): void {
  if (verts.length < 3)
    return
  g.moveTo(verts[0]!.x, verts[0]!.y)
  for (let i = 1; i < verts.length; i++)
    g.lineTo(verts[i]!.x, verts[i]!.y)
  g.closePath()
}

function drawCollider(g: Graphics, c: Collider): void {
  if (!c.alive)
    return
  const pal = activePalette()
  const m = pal.materials[c.material]

  // Hazards get the old "spikes on the top edge" treatment so the warning
  // still reads; the step 6 pass will replace this with a proper spiked
  // silhouette.
  if (c.material === 'hazard') {
    pathPolygon(g, c.vertices)
    g.fill({ color: m.fill })
    drawHazardSpikes(g, c)
    return
  }

  // Filled body.
  pathPolygon(g, c.vertices)
  g.fill({ color: m.fill })

  // Top-edge highlight stripe — draws a 2px offset along each top-facing
  // edge so flat floors still show the old "grass line" look.
  const n = c.vertices.length
  for (let i = 0; i < n; i++) {
    const p = c.vertices[i]!
    const q = c.vertices[(i + 1) % n]!
    if (!isTopFacing(p.x, p.y, q.x, q.y))
      continue
    g.moveTo(p.x, p.y + 1)
    g.lineTo(q.x, q.y + 1)
    g.stroke({ width: 2, color: m.edge, alpha: 0.9 })
  }

  // Stone cracks still read via damage counter (populated in step 5).
  if (c.material === 'stone' && c.damage > 0)
    drawStoneCracks(g, c, m.shadow)
}

function drawHazardSpikes(g: Graphics, c: Collider): void {
  const pal = activePalette().materials.hazard
  const step = 5
  // Spike triangles along each top-facing edge.
  const n = c.vertices.length
  for (let i = 0; i < n; i++) {
    const p = c.vertices[i]!
    const q = c.vertices[(i + 1) % n]!
    if (!isTopFacing(p.x, p.y, q.x, q.y))
      continue
    const dx = q.x - p.x
    const len = Math.abs(dx)
    if (len < 4)
      continue
    const dir = Math.sign(dx) || 1
    const steps = Math.floor(len / step)
    for (let s = 0; s < steps; s++) {
      const x0 = p.x + dir * (s * step + 1)
      const x1 = p.x + dir * (s * step + 3)
      const x2 = p.x + dir * (s * step + 5)
      g.poly([x0, p.y, x1, p.y - 6, x2, p.y]).fill({ color: pal.highlight })
    }
  }
}

// Axis-aligned crack decoration — only sensible on rectangular colliders.
// We inscribe the scratches inside the bounds so it reads regardless of
// whether the collider has been carved.
function drawStoneCracks(g: Graphics, c: Collider, crackColor: number): void {
  const w = c.maxX - c.minX
  const h = c.maxY - c.minY
  if (w < 6 || h < 6)
    return
  const cx = c.minX + w / 2
  const cy = c.minY + h / 2
  g.rect(cx - 1, cy - 3, 2, 6).fill({ color: crackColor, alpha: 0.8 })
  g.rect(cx - 3, cy, 8, 2).fill({ color: crackColor, alpha: 0.8 })
  g.rect(cx + 3, cy - 2, 2, 4).fill({ color: crackColor, alpha: 0.8 })
}

export function drawColliders(g: Graphics, level: Level): void {
  g.clear()
  for (const c of level.colliders)
    drawCollider(g, c)
}

// Cheap change detection so the renderer can skip redraws when nothing
// in the world has mutated. Destruction changes vertices.length and
// damage counter; both feed in here. Separate from the tilemap hash the
// old render.ts used — step 3 removes that.
export function hashColliders(level: Level): number {
  let h = 0x811C9DC5
  for (const c of level.colliders) {
    let v = c.vertices.length * 31 + c.damage * 7 + (c.alive ? 1 : 0)
    v = (v * 31 + c.id) >>> 0
    h ^= v
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}
