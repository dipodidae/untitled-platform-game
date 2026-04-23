import type { Level } from './world/level'
import type { MaterialId } from './materials'
import { CONFIG } from './config'
import {
  isDestructible,
  isReflective,
  isSolid,
  MAT_DIRT,
  MAT_EMPTY,
  MAT_STONE,

} from './materials'
import { tileAt } from './physics'

const TS = CONFIG.TILE_SIZE

// Rupture shape: a rotated ellipse biased along the player's velocity
// vector at the moment of fracture. rx is the MAJOR axis (along velocity),
// ry is the MINOR axis (perpendicular).
export interface RuptureShape {
  readonly rx: number
  readonly ry: number
  readonly angle: number
}

export interface TileHit {
  readonly tx: number
  readonly ty: number
  readonly prevMat: MaterialId
  readonly newMat: MaterialId
  readonly destroyed: boolean
  readonly cracked: boolean
}

export interface RuptureResult {
  readonly center: { readonly x: number, readonly y: number }
  readonly shape: RuptureShape
  readonly affectedTiles: readonly TileHit[]
  readonly reflection: {
    readonly active: boolean
    readonly dir: { readonly x: number, readonly y: number }
  }
  readonly impulse: { readonly x: number, readonly y: number }
}

// Derive the rupture ellipse from the fracture-instant velocity.
// At |v| = 0 we produce a symmetric circle of RUPTURE_BASE_RADIUS.
// At |v| ≥ RUPTURE_SPEED_NORM we reach (MAJOR_MAX × MINOR_MIN).
export function computeRuptureShape(vx: number, vy: number): RuptureShape {
  const speed = Math.hypot(vx, vy)
  const t
    = speed <= 0 ? 0 : Math.min(1, speed / CONFIG.RUPTURE_SPEED_NORM)
  const rx = CONFIG.RUPTURE_BASE_RADIUS + t * (CONFIG.RUPTURE_MAJOR_MAX - CONFIG.RUPTURE_BASE_RADIUS)
  const ry = CONFIG.RUPTURE_BASE_RADIUS + t * (CONFIG.RUPTURE_MINOR_MIN - CONFIG.RUPTURE_BASE_RADIUS)
  const angle = speed > 0.0001 ? Math.atan2(vy, vx) : 0
  return { rx, ry, angle }
}

// Is the point (dx, dy) (local offset from rupture center) inside the
// rotated ellipse? Axis-align by rotating by -angle, then canonical ellipse.
export function pointInRupture(
  dx: number,
  dy: number,
  shape: RuptureShape,
): boolean {
  const c = Math.cos(-shape.angle)
  const s = Math.sin(-shape.angle)
  const lx = dx * c - dy * s
  const ly = dx * s + dy * c
  const a = lx / shape.rx
  const b = ly / shape.ry
  return a * a + b * b <= 1
}

// Compute the rupture and apply its effects. Mutates level tiles + damage
// grid, then returns a structured description for the renderer / FX to draw.
//
// The player's velocity at call time determines BOTH the shape and the
// self-impulse direction. We do *not* mutate the player here — the caller
// (player.ts) consumes `result.impulse` so it stays in control of its own vy.
export function performRupture(
  level: Level,
  px: number,
  py: number,
  vx: number,
  vy: number,
): RuptureResult {
  const shape = computeRuptureShape(vx, vy)
  const cx = px
  const cy = py

  const affected: TileHit[] = []
  // Accumulate an "away from steel" vector from every steel tile the rupture
  // touches. Longer cluster of steel → stronger reflection kick.
  let steelAwayX = 0
  let steelAwayY = 0
  let steelTouched = 0
  // Also track the surrounding-terrain centroid — used for impulse when
  // velocity is too low to give a meaningful direction (ground-fracture
  // from a standstill needs to push up off the ground).
  let terrainTowardX = 0
  let terrainTowardY = 0
  let terrainCount = 0

  const maxR = Math.max(shape.rx, shape.ry)
  const tx0 = Math.floor((cx - maxR) / TS)
  const tx1 = Math.floor((cx + maxR) / TS)
  const ty0 = Math.floor((cy - maxR) / TS)
  const ty1 = Math.floor((cy + maxR) / TS)

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const tileCx = tx * TS + TS / 2
      const tileCy = ty * TS + TS / 2
      if (!pointInRupture(tileCx - cx, tileCy - cy, shape))
        continue

      const prevMat = tileAt(level, tx, ty) as MaterialId
      if (prevMat === MAT_EMPTY)
        continue

      if (isSolid(prevMat)) {
        terrainTowardX += tileCx - cx
        terrainTowardY += tileCy - cy
        terrainCount++
      }

      if (isReflective(prevMat)) {
        steelAwayX += cx - tileCx
        steelAwayY += cy - tileCy
        steelTouched++
        continue // steel isn't damaged
      }

      if (!isDestructible(prevMat))
        continue // hazard etc. — untouched

      if (prevMat === MAT_DIRT) {
        writeTile(level, tx, ty, MAT_EMPTY)
        affected.push({
          tx,
          ty,
          prevMat,
          newMat: MAT_EMPTY,
          destroyed: true,
          cracked: false,
        })
      }
      else if (prevMat === MAT_STONE) {
        const dRow = level.damage[ty]
        const prevDmg = dRow?.[tx] ?? 0
        const nextDmg = prevDmg + 1
        if (nextDmg >= CONFIG.STONE_HITS) {
          writeTile(level, tx, ty, MAT_EMPTY)
          if (dRow)
            dRow[tx] = 0
          affected.push({
            tx,
            ty,
            prevMat,
            newMat: MAT_EMPTY,
            destroyed: true,
            cracked: false,
          })
        }
        else {
          if (dRow)
            dRow[tx] = nextDmg
          affected.push({
            tx,
            ty,
            prevMat,
            newMat: MAT_STONE,
            destroyed: false,
            cracked: true,
          })
        }
      }
    }
  }

  // ─── self-impulse ────────────────────────────────────────────
  const speed = Math.hypot(vx, vy)
  let impulseX = 0
  let impulseY = 0
  if (speed >= CONFIG.RUPTURE_MIN_SPEED_FOR_V_DIR) {
    // Dominant direction = velocity direction; launch opposite.
    impulseX = (-vx / speed) * CONFIG.RUPTURE_IMPULSE
    impulseY = (-vy / speed) * CONFIG.RUPTURE_IMPULSE
  }
  else if (terrainCount > 0) {
    // Near-stationary fracture: push away from surrounding terrain mass.
    // TUNING: if stand-still ground pops feel under-powered, bump the y bias here.
    const tmag = Math.hypot(terrainTowardX, terrainTowardY)
    if (tmag > 0.0001) {
      impulseX = (-terrainTowardX / tmag) * CONFIG.RUPTURE_IMPULSE
      impulseY = (-terrainTowardY / tmag) * CONFIG.RUPTURE_IMPULSE
    }
    else {
      impulseY = -CONFIG.RUPTURE_IMPULSE // sandwiched; just pop up
    }
  }
  else {
    // Mid-air with no nearby terrain and basically no velocity — pop up.
    // TUNING: if this feels cheap, maybe zero the impulse instead.
    impulseY = -CONFIG.RUPTURE_IMPULSE
  }

  // Reflection bonus — adds impulse in the away-from-hard-surface direction.
  let reflectionActive = false
  let refDirX = 0
  let refDirY = 0
  if (steelTouched > 0) {
    const smag = Math.hypot(steelAwayX, steelAwayY)
    if (smag > 0.0001) {
      refDirX = steelAwayX / smag
      refDirY = steelAwayY / smag
      impulseX += refDirX * CONFIG.RUPTURE_STEEL_BONUS
      impulseY += refDirY * CONFIG.RUPTURE_STEEL_BONUS
      reflectionActive = true
    }
  }

  return {
    center: { x: cx, y: cy },
    shape,
    affectedTiles: affected,
    reflection: { active: reflectionActive, dir: { x: refDirX, y: refDirY } },
    impulse: { x: impulseX, y: impulseY },
  }
}

function writeTile(level: Level, tx: number, ty: number, mat: MaterialId): void {
  const row = level.tiles[ty]
  if (!row)
    return
  if (tx < 0 || tx >= level.width)
    return
  row[tx] = mat
}
