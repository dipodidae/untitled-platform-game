// Ambient wind — slow drifting motes across the world. Reveals erosion
// without touching gameplay. Motes respect the camera so they "belong to
// the world" rather than the screen.
//
// Purely aesthetic: no collision, no effect on instability, no effect on
// anything but the eye.

import type { Graphics } from 'pixi.js'
import type { Camera } from './camera'
import { CONFIG } from '../config'
import { PALETTE } from './palette'

interface Mote {
  x: number
  y: number
  vx: number
  vy: number
  alpha: number
  size: number
  seed: number
}

export interface WindState {
  motes: Mote[]
  elapsed: number
  seededRng: () => number
}

// Fast xorshift seeded from CONFIG.PARALLAX_SEED so wind looks consistent
// run-to-run for screenshots.
function makeRng(seed: number): () => number {
  let s = seed | 0x1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    // Convert to [0, 1)
    return ((s >>> 0) % 1_000_003) / 1_000_003
  }
}

export function createWindState(): WindState {
  return {
    motes: [],
    elapsed: 0,
    seededRng: makeRng(CONFIG.PARALLAX_SEED ^ 0xA17B),
  }
}

function respawnMote(m: Mote, rng: () => number, level: { worldWidth: number, worldHeight: number }): void {
  m.x = level.worldWidth * rng()
  m.y = level.worldHeight * rng()
  m.vx = CONFIG.WIND_X + (rng() * 2 - 1) * CONFIG.WIND_VARIANCE
  m.vy = (rng() * 2 - 1) * 3 // tiny vertical noise; mostly horizontal
  m.alpha = 0.08 + rng() * CONFIG.WIND_MOTE_MAX_ALPHA
  m.size = 1 + Math.floor(rng() * 2) // 1 or 2 px squares
  m.seed = rng()
}

// Advance wind at render cadence. Deterministic per-mote noise so motes
// don't twitch on frame-time jitter.
export function tickWind(
  wind: WindState,
  dt: number,
  level: { worldWidth: number, worldHeight: number },
): void {
  wind.elapsed += dt

  // Lazily fill the mote pool on first tick once we know world size.
  while (wind.motes.length < CONFIG.WIND_MOTE_COUNT) {
    const m: Mote = { x: 0, y: 0, vx: 0, vy: 0, alpha: 0, size: 1, seed: 0 }
    respawnMote(m, wind.seededRng, level)
    wind.motes.push(m)
  }

  // Slow sinusoidal gust modulates every mote uniformly.
  const gust = Math.sin(wind.elapsed * CONFIG.WIND_GUST_HZ * Math.PI * 2) * CONFIG.WIND_GUST_AMPLITUDE

  for (const m of wind.motes) {
    m.x += (m.vx + gust) * dt
    m.y += m.vy * dt
    // Wrap around world with a margin so motes re-enter from either side.
    if (m.x < -8)
      m.x = level.worldWidth + 8
    else if (m.x > level.worldWidth + 8)
      m.x = -8
    if (m.y < -8)
      m.y = level.worldHeight + 8
    else if (m.y > level.worldHeight + 8)
      m.y = -8
  }
}

export function drawWind(g: Graphics, wind: WindState, camera: Camera): void {
  g.clear()
  const color = PALETTE.windMote
  for (const m of wind.motes) {
    // Cull motes off-screen (cheap — motes are tiny).
    const sx = m.x - camera.x
    const sy = m.y - camera.y
    if (sx < -8 || sy < -8 || sx > CONFIG.LOGICAL_WIDTH + 8 || sy > CONFIG.LOGICAL_HEIGHT + 8)
      continue
    g.rect(m.x, m.y, m.size, m.size).fill({ color, alpha: m.alpha })
  }
}
