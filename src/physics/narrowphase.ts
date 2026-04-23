// Narrowphase collision: AABB vs. convex polygon via SAT, plus swept-AABB
// CCD for high-speed tunneling prevention. Narrowphase only computes the
// collision data; `resolve.ts` applies it to the player.

import type { Collider } from '../world/level'
import type { AABB, SatHit } from '../math/sat'
import type { Vec2 } from '../math/vec2'
import { satAabbPoly } from '../math/sat'

export interface ContactHit extends SatHit {
  collider: Collider
}

// SAT the AABB against every convex piece of every candidate collider.
// One-way colliders are gated by caller — this module reports geometry
// only; semantic filters live in resolve.ts.
//
// Returns the DEEPEST hit. Resolving the worst overlap first is generally
// sufficient for kinematic AABB vs. static world at small dt; if more
// depth remains after resolution, the next substep picks it up.
export function deepestContact(box: AABB, candidates: readonly Collider[]): ContactHit | null {
  let best: ContactHit | null = null
  for (const c of candidates) {
    if (!c.alive)
      continue
    for (const piece of c.pieces) {
      const hit = satAabbPoly(box, piece)
      if (!hit)
        continue
      if (!best || hit.depth > best.depth) {
        best = { collider: c, normal: hit.normal, depth: hit.depth }
      }
    }
  }
  return best
}

// Swept-AABB against the swept path (prev center → next center). Returns
// the time of impact in [0, 1] where 1 = no collision along the sweep.
// Implementation: binary-search along the path for the first substep where
// SAT reports a hit. Coarse but robust for our small dt + low candidate
// counts; good enough for CCD of a 12x14 AABB at player speeds.
export function sweptToi(
  prev: Vec2,
  next: Vec2,
  halfW: number,
  halfH: number,
  candidates: readonly Collider[],
): number {
  const dx = next.x - prev.x
  const dy = next.y - prev.y
  if (dx === 0 && dy === 0)
    return 1

  // Fast path: are we clear at `next`? If so, no collision along the sweep.
  // (True only when the path is "short enough" that starting-clear + ending-clear
  //  implies a clear interior. For player-speed sweeps at substep dt this holds.)
  const endBox: AABB = { x: next.x - halfW, y: next.y - halfH, w: halfW * 2, h: halfH * 2 }
  if (deepestContact(endBox, candidates) === null)
    return 1

  // Bisect [0, 1] to find the TOI. 10 iterations = 1/1024 of the path — ~0.1px
  // precision at typical substep distances. We conservatively back off a bit
  // so the resolver still has a non-zero gap to push against.
  let lo = 0
  let hi = 1
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) * 0.5
    const box: AABB = {
      x: prev.x + dx * mid - halfW,
      y: prev.y + dy * mid - halfH,
      w: halfW * 2,
      h: halfH * 2,
    }
    if (deepestContact(box, candidates))
      hi = mid
    else
      lo = mid
  }
  return lo
}
