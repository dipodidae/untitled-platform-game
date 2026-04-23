// Rupture vs. polygon world. Subtracts the rupture ellipse from every
// overlapping destructible collider using polygon boolean difference,
// re-decomposes the remainder into convex pieces, and tallies the data
// the rupture orchestrator needs for impulse + reflection math.

import type { RuptureShape } from '../rupture'
import type { Collider, Level, MaterialName } from './level'
import { CONFIG } from '../config'
import { circleToPolygon, polygonDifference } from '../math/polygon'
import { buildCollider, refreshCollider } from './level'

export interface AffectedCollider {
  id: number
  prevMaterial: MaterialName
  destroyed: boolean // collider fully removed
  cracked: boolean // stone took a hit but survived
}

export interface DestructionOutcome {
  affected: AffectedCollider[]
  // Sum of (center - steel_centroid) across every steel collider the
  // rupture touched. Orchestrator normalizes to direction.
  reflection: { x: number, y: number }
  reflectionCount: number
  // Sum of (terrain_centroid - center) across every solid collider
  // touched — orchestrator uses this when velocity is too low to give a
  // direction for self-impulse.
  terrainToward: { x: number, y: number }
  terrainCount: number
}

// AABB of the rupture ellipse (loose — uses max of rx/ry as radius).
function ellipseBBox(cx: number, cy: number, shape: RuptureShape): {
  minX: number, minY: number, maxX: number, maxY: number
} {
  const r = Math.max(shape.rx, shape.ry)
  return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r }
}

function centroidXY(c: Collider): { x: number, y: number } {
  return { x: (c.minX + c.maxX) / 2, y: (c.minY + c.maxY) / 2 }
}

// Next collider id. We bump past the max existing id so splits don't
// collide with authored ids.
function allocId(level: Level): number {
  let max = 0
  for (const c of level.colliders) {
    if (c.id > max)
      max = c.id
  }
  return max + 1
}

export function applyRupture(
  level: Level,
  cx: number,
  cy: number,
  shape: RuptureShape,
): DestructionOutcome {
  const shapePoly = circleToPolygon(cx, cy, shape.rx, shape.ry, shape.angle)
  const bbox = ellipseBBox(cx, cy, shape)

  const affected: AffectedCollider[] = []
  const next: Collider[] = []
  let refX = 0
  let refY = 0
  let refCount = 0
  let terX = 0
  let terY = 0
  let terCount = 0

  for (const c of level.colliders) {
    if (!c.alive) {
      next.push(c)
      continue
    }
    // AABB early reject.
    if (c.minX > bbox.maxX || c.maxX < bbox.minX
      || c.minY > bbox.maxY || c.maxY < bbox.minY) {
      next.push(c)
      continue
    }

    // Hazard: untouched.
    if (c.material === 'hazard') {
      next.push(c)
      continue
    }

    // Steel: untouched, contributes reflection AND terrain vectors.
    if (c.material === 'steel') {
      const cen = centroidXY(c)
      refX += cx - cen.x
      refY += cy - cen.y
      refCount++
      terX += cen.x - cx
      terY += cen.y - cy
      terCount++
      next.push(c)
      continue
    }

    // Stone chipping: first hit increments damage, doesn't carve.
    if (c.material === 'stone' && c.damage < CONFIG.STONE_HITS - 1) {
      c.damage++
      const cen = centroidXY(c)
      terX += cen.x - cx
      terY += cen.y - cy
      terCount++
      affected.push({ id: c.id, prevMaterial: 'stone', destroyed: false, cracked: true })
      next.push(c)
      continue
    }

    // Destructible (dirt, or stone at/past threshold): clip.
    const cen = centroidXY(c)
    terX += cen.x - cx
    terY += cen.y - cy
    terCount++

    const remaining = polygonDifference(c.vertices, [shapePoly])
    if (remaining.length === 0) {
      c.alive = false
      affected.push({ id: c.id, prevMaterial: c.material, destroyed: true, cracked: false })
      // Don't push — fully removed from the world.
      continue
    }

    // Replace current collider with first piece; additional pieces
    // become new colliders with fresh ids.
    const first = remaining[0]!
    c.vertices = first
    c.damage = 0 // reset — this is now a new shape
    refreshCollider(c)
    next.push(c)
    for (let i = 1; i < remaining.length; i++) {
      next.push(buildCollider(allocId(level), c.material, remaining[i]!, c.oneWay))
    }
    affected.push({ id: c.id, prevMaterial: c.material, destroyed: false, cracked: false })
  }

  level.colliders = next

  return {
    affected,
    reflection: { x: refX, y: refY },
    reflectionCount: refCount,
    terrainToward: { x: terX, y: terY },
    terrainCount: terCount,
  }
}
