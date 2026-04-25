// Movement + collision resolution for the player AABB against the
// polygon world. Iterative MTV along the contact normal. Owns:
//   - corner nudge when rising into a ceiling-edge
//   - one-way platform gating + drop-through respect
//   - slope projection (tangent-aligned velocity while grounded)
//   - stick-to-ground probe to keep descent smooth on bumpy terrain
//   - grounded / touchingWall / groundNormal flags

import type { Player } from '../player/player'
import type { Collider, Level } from '../world/level'
import type { BroadphaseGrid } from './broadphase'
import type { AABB } from './sat'
import { CONFIG } from '../config'
import { deepestContact } from './narrowphase'
import { satAabbPoly } from './sat'

const MAX_MTV_ITERS = 4
// cos(MAX_SLOPE_ANGLE). normal.y < -this ⇒ surface walkable. A 50° slope
// has normal.y = -cos(50°) ≈ -0.643.
const GROUND_NORMAL_Y = -Math.cos((CONFIG.MAX_SLOPE_ANGLE * Math.PI) / 180)
const WALL_NORMAL_X = 0.7
// Corner correction triggers when we'd clip a ceiling — normal.y >= this
// (polygon is above, pushing player down).
const CEILING_NORMAL_Y = 0.7

function playerBox(p: Player): AABB {
  return { x: p.x, y: p.y, w: p.w, h: p.h }
}

// One-way platform gating. Collide only when arriving from above: vy ≥ 0
// AND the pre-move bottom was at or above the top of the platform hit.
function oneWayAllowsContact(
  p: Player,
  prevY: number,
  normal: { x: number, y: number },
): boolean {
  if (p.dropThroughTimer > 0)
    return false
  if (normal.y >= GROUND_NORMAL_Y)
    return false // side / under — always pass through
  return p.vy >= 0 && prevY + p.h <= p.y + p.h
}

function tryCornerNudge(p: Player, dt: number, candidates: readonly Collider[]): void {
  if (p.vy >= 0)
    return
  const newY = p.y + p.vy * dt
  const probe: AABB = { x: p.x, y: newY, w: p.w, h: p.h }
  const hit = deepestContact(probe, candidates)
  if (!hit || hit.normal.y < CEILING_NORMAL_Y)
    return

  for (let n = 1; n <= CONFIG.CORNER_NUDGE; n++) {
    const right: AABB = { x: p.x + n, y: newY, w: p.w, h: p.h }
    if (!deepestContact(right, candidates)) {
      p.x += n
      return
    }
    const left: AABB = { x: p.x - n, y: newY, w: p.w, h: p.h }
    if (!deepestContact(left, candidates)) {
      p.x -= n
      return
    }
  }
}

// Rotate the (vx, ~0) horizontal intent into a tangent-aligned velocity
// matching the current ground normal. Call BEFORE applying gravity.
//
// Effect: walking uphill preserves horizontal input magnitude (no cos()
// slowdown), and walking downhill produces gentle downward velocity that
// the stick-to-ground pass catches.
export function applySlopeProjection(p: Player): void {
  if (!p.grounded || !p.groundNormal)
    return
  const nx = p.groundNormal.x
  if (Math.abs(nx) < 0.01)
    return // flat ground, nothing to do
  // Tangent = rotate normal by +90° (CCW): (-ny, nx). Orient along vx sign.
  let tx = -p.groundNormal.y
  let ty = nx
  const speed = Math.abs(p.vx)
  if (speed < 0.01) {
    // Not actively walking — let natural gravity + collision handle.
    return
  }
  const wantDir = Math.sign(p.vx)
  const tangentDirX = Math.sign(tx) || 1
  if (tangentDirX !== wantDir) {
    tx = -tx
    ty = -ty
  }
  p.vx = tx * speed
  p.vy = ty * speed
}

// After a tick's move+collide, if the player WAS grounded last frame and
// isn't now (probably stepped off a downslope), probe downward up to
// STICK_TO_GROUND_MAX_DIST px to reattach. Caller ensures we're not
// mid-jump before calling.
export function tryStickToGround(p: Player, broadphase: BroadphaseGrid): void {
  const dist = CONFIG.STICK_TO_GROUND_MAX_DIST
  const candidates: Collider[] = []
  broadphase.query(
    p.x - 2,
    p.y - 2,
    p.x + p.w + 2,
    p.y + p.h + dist + 2,
    candidates,
  )
  const physical = candidates.filter(c => c.material !== 'shard')
  const savedY = p.y
  // Push down by `dist`, find deepest contact with a floor-ish normal,
  // then resolve along that normal so we settle on top.
  p.y += dist
  const box = playerBox(p)
  let bestDepth = 0
  let bestNx = 0
  let bestNy = 0
  let found = false
  for (const c of physical) {
    if (!c.alive)
      continue
    if (c.oneWay && !oneWayAllowsContact(p, savedY, { x: 0, y: -1 }))
      continue
    for (const piece of c.pieces) {
      const hit = satAabbPoly(box, piece)
      if (!hit)
        continue
      if (hit.normal.y >= GROUND_NORMAL_Y)
        continue // not ground-facing
      if (hit.depth > bestDepth) {
        bestDepth = hit.depth
        bestNx = hit.normal.x
        bestNy = hit.normal.y
        found = true
      }
    }
  }
  if (!found) {
    p.y = savedY
    return
  }
  p.x += bestNx * bestDepth
  p.y += bestNy * bestDepth
  p.grounded = true
  p.groundNormal = { x: bestNx, y: bestNy }
  // Kill residual vy so we don't immediately come off again.
  if (p.vy > 0)
    p.vy = 0
}

export function moveAndCollide(
  p: Player,
  _level: Level,
  dt: number,
  broadphase: BroadphaseGrid,
): void {
  const candidates: Collider[] = []
  const padX = Math.max(CONFIG.CORNER_NUDGE, Math.abs(p.vx * dt)) + 2
  const padY = Math.max(CONFIG.CORNER_NUDGE, Math.abs(p.vy * dt)) + 2
  broadphase.query(
    p.x - padX,
    p.y - padY,
    p.x + p.w + padX,
    p.y + p.h + padY,
    candidates,
  )
  const physical = candidates.filter(c => c.material !== 'shard')

  const prevY = p.y
  tryCornerNudge(p, dt, physical)

  p.x += p.vx * dt
  p.y += p.vy * dt

  let grounded = false
  let touchingWall = false
  let wallSide: -1 | 0 | 1 = 0
  let gnx = 0
  let gny = 0
  let groundCollider: Collider | null = null

  for (let iter = 0; iter < MAX_MTV_ITERS; iter++) {
    let bestDepth = -1
    let bestNx = 0
    let bestNy = 0
    let bestCollider: Collider | null = null
    let found = false

    const box = playerBox(p)
    for (const c of physical) {
      if (!c.alive)
        continue
      // Glass priming: touched glass acts as one-way (passable from below).
      const effectiveOneWay = c.oneWay || (c.material === 'glass' && c.touched)
      for (const piece of c.pieces) {
        const hit = satAabbPoly(box, piece)
        if (!hit)
          continue
        if (effectiveOneWay && !oneWayAllowsContact(p, prevY, hit.normal))
          continue
        // Always consider any hit — including depth=0 contact.
        // Without this, a player at rest exactly on top of the floor
        // (common post-MTV steady state) would not register grounded,
        // and jumps would silently fail.
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

    // Register contact flags even for depth=0 "touching" contacts.
    if (bestNy < GROUND_NORMAL_Y) {
      grounded = true
      groundCollider = bestCollider
      if (bestNy < gny) {
        gnx = bestNx
        gny = bestNy
      }
    }
    if (Math.abs(bestNx) > WALL_NORMAL_X) {
      touchingWall = true
      wallSide = bestNx > 0 ? -1 : 1 // normal points away from wall; wall on opposite side
    }

    // Nothing to displace — contact is registered, iteration done.
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

  // Soft contact damping: if any touched collider this tick was SOFT,
  // bleed velocity. Cost of hiding in the padded places.
  let touchedSoft = false
  const postBox = playerBox(p)
  for (const c of physical) {
    if (!c.alive || c.material !== 'soft')
      continue
    if (postBox.x + postBox.w < c.minX - 1 || postBox.x > c.maxX + 1
      || postBox.y + postBox.h < c.minY - 1 || postBox.y > c.maxY + 1) {
      continue
    }
    touchedSoft = true
    break
  }
  if (touchedSoft) {
    const factor = CONFIG.SOFT_DAMPING_PER_SEC ** dt
    p.vx *= factor
    p.vy *= factor
  }

  // Bone-fragile collapse: increment contactTime for any bone_fragile
  // collider the player is standing on this tick. Once the timer fills,
  // the collider dies. Timer persists — leaving and returning continues
  // the countdown.
  if (grounded) {
    for (const c of physical) {
      if (!c.alive || c.material !== 'bone_fragile')
        continue
      if (postBox.x + postBox.w < c.minX - 1 || postBox.x > c.maxX + 1
        || postBox.y + postBox.h < c.minY - 1 || postBox.y > c.maxY + 1) {
        continue
      }
      for (const piece of c.pieces) {
        const hit = satAabbPoly(postBox, piece)
        if (hit && hit.normal.y < GROUND_NORMAL_Y) {
          c.contactTime += dt
          if (c.contactTime >= CONFIG.BONE_FRAGILE_COLLAPSE_TIME)
            c.alive = false
          break
        }
      }
    }
  }

  // Ground material tracking + glass priming + resonant chain.
  if (grounded && groundCollider) {
    p.groundMaterial = groundCollider.material

    // Glass priming: first ground contact marks the glass as touched.
    // On subsequent approaches from below it acts as one-way.
    if (groundCollider.material === 'glass' && !groundCollider.touched)
      groundCollider.touched = true

    // Resonant chain: consecutive resonant contacts stack the boost.
    if (groundCollider.material === 'resonant') {
      if (!p.grounded)
        p.resonantChain++
    }
    else {
      p.resonantChain = 0
    }
  }
  else {
    // Airborne — keep groundMaterial from last frame for coyote-time
    // jump boost, but don't reset chain until we land on something else.
    if (!grounded && !p.grounded)
      p.groundMaterial = null
  }

  p.grounded = grounded
  p.touchingWall = touchingWall
  p.wallSide = touchingWall ? wallSide : 0
  p.groundNormal = grounded ? { x: gnx, y: gny } : null
}

// Player AABB vs. any lethal collider. Only SHARDS are lethal in
// FAULTLINE — everything else is solid or pass-through-harmless. Shards
// are what you leave behind when you ruin yourself.
export function overlapsLethal(level: Level, x: number, y: number, w: number, h: number): boolean {
  const box: AABB = { x, y, w, h }
  for (const c of level.colliders) {
    if (!c.alive || c.material !== 'shard')
      continue
    if (x + w < c.minX || x > c.maxX || y + h < c.minY || y > c.maxY)
      continue
    for (const piece of c.pieces) {
      if (satAabbPoly(box, piece))
        return true
    }
  }
  return false
}
