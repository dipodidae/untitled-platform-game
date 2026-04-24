// The Prowler — a weighted movement organism that lives in the same physics
// as the player. Not an AI with states; a body with material biases.
//
// Ground confidence scales movement speed:
//   bone=1.0  resonant=0.8  glass=0.3  soft=0.2  airborne=0.0
//
// Player attraction: constant horizontal bias toward player.x, scaled by
// confidence. Never chases vertically — just horizontal pressure.
//
// Instability: accumulates from momentum events (resonant launches, fast
// landings, glass contact). At high instability, breaks glass underfoot.
// Rupture within radius = massive knockback + instability spike.
// Max instability = shatter (removed temporarily, respawns after cooldown).

import type { AABB } from '../math/sat'
import type { BroadphaseGrid } from '../physics/broadphase'
import type { Player } from '../player'
import type { Collider, Level, MaterialName } from '../world/level'
import { CONFIG } from '../config'
import { satAabbPoly } from '../math/sat'

// ─── confidence table ─────────────────────────────────────────────────
const GROUND_CONFIDENCE: Partial<Record<MaterialName, number>> = {
  bone: 1.0,
  bone_fragile: 0.9,
  resonant: 0.8,
  glass: 0.3,
  soft: 0.2,
  shard: 0.0,
}

// ─── config ───────────────────────────────────────────────────────────
const PROWLER_W = 14
const PROWLER_H = 14
const PROWLER_MAX_SPEED = 55 // px/s — slower than player (110)
const PROWLER_ACCEL = 280 // px/s²
const PROWLER_ATTRACTION = 0.6 // weight toward player.x (0..1)
const PROWLER_DETECT_RANGE = 200 // px — horizontal range for attraction
const PROWLER_KNOCKBACK = 180 // impulse applied to player on contact
const PROWLER_INSTABILITY_MAX = 1.0
const PROWLER_INSTAB_DECAY = 0.08 // per second
const PROWLER_INSTAB_RESONANT = 0.25 // gained per resonant launch
const PROWLER_INSTAB_GLASS = 0.15 // gained per glass contact tick
const PROWLER_INSTAB_LANDING = 0.10 // gained on fast landing
const PROWLER_GLASS_BREAK_THRESH = 0.7 // instability above this breaks glass
const PROWLER_SHATTER_RESPAWN = 3.0 // seconds before respawn after shatter
const PROWLER_RUPTURE_RANGE = 40 // px — rupture within this radius affects prowler
const PROWLER_RUPTURE_KNOCKBACK = 250 // impulse from rupture
const PROWLER_RUPTURE_INSTAB = 0.35 // instability gained from rupture hit
const PROWLER_STUN_TIME = 0.8 // seconds stunned after rupture hit

const GROUND_NORMAL_Y = -Math.cos((CONFIG.MAX_SLOPE_ANGLE * Math.PI) / 180)

export interface Prowler {
  x: number
  y: number
  vx: number
  vy: number
  readonly w: number
  readonly h: number
  grounded: boolean
  groundMaterial: MaterialName | null
  facing: 1 | -1
  instability: number
  alive: boolean
  stunTimer: number // seconds remaining in stun
  shatterTimer: number // seconds until respawn (0 = active)
  spawnX: number
  spawnY: number
}

export function createProwler(x: number, y: number): Prowler {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    w: PROWLER_W,
    h: PROWLER_H,
    grounded: false,
    groundMaterial: null,
    facing: 1,
    instability: 0,
    alive: true,
    stunTimer: 0,
    shatterTimer: 0,
    spawnX: x,
    spawnY: y,
  }
}

function prowlerBox(p: Prowler): AABB {
  return { x: p.x, y: p.y, w: p.w, h: p.h }
}

// ─── physics: move + collide (shared with player logic) ───────────────
function moveAndCollideProwler(
  p: Prowler,
  dt: number,
  broadphase: BroadphaseGrid,
): void {
  const candidates: Collider[] = []
  const pad = Math.max(4, Math.abs(p.vx * dt), Math.abs(p.vy * dt)) + 2
  broadphase.query(p.x - pad, p.y - pad, p.x + p.w + pad, p.y + p.h + pad, candidates)
  const physical = candidates.filter(c => c.material !== 'shard' && c.alive)

  p.x += p.vx * dt
  p.y += p.vy * dt

  let grounded = false
  let groundMat: MaterialName | null = null

  // Iterative MTV — same as player, simpler (no corner nudge)
  for (let iter = 0; iter < 4; iter++) {
    let bestDepth = -1
    let bestNx = 0
    let bestNy = 0
    let bestCollider: Collider | null = null
    let found = false

    const box = prowlerBox(p)
    for (const c of physical) {
      const effectiveOneWay = c.oneWay || (c.material === 'glass' && c.touched)
      for (const piece of c.pieces) {
        const hit = satAabbPoly(box, piece)
        if (!hit)
          continue
        // One-way: only collide from above
        if (effectiveOneWay) {
          if (hit.normal.y >= GROUND_NORMAL_Y)
            continue
          if (p.vy < 0)
            continue
        }
        if (!found || hit.depth > bestDepth) {
          bestDepth = hit.depth
          bestNx = hit.normal.x
          bestNy = hit.normal.y
          bestCollider = c
          found = true
        }
      }
    }
    if (!found)
      break

    if (bestNy < GROUND_NORMAL_Y) {
      grounded = true
      groundMat = bestCollider?.material ?? null
    }

    if (bestDepth <= 0.001)
      break
    p.x += bestNx * bestDepth
    p.y += bestNy * bestDepth
    const vn = p.vx * bestNx + p.vy * bestNy
    if (vn < 0) {
      p.vx -= bestNx * vn
      p.vy -= bestNy * vn
    }
  }

  p.grounded = grounded
  p.groundMaterial = groundMat
}

// ─── edge detection ───────────────────────────────────────────────────
function hasFloorAhead(p: Prowler, broadphase: BroadphaseGrid): boolean {
  // Probe one step ahead + below for ground
  const probeX = p.facing === 1 ? p.x + p.w + 2 : p.x - 4
  const probeY = p.y + p.h + 2
  const candidates: Collider[] = []
  broadphase.query(probeX, probeY, probeX + 2, probeY + 16, candidates)
  for (const c of candidates) {
    if (!c.alive || c.material === 'shard')
      continue
    for (const piece of c.pieces) {
      if (satAabbPoly({ x: probeX, y: probeY, w: 2, h: 16 }, piece))
        return true
    }
  }
  return false
}

// ─── main update ──────────────────────────────────────────────────────
export function updateProwler(
  p: Prowler,
  player: Player,
  level: Level,
  broadphase: BroadphaseGrid,
  dt: number,
): void {
  // Shatter respawn countdown
  if (p.shatterTimer > 0) {
    p.shatterTimer -= dt
    if (p.shatterTimer <= 0) {
      p.alive = true
      p.x = p.spawnX
      p.y = p.spawnY
      p.vx = 0
      p.vy = 0
      p.instability = 0
      p.stunTimer = 0
      p.grounded = false
    }
    return
  }

  if (!p.alive)
    return

  // Stun decay
  if (p.stunTimer > 0) {
    p.stunTimer -= dt
  }

  // Instability decay
  p.instability = Math.max(0, p.instability - PROWLER_INSTAB_DECAY * dt)

  // Gravity
  const gravity = p.vy < 0 ? CONFIG.JUMP_GRAVITY : CONFIG.FALL_GRAVITY
  p.vy += gravity * dt
  if (p.vy > CONFIG.MAX_FALL)
    p.vy = CONFIG.MAX_FALL

  // Confidence from ground material
  const confidence = p.grounded && p.groundMaterial
    ? (GROUND_CONFIDENCE[p.groundMaterial] ?? 0.5)
    : 0

  // Movement (only if not stunned and grounded)
  if (p.stunTimer <= 0 && p.grounded) {
    // Player attraction vector
    let targetVx = 0
    const dx = player.x - p.x
    const dist = Math.abs(dx)
    if (dist < PROWLER_DETECT_RANGE && player.alive) {
      // Weighted toward player
      targetVx = Math.sign(dx) * PROWLER_MAX_SPEED * PROWLER_ATTRACTION * confidence
    }

    // Patrol drift when player is far
    if (Math.abs(targetVx) < 5) {
      targetVx = p.facing * PROWLER_MAX_SPEED * 0.4 * confidence
    }

    // Edge avoidance: reverse at ledges
    if (!hasFloorAhead(p, broadphase)) {
      p.facing = p.facing === 1 ? -1 : 1
      targetVx = p.facing * PROWLER_MAX_SPEED * 0.3 * confidence
    }

    // Update facing
    if (targetVx > 1)
      p.facing = 1
    else if (targetVx < -1)
      p.facing = -1

    // Accelerate toward target
    const accel = PROWLER_ACCEL * confidence * dt
    if (p.vx < targetVx)
      p.vx = Math.min(p.vx + accel, targetVx)
    else if (p.vx > targetVx)
      p.vx = Math.max(p.vx - accel, targetVx)
  }
  else if (p.stunTimer > 0) {
    // Stunned: friction decay
    p.vx *= 0.92
  }

  // Soft damping
  if (p.grounded && p.groundMaterial === 'soft') {
    const factor = CONFIG.SOFT_DAMPING_PER_SEC ** dt
    p.vx *= factor
  }

  // Move + collide
  const wasGrounded = p.grounded
  moveAndCollideProwler(p, dt, broadphase)

  // Instability events
  if (p.grounded && p.groundMaterial === 'glass') {
    p.instability += PROWLER_INSTAB_GLASS * dt
  }
  if (p.grounded && p.groundMaterial === 'resonant' && !wasGrounded) {
    p.instability += PROWLER_INSTAB_RESONANT
  }
  if (p.grounded && !wasGrounded && Math.abs(p.vy) > 150) {
    p.instability += PROWLER_INSTAB_LANDING
  }

  // Glass breaking under unstable prowler
  if (p.grounded && p.groundMaterial === 'glass' && p.instability > PROWLER_GLASS_BREAK_THRESH) {
    const box = prowlerBox(p)
    for (const c of level.colliders) {
      if (!c.alive || c.material !== 'glass')
        continue
      if (box.x + box.w < c.minX || box.x > c.maxX || box.y + box.h < c.minY || box.y > c.maxY)
        continue
      c.alive = false
    }
  }

  // Shatter at max instability
  if (p.instability >= PROWLER_INSTABILITY_MAX) {
    p.alive = false
    p.shatterTimer = PROWLER_SHATTER_RESPAWN
  }

  // Fall-out safety
  if (p.y > level.worldHeight + 100) {
    p.alive = false
    p.shatterTimer = PROWLER_SHATTER_RESPAWN
  }
}

// ─── rupture reaction ─────────────────────────────────────────────────
// Called by game.ts after a rupture event occurs.
export function prowlerReactToRupture(
  p: Prowler,
  ruptureX: number,
  ruptureY: number,
): void {
  if (!p.alive || p.shatterTimer > 0)
    return
  const cx = p.x + p.w / 2
  const cy = p.y + p.h / 2
  const dx = cx - ruptureX
  const dy = cy - ruptureY
  const dist = Math.hypot(dx, dy)
  if (dist > PROWLER_RUPTURE_RANGE)
    return

  // Knockback away from rupture center
  const falloff = 1 - dist / PROWLER_RUPTURE_RANGE
  const nx = dist > 0.1 ? dx / dist : 0
  const ny = dist > 0.1 ? dy / dist : -1
  p.vx += nx * PROWLER_RUPTURE_KNOCKBACK * falloff
  p.vy += ny * PROWLER_RUPTURE_KNOCKBACK * falloff
  p.instability += PROWLER_RUPTURE_INSTAB * falloff
  p.stunTimer = PROWLER_STUN_TIME
  p.grounded = false
}

// ─── player contact ───────────────────────────────────────────────────
// Returns true if contact happened (player gets knocked back).
export function checkProwlerPlayerContact(p: Prowler, player: Player): boolean {
  if (!p.alive || p.shatterTimer > 0 || !player.alive)
    return false
  if (player.iframeTimer > 0)
    return false

  // AABB overlap
  if (
    player.x + player.w <= p.x
    || player.x >= p.x + p.w
    || player.y + player.h <= p.y
    || player.y >= p.y + p.h
  ) {
    return false
  }

  // Knockback direction: away from prowler center
  const pcx = p.x + p.w / 2
  const plx = player.x + player.w / 2
  const dir = plx >= pcx ? 1 : -1
  player.vx = dir * PROWLER_KNOCKBACK
  player.vy = -PROWLER_KNOCKBACK * 0.5
  player.grounded = false
  return true
}
