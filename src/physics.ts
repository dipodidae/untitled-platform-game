import type { Level } from './world/level'
import type { Player } from './player'
import { CONFIG } from './config'
import { isHazard, isSolid, MAT_DIRT } from './materials'

const TS = CONFIG.TILE_SIZE

// Sample the raw material id. Out-of-bounds reads as dirt (any solid would do
// — we just can't let the player escape the world).
export function tileAt(level: Level, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= level.width || ty >= level.height)
    return MAT_DIRT
  const row = level.tiles[ty]
  return row?.[tx] ?? MAT_DIRT
}

export function isSolidAt(level: Level, tx: number, ty: number): boolean {
  return isSolid(tileAt(level, tx, ty))
}

// Does the AABB {x,y,w,h} overlap any solid tile?
export function rectOverlapsSolid(
  level: Level,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  const tx0 = Math.floor(x / TS)
  const ty0 = Math.floor(y / TS)
  const tx1 = Math.floor((x + w - 1) / TS)
  const ty1 = Math.floor((y + h - 1) / TS)
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isSolidAt(level, tx, ty))
        return true
    }
  }
  return false
}

// Same scan, but for hazards. Hazards are pass-through (non-solid), so the
// player's AABB passes into them during a normal move — we just kill on
// contact. Called once per tick by the player update.
export function rectOverlapsHazard(
  level: Level,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  const tx0 = Math.floor(x / TS)
  const ty0 = Math.floor(y / TS)
  const tx1 = Math.floor((x + w - 1) / TS)
  const ty1 = Math.floor((y + h - 1) / TS)
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isHazard(tileAt(level, tx, ty)))
        return true
    }
  }
  return false
}

// Axis-separated AABB vs. tile grid.
// Resolving X then Y avoids the classic "stuck on tile corner seam" bug that
// single-pass swept collisions produce on axis-aligned grids.
//
// We set p.touchingWall when an X collision stopped horizontal motion — the
// pressure system reads this to award "pressed into a wall while moving" gain.
export function moveAndCollideX(p: Player, level: Level, dt: number): void {
  p.touchingWall = false
  p.x += p.vx * dt
  if (!rectOverlapsSolid(level, p.x, p.y, p.w, p.h))
    return

  const ty0 = Math.floor(p.y / TS)
  const ty1 = Math.floor((p.y + p.h - 1) / TS)
  const tx0 = Math.floor(p.x / TS)
  const tx1 = Math.floor((p.x + p.w - 1) / TS)

  if (p.vx > 0) {
    // Moving right: snap right edge to the left side of the first solid column.
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        if (isSolidAt(level, tx, ty)) {
          p.x = tx * TS - p.w
          p.vx = 0
          p.touchingWall = true
          return
        }
      }
    }
  }
  else if (p.vx < 0) {
    // Moving left: snap left edge to the right side of the first solid column.
    for (let tx = tx1; tx >= tx0; tx--) {
      for (let ty = ty0; ty <= ty1; ty++) {
        if (isSolidAt(level, tx, ty)) {
          p.x = (tx + 1) * TS
          p.vx = 0
          p.touchingWall = true
          return
        }
      }
    }
  }
}

export function moveAndCollideY(p: Player, level: Level, dt: number): void {
  p.y += p.vy * dt
  p.grounded = false
  if (!rectOverlapsSolid(level, p.x, p.y, p.w, p.h))
    return

  const tx0 = Math.floor(p.x / TS)
  const tx1 = Math.floor((p.x + p.w - 1) / TS)
  const ty0 = Math.floor(p.y / TS)
  const ty1 = Math.floor((p.y + p.h - 1) / TS)

  if (p.vy > 0) {
    // Falling: land on top of the first solid row.
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (isSolidAt(level, tx, ty)) {
          p.y = ty * TS - p.h
          p.vy = 0
          p.grounded = true
          return
        }
      }
    }
  }
  else if (p.vy < 0) {
    // Rising: bonk head on the first solid row scanned from the bottom up.
    for (let ty = ty1; ty >= ty0; ty--) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (isSolidAt(level, tx, ty)) {
          p.y = (ty + 1) * TS
          p.vy = 0
          return
        }
      }
    }
  }
}

// Corner correction — if a small head-clip would kill the jump, nudge past it.
// Call AFTER X resolution, BEFORE Y resolution. We look at where the head
// *would* end up post-Y-move; if it overlaps, try sliding 1..N px either way.
export function tryCornerCorrection(p: Player, level: Level, dt: number): void {
  if (p.vy >= 0)
    return
  const newY = p.y + p.vy * dt
  if (!rectOverlapsSolid(level, p.x, newY, p.w, p.h))
    return
  for (let n = 1; n <= CONFIG.CORNER_NUDGE; n++) {
    if (!rectOverlapsSolid(level, p.x + n, newY, p.w, p.h)) {
      p.x += n
      return
    }
    if (!rectOverlapsSolid(level, p.x - n, newY, p.w, p.h)) {
      p.x -= n
      return
    }
  }
}
