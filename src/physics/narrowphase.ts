// Narrowphase collision: AABB vs. convex polygon via SAT. Narrowphase only
// computes the collision data; `resolve.ts` applies it to the player.

import type { Collider } from '../world/level'
import type { AABB, SatHit } from './sat'
import { satAabbPoly } from './sat'

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
