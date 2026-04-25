// ─── Particle system (PixiJS v8 ParticleContainer-backed) ────────────────────
//
// Replaces the hand-rolled Graphics-triangle pool that used to live in fx.ts.
// Two procedural textures (soft dot, sharp triangle) are generated once at
// init. Two ParticleContainers host them — one draw call each — and every
// effect picks its shape via a per-kind config. All physics state lives in
// ParticleRecord objects pooled in a freelist; per-frame cost is a tight loop
// integrating velocity + writing back to `particle.x/y/rotation/alpha/scale`,
// which ParticleContainer batches into a single GPU upload.
//
// Design rules:
//   - One spawn API (emit) with per-kind defaults; helpers on top for common
//     game events (fracture, impact, muzzle, landing, disintegration, wall-slide)
//   - Tick at physics cadence so particle motion stays deterministic for any
//     physics-spawned event; ambient/cosmetic effects can emit at render cadence
//     without breaking determinism because they're short-lived
//   - Freelist reuse — no `new Particle()` in the hot path
//   - All rendering inside a single `root` Container added to worldContainer

import type { Renderer, Texture } from 'pixi.js'
import { Container, Graphics, Particle, ParticleContainer, RenderTexture } from 'pixi.js'

// ─── textures ───────────────────────────────────────────────────────────────
// Procedural small textures so we don't need an asset file for particles.
// Built once on init via renderer.extract-style generateTexture; all particles
// reuse these Texture objects.

function buildDotTexture(renderer: Renderer): Texture {
  // 16×16 radial-falloff white dot. Alpha ramps out smoothly from center.
  const size = 16
  const g = new Graphics()
  const steps = 6
  for (let i = steps; i > 0; i--) {
    const r = (i / steps) * (size / 2)
    const a = (1 - i / steps) * 0.18 + (i === 1 ? 1 : 0)
    g.circle(size / 2, size / 2, r).fill({ color: 0xFFFFFF, alpha: a })
  }
  // Solid bright core on top.
  g.circle(size / 2, size / 2, 1.5).fill({ color: 0xFFFFFF, alpha: 1 })
  const tex = RenderTexture.create({ width: size, height: size, antialias: true })
  renderer.render({ container: g, target: tex })
  g.destroy()
  return tex
}

function buildShardTexture(renderer: Renderer): Texture {
  // 12×16 asymmetric triangle shard. Rotated + scaled per particle gives a
  // varied-debris feel without separate textures per variant.
  const w = 12
  const h = 16
  const g = new Graphics()
  g.poly([w / 2, 0, w, h, 0, h * 0.7]).fill({ color: 0xFFFFFF, alpha: 1 })
  const tex = RenderTexture.create({ width: w, height: h, antialias: true })
  renderer.render({ container: g, target: tex })
  g.destroy()
  return tex
}

// ─── kinds ──────────────────────────────────────────────────────────────────

export type ParticleKindName
  = | 'glassShard'
    | 'boneChunk'
    | 'dust'
    | 'blood'
    | 'spark'
    | 'ember'
    | 'smoke'
    | 'mote' // ambient background

interface KindDef {
  shape: 'dot' | 'shard'
  gravity: number // px/s²
  drag: number // per-second velocity retained (1 = none, 0.9 = strong)
  spinMin: number // rad/s
  spinMax: number
  scaleMin: number
  scaleMax: number
  lifeMin: number // seconds
  lifeMax: number
  speedMin: number // ejection speed (px/s)
  speedMax: number
  coneDeg: number // spread around ejection direction
  stretchBySpeed: number // 0 = no stretch; >0 elongates in vel direction
  tintPool: readonly number[]
  fadeOutStart: number // normalized life (0..1) at which fade-out begins
  growTo: number // scale multiplier at death (1 = constant, >1 grows, <1 shrinks)
  upBias: number // extra -vy added at spawn (negative = shoot upward)
}

const KINDS: Record<ParticleKindName, KindDef> = {
  glassShard: {
    shape: 'shard',
    gravity: 620,
    drag: 0.92,
    spinMin: -14,
    spinMax: 14,
    scaleMin: 0.35,
    scaleMax: 0.8,
    lifeMin: 0.4,
    lifeMax: 0.85,
    speedMin: 140,
    speedMax: 340,
    coneDeg: 85,
    stretchBySpeed: 0,
    tintPool: [0xE8F0FF, 0xB8D4F0, 0xFFFFFF, 0xC8E0FF],
    fadeOutStart: 0.6,
    growTo: 1,
    upBias: 60,
  },
  boneChunk: {
    shape: 'shard',
    gravity: 540,
    drag: 0.93,
    spinMin: -10,
    spinMax: 10,
    scaleMin: 0.4,
    scaleMax: 0.9,
    lifeMin: 0.35,
    lifeMax: 0.7,
    speedMin: 90,
    speedMax: 240,
    coneDeg: 80,
    stretchBySpeed: 0,
    tintPool: [0xD4B896, 0xA88860, 0xE8D4B0, 0xBFA078],
    fadeOutStart: 0.55,
    growTo: 1,
    upBias: 40,
  },
  dust: {
    shape: 'dot',
    gravity: 40,
    drag: 0.82,
    spinMin: -1,
    spinMax: 1,
    scaleMin: 0.4,
    scaleMax: 1.0,
    lifeMin: 0.3,
    lifeMax: 0.7,
    speedMin: 30,
    speedMax: 110,
    coneDeg: 150,
    stretchBySpeed: 0,
    tintPool: [0x8C6A42, 0xB08C60, 0x6C4E30],
    fadeOutStart: 0.3,
    growTo: 2.2, // expands as it dissipates
    upBias: 20,
  },
  blood: {
    shape: 'dot',
    gravity: 780,
    drag: 0.88,
    spinMin: -2,
    spinMax: 2,
    scaleMin: 0.5,
    scaleMax: 1.1,
    lifeMin: 0.4,
    lifeMax: 0.9,
    speedMin: 120,
    speedMax: 300,
    coneDeg: 95,
    stretchBySpeed: 0.35,
    tintPool: [0xC01020, 0x8A0814, 0xE23040, 0xA01030],
    fadeOutStart: 0.7,
    growTo: 0.7, // shrinks into droplets
    upBias: 90,
  },
  spark: {
    shape: 'dot',
    gravity: 140,
    drag: 0.78,
    spinMin: 0,
    spinMax: 0,
    scaleMin: 0.2,
    scaleMax: 0.6,
    lifeMin: 0.08,
    lifeMax: 0.24,
    speedMin: 200,
    speedMax: 460,
    coneDeg: 35,
    stretchBySpeed: 1.4, // long streaks
    tintPool: [0xFFE6A8, 0xFFD060, 0xFFF6D8, 0xFFA830],
    fadeOutStart: 0.2,
    growTo: 0.4,
    upBias: 0,
  },
  ember: {
    shape: 'dot',
    gravity: -40, // floats up
    drag: 0.94,
    spinMin: -0.5,
    spinMax: 0.5,
    scaleMin: 0.25,
    scaleMax: 0.55,
    lifeMin: 0.9,
    lifeMax: 1.8,
    speedMin: 20,
    speedMax: 80,
    coneDeg: 360,
    stretchBySpeed: 0,
    tintPool: [0xFF6830, 0xFFA050, 0xFFD070, 0xD03820],
    fadeOutStart: 0.5,
    growTo: 0.3,
    upBias: 40,
  },
  smoke: {
    shape: 'dot',
    gravity: -25,
    drag: 0.85,
    spinMin: -0.6,
    spinMax: 0.6,
    scaleMin: 0.8,
    scaleMax: 1.6,
    lifeMin: 0.6,
    lifeMax: 1.3,
    speedMin: 15,
    speedMax: 55,
    coneDeg: 180,
    stretchBySpeed: 0,
    tintPool: [0x3A3A40, 0x4C4C55, 0x2A2A30],
    fadeOutStart: 0.4,
    growTo: 2.8,
    upBias: 30,
  },
  mote: {
    shape: 'dot',
    gravity: -5,
    drag: 0.98,
    spinMin: 0,
    spinMax: 0,
    scaleMin: 0.15,
    scaleMax: 0.35,
    lifeMin: 4,
    lifeMax: 10,
    speedMin: 5,
    speedMax: 18,
    coneDeg: 360,
    stretchBySpeed: 0,
    tintPool: [0xA89878, 0xC4A880, 0x8A7860],
    fadeOutStart: 0.85,
    growTo: 1,
    upBias: 0,
  },
}

// ─── record + system ────────────────────────────────────────────────────────

interface ParticleRecord {
  particle: Particle
  kind: ParticleKindName
  vx: number
  vy: number
  life: number
  maxLife: number
  spin: number
  baseScale: number
  growTo: number
  fadeOutStart: number
  stretchBySpeed: number
  gravity: number
  drag: number
}

export interface ParticleSystem {
  readonly root: Container
  readonly dotContainer: ParticleContainer
  readonly shardContainer: ParticleContainer
  readonly dotTexture: Texture
  readonly shardTexture: Texture
  // Active records. Packed — dead records are swapped with the tail on cull.
  active: ParticleRecord[]
  // Freelist of inactive records — reuse to avoid Particle allocations in hot path.
  free: ParticleRecord[]
}

const MAX_ACTIVE = 6000 // soft cap to prevent runaway allocation

export function createParticleSystem(renderer: Renderer): ParticleSystem {
  const dotTexture = buildDotTexture(renderer)
  const shardTexture = buildShardTexture(renderer)
  const dynProps = { position: true, rotation: true, color: true, scale: true }
  const dotContainer = new ParticleContainer({ dynamicProperties: dynProps })
  const shardContainer = new ParticleContainer({ dynamicProperties: dynProps })
  const root = new Container()
  // Shards in front — sharp debris reads best on top of soft dust/smoke.
  root.addChild(dotContainer)
  root.addChild(shardContainer)
  return {
    root,
    dotContainer,
    shardContainer,
    dotTexture,
    shardTexture,
    active: [],
    free: [],
  }
}

// ─── emit ───────────────────────────────────────────────────────────────────
// Emits `count` particles of `kind` at (x, y) in a cone around (dirX, dirY).
// If dir isn't supplied, emits omnidirectionally.
export function emit(
  system: ParticleSystem,
  kind: ParticleKindName,
  x: number,
  y: number,
  count: number,
  dirX: number = 0,
  dirY: number = -1,
  opts?: { tintOverride?: number, scaleMul?: number, speedMul?: number },
): void {
  const def = KINDS[kind]
  const container = def.shape === 'shard' ? system.shardContainer : system.dotContainer
  const texture = def.shape === 'shard' ? system.shardTexture : system.dotTexture
  const dirLen = Math.hypot(dirX, dirY)
  const dx = dirLen > 0.01 ? dirX / dirLen : 0
  const dy = dirLen > 0.01 ? dirY / dirLen : -1
  const baseAngle = Math.atan2(dy, dx)
  const coneRad = (def.coneDeg * Math.PI) / 180

  for (let i = 0; i < count; i++) {
    if (system.active.length >= MAX_ACTIVE)
      return

    const speed = (def.speedMin + Math.random() * (def.speedMax - def.speedMin))
      * (opts?.speedMul ?? 1)
    const angle = baseAngle + (Math.random() - 0.5) * coneRad
    const vx = Math.cos(angle) * speed
    const vy = Math.sin(angle) * speed - def.upBias
    const life = def.lifeMin + Math.random() * (def.lifeMax - def.lifeMin)
    const baseScale = (def.scaleMin + Math.random() * (def.scaleMax - def.scaleMin))
      * (opts?.scaleMul ?? 1)
    const spin = def.spinMin + Math.random() * (def.spinMax - def.spinMin)
    const tint = opts?.tintOverride
      ?? def.tintPool[Math.floor(Math.random() * def.tintPool.length)]!

    // Reuse from freelist, or build new.
    let rec: ParticleRecord
    const recycled = system.free.pop()
    if (recycled) {
      rec = recycled
      rec.particle.texture = texture
    }
    else {
      const p = new Particle({ texture, anchorX: 0.5, anchorY: 0.5 })
      rec = {
        particle: p,
        kind,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0,
        spin: 0,
        baseScale: 1,
        growTo: 1,
        fadeOutStart: 0.5,
        stretchBySpeed: 0,
        gravity: 0,
        drag: 1,
      }
      container.addParticle(p)
    }

    rec.kind = kind
    rec.vx = vx
    rec.vy = vy
    rec.life = life
    rec.maxLife = life
    rec.spin = spin
    rec.baseScale = baseScale
    rec.growTo = def.growTo
    rec.fadeOutStart = def.fadeOutStart
    rec.stretchBySpeed = def.stretchBySpeed
    rec.gravity = def.gravity
    rec.drag = def.drag

    const p = rec.particle
    p.x = x
    p.y = y
    p.scaleX = baseScale
    p.scaleY = baseScale
    p.rotation = def.shape === 'shard' ? Math.random() * Math.PI * 2 : angle
    p.tint = tint
    p.alpha = 1

    // If the particle is shard-shaped and currently belongs to the dot container
    // (or vice versa from previous use), move it.
    const otherContainer = def.shape === 'shard' ? system.dotContainer : system.shardContainer
    if (otherContainer.particleChildren.includes(p)) {
      otherContainer.removeParticle(p)
      container.addParticle(p)
    }

    system.active.push(rec)
  }
}

// ─── tick ───────────────────────────────────────────────────────────────────
// Runs at physics cadence from game.ts. Integrates velocity + drag + gravity,
// writes back to sprite transforms, decrements life, compacts dead records
// into the freelist.
export function tickParticles(system: ParticleSystem, dt: number): void {
  const active = system.active
  let write = 0
  for (let read = 0; read < active.length; read++) {
    const rec = active[read]!
    rec.life -= dt
    if (rec.life <= 0) {
      rec.particle.alpha = 0 // hide; particle stays in container for reuse
      system.free.push(rec)
      continue
    }
    // Integrate
    rec.vy += rec.gravity * dt
    const dragF = rec.drag ** dt
    rec.vx *= dragF
    rec.vy *= dragF
    rec.particle.x += rec.vx * dt
    rec.particle.y += rec.vy * dt
    rec.particle.rotation += rec.spin * dt

    // Scale / alpha over life
    const t = 1 - rec.life / rec.maxLife // 0 at birth → 1 at death
    const sFactor = 1 + (rec.growTo - 1) * t
    const s = rec.baseScale * sFactor
    if (rec.stretchBySpeed > 0) {
      const sp = Math.hypot(rec.vx, rec.vy)
      const stretch = 1 + (sp / 260) * rec.stretchBySpeed
      rec.particle.scaleX = s * stretch
      rec.particle.scaleY = s
      rec.particle.rotation = Math.atan2(rec.vy, rec.vx)
    }
    else {
      rec.particle.scaleX = s
      rec.particle.scaleY = s
    }

    if (t >= rec.fadeOutStart) {
      const fadeT = (t - rec.fadeOutStart) / (1 - rec.fadeOutStart)
      rec.particle.alpha = 1 - fadeT
    }
    else {
      rec.particle.alpha = 1
    }

    active[write++] = rec
  }
  active.length = write
}

// ─── high-level effect helpers ──────────────────────────────────────────────

// Fracture burst — the big one. Cloud of bone/glass shards + smoke +
// embers, ejected opposite the player's velocity so debris reads as
// "thrown out by the blast" rather than floating.
export function emitFractureBurst(
  system: ParticleSystem,
  x: number,
  y: number,
  dominantMaterial: 'bone' | 'glass' | 'soft' | 'resonant',
  vx: number,
  vy: number,
): void {
  const invLen = 1 / Math.max(1, Math.hypot(vx, vy))
  const outX = -vx * invLen
  const outY = -vy * invLen
  // Shard core — material-tinted.
  if (dominantMaterial === 'glass')
    emit(system, 'glassShard', x, y, 80, outX, outY)
  else emit(system, 'boneChunk', x, y, 70, outX, outY)
  // Dust cloud — always.
  emit(system, 'dust', x, y, 45, outX, outY)
  // Smoke for weight.
  emit(system, 'smoke', x, y, 18, outX, outY - 0.3)
  // Embers for atmosphere + warmth.
  emit(system, 'ember', x, y, 24, 0, -1)
  // Sharp sparks radiating outward.
  emit(system, 'spark', x, y, 30, outX, outY)
}

// Per-material impact burst (bullets on terrain, post-carve).
export function emitImpactBurst(
  system: ParticleSystem,
  x: number,
  y: number,
  material: 'bone' | 'glass' | 'bone_fragile' | 'soft' | 'resonant' | 'enemy',
  vx: number,
  vy: number,
): void {
  const invLen = 1 / Math.max(1, Math.hypot(vx, vy))
  const outX = -vx * invLen
  const outY = -vy * invLen
  switch (material) {
    case 'enemy':
      emit(system, 'blood', x, y, 18, outX, outY)
      emit(system, 'spark', x, y, 6, outX, outY)
      break
    case 'glass':
      emit(system, 'glassShard', x, y, 16, outX, outY)
      emit(system, 'spark', x, y, 8, outX, outY)
      emit(system, 'dust', x, y, 4, outX, outY)
      break
    case 'bone':
    case 'bone_fragile':
      emit(system, 'boneChunk', x, y, 12, outX, outY)
      emit(system, 'dust', x, y, 10, outX, outY)
      break
    case 'soft':
      emit(system, 'dust', x, y, 10, outX, outY, { speedMul: 0.5 })
      emit(system, 'smoke', x, y, 4, outX, outY)
      break
    case 'resonant':
      // Indestructible surface — bullet just throws sparks.
      emit(system, 'spark', x, y, 14, outX, outY)
      emit(system, 'ember', x, y, 4, outX, outY)
      break
  }
}

// Bright cone of sparks from the muzzle on each fired slug.
export function emitMuzzleFlash(
  system: ParticleSystem,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
): void {
  emit(system, 'spark', x, y, 8, dirX, dirY, { speedMul: 0.8 })
  emit(system, 'ember', x, y, 3, dirX, dirY, { speedMul: 0.4 })
}

// Dust puff on ground impact. Intensity scales with landing speed.
export function emitLandingDust(
  system: ParticleSystem,
  x: number,
  y: number,
  intensity: number, // 0..1
): void {
  const n = Math.round(4 + intensity * 16)
  // Two bursts — left and right — so dust kicks out sideways rather than
  // mushrooming straight up like a bomb.
  emit(system, 'dust', x - 4, y, Math.ceil(n / 2), -0.8, -0.4, { speedMul: 0.6 + intensity * 0.6 })
  emit(system, 'dust', x + 4, y, Math.floor(n / 2), 0.8, -0.4, { speedMul: 0.6 + intensity * 0.6 })
}

// Continuous shed — called per tick while instability is high. Matches the
// "you are not entirely here" line in the README: at high instability the
// player visibly sheds micro-debris.
export function emitDisintegration(
  system: ParticleSystem,
  x: number,
  y: number,
  vx: number,
  vy: number,
  intensity: number, // 0..1
): void {
  if (intensity <= 0)
    return
  // Spawn rate scales with intensity.
  const count = Math.floor(1 + intensity * 3)
  const invLen = 1 / Math.max(1, Math.hypot(vx, vy))
  // Shed opposite movement direction — looks like it's peeling off behind.
  const trailX = vx ? -vx * invLen : 0
  const trailY = vy ? -vy * invLen : -1
  emit(system, 'ember', x, y, count, trailX, trailY, { speedMul: 0.6 })
  if (intensity > 0.7 && Math.random() < 0.4)
    emit(system, 'smoke', x, y, 1, trailX, trailY, { speedMul: 0.5 })
}

// Thin line of sparks at the wall-contact point when wall-sliding.
export function emitWallSlideSparks(
  system: ParticleSystem,
  x: number,
  y: number,
  wallSide: -1 | 1, // -1 = wall on left
): void {
  const dirX = -wallSide
  emit(system, 'spark', x, y, 2, dirX * 0.7, 0.5, { speedMul: 0.5 })
}

// Glass-break callout — hazard shards spawning (the lethal ones). Visual pair
// to the physical shard colliders appearing.
export function emitGlassBreak(
  system: ParticleSystem,
  x: number,
  y: number,
): void {
  emit(system, 'glassShard', x, y, 30, 0, -1, { speedMul: 1.1 })
  emit(system, 'spark', x, y, 10, 0, -1)
}

// Pickup claim — big burst of embers + sparks when the player collects an item.
// Omnidirectional (dir zero) so it reads as a burst outward from the pickup
// position, not a directional spray. Tint matches the pickup color.
export function emitPickupClaim(
  system: ParticleSystem,
  x: number,
  y: number,
  tint?: number,
): void {
  const t = tint ? { tintOverride: tint } : undefined
  emit(system, 'ember', x, y, 28, 0, -1, { speedMul: 1.2, ...t })
  emit(system, 'spark', x, y, 18, 0, 0, { speedMul: 1.1, ...t })
  emit(system, 'dust', x, y, 12, 0, -0.4, { speedMul: 0.7 })
  emit(system, 'smoke', x, y, 4, 0, -0.5, { speedMul: 0.5 })
}

// ─── ambient motes ──────────────────────────────────────────────────────────
// Scatter N motes across a world region. Called once on level load; motes
// tick for their full lifetime and get replenished by the game loop.
export function scatterMotes(
  system: ParticleSystem,
  worldWidth: number,
  worldHeight: number,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * worldWidth
    const y = Math.random() * worldHeight * 0.8
    emit(system, 'mote', x, y, 1, Math.random() - 0.5, -0.5, { speedMul: 1 })
  }
}

// Reset system on level change / respawn. Clears all active particles but
// keeps the container + pooled Particle objects.
export function resetParticleSystem(system: ParticleSystem): void {
  for (const rec of system.active) {
    rec.particle.alpha = 0
    system.free.push(rec)
  }
  system.active.length = 0
}
