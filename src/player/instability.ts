import { CONFIG } from '../config'

// Instability: the thing failing inside you. 0..INSTABILITY_MAX. At max,
// cohesion is lost — you fracture.
//
// The rules live here; `player.ts` calls `updateInstability` once per
// fixed tick, passing a snapshot of what happened (jumped, landed with
// impact, pressed into a wall, etc). The table of gains/bleeds stays
// single-file so every line in the identity brief maps to one branch.
//
// The containment action is also owned here: input edges + movement lock
// + post-release stun. Containment is the player's only way to push back
// against their own failure — and it costs commitment (you can't move,
// and releasing has a stun).

export interface InstabilityState {
  value: number // 0 .. CONFIG.INSTABILITY_MAX
  containing: boolean // player is actively holding containment
  containmentStunTimer: number // seconds left where we block jump + re-contain
  fractureQueued: boolean // set when value ≥ max; rupture fires next tick
}

// Per-tick inputs to the instability update.
export interface InstabilityTickInput {
  readonly grounded: boolean
  readonly vxAbs: number
  readonly jumpedThisTick: boolean
  readonly landedImpactVy: number // |vy| at the moment of landing; 0 if no landing
  readonly touchingWallMoving: boolean // pressed into a wall with input against it
  readonly containHeld: boolean // V or Shift held THIS tick
  readonly iframes: boolean // post-fracture window: freeze all gains
}

export function createInstabilityState(): InstabilityState {
  return { value: 0, containing: false, containmentStunTimer: 0, fractureQueued: false }
}

// Reset in place — same convention as the rest of respawn.
export function resetInstability(s: InstabilityState): void {
  s.value = 0
  s.containing = false
  s.containmentStunTimer = 0
  s.fractureQueued = false
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

// Per-tick update. Order: containment state → bleeds/gains → fracture check.
export function updateInstability(
  s: InstabilityState,
  input: InstabilityTickInput,
  dt: number,
): void {
  if (s.containmentStunTimer > 0)
    s.containmentStunTimer -= dt

  // ─── containment state machine ────────────────────────────────
  // Active only when: held AND not stunned AND not already fracturing.
  const canContain = input.containHeld && s.containmentStunTimer <= 0 && !s.fractureQueued
  const wasContaining = s.containing
  s.containing = canContain

  // Edge-triggered stun on release. Also fires if the player burned the
  // meter to zero mid-containment — same commitment cost either way.
  if (wasContaining && !s.containing) {
    s.containmentStunTimer = CONFIG.CONTAINMENT_STUN
  }

  // During iframes: skip all gain/bleed. The player should see their own
  // rupture without the meter refilling under them.
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
  // Active containment trumps idle bleed (it's a stronger drain anyway,
  // and the player is holding the key on purpose).
  if (s.containing) {
    s.value = Math.max(0, s.value - CONFIG.INSTABILITY_CONTAIN_DRAIN_PER_SEC * dt)
  }
  else if (input.grounded && input.vxAbs < CONFIG.INSTABILITY_IDLE_VX_MAX) {
    s.value = Math.max(0, s.value - CONFIG.INSTABILITY_IDLE_BLEED_PER_SEC * dt)
  }
  else if (!input.grounded) {
    // Slow air bleed — skilled airborne play is rewarded with tiny recovery.
    s.value = Math.max(0, s.value - CONFIG.INSTABILITY_AIR_BLEED_PER_SEC * dt)
  }

  // ─── fracture trigger ─────────────────────────────────────────
  // Flag set here, rupture fires on the next tick — gives the preview one
  // guaranteed render frame at peak, and avoids the same tick both adding
  // and consuming instability.
  if (s.value >= CONFIG.INSTABILITY_MAX)
    s.fractureQueued = true
}

// Reset state for the next charge cycle after a fracture fires.
export function onFractured(s: InstabilityState): void {
  s.value = 0
  s.fractureQueued = false
  s.containing = false
  s.containmentStunTimer = 0
}
