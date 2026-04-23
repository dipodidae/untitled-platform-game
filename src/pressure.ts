import { CONFIG } from './config'

// Pressure: the core resource. 0..PRESSURE_MAX. At max, the player detonates.
//
// The rules live here; `player.ts` calls `updatePressure` once per fixed tick,
// passing a snapshot of what happened that tick (jumped, landed with impact,
// pressed into a wall, etc). This keeps the gain/bleed table readable and
// easy to tune — every rule in the brief maps to a single branch below.
//
// The vent action is also owned here: input edges + movement lock + post-vent
// stun so the skill-expression loop ("bleed at exactly the right moment")
// has a place to live that isn't tangled with jump/gravity code.

export interface PressureState {
  value: number // 0 .. CONFIG.PRESSURE_MAX
  venting: boolean // player is actively holding vent
  ventStunTimer: number // seconds left where we block jump + re-vent
  detonateQueued: boolean // set when value ≥ max; blast fires next tick
}

// Per-tick inputs to the pressure update.
export interface PressureTickInput {
  readonly grounded: boolean
  readonly vxAbs: number
  readonly jumpedThisTick: boolean
  readonly landedImpactVy: number // |vy| at the moment of landing; 0 if no landing
  readonly touchingWallMoving: boolean // pressed into a wall with input against it
  readonly ventHeld: boolean // V or Shift held THIS tick
  readonly iframes: boolean // post-detonation window: freeze all gains
}

export function createPressureState(): PressureState {
  return { value: 0, venting: false, ventStunTimer: 0, detonateQueued: false }
}

// Reset an existing pressure state in place. Used on respawn so we don't
// reallocate (kept consistent with the rest of respawn, which mutates).
export function resetPressure(s: PressureState): void {
  s.value = 0
  s.venting = false
  s.ventStunTimer = 0
  s.detonateQueued = false
}

// Inverse lerp clamp helper kept local to avoid a utils grab-bag.
function invLerp01(v: number, lo: number, hi: number): number {
  if (hi <= lo)
    return v >= hi ? 1 : 0
  const t = (v - lo) / (hi - lo)
  return t < 0 ? 0 : t > 1 ? 1 : t
}

// External hook for a future dash action (or any other one-shot gain).
// The brief explicitly asks for "+20 if you add dash later — leave a hook".
export function addPressure(s: PressureState, amount: number): void {
  if (amount <= 0)
    return
  s.value = Math.min(CONFIG.PRESSURE_MAX, s.value + amount)
}

// Per-tick pressure update. Order is: vent state → bleeds/gains → detonate check.
// Returns nothing — mutates `s` in place, which matches the rest of the codebase.
export function updatePressure(
  s: PressureState,
  input: PressureTickInput,
  dt: number,
): void {
  if (s.ventStunTimer > 0)
    s.ventStunTimer -= dt

  // ─── vent state machine ────────────────────────────────────────
  // Vent is active only when: held AND not stunned AND not already detonating.
  const canVent = input.ventHeld && s.ventStunTimer <= 0 && !s.detonateQueued
  const wasVenting = s.venting
  s.venting = canVent

  // Edge-triggered stun on release — "0.15s post-vent stun on release where
  // you can't jump or vent again". We also trigger stun if the player just
  // burned the meter to zero mid-vent: same commitment cost either way.
  if (wasVenting && !s.venting) {
    s.ventStunTimer = CONFIG.VENT_STUN
  }

  // During i-frames we skip all gain/bleed entirely. Wanted behavior: the
  // player can see their own blast without the meter immediately refilling.
  if (input.iframes)
    return

  // ─── gains ─────────────────────────────────────────────────────
  if (input.jumpedThisTick)
    addPressure(s, CONFIG.PRESSURE_JUMP)

  if (input.landedImpactVy > CONFIG.PRESSURE_LAND_MIN_VY) {
    const t = invLerp01(
      input.landedImpactVy,
      CONFIG.PRESSURE_LAND_MIN_VY,
      CONFIG.MAX_FALL,
    )
    addPressure(s, t * CONFIG.PRESSURE_LAND_MAX_GAIN)
  }

  if (input.touchingWallMoving) {
    addPressure(s, CONFIG.PRESSURE_WALL_PER_SEC * dt)
  }

  if (input.grounded && input.vxAbs >= CONFIG.MAX_RUN * CONFIG.PRESSURE_RUN_THRESHOLD) {
    addPressure(s, CONFIG.PRESSURE_RUN_PER_SEC * dt)
  }

  // ─── bleeds ────────────────────────────────────────────────────
  // Active vent trumps idle bleed (it's a stronger drain anyway, and the
  // player is holding the key on purpose).
  if (s.venting) {
    s.value = Math.max(0, s.value - CONFIG.PRESSURE_VENT_DRAIN_PER_SEC * dt)
  }
  else if (input.grounded && input.vxAbs < CONFIG.PRESSURE_IDLE_VX_MAX) {
    s.value = Math.max(0, s.value - CONFIG.PRESSURE_IDLE_BLEED_PER_SEC * dt)
  }

  // ─── detonation trigger ────────────────────────────────────────
  // Flag set here, blast fires on the next tick — gives the ghost-preview
  // one guaranteed render frame at peak pressure, and avoids the same tick
  // both adding pressure and consuming it.
  if (s.value >= CONFIG.PRESSURE_MAX) {
    s.detonateQueued = true
  }
}

// Called after a detonation fires, to reset state for the next charge cycle.
export function onDetonated(s: PressureState): void {
  s.value = 0
  s.detonateQueued = false
  s.venting = false
  s.ventStunTimer = 0
}
