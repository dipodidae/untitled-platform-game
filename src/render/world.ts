// Draws the polygon world. Each material gets its own silhouette
// language so behavior reads from motion + shape, not just color.
//
//   glass     — pale, translucent fill + extra-bright rim (fragile light)
//   bone      — warm off-white with damage scribbles (cracks deepen)
//   resonant  — cold blue-violet with a mirrored inner line (hums)
//   soft      — mauve with a blurred inset (pillowy)
//   shard     — small jagged triangle, rust-red (hazard)

import type { Graphics } from 'pixi.js'
import type { Collider, Level } from '../world/level'
import { CONFIG } from '../config'
import { activePalette } from './palette'

function pathPolygon(g: Graphics, verts: readonly { x: number, y: number }[]): void {
  if (verts.length < 3)
    return
  g.moveTo(verts[0]!.x, verts[0]!.y)
  for (let i = 1; i < verts.length; i++)
    g.lineTo(verts[i]!.x, verts[i]!.y)
  g.closePath()
}

function edgeNormal(px: number, py: number, qx: number, qy: number): { nx: number, ny: number } | null {
  const dx = qx - px
  const dy = qy - py
  const len = Math.hypot(dx, dy)
  if (len < 1e-6)
    return null
  return { nx: dy / len, ny: -dx / len }
}

function drawShard(g: Graphics, c: Collider): void {
  const m = activePalette().materials.shard
  pathPolygon(g, c.vertices)
  g.fill({ color: m.fill, alpha: 0.92 })
  pathPolygon(g, c.vertices)
  g.stroke({ width: 1, color: m.highlight, alpha: 0.9 })
}

function drawGlass(g: Graphics, c: Collider): void {
  const m = activePalette().materials.glass
  pathPolygon(g, c.vertices)
  g.fill({ color: m.fill, alpha: 0.55 })

  // Extra-bright rim on every edge — the silhouette catches light like
  // a shard even before it's broken. "This looks like it might shatter."
  const n = c.vertices.length
  for (let i = 0; i < n; i++) {
    const p = c.vertices[i]!
    const q = c.vertices[(i + 1) % n]!
    g.moveTo(p.x, p.y).lineTo(q.x, q.y)
    g.stroke({ width: 1, color: m.edge, alpha: 0.85 })
  }
  // Inner highlight — one thin diagonal near the top makes glass "glint."
  const bx = (c.minX + c.maxX) / 2
  const by = c.minY + 3
  g.moveTo(bx - 4, by + 1).lineTo(bx + 3, by - 2)
  g.stroke({ width: 1, color: m.highlight, alpha: 0.7 })
}

function drawBone(g: Graphics, c: Collider): void {
  const m = activePalette().materials.bone
  pathPolygon(g, c.vertices)
  g.fill({ color: m.fill })

  // Per-edge lighting.
  const n = c.vertices.length
  for (let i = 0; i < n; i++) {
    const p = c.vertices[i]!
    const q = c.vertices[(i + 1) % n]!
    const nrm = edgeNormal(p.x, p.y, q.x, q.y)
    if (!nrm)
      continue
    if (nrm.ny < CONFIG.EDGE_TOP_NORMAL_Y) {
      g.moveTo(p.x, p.y + 1).lineTo(q.x, q.y + 1)
      g.stroke({ width: 2, color: m.edge, alpha: 0.95 })
    }
    else if (nrm.ny > CONFIG.EDGE_BOTTOM_NORMAL_Y) {
      g.moveTo(p.x, p.y - 1).lineTo(q.x, q.y - 1)
      g.stroke({ width: 1, color: m.shadow, alpha: 0.6 })
    }
  }
  pathPolygon(g, c.vertices)
  g.stroke({ width: 1, color: m.shadow, alpha: 0.45 })

  // Damage scribble — deepens with each accumulated hit. Bone remembers.
  if (c.damage > 0) {
    const w = c.maxX - c.minX
    const h = c.maxY - c.minY
    if (w >= 6 && h >= 6) {
      const cx = c.minX + w / 2
      const cy = c.minY + h / 2
      const lines = c.damage // 1, 2 → denser scribble
      for (let i = 0; i < lines; i++) {
        const ox = -3 + i * 2
        g.moveTo(cx + ox, cy - 4)
          .lineTo(cx + ox + 1, cy - 1)
          .lineTo(cx + ox - 2, cy + 2)
          .lineTo(cx + ox + 2, cy + 5)
        g.stroke({ width: 1, color: m.shadow, alpha: 0.7 + i * 0.1 })
      }
    }
  }
}

function drawResonant(g: Graphics, c: Collider): void {
  const m = activePalette().materials.resonant
  pathPolygon(g, c.vertices)
  g.fill({ color: m.fill })

  // Top-lit edge.
  const n = c.vertices.length
  for (let i = 0; i < n; i++) {
    const p = c.vertices[i]!
    const q = c.vertices[(i + 1) % n]!
    const nrm = edgeNormal(p.x, p.y, q.x, q.y)
    if (!nrm)
      continue
    if (nrm.ny < CONFIG.EDGE_TOP_NORMAL_Y) {
      g.moveTo(p.x, p.y + 1).lineTo(q.x, q.y + 1)
      g.stroke({ width: 2, color: m.edge, alpha: 1 })
    }
  }
  // Interior mirrored stripe — reads as "humming." A single highlight
  // line offset from the top-left interior.
  const interiorX1 = c.minX + 3
  const interiorX2 = c.maxX - 3
  const interiorY = c.minY + 4
  g.moveTo(interiorX1, interiorY).lineTo(interiorX2, interiorY)
  g.stroke({ width: 1, color: m.highlight, alpha: 0.6 })

  pathPolygon(g, c.vertices)
  g.stroke({ width: 1, color: m.shadow, alpha: 0.55 })
}

function drawSoft(g: Graphics, c: Collider): void {
  const m = activePalette().materials.soft
  // Body.
  pathPolygon(g, c.vertices)
  g.fill({ color: m.fill })

  // Slight inset polygon at low alpha — fakes the pillowy inner
  // shadow without a geometric offset (which would need inset math).
  pathPolygon(g, c.vertices)
  g.stroke({ width: 3, color: m.shadow, alpha: 0.35 })

  // Thin highlight on top-facing edges only — slightly softer than bone.
  const n = c.vertices.length
  for (let i = 0; i < n; i++) {
    const p = c.vertices[i]!
    const q = c.vertices[(i + 1) % n]!
    const nrm = edgeNormal(p.x, p.y, q.x, q.y)
    if (!nrm)
      continue
    if (nrm.ny < CONFIG.EDGE_TOP_NORMAL_Y) {
      g.moveTo(p.x, p.y + 1).lineTo(q.x, q.y + 1)
      g.stroke({ width: 2, color: m.highlight, alpha: 0.55 })
    }
  }
}

function drawCollider(g: Graphics, c: Collider): void {
  if (!c.alive)
    return
  switch (c.material) {
    case 'shard': drawShard(g, c); return
    case 'glass': drawGlass(g, c); return
    case 'bone': drawBone(g, c); return
    case 'resonant': drawResonant(g, c); return
    case 'soft': drawSoft(g, c); return
  }
}

export function drawColliders(g: Graphics, level: Level): void {
  g.clear()
  for (const c of level.colliders)
    drawCollider(g, c)
}

// Hash includes shard expiries so the renderer repaints as shards expire.
export function hashColliders(level: Level): number {
  let h = 0x811C9DC5
  for (const c of level.colliders) {
    let v = c.vertices.length * 31 + c.damage * 7 + (c.alive ? 1 : 0)
    v = (v * 31 + c.id) >>> 0
    if (c.expiresAt !== null)
      v ^= Math.floor(c.expiresAt * 10) >>> 0
    h ^= v
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}
