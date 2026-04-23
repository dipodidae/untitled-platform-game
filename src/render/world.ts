// Draws the polygon world with edge lighting + AO rim.
//
// Each collider gets:
//   1. Filled body (material.fill)
//   2. Inner AO stroke (thin, material.shadow, low alpha) — cheap inset that
//      reads as contact shadow without running a geometric offset
//   3. Per-edge stripes: top-facing edges = material.edge (lit),
//      bottom-facing = material.shadow (shadowed)
//
// Hazards still carry spike glyphs — FAULTLINE keeps the threat legible.

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

// Outward normal for a CCW polygon edge (p→q): (dy, -dx) normalized.
function edgeNormal(px: number, py: number, qx: number, qy: number): { nx: number, ny: number } | null {
  const dx = qx - px
  const dy = qy - py
  const len = Math.hypot(dx, dy)
  if (len < 1e-6)
    return null
  return { nx: dy / len, ny: -dx / len }
}

function drawCollider(g: Graphics, c: Collider): void {
  if (!c.alive)
    return
  const m = activePalette().materials[c.material]

  if (c.material === 'hazard') {
    pathPolygon(g, c.vertices)
    g.fill({ color: m.fill, alpha: 0.95 })
    drawHazardSpikes(g, c)
    return
  }

  // Filled body.
  pathPolygon(g, c.vertices)
  g.fill({ color: m.fill })

  // Per-edge lighting pass.
  const n = c.vertices.length
  for (let i = 0; i < n; i++) {
    const p = c.vertices[i]!
    const q = c.vertices[(i + 1) % n]!
    const nrm = edgeNormal(p.x, p.y, q.x, q.y)
    if (!nrm)
      continue
    if (nrm.ny < CONFIG.EDGE_TOP_NORMAL_Y) {
      // Top-facing — draw lit edge inset 1px so it reads as rim light.
      g.moveTo(p.x, p.y + 1).lineTo(q.x, q.y + 1)
      g.stroke({ width: 2, color: m.edge, alpha: 0.95 })
    }
    else if (nrm.ny > CONFIG.EDGE_BOTTOM_NORMAL_Y) {
      // Bottom-facing — darker band from below.
      g.moveTo(p.x, p.y - 1).lineTo(q.x, q.y - 1)
      g.stroke({ width: 1, color: m.shadow, alpha: 0.7 })
    }
  }

  // Inner AO rim — stroke the polygon outline with material.shadow, low
  // alpha. Cheap: reads as contact shadow at the edges.
  pathPolygon(g, c.vertices)
  g.stroke({ width: 1, color: m.shadow, alpha: 0.45 })

  // Stone damage hint: faint crack scribble when cracked.
  if (c.material === 'stone' && c.damage > 0)
    drawStoneCracks(g, c, m.shadow)
}

function drawHazardSpikes(g: Graphics, c: Collider): void {
  const pal = activePalette().materials.hazard
  const step = 6
  const n = c.vertices.length
  for (let i = 0; i < n; i++) {
    const p = c.vertices[i]!
    const q = c.vertices[(i + 1) % n]!
    const nrm = edgeNormal(p.x, p.y, q.x, q.y)
    if (!nrm || nrm.ny > CONFIG.EDGE_TOP_NORMAL_Y)
      continue
    const dx = q.x - p.x
    const len = Math.abs(dx)
    if (len < 5)
      continue
    const dir = Math.sign(dx) || 1
    const steps = Math.floor(len / step)
    for (let s = 0; s < steps; s++) {
      const x0 = p.x + dir * (s * step + 1)
      const x1 = p.x + dir * (s * step + 3)
      const x2 = p.x + dir * (s * step + 5)
      g.poly([x0, p.y, x1, p.y - 7, x2, p.y]).fill({ color: pal.highlight, alpha: 0.9 })
    }
  }
}

function drawStoneCracks(g: Graphics, c: Collider, crackColor: number): void {
  const w = c.maxX - c.minX
  const h = c.maxY - c.minY
  if (w < 6 || h < 6)
    return
  const cx = c.minX + w / 2
  const cy = c.minY + h / 2
  g.moveTo(cx - 1, cy - 4).lineTo(cx + 1, cy - 1).lineTo(cx - 2, cy + 2).lineTo(cx + 2, cy + 5)
  g.stroke({ width: 1, color: crackColor, alpha: 0.75 })
}

export function drawColliders(g: Graphics, level: Level): void {
  g.clear()
  for (const c of level.colliders)
    drawCollider(g, c)
}

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
