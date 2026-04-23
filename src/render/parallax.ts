// Two silhouette layers behind the world. Seeded so the broken horizon
// is deterministic — the same ruined skyline every load, because this is
// the world you're stuck in, not a procedural variety show.
//
// Layers move fractionally with the camera (factor < 1). Vertical parallax
// has reduced magnitude so falling feels cinematic without snapping the
// sky off-screen.

import { Container, Graphics } from 'pixi.js'
import { CONFIG } from '../config'
import { PALETTE } from './palette'

interface Layer {
  node: Graphics
  factor: number
  yFactor: number
  baseY: number
}

export interface ParallaxState {
  container: Container
  layers: Layer[]
}

// Seeded RNG (same xorshift pattern as wind).
function makeRng(seed: number): () => number {
  let s = seed | 0x1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1_000_003) / 1_000_003
  }
}

// Build a broken-horizon polyline across `width` px, drawn as a filled
// polygon so it reads as a solid silhouette cut-out.
function drawSilhouette(
  g: Graphics,
  color: number,
  width: number,
  baseY: number,
  amplitude: number,
  step: number,
  rng: () => number,
): void {
  g.clear()
  const points: number[] = []
  points.push(-20, baseY + amplitude + 40) // bottom-left anchor off-screen
  let x = -10
  while (x < width + 20) {
    const h = rng() * amplitude
    // Jagged: each x gets a slight vertical spike, occasionally a tall one
    // to suggest broken towers / distant ruins.
    const spike = rng() < 0.12 ? amplitude * 0.6 : 0
    points.push(x, baseY - h - spike)
    x += step * (0.7 + rng() * 0.7)
  }
  points.push(width + 20, baseY + amplitude + 40) // bottom-right anchor
  g.poly(points).fill({ color })
}

export function createParallax(
  worldWidth: number,
  worldHeight: number,
): ParallaxState {
  const container = new Container()
  const rng = makeRng(CONFIG.PARALLAX_SEED)

  const far = new Graphics()
  drawSilhouette(
    far,
    PALETTE.parallaxFar,
    CONFIG.LOGICAL_WIDTH * 2,
    CONFIG.LOGICAL_HEIGHT * 0.72,
    32,
    14,
    rng,
  )
  container.addChild(far)

  const near = new Graphics()
  drawSilhouette(
    near,
    PALETTE.parallaxNear,
    CONFIG.LOGICAL_WIDTH * 2,
    CONFIG.LOGICAL_HEIGHT * 0.84,
    22,
    10,
    rng,
  )
  container.addChild(near)

  // Reference worldWidth/Height for future layer extent; keeps the
  // silhouette wide enough that parallax never reveals the edge.
  void worldWidth
  void worldHeight

  return {
    container,
    layers: [
      { node: far, factor: 0.12, yFactor: 0.18, baseY: 0 },
      { node: near, factor: 0.30, yFactor: 0.28, baseY: 0 },
    ],
  }
}

// Update each layer's position from the camera. yFactor < 1 means the
// layer drifts less than the camera — a tall jump only slightly pans the
// sky, which feels cinematic.
export function updateParallax(state: ParallaxState, cameraX: number, cameraY: number): void {
  for (const l of state.layers) {
    l.node.x = -cameraX * l.factor
    l.node.y = -cameraY * l.yFactor
  }
}
