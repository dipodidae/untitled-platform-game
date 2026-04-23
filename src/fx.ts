import type { RuptureResult } from './rupture'
import { CONFIG } from './config'
import { PALETTE } from './render/palette'

// Central effects state. Hitstop / shake / flash / particle timers live
// in one `FxState` so a single module owns timing and the renderer reads
// from one place.
//
// Hitstop is counted in TICKS (not seconds) because the identity brief
// demands an exact frame count for the fracture recognition beat.

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: number
}

export interface FxState {
  hitstopTicks: number // while > 0, game.ts skips the physics update
  shakeTimer: number
  shakeDuration: number
  shakeAmplitude: number
  flashTimer: number
  flashDuration: number
  particles: Particle[]
}

export function createFxState(): FxState {
  return {
    hitstopTicks: 0,
    shakeTimer: 0,
    shakeDuration: 0,
    shakeAmplitude: 0,
    flashTimer: 0,
    flashDuration: 0,
    particles: [],
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

// Particles advance at physics cadence so they stay deterministic w.r.t.
// destruction — they spawn from a fracture, and fractures are physics events.
// Iterates in place: swap dead particles with the tail and shrink length, so the
// hot path doesn't allocate a fresh array every tick.
export function tickParticlesPhysics(fx: FxState, dt: number): void {
  const ps = fx.particles
  let write = 0
  for (let read = 0; read < ps.length; read++) {
    const p = ps[read]!
    p.life -= dt
    if (p.life <= 0)
      continue
    p.vy += CONFIG.FALL_GRAVITY * 0.35 * dt // light gravity tug, cheaper than real
    p.x += p.vx * dt
    p.y += p.vy * dt
    ps[write++] = p
  }
  ps.length = write
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

// Full effects bundle for a fracture — hitstop, shake, flash, debris.
export function triggerFractureFx(fx: FxState, rupture: RuptureResult): void {
  fx.hitstopTicks = CONFIG.FRACTURE_HITSTOP_FRAMES
  triggerShake(fx, CONFIG.FRACTURE_SHAKE_AMPLITUDE, CONFIG.FRACTURE_SHAKE_DURATION)
  triggerFlash(fx, CONFIG.FRACTURE_FLASH_DURATION)

  // Debris color matches the material that failed — so the burst
  // "belongs" to the wound.
  let baseColor = PALETTE.materials.bone.highlight
  const firstDestroyed = rupture.affected.find(a => a.destroyed)
  if (firstDestroyed)
    baseColor = PALETTE.materials[firstDestroyed.prevMaterial].highlight
  const n = CONFIG.FRACTURE_PARTICLES
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3
    const speed = 80 + Math.random() * 140
    fx.particles.push({
      x: rupture.center.x,
      y: rupture.center.y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 40, // up-bias so debris arcs
      life: 0.35 + Math.random() * 0.25,
      maxLife: 0.6,
      color: baseColor,
    })
  }
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
