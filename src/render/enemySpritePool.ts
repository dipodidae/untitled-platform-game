// Lightweight sprite pool for enemy rendering. Instead of drawing shapes via
// Graphics, we position pre-created Sprite instances from loaded textures.
// Each pool manages sprites for one category; sprites are shown/hidden and
// repositioned each frame with procedural animation applied.

import type { EnemyKind } from './enemyAssets'
import { Container, Sprite } from 'pixi.js'
import { computeAnim } from './enemyAnim'
import { getEnemyTexture } from './enemyAssets'

export interface EnemySpritePool {
  readonly container: Container
  sprites: Sprite[]
}

export function createEnemySpritePool(): EnemySpritePool {
  return { container: new Container(), sprites: [] }
}

// Ensure the pool has at least `count` sprites.
function ensureSprites(pool: EnemySpritePool, count: number): void {
  while (pool.sprites.length < count) {
    const s = new Sprite()
    s.anchor.set(0.5)
    s.visible = false
    pool.container.addChild(s)
    pool.sprites.push(s)
  }
}

// Position a sprite to cover an AABB with procedural animation.
// `time` drives the animation clock; `seed` offsets per-instance so
// enemies of the same kind don't animate in lockstep.
export function positionEnemySprite(
  pool: EnemySpritePool,
  index: number,
  kind: EnemyKind,
  x: number,
  y: number,
  w: number,
  h: number,
  alive: boolean,
  flash: boolean,
  alpha = 1,
  flipX = false,
  time = 0,
  seed = 0,
): void {
  ensureSprites(pool, index + 1)
  const s = pool.sprites[index]!
  if (!alive) {
    s.visible = false
    return
  }

  // Compute procedural animation
  const anim = computeAnim(kind, time, seed)

  // Pick frame A or B texture
  const tex = getEnemyTexture(kind, anim.useFrameB)
  if (s.texture !== tex) {
    s.texture = tex
  }

  s.visible = true
  s.x = x + w / 2
  s.y = y + h / 2 + anim.offsetY

  // Scale sprite well beyond the AABB so the art reads clearly — hitboxes
  // are small game-world units while textures are 128×128.
  const SPRITE_OVERSHOOT = 3.0
  if (tex.width > 0 && tex.height > 0) {
    const baseScaleX = (w / tex.width) * SPRITE_OVERSHOOT
    const baseScaleY = (h / tex.height) * SPRITE_OVERSHOOT
    s.scale.x = (flipX ? -1 : 1) * baseScaleX * anim.scaleXMul
    s.scale.y = baseScaleY * anim.scaleYMul
  }

  s.rotation = anim.rotation
  s.skew.x = anim.skewX
  s.alpha = alpha * anim.alphaMul
  s.tint = flash ? 0xFF4A4A : 0xFFFFFF
}

// Hide all sprites beyond `count` (for when enemy arrays shrink).
export function hideExcessSprites(pool: EnemySpritePool, fromIndex: number): void {
  for (let i = fromIndex; i < pool.sprites.length; i++) {
    pool.sprites[i]!.visible = false
  }
}
