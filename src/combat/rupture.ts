import type { AffectedCollider } from '../world/destruction'
import type { Level } from '../world/level'
import { CONFIG } from '../config'
import { applyRupture } from '../world/destruction'

// Rupture shape: a rotated ellipse biased along the player's velocity
// vector at the moment of fracture. rx is the MAJOR axis (along velocity),
// ry is the MINOR axis (perpendicular).
export interface RuptureShape {
  readonly rx: number
  readonly ry: number
  readonly angle: number
}

export interface RuptureResult {
  readonly center: { readonly x: number, readonly y: number }
  readonly shape: RuptureShape
  readonly affected: readonly AffectedCollider[]
  readonly reflection: {
    readonly active: boolean
    readonly dir: { readonly x: number, readonly y: number }
  }
  readonly impulse: { readonly x: number, readonly y: number }
}

// Derive the rupture ellipse from the fracture-instant velocity.
export function computeRuptureShape(vx: number, vy: number): RuptureShape {
  const speed = Math.hypot(vx, vy)
  const t = speed <= 0 ? 0 : Math.min(1, speed / CONFIG.RUPTURE_SPEED_NORM)
  const rx = CONFIG.RUPTURE_BASE_RADIUS + t * (CONFIG.RUPTURE_MAJOR_MAX - CONFIG.RUPTURE_BASE_RADIUS)
  const ry = CONFIG.RUPTURE_BASE_RADIUS + t * (CONFIG.RUPTURE_MINOR_MIN - CONFIG.RUPTURE_BASE_RADIUS)
  const angle = speed > 0.0001 ? Math.atan2(vy, vx) : 0
  return { rx, ry, angle }
}

// Is the point (dx, dy) (local offset from rupture center) inside the
// rotated ellipse? Axis-align by rotating by -angle, then canonical ellipse.
export function pointInRupture(dx: number, dy: number, shape: RuptureShape): boolean {
  const c = Math.cos(-shape.angle)
  const s = Math.sin(-shape.angle)
  const lx = dx * c - dy * s
  const ly = dx * s + dy * c
  const a = lx / shape.rx
  const b = ly / shape.ry
  return a * a + b * b <= 1
}

// Compute the rupture and apply its effects. The caller (player.ts)
// consumes `result.impulse` — we don't mutate the player here so the
// player module stays in control of its own velocity.
export function performRupture(
  level: Level,
  px: number,
  py: number,
  vx: number,
  vy: number,
  now: number,
): RuptureResult {
  const shape = computeRuptureShape(vx, vy)
  const outcome = applyRupture(level, px, py, shape, now)

  // ─── self-impulse ────────────────────────────────────────────
  const speed = Math.hypot(vx, vy)
  let impulseX = 0
  let impulseY = 0
  if (speed >= CONFIG.RUPTURE_MIN_SPEED_FOR_V_DIR) {
    // Dominant direction = velocity direction; launch opposite.
    impulseX = (-vx / speed) * CONFIG.RUPTURE_IMPULSE
    impulseY = (-vy / speed) * CONFIG.RUPTURE_IMPULSE
  }
  else if (outcome.terrainCount > 0) {
    // Near-stationary fracture: push away from surrounding terrain mass.
    // TUNING: if stand-still ground pops feel under-powered, bump the y bias here.
    const tmag = Math.hypot(outcome.terrainToward.x, outcome.terrainToward.y)
    if (tmag > 0.0001) {
      impulseX = (-outcome.terrainToward.x / tmag) * CONFIG.RUPTURE_IMPULSE
      impulseY = (-outcome.terrainToward.y / tmag) * CONFIG.RUPTURE_IMPULSE
    }
    else {
      impulseY = -CONFIG.RUPTURE_IMPULSE
    }
  }
  else {
    // Mid-air with no nearby terrain and near-zero velocity — pop up.
    impulseY = -CONFIG.RUPTURE_IMPULSE
  }

  // Resonant reflection — adds impulse away from resonant surfaces, with
  // a chain multiplier: a rupture touching N resonant colliders launches
  // you (1 + (N-1) × RESONANT_CHAIN_MULT) as hard. Tells the "chained
  // resonant sent me way further than I expected" story.
  let reflectionActive = false
  let refDirX = 0
  let refDirY = 0
  if (outcome.reflectionCount > 0) {
    const smag = Math.hypot(outcome.reflection.x, outcome.reflection.y)
    if (smag > 0.0001) {
      refDirX = outcome.reflection.x / smag
      refDirY = outcome.reflection.y / smag
      const chainMult = 1 + (outcome.reflectionCount - 1) * CONFIG.RESONANT_CHAIN_MULT
      const bonus = CONFIG.RESONANT_IMPULSE_BONUS * chainMult
      impulseX += refDirX * bonus
      impulseY += refDirY * bonus
      reflectionActive = true
    }
  }

  return {
    center: { x: px, y: py },
    shape,
    affected: outcome.affected,
    reflection: { active: reflectionActive, dir: { x: refDirX, y: refDirY } },
    impulse: { x: impulseX, y: impulseY },
  }
}
