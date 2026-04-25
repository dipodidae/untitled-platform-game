import { CONFIG } from '../config'

// Instability: the thing failing inside you. 0..INSTABILITY_MAX. At max,
// cohesion is lost — you fracture.
//
// The rules live here; `player.ts` calls `updateInstability` once per
// fixed tick, passing a snapshot of what happened (jumped, landed with
// impact, pressed into a wall, etc). The table of gains/bleeds stays
// single-file so every line in the identity brief maps to one branch.
//
export interface InstabilityState {
  value: number // 0 .. CONFIG.INSTABILITY_MAX
}

// Per-tick inputs to the instability update.
export interface InstabilityTickInput {
  readonly grounded: boolean
  readonly vxAbs: number
  readonly jumpedThisTick: boolean
  readonly landedImpactVy: number // |vy| at the moment of landing; 0 if no landing
  readonly touchingWallMoving: boolean // pressed into a wall with input against it
  readonly iframes: boolean // post-fracture window: freeze all gains
}

export function createInstabilityState(): InstabilityState {
  return { value: 0 }
}

// Reset in place — same convention as the rest of respawn.
export function resetInstability(s: InstabilityState): void {
  s.value = 0
}

function invLerp01(v: number, lo: number, hi: number): number {
  if (hi <= lo)
    return v >= hi ? 1 : 0
  const t = (v - lo) / (hi - lo)
  return t < 0 ? 0 : t > 1 ? 1 : t
}

// External hook for any future one-shot gain.
export function addInstability(s: InstabilityState, amount: number): void {
  if (amount <= 0)
    return
  s.value = Math.min(CONFIG.INSTABILITY_MAX, s.value + amount)
}

// Per-tick update. Order: bleeds/gains only — no fracture, no containment.
export function updateInstability(
  s: InstabilityState,
  input: InstabilityTickInput,
  dt: number,
): void {
  // During iframes: skip all gain/bleed.
  if (input.iframes)
    return

  // ─── gains ────────────────────────────────────────────────────
  if (input.jumpedThisTick)
    addInstability(s, CONFIG.INSTABILITY_JUMP)

  if (input.landedImpactVy > CONFIG.INSTABILITY_LAND_MIN_VY) {
    const t = invLerp01(
      input.landedImpactVy,
      CONFIG.INSTABILITY_LAND_MIN_VY,
      CONFIG.MAX_FALL,
    )
    addInstability(s, t * CONFIG.INSTABILITY_LAND_MAX_GAIN)
  }

  if (input.touchingWallMoving)
    addInstability(s, CONFIG.INSTABILITY_WALL_PER_SEC * dt)

  if (input.grounded && input.vxAbs >= CONFIG.MAX_RUN * CONFIG.INSTABILITY_RUN_THRESHOLD)
    addInstability(s, CONFIG.INSTABILITY_RUN_PER_SEC * dt)

  // ─── bleeds ───────────────────────────────────────────────────
  if (input.grounded && input.vxAbs < CONFIG.INSTABILITY_IDLE_VX_MAX) {
    s.value = Math.max(0, s.value - CONFIG.INSTABILITY_IDLE_BLEED_PER_SEC * dt)
  }
  else if (!input.grounded) {
    s.value = Math.max(0, s.value - CONFIG.INSTABILITY_AIR_BLEED_PER_SEC * dt)
  }
}
