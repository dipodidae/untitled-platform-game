// Cosmetic renderer — draws non-colliding decoration behind and (optionally)
// in front of the gameplay plane. All cosmetics are purely visual; they never
// interact with physics, enemies, or player.
//
// Scene graph insertion:
//   bgContainer:  parallax sprites (replace procedural silhouettes when present)
//   worldContainer: prop sprites (behind wind, behind colliders)

import type { Level } from '../world/level'
import type { CosmeticData, PropDef } from './cosmeticAssets'
import { Container, Sprite, TilingSprite } from 'pixi.js'
import { CONFIG } from '../config'

export interface CosmeticState {
  parallaxContainer: Container
  parallaxSprites: { sprite: TilingSprite | Sprite, depth: number, yDepth: number }[]
  propContainer: Container
  propSprites: Sprite[]
}

// Seeded RNG matching parallax.ts style
function makeRng(seed: number): () => number {
  let s = seed | 0x1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1_000_003) / 1_000_003
  }
}

export function createCosmeticState(): CosmeticState {
  return {
    parallaxContainer: new Container(),
    parallaxSprites: [],
    propContainer: new Container(),
    propSprites: [],
  }
}

export function populateCosmetics(
  state: CosmeticState,
  data: CosmeticData,
  level: Level,
): void {
  // Clear previous
  state.parallaxContainer.removeChildren()
  state.parallaxSprites.length = 0
  state.propContainer.removeChildren()
  state.propSprites.length = 0

  const screenW = CONFIG.LOGICAL_WIDTH
  const screenH = CONFIG.LOGICAL_HEIGHT

  // ─── Parallax layers ───────────────────────────────────────────
  for (const layer of data.parallax) {
    // Use TilingSprite so the layer repeats horizontally as the camera pans
    const tw = layer.texture.width
    const th = layer.texture.height
    if (tw === 0 || th === 0)
      continue

    // Scale the texture to fit screen height from baseY to bottom
    const visibleH = screenH * (1 - layer.baseY)
    const scale = visibleH / th
    const tiledW = screenW * 3 // wide enough to never see the edge

    const ts = new TilingSprite({
      texture: layer.texture,
      width: tiledW / scale,
      height: th,
    })
    ts.scale.set(scale)
    ts.y = screenH * layer.baseY

    state.parallaxContainer.addChild(ts)
    state.parallaxSprites.push({
      sprite: ts,
      depth: layer.depth,
      yDepth: layer.yDepth,
    })
  }

  // ─── Background props ──────────────────────────────────────────
  if (data.props.length > 0 && data.propDensity > 0) {
    const rng = makeRng(data.propScatterSeed)

    // Scatter props along the world width. Density = average props per 100px.
    const worldW = level.worldWidth
    const worldH = level.worldHeight
    const step = 100
    const count = Math.floor(worldW / step)

    for (let i = 0; i < count; i++) {
      if (rng() > data.propDensity)
        continue

      const propDef: PropDef = data.props[Math.floor(rng() * data.props.length)]!
      const s = new Sprite(propDef.texture)
      s.anchor.set(propDef.anchor[0], propDef.anchor[1])

      // Position: random x within this step, y near the bottom of the world
      // (props sit on or near the ground plane)
      s.x = i * step + rng() * step
      // Place props at worldHeight (ground level) with slight variation
      s.y = worldH - 2 + rng() * 4

      // Slight scale variation for organic feel
      const baseScale = 0.8 + rng() * 0.5
      s.scale.set(baseScale)

      // Desaturate slightly via alpha for depth
      s.alpha = 0.4 + rng() * 0.3

      state.propContainer.addChild(s)
      state.propSprites.push(s)
    }
  }
}

export function updateCosmeticParallax(
  state: CosmeticState,
  cameraX: number,
  cameraY: number,
): void {
  for (const layer of state.parallaxSprites) {
    if (layer.sprite instanceof TilingSprite) {
      // Offset the tiling position rather than moving the sprite
      layer.sprite.tilePosition.x = -cameraX * layer.depth
      layer.sprite.y = CONFIG.LOGICAL_HEIGHT * (1 - layer.sprite.height * layer.sprite.scale.y / CONFIG.LOGICAL_HEIGHT) - cameraY * layer.yDepth
    }
    else {
      layer.sprite.x = -cameraX * layer.depth
      layer.sprite.y += -cameraY * layer.yDepth
    }
  }
}

export function teardownCosmetics(state: CosmeticState): void {
  state.parallaxContainer.removeChildren()
  state.parallaxSprites.length = 0
  state.propContainer.removeChildren()
  state.propSprites.length = 0
}
