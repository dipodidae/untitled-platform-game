import { CONFIG } from '../config'

// Central effects state — hitstop + shake + flash. Particles used to live
// here too but moved to src/render/particles.ts in the ParticleContainer
// rewrite; each fx event (fracture, impact, muzzle, landing, etc.) now
// spawns particles via that module directly.
//
// Hitstop is counted in TICKS (not seconds) because the identity brief
// demands an exact frame count for the fracture recognition beat.

export interface FxState {
  hitstopTicks: number // while > 0, game.ts skips the physics update
  shakeTimer: number
  shakeDuration: number
  shakeAmplitude: number
  flashTimer: number
  flashDuration: number
}

export function createFxState(): FxState {
  return {
    hitstopTicks: 0,
    shakeTimer: 0,
    shakeDuration: 0,
    shakeAmplitude: 0,
    flashTimer: 0,
    flashDuration: 0,
  }
}

// Returns true iff this tick should be skipped due to hitstop.
// Decrements as a side effect so that `hitstopTicks = 4` gives exactly 4
// skipped physics ticks — one per call.
export function consumeHitstopTick(fx: FxState): boolean {
  if (fx.hitstopTicks > 0) {
    fx.hitstopTicks -= 1
    return true
  }
  return false
}

// Timers that decay in real time — called once per rendered frame.
// Keeping shake/flash on render cadence (not physics) makes them look
// identical regardless of how many physics steps ran in a frame.
export function tickFxRender(fx: FxState, dt: number): void {
  if (fx.shakeTimer > 0)
    fx.shakeTimer = Math.max(0, fx.shakeTimer - dt)
  if (fx.flashTimer > 0)
    fx.flashTimer = Math.max(0, fx.flashTimer - dt)
}

export function triggerShake(fx: FxState, amplitude: number, duration: number): void {
  // Take the louder of what's already playing vs. what was just requested,
  // so a chained fracture doesn't cut a big shake short.
  if (duration > fx.shakeTimer) {
    fx.shakeTimer = duration
    fx.shakeDuration = duration
  }
  if (amplitude > fx.shakeAmplitude || fx.shakeTimer === 0) {
    fx.shakeAmplitude = amplitude
  }
}

export function triggerFlash(fx: FxState, duration: number): void {
  if (duration > fx.flashTimer) {
    fx.flashTimer = duration
    fx.flashDuration = duration
  }
}

// Timing/screen-effect bundle for a fracture — hitstop, shake, flash.
// Particle debris for the fracture is spawned separately via
// `emitFractureBurst` in src/render/particles.ts so fx.ts stays free of
// renderer dependencies.
export function triggerFractureFx(fx: FxState): void {
  fx.hitstopTicks = CONFIG.FRACTURE_HITSTOP_FRAMES
  triggerShake(fx, CONFIG.FRACTURE_SHAKE_AMPLITUDE, CONFIG.FRACTURE_SHAKE_DURATION)
  triggerFlash(fx, CONFIG.FRACTURE_FLASH_DURATION)
}

// Shake offset to apply at a given render frame. Uses remaining/duration as
// a decay so shake fades out smoothly instead of popping off.
export function shakeOffset(fx: FxState): { x: number, y: number } {
  if (fx.shakeTimer <= 0 || fx.shakeDuration <= 0)
    return { x: 0, y: 0 }
  const k = fx.shakeTimer / fx.shakeDuration
  const mag = fx.shakeAmplitude * k
  return {
    x: (Math.random() * 2 - 1) * mag,
    y: (Math.random() * 2 - 1) * mag,
  }
}

// 0..1 current flash opacity.
export function flashAlpha(fx: FxState): number {
  if (fx.flashTimer <= 0 || fx.flashDuration <= 0)
    return 0
  return fx.flashTimer / fx.flashDuration
}
