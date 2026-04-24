// Prowler rendering — angular, cold, opposite of the warm rounded player.
// Diamond-ish silhouette with instability-driven jitter and stun flash.

import type { Graphics } from 'pixi.js'
import type { Prowler } from '../enemies/prowler'

// Cold palette — desaturated blue-violet
const COL_OUTER = 0x1A1030
const COL_MID = 0x302850
const COL_CORE = 0x5040A0
const COL_STUN = 0xFFFFFF
const COL_INSTAB_HIGH = 0x8060C0

// Angular diamond vertices (14×14 body, drawn around 0,0)
const BASE: { x: number, y: number }[] = [
  { x: 0, y: -7 }, // top
  { x: 5, y: -3 },
  { x: 7, y: 0 }, // right
  { x: 5, y: 4 },
  { x: 2, y: 7 }, // bottom-right
  { x: -2, y: 7 }, // bottom-left
  { x: -5, y: 4 },
  { x: -7, y: 0 }, // left
  { x: -5, y: -3 },
]

function pathPoly(g: Graphics, verts: { x: number, y: number }[]): void {
  if (verts.length < 3)
    return
  const flat: number[] = []
  for (const v of verts) flat.push(v.x, v.y)
  g.poly(flat)
}

function insetVerts(
  verts: { x: number, y: number }[],
  amount: number,
): { x: number, y: number }[] {
  // Simple proportional inset toward center
  return verts.map(v => ({
    x: v.x * (1 - amount / 7),
    y: v.y * (1 - amount / 7),
  }))
}

export function drawProwler(
  g: Graphics,
  prowler: Prowler,
  time: number,
): void {
  g.clear()

  if (!prowler.alive)
    return

  const inst = prowler.instability

  // Build jittered vertices
  const verts = BASE.map((v) => {
    let jx = 0
    let jy = 0
    if (inst > 0.3) {
      const amp = inst * 1.5
      jx = (Math.random() - 0.5) * amp
      jy = (Math.random() - 0.5) * amp
    }
    return { x: v.x + jx, y: v.y + jy }
  })

  // Stun flash — alternate between white flash and normal
  const stunFlash = prowler.stunTimer > 0 && Math.floor(time * 20) % 2 === 0

  // Outer body
  pathPoly(g, verts)
  g.fill({ color: stunFlash ? COL_STUN : COL_OUTER, alpha: stunFlash ? 0.8 : 1.0 })

  // Mid layer (inset 2px)
  const midVerts = insetVerts(verts, 2)
  pathPoly(g, midVerts)
  g.fill({ color: inst > 0.6 ? COL_INSTAB_HIGH : COL_MID })

  // Core (inset 4px)
  const coreVerts = insetVerts(verts, 4)
  pathPoly(g, coreVerts)
  g.fill({ color: COL_CORE, alpha: 0.7 + inst * 0.3 })

  // Eye-slit (two small rects offset by facing)
  const eyeOff = prowler.facing * 1.5
  g.rect(eyeOff - 1.5, -2, 3, 1).fill({ color: COL_STUN, alpha: 0.9 })
}
