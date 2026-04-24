// Bullets — projectiles that carve the polygon world on impact and damage
// dummies/enemies. Fired with an initial velocity (muzzle position + aim
// direction from the Spineboy bridge), then integrated under per-kind gravity
// so the current "slug" kind arcs noticeably mid-flight. Future kinds (rifle,
// plasma, etc.) can tune speed / gravity / colors in BULLET_KINDS.
//
// Hit resolution order each tick:
//   1) Dummy AABB test — front-loaded so enemies absorb shots that would
//      otherwise carve the wall behind them.
//   2) Terrain SAT via the existing broadphase + collider pieces.
// On any impact we spawn a material-tinted debris burst and despawn the bullet.

import type { Camera } from './camera'
import type { Dummy } from './dummy'
import type { BroadphaseGrid } from './physics/broadphase'
import type { ParticleSystem } from './render/particles'
import type { Collider, Level, MaterialName } from './world/level'
import { addTrauma } from './camera'
import { CONFIG } from './config'
import { damageDummy, dummyAabb, overlapsDummy } from './dummy'
import { satAabbPoly } from './math/sat'
import { emitImpactBurst, emitMuzzleFlash } from './render/particles'
import { applyRupture } from './world/destruction'

// ─── bullet kinds (weapon profiles) ──────────────────────────────────────────
export interface BulletKind {
  speed: number // px/s — initial velocity magnitude along aim direction
  gravity: number // px/s² — downward acceleration on vy
  lifeSec: number
  size: number // AABB half-extent for hit tests
  ruptureRadius: number
  damage: number
  coreColor: number // tracer core
  haloColor: number // tracer halo
  fireCooldownSec: number
}

export const BULLET_KINDS = {
  // Slug — sluggish, heavy, visibly arcs. Feels like a pistol-level round.
  // Drop over full lifetime ≈ 0.5 * 280 * 1² = 140px against ~360px range.
  slug: {
    speed: 380,
    gravity: 180,
    lifeSec: 1.0,
    size: 3,
    ruptureRadius: 12,
    damage: 1,
    coreColor: 0xFFD48C,
    haloColor: 0x8A2A1C,
    fireCooldownSec: 0.14,
  },
} as const satisfies Record<string, BulletKind>

export type BulletKindName = keyof typeof BULLET_KINDS

// ─── state ───────────────────────────────────────────────────────────────────
export interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  alive: boolean
  kind: BulletKindName
}

export interface BulletState {
  readonly bullets: Bullet[]
  fireCooldown: number
  // True for exactly one render frame after a spawn — the Spineboy bridge
  // consumes this to trigger the 'shoot' track-1 overlay.
  fireEdge: boolean
}

export function createBulletState(): BulletState {
  return { bullets: [], fireCooldown: 0, fireEdge: false }
}

export function resetBulletState(s: BulletState): void {
  s.bullets.length = 0
  s.fireCooldown = 0
  s.fireEdge = false
}

// ─── spawn ───────────────────────────────────────────────────────────────────
// Muzzle is the world-space gun-tip position snapshotted by the Spineboy
// bridge on the previous render frame; dir is a unit vector along the barrel.
// Both come from the visual rig so bullets match the visibly-drawn aim — if
// Spineboy's gun is swaying mid-jump, shots sway with it.
export function spawnBullet(
  s: BulletState,
  particles: ParticleSystem,
  muzzleX: number,
  muzzleY: number,
  dirX: number,
  dirY: number,
  kindName: BulletKindName = 'slug',
): void {
  if (s.fireCooldown > 0)
    return
  const kind = BULLET_KINDS[kindName]
  s.bullets.push({
    x: muzzleX,
    y: muzzleY,
    vx: dirX * kind.speed,
    vy: dirY * kind.speed,
    life: kind.lifeSec,
    alive: true,
    kind: kindName,
  })
  s.fireCooldown = kind.fireCooldownSec
  s.fireEdge = true
  // Muzzle flash — quick burst of sparks + embers at the barrel tip.
  emitMuzzleFlash(particles, muzzleX, muzzleY, dirX, dirY)
}

// ─── fixed-tick update ───────────────────────────────────────────────────────
// Per-kind trauma levels are small so a burst of shots doesn't shake the
// screen into uselessness — scaled up for enemy hits so blood spray gets
// a noticeable thud.
const IMPACT_TRAUMA = {
  enemy: 0.18,
  terrain: 0.08,
} as const

export function updateBullets(
  s: BulletState,
  level: Level,
  dummies: readonly Dummy[],
  broadphase: BroadphaseGrid,
  particles: ParticleSystem,
  camera: Camera,
  now: number,
  dt: number,
): void {
  if (s.fireCooldown > 0)
    s.fireCooldown = Math.max(0, s.fireCooldown - dt)

  if (s.bullets.length === 0)
    return

  const candidates: Collider[] = []

  for (const b of s.bullets) {
    if (!b.alive)
      continue

    const kind = BULLET_KINDS[b.kind]

    // Gravity first so initial integrate already reflects arc curvature.
    b.vy += kind.gravity * dt
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.life -= dt

    if (b.life <= 0) {
      b.alive = false
      continue
    }
    if (b.x < -32 || b.x > level.worldWidth + 32 || b.y > level.worldHeight + 32) {
      b.alive = false
      continue
    }

    // ── 1. Dummies first — front-load so enemies soak shots. ─────
    let hitDummy: Dummy | null = null
    for (const d of dummies) {
      if (!d.alive)
        continue
      if (overlapsDummy(d, b.x, b.y, kind.size)) {
        hitDummy = d
        break
      }
    }
    if (hitDummy) {
      damageDummy(hitDummy, kind.damage)
      emitImpactBurst(particles, b.x, b.y, 'enemy', b.vx, b.vy)
      addTrauma(camera, IMPACT_TRAUMA.enemy)
      b.alive = false
      continue
    }

    // ── 2. Terrain SAT via broadphase. ───────────────────────────
    const sz = kind.size
    candidates.length = 0
    broadphase.query(b.x - sz, b.y - sz, b.x + sz, b.y + sz, candidates)

    let hitMaterial: MaterialName | null = null
    let hit = false
    for (const c of candidates) {
      if (!c.alive || c.material === 'shard')
        continue
      const box = { x: b.x - sz, y: b.y - sz, w: sz * 2, h: sz * 2 }
      for (const piece of c.pieces) {
        if (satAabbPoly(box, piece)) {
          hit = true
          hitMaterial = c.material
          break
        }
      }
      if (hit)
        break
    }

    if (hit) {
      applyRupture(
        level,
        b.x,
        b.y,
        { rx: kind.ruptureRadius, ry: kind.ruptureRadius, angle: 0 },
        now,
      )
      emitImpactBurst(particles, b.x, b.y, hitMaterial ?? 'bone', b.vx, b.vy)
      addTrauma(camera, IMPACT_TRAUMA.terrain)
      b.alive = false
    }
  }

  // Compact in place.
  let write = 0
  for (let read = 0; read < s.bullets.length; read++) {
    const b = s.bullets[read]!
    if (b.alive)
      s.bullets[write++] = b
  }
  s.bullets.length = write

  void CONFIG
  // dummyAabb is re-exported by dummy.ts but only used elsewhere; pin so the
  // strict-unused-import lint doesn't fire if this ever gets trimmed.
  void dummyAabb
}

// ─── trajectory prediction (crosshair) ──────────────────────────────────────
// Forward-simulate a bullet of the given kind under the same gravity/dt
// integration as updateBullets, returning sampled points + the first impact.
// Used by the render pipeline to draw a crosshair marker at where the current
// aim would actually land. Cheap enough to run each frame: ~25 steps × a few
// broadphase candidates.

export interface TrajectoryPoint {
  x: number
  y: number
}

export type ImpactHit = 'enemy' | 'terrain' | 'none'

export interface ImpactPrediction {
  readonly points: readonly TrajectoryPoint[]
  readonly impactX: number
  readonly impactY: number
  readonly hit: ImpactHit
  readonly material: MaterialName | null
}

export function predictBulletImpact(
  startX: number,
  startY: number,
  dirX: number,
  dirY: number,
  kindName: BulletKindName,
  level: Level,
  dummies: readonly Dummy[],
  broadphase: BroadphaseGrid,
): ImpactPrediction {
  const kind = BULLET_KINDS[kindName]
  const stepDt = 0.04 // ~25 Hz sim — coarse, but smooth enough to read as a curve
  const maxSteps = Math.ceil(kind.lifeSec / stepDt) + 2
  const points: TrajectoryPoint[] = [{ x: startX, y: startY }]
  const candidates: Collider[] = []
  const sz = kind.size

  let x = startX
  let y = startY
  const vx = dirX * kind.speed
  let vy = dirY * kind.speed

  for (let i = 0; i < maxSteps; i++) {
    vy += kind.gravity * stepDt
    x += vx * stepDt
    y += vy * stepDt
    points.push({ x, y })

    if (x < -32 || x > level.worldWidth + 32 || y > level.worldHeight + 32)
      return { points, impactX: x, impactY: y, hit: 'none', material: null }

    // Dummies first — matches runtime ordering in updateBullets.
    for (const d of dummies) {
      if (!d.alive)
        continue
      if (overlapsDummy(d, x, y, sz))
        return { points, impactX: x, impactY: y, hit: 'enemy', material: null }
    }

    // Terrain.
    candidates.length = 0
    broadphase.query(x - sz, y - sz, x + sz, y + sz, candidates)
    for (const c of candidates) {
      if (!c.alive || c.material === 'shard')
        continue
      const box = { x: x - sz, y: y - sz, w: sz * 2, h: sz * 2 }
      for (const piece of c.pieces) {
        if (satAabbPoly(box, piece))
          return { points, impactX: x, impactY: y, hit: 'terrain', material: c.material }
      }
    }
  }
  return { points, impactX: x, impactY: y, hit: 'none', material: null }
}
