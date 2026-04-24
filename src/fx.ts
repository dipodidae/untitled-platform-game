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
  // Polygon-shard metadata — 0 angle + 0 spin collapses the render to
  // a pixel square (for wind motes etc, though wind uses its own path).
  angle: number
  spin: number
  size: number
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
    p.vy += CONFIG.FALL_GRAVITY * 0.35 * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.angle += p.spin * dt
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
// Tuned for recognition (long freeze, soft flash) not for spectacle.
export function triggerFractureFx(fx: FxState, rupture: RuptureResult): void {
  fx.hitstopTicks = CONFIG.FRACTURE_HITSTOP_FRAMES
  triggerShake(fx, CONFIG.FRACTURE_SHAKE_AMPLITUDE, CONFIG.FRACTURE_SHAKE_DURATION)
  triggerFlash(fx, CONFIG.FRACTURE_FLASH_DURATION)

  // Debris color matches the material that failed, so the burst
  // "belongs" to the wound.
  let baseColor = PALETTE.materials.bone.highlight
  const firstDestroyed = rupture.affected.find(a => a.destroyed)
  if (firstDestroyed)
    baseColor = PALETTE.materials[firstDestroyed.prevMaterial].highlight

  const n = CONFIG.FRACTURE_PARTICLES
  const sizeRange = CONFIG.FRACTURE_SHARD_SIZE_MAX - CONFIG.FRACTURE_SHARD_SIZE_MIN
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3
    const speed = 70 + Math.random() * 150
    fx.particles.push({
      x: rupture.center.x,
      y: rupture.center.y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 40, // up-bias so debris arcs
      life: 0.45 + Math.random() * 0.35,
      maxLife: 0.8,
      color: baseColor,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() * 2 - 1) * CONFIG.FRACTURE_SHARD_SPIN_MAX,
      size: CONFIG.FRACTURE_SHARD_SIZE_MIN + Math.random() * sizeRange,
    })
  }
}

// ─── impact burst ────────────────────────────────────────────────────────────
// Spawned at the point a bullet hits terrain or a dummy. Small, short-lived;
// shape is the same as fracture debris (rotated triangle shards) so we reuse
// the existing particle renderer. Color + count + speed vary per kind:
//   enemy     — 10 blood-red, fast, steep-up bias (spray)
//   glass     — 8 cold-white, fast, jagged
//   bone      — 7 cream/beige, medium
//   bone_fragile — same palette as bone, slightly darker
//   soft      — 5 muddy brown, slow (absorbed feel)
//   resonant  — 6 steel-blue, medium (sparks off indestructible surface)
//   shard     — never fires (shards are lethal passthrough, not shot targets)
export type ImpactKind = 'enemy' | 'glass' | 'bone' | 'bone_fragile' | 'soft' | 'resonant' | 'shard'

interface ImpactProfile {
  count: number
  colors: readonly number[] // randomly picked per particle
  minSpeed: number
  maxSpeed: number
  lifeMin: number
  lifeMax: number
  upBias: number // extra negative vy so bursts arc upward
  sizeMin: number
  sizeMax: number
}

const IMPACT_PROFILES: Record<ImpactKind, ImpactProfile> = {
  enemy: {
    count: 12,
    colors: [0xC01020, 0x8A0814, 0xE23040],
    minSpeed: 80,
    maxSpeed: 200,
    lifeMin: 0.35,
    lifeMax: 0.7,
    upBias: 60,
    sizeMin: 1,
    sizeMax: 2.5,
  },
  glass: {
    count: 8,
    colors: [0xE8F0FF, 0xB8D4F0, 0xFFFFFF],
    minSpeed: 100,
    maxSpeed: 240,
    lifeMin: 0.25,
    lifeMax: 0.55,
    upBias: 30,
    sizeMin: 1,
    sizeMax: 2,
  },
  bone: {
    count: 7,
    colors: [0xD4B896, 0xA88860, 0xE8D4B0],
    minSpeed: 60,
    maxSpeed: 160,
    lifeMin: 0.3,
    lifeMax: 0.55,
    upBias: 20,
    sizeMin: 1,
    sizeMax: 2.5,
  },
  bone_fragile: {
    count: 6,
    colors: [0xB89870, 0x8C6848, 0xC8A880],
    minSpeed: 50,
    maxSpeed: 140,
    lifeMin: 0.25,
    lifeMax: 0.5,
    upBias: 15,
    sizeMin: 1,
    sizeMax: 2,
  },
  soft: {
    count: 5,
    colors: [0x8A6040, 0x604028, 0xA07850],
    minSpeed: 30,
    maxSpeed: 80,
    lifeMin: 0.25,
    lifeMax: 0.45,
    upBias: 5,
    sizeMin: 1,
    sizeMax: 2,
  },
  resonant: {
    count: 6,
    colors: [0xB8CCDC, 0x7090A8, 0xE0F0FF],
    minSpeed: 120,
    maxSpeed: 260,
    lifeMin: 0.15,
    lifeMax: 0.35,
    upBias: 20,
    sizeMin: 1,
    sizeMax: 1.8,
  },
  shard: {
    count: 0,
    colors: [0xFFFFFF],
    minSpeed: 0,
    maxSpeed: 0,
    lifeMin: 0,
    lifeMax: 0,
    upBias: 0,
    sizeMin: 1,
    sizeMax: 1,
  },
}

// `vx`/`vy` are the incoming bullet velocity — we bias the spray opposite-
// direction so debris reads as "ejected from impact" rather than floating.
export function spawnImpactBurst(
  fx: FxState,
  x: number,
  y: number,
  kind: ImpactKind,
  vx: number,
  vy: number,
): void {
  const profile = IMPACT_PROFILES[kind]
  if (profile.count === 0)
    return

  const inv = 1 / Math.max(1, Math.hypot(vx, vy))
  // Ejection axis = reverse of bullet travel.
  const ejectX = -vx * inv
  const ejectY = -vy * inv

  for (let i = 0; i < profile.count; i++) {
    // Cone around eject axis, ±70°.
    const spread = (Math.random() - 0.5) * (Math.PI * 0.78)
    const c = Math.cos(spread)
    const s = Math.sin(spread)
    const dirX = ejectX * c - ejectY * s
    const dirY = ejectX * s + ejectY * c
    const speed = profile.minSpeed + Math.random() * (profile.maxSpeed - profile.minSpeed)
    const life = profile.lifeMin + Math.random() * (profile.lifeMax - profile.lifeMin)
    const size = profile.sizeMin + Math.random() * (profile.sizeMax - profile.sizeMin)
    const colorIdx = Math.floor(Math.random() * profile.colors.length)
    fx.particles.push({
      x,
      y,
      vx: dirX * speed,
      vy: dirY * speed - profile.upBias,
      life,
      maxLife: life,
      color: profile.colors[colorIdx]!,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() * 2 - 1) * 10,
      size,
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
