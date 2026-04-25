// Draws the polygon world — CRT Horror Pixel edition.
// Each material gets its own visual language.

import type { Graphics } from 'pixi.js'
import type { Collider, Level } from '../world/level'
import { CONFIG } from '../config'
import { activePalette } from './palette'

let _frameCount = 0

// ─── light direction for edge lighting (normalized) ────────────────
const LIGHT_DX = 0.3
const LIGHT_DY = -1.0
const LIGHT_LEN = Math.hypot(LIGHT_DX, LIGHT_DY)
const LIGHT_NX = LIGHT_DX / LIGHT_LEN
const LIGHT_NY = LIGHT_DY / LIGHT_LEN

interface Vert { x: number, y: number }

function pathPolygon(g: Graphics, verts: readonly Vert[]): void {
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

// Hard cutoff edge lighting: bright if dot > 0, dark otherwise.
function edgeLit(nx: number, ny: number): boolean {
  return (nx * LIGHT_NX + ny * LIGHT_NY) > 0
}

// Simple deterministic hash for seeded scribbles.
function idHash(id: number, i: number): number {
  let h = id * 2654435761 + i * 2246822519
  h ^= h >>> 16
  h = Math.imul(h, 0x45D9F3B)
  h ^= h >>> 16
  return h
}

// ─── shard ─────────────────────────────────────────────────────────
function drawShard(g: Graphics, c: Collider): void {
  const m = activePalette().materials.shard
  const verts = c.vertices

  // Snap all vertices to integer (stairstepped polygon)
  const snapped = verts.map(v => ({ x: Math.round(v.x), y: Math.round(v.y) }))
  pathPolygon(g, snapped)
  g.fill({ color: m.fill, alpha: 0.92 })

  // 1px white highlight on topmost edge only
  let topEdgeIdx = 0
  let topY = Infinity
  const n = snapped.length
  for (let i = 0; i < n; i++) {
    const p = snapped[i]!
    const q = snapped[(i + 1) % n]!
    const midY = (p.y + q.y) / 2
    if (midY < topY) {
      topY = midY
      topEdgeIdx = i
    }
  }
  const tp = snapped[topEdgeIdx]!
  const tq = snapped[(topEdgeIdx + 1) % n]!
  g.moveTo(tp.x, tp.y).lineTo(tq.x, tq.y)
  g.stroke({ width: 1, color: 0xFFFFFF, alpha: 0.9 })
}

// ─── glass ─────────────────────────────────────────────────────────
function drawGlass(g: Graphics, c: Collider): void {
  const m = activePalette().materials.glass
  const verts = c.vertices

  // Primed glass (touched): dimmer fill to indicate one-way state.
  const fillAlpha = c.touched ? 0.22 : 0.4
  pathPolygon(g, verts)
  g.fill({ color: m.fill, alpha: fillAlpha })

  // Bright 1px edge lines + rim ghost offset + random flicker
  const n = verts.length
  for (let i = 0; i < n; i++) {
    const p = verts[i]!
    const q = verts[(i + 1) % n]!
    const nrm = edgeNormal(p.x, p.y, q.x, q.y)

    // 1-frame flicker: ~3% chance per edge per frame
    const flickered = Math.random() < 0.03
    if (!flickered) {
      const lit = nrm ? edgeLit(nrm.nx, nrm.ny) : true
      g.moveTo(p.x, p.y).lineTo(q.x, q.y)
      g.stroke({ width: 1, color: lit ? m.edge : m.shadow, alpha: lit ? 0.85 : 0.4 })
    }

    // Rim ghost — 1px outward offset at 15% opacity
    if (nrm && !flickered) {
      g.moveTo(p.x + nrm.nx, p.y + nrm.ny).lineTo(q.x + nrm.nx, q.y + nrm.ny)
      g.stroke({ width: 1, color: m.edge, alpha: 0.15 })
    }
  }
}

// ─── bone ──────────────────────────────────────────────────────────
function drawBone(g: Graphics, c: Collider): void {
  const m = activePalette().materials.bone
  const verts = c.vertices

  pathPolygon(g, verts)
  g.fill({ color: m.fill })

  // Edge lighting — hard cutoff based on dot with light direction
  const n = verts.length
  for (let i = 0; i < n; i++) {
    const p = verts[i]!
    const q = verts[(i + 1) % n]!
    const nrm = edgeNormal(p.x, p.y, q.x, q.y)
    if (!nrm)
      continue
    const lit = edgeLit(nrm.nx, nrm.ny)
    g.moveTo(p.x, p.y).lineTo(q.x, q.y)
    g.stroke({ width: 1, color: lit ? m.edge : m.shadow, alpha: lit ? 0.9 : 0.5 })
  }

  // Damage scribbles — thin 1px random line segments inside polygon
  if (c.damage > 0) {
    const w = c.maxX - c.minX
    const h = c.maxY - c.minY
    if (w >= 6 && h >= 6) {
      const count = c.damage * 4
      for (let i = 0; i < count; i++) {
        const seed = idHash(c.id, i)
        let x0 = c.minX + 2 + ((seed >>> 0) % Math.max(1, Math.floor(w - 4)))
        let y0 = c.minY + 2 + ((seed >>> 8) % Math.max(1, Math.floor(h - 4)))
        let x1 = x0 + ((seed >>> 16) % 7) - 3
        let y1 = y0 + ((seed >>> 24) % 7) - 3

            g.moveTo(x0, y0).lineTo(x1, y1)
        g.stroke({ width: 1, color: m.shadow, alpha: 0.7 })
      }
    }
  }
}

// ─── resonant ──────────────────────────────────────────────────────
function drawResonant(g: Graphics, c: Collider): void {
  const m = activePalette().materials.resonant
  const verts = c.vertices

  pathPolygon(g, verts)
  g.fill({ color: m.fill })

  // Interior diagonal stripes (45°, 6px spacing, 1px wide, 20% opacity)
  // Clipped by drawing only within AABB — close enough for the effect.
  const stripeSpacing = 6
  const startOff = c.minX + c.minY
  const endOff = c.maxX + c.maxY
  for (let d = Math.floor(startOff / stripeSpacing) * stripeSpacing; d < endOff; d += stripeSpacing) {
    // Diagonal line: x + y = d, clipped to AABB
    const x0 = Math.max(c.minX, d - c.maxY)
    const y0 = d - x0
    const x1 = Math.min(c.maxX, d - c.minY)
    const y1 = d - x1
    if (x0 < x1) {
      g.moveTo(x0, y0).lineTo(x1, y1)
      g.stroke({ width: 1, color: m.highlight, alpha: 0.2 })
    }
  }

  // Edge glow — render edge highlight twice: once normal, once offset by
  // velocity direction for motion lag ghost
  const n = verts.length
  for (let i = 0; i < n; i++) {
    const p = verts[i]!
    const q = verts[(i + 1) % n]!
    const nrm = edgeNormal(p.x, p.y, q.x, q.y)
    if (!nrm)
      continue
    const lit = edgeLit(nrm.nx, nrm.ny)
    const col = lit ? m.highlight : m.shadow
    const alp = lit ? 0.9 : 0.4

    // Primary edge
    g.moveTo(p.x, p.y).lineTo(q.x, q.y)
    g.stroke({ width: 1, color: col, alpha: alp })

    // Motion lag ghost — offset by 1px in edge tangent direction
    if (lit) {
      const dx = q.x - p.x
      const dy = q.y - p.y
      const len = Math.hypot(dx, dy)
      if (len > 0) {
        const tx = dx / len
        const ty = dy / len
        g.moveTo(p.x + tx, p.y + ty).lineTo(q.x + tx, q.y + ty)
        g.stroke({ width: 1, color: col, alpha: alp * 0.5 })
      }
    }
  }
}

// ─── soft ──────────────────────────────────────────────────────────
function drawSoft(g: Graphics, c: Collider): void {
  const m = activePalette().materials.soft
  const verts = c.vertices

  pathPolygon(g, verts)
  g.fill({ color: m.fill })

  // 3px inset shadow polygon — shrink all vertices inward by 3px
  if (verts.length >= 3) {
    const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length
    const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length
    const inset = verts.map((v) => {
      const dx = v.x - cx
      const dy = v.y - cy
      const d = Math.hypot(dx, dy)
      if (d < 1)
        return { x: cx, y: cy }
      const scale = Math.max(0, d - 3) / d
      return { x: cx + dx * scale, y: cy + dy * scale }
    })
    pathPolygon(g, inset)
    g.fill({ color: m.shadow, alpha: 0.6 })
  }

  // Edge lighting — hard cutoff
  const n = verts.length
  for (let i = 0; i < n; i++) {
    const p = verts[i]!
    const q = verts[(i + 1) % n]!
    const nrm = edgeNormal(p.x, p.y, q.x, q.y)
    if (!nrm)
      continue
    const lit = edgeLit(nrm.nx, nrm.ny)
    g.moveTo(p.x, p.y).lineTo(q.x, q.y)
    g.stroke({ width: 1, color: lit ? m.highlight : m.shadow, alpha: lit ? 0.55 : 0.3 })
  }
}

// ─── bone_fragile ─────────────────────────────────────────────────
function drawBoneFragile(g: Graphics, c: Collider): void {
  const m = activePalette().materials.bone_fragile
  const ratio = Math.min(1, c.contactTime / CONFIG.BONE_FRAGILE_COLLAPSE_TIME)

  // Shake increases with timer ratio
  const shakeAmp = ratio > 0.5 ? (ratio - 0.5) * 3 : 0
  const shakeX = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp : 0
  const shakeY = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp * 0.5 : 0

  const rawVerts = c.vertices
  const verts = rawVerts.map(v => ({ x: v.x + shakeX, y: v.y + shakeY }))

  // Darken fill as timer progresses
  const fillAlpha = 1.0 - ratio * 0.3
  pathPolygon(g, verts)
  g.fill({ color: m.fill, alpha: fillAlpha })

  // Edge lighting (same as bone)
  const n = verts.length
  for (let i = 0; i < n; i++) {
    const p = verts[i]!
    const q = verts[(i + 1) % n]!
    const nrm = edgeNormal(p.x, p.y, q.x, q.y)
    if (!nrm)
      continue
    const lit = edgeLit(nrm.nx, nrm.ny)
    g.moveTo(p.x, p.y).lineTo(q.x, q.y)
    g.stroke({ width: 1, color: lit ? m.edge : m.shadow, alpha: (lit ? 0.9 : 0.5) * fillAlpha })
  }

  // Crack scribbles scale with timer
  const cracks = Math.floor(ratio * 4)
  if (cracks > 0) {
    const w = c.maxX - c.minX
    const h = c.maxY - c.minY
    if (w >= 6 && h >= 6) {
      const count = cracks * 3
      for (let i = 0; i < count; i++) {
        const seed = idHash(c.id, i + 500)
        const x0 = c.minX + 2 + ((seed >>> 0) % Math.max(1, Math.floor(w - 4))) + shakeX
        const y0 = c.minY + 2 + ((seed >>> 8) % Math.max(1, Math.floor(h - 4))) + shakeY
        const x1 = x0 + ((seed >>> 16) % 7) - 3
        const y1 = y0 + ((seed >>> 24) % 7) - 3
        g.moveTo(x0, y0).lineTo(x1, y1)
        g.stroke({ width: 1, color: m.shadow, alpha: 0.6 + ratio * 0.3 })
      }
    }
  }
}

// ─── draw dispatch ─────────────────────────────────────────────────
function drawCollider(g: Graphics, c: Collider): void {
  if (!c.alive)
    return
  switch (c.material) {
    case 'shard':
      drawShard(g, c)
      return
    case 'glass':
      drawGlass(g, c)
      return
    case 'bone':
      drawBone(g, c)
      return
    case 'bone_fragile':
      drawBoneFragile(g, c)
      return
    case 'resonant':
      drawResonant(g, c)
      return
    case 'soft':
      drawSoft(g, c)
  }
}

export function drawColliders(g: Graphics, level: Level): void {
  g.clear()
  for (const c of level.colliders)
    drawCollider(g, c)
}

export function getFrameCount(): number {
  return _frameCount
}

// Hash includes shard expiries so the renderer repaints as shards expire.
export function hashColliders(level: Level): number {
  let h = 0x811C9DC5
  for (const c of level.colliders) {
    let v = c.vertices.length * 31 + c.damage * 7 + (c.alive ? 1 : 0) + Math.floor(c.contactTime * 5) + (c.touched ? 13 : 0)
    v = (v * 31 + c.id) >>> 0
    if (c.expiresAt !== null)
      v ^= Math.floor(c.expiresAt * 10) >>> 0
    h ^= v
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}
