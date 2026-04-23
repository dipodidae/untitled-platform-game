// Vignette + sky gradient. Post-pass, screen-fixed, drawn after the
// world. Sky gradient is the bottom layer (drawn first); vignette is a
// radial darken over the whole frame.
//
// Both are cheap static Graphics primitives — redrawn only on resize.

import type { Graphics } from 'pixi.js'
import { CONFIG } from '../config'
import { PALETTE } from './palette'

// A 12-step vertical gradient is enough for the scale we render at —
// banding isn't visible against the subsequent world + vignette layers.
export function drawSky(g: Graphics, width: number, height: number): void {
  g.clear()
  const steps = 12
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const r = lerp(fetchByte(PALETTE.skyTop, 16), fetchByte(PALETTE.skyBottom, 16), t)
    const gg = lerp(fetchByte(PALETTE.skyTop, 8), fetchByte(PALETTE.skyBottom, 8), t)
    const b = lerp(fetchByte(PALETTE.skyTop, 0), fetchByte(PALETTE.skyBottom, 0), t)
    const color = (r << 16) | (gg << 8) | b
    const y = Math.floor((i / steps) * height)
    const h = Math.ceil(height / steps) + 1
    g.rect(0, y, width, h).fill(color)
  }
}

// Radial-ish vignette faked with a series of nested rectangles at
// increasing darkness toward the frame edge. Cheap, no shader needed.
export function drawVignette(g: Graphics, width: number, height: number): void {
  g.clear()
  const strength = CONFIG.VIGNETTE_STRENGTH
  if (strength <= 0)
    return
  const cx = width / 2
  const cy = height / 2
  const diag = Math.hypot(cx, cy)
  const inner = diag * CONFIG.VIGNETTE_INNER
  const rings = 14
  for (let i = 0; i < rings; i++) {
    const t = (i + 1) / rings
    const r = inner + (diag - inner) * t
    // Draw the complement: a frame-sized rect with a hole of radius r.
    // Approximated with 4 thick strips aligned to the ring.
    const depth = Math.max(0, t * t) * strength * 0.25
    if (depth < 0.005)
      continue
    // Four strips around the center hole.
    const holeW = Math.min(width, r * 2)
    const holeH = Math.min(height, r * 2)
    const holeX = cx - holeW / 2
    const holeY = cy - holeH / 2
    g.rect(0, 0, width, holeY).fill({ color: PALETTE.vignette, alpha: depth })
    g.rect(0, holeY + holeH, width, height - (holeY + holeH)).fill({ color: PALETTE.vignette, alpha: depth })
    g.rect(0, holeY, holeX, holeH).fill({ color: PALETTE.vignette, alpha: depth })
    g.rect(holeX + holeW, holeY, width - (holeX + holeW), holeH).fill({ color: PALETTE.vignette, alpha: depth })
  }
}

function fetchByte(color: number, shift: number): number {
  return (color >> shift) & 0xFF
}
function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}
