// Movement + collision resolution for the player AABB against the
// polygon world. Iterative MTV along the contact normal. Also owns:
//   - corner correction when rising into a ceiling-edge
//   - one-way gating
//   - grounded / touchingWall flags
//   - slope projection + stick-to-ground (step 4 fills these in)
//
// The player is always an AABB — keeping the resolver one-sided (AABB
// vs. polygon, never poly vs. poly) is simpler and fast enough.

import type { Player } from '../player'
import type { Collider, Level } from '../world/level'
import type { BroadphaseGrid } from './broadphase'
import type { AABB } from '../math/sat'
import { CONFIG } from '../config'
import { satAabbPoly } from '../math/sat'
import { deepestContact } from './narrowphase'

const MAX_MTV_ITERS = 4
// Grounded when contact normal points sufficiently upward (in our y-down
// screen space, that means normal.y < -this threshold).
const GROUND_NORMAL_Y = -0.7
// Treat a contact as a wall when |normal.x| exceeds this. Keeps slope
// surfaces out of the "touching a wall" category.
const WALL_NORMAL_X = 0.7
// Corner correction triggers when we'd clip a ceiling-ish edge —
// normal.y > this (polygon is above, pushing player down).
const CEILING_NORMAL_Y = 0.7

function playerBox(p: Player): AABB {
  return { x: p.x, y: p.y, w: p.w, h: p.h }
}

// One-way gating. A one-way platform only collides when the player is
// clearly coming down onto its top surface: AABB bottom was above the
// hit edge before this move, and vy ≥ 0.
function oneWayAllowsContact(
  p: Player,
  prevY: number,
  normal: { x: number, y: number },
): boolean {
  if (normal.y >= GROUND_NORMAL_Y)
    return false // contact from below / the side — pass through
  // Was the player's bottom above the platform prior to this substep?
  // `prevY + h` is the old bottom; if it's at-or-above where we'd settle,
  // the player is arriving from above.
  return p.vy >= 0 && prevY + p.h <= p.y + p.h
}

// Nudge sideways up to CORNER_NUDGE px when a head-clip would otherwise
// kill the jump. Only runs while rising. Called BEFORE the move is applied.
function tryCornerNudge(p: Player, dt: number, candidates: readonly Collider[]): void {
  if (p.vy >= 0)
    return
  const newY = p.y + p.vy * dt
  const probe: AABB = { x: p.x, y: newY, w: p.w, h: p.h }
  const hit = deepestContact(probe, candidates)
  if (!hit)
    return
  if (hit.normal.y < CEILING_NORMAL_Y)
    return // not a ceiling-ish contact; not our job

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

// Integrate one substep worth of movement and resolve collisions.
// Mutates p.{x,y,vx,vy,grounded,touchingWall}. Caller is responsible
// for running gravity/input before this and reading p after.
// `level` is accepted for future use (slope handling reads materials),
// kept in the signature for step-4 drop-in.
export function moveAndCollide(
  p: Player,
  _level: Level,
  dt: number,
  broadphase: BroadphaseGrid,
): void {
  const candidates: Collider[] = []
  // Gather broadphase candidates using an expanded query box that
  // covers both start and end positions.
  const padX = Math.max(CONFIG.CORNER_NUDGE, Math.abs(p.vx * dt)) + 2
  const padY = Math.max(CONFIG.CORNER_NUDGE, Math.abs(p.vy * dt)) + 2
  broadphase.query(
    p.x - padX,
    p.y - padY,
    p.x + p.w + padX,
    p.y + p.h + padY,
    candidates,
  )

  // Filter hazards out of the physics candidates — they're pass-through.
  // Hazard overlap is checked separately (see physics.ts rectOverlapsHazard).
  const physical = candidates.filter(c => c.material !== 'hazard')

  const prevY = p.y
  tryCornerNudge(p, dt, physical)

  p.x += p.vx * dt
  p.y += p.vy * dt

  let grounded = false
  let touchingWall = false

  for (let iter = 0; iter < MAX_MTV_ITERS; iter++) {
    let bestDepth = 0
    let bestNx = 0
    let bestNy = 0
    let bestOneWayOk = true
    let found = false

    const box = playerBox(p)
    for (const c of physical) {
      if (!c.alive)
        continue
      for (const piece of c.pieces) {
        const hit = satAabbPoly(box, piece)
        if (!hit)
          continue
        if (c.oneWay && !oneWayAllowsContact(p, prevY, hit.normal))
          continue
        if (hit.depth > bestDepth) {
          bestDepth = hit.depth
          bestNx = hit.normal.x
          bestNy = hit.normal.y
          bestOneWayOk = true
          found = true
        }
      }
    }
    if (!found)
      break
    if (!bestOneWayOk)
      break

    // Push out along the contact normal.
    p.x += bestNx * bestDepth
    p.y += bestNy * bestDepth

    // Cancel velocity component going INTO the surface (preserves tangent).
    const vn = p.vx * bestNx + p.vy * bestNy
    if (vn < 0) {
      p.vx -= bestNx * vn
      p.vy -= bestNy * vn
    }

    if (bestNy < GROUND_NORMAL_Y)
      grounded = true
    if (Math.abs(bestNx) > WALL_NORMAL_X)
      touchingWall = true
  }

  p.grounded = grounded
  p.touchingWall = touchingWall
}

// AABB vs. any hazard-tagged collider. SAT-based so we catch hazards
// of any shape, not just axis-aligned.
export function overlapsHazard(level: Level, x: number, y: number, w: number, h: number): boolean {
  const box: AABB = { x, y, w, h }
  for (const c of level.colliders) {
    if (!c.alive || c.material !== 'hazard')
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
