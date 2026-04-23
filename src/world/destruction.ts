// Rupture vs. polygon world — per-material response.
//
//   glass        → 1 hit, carves like dirt, spawns shard colliders at break
//   bone         → BONE_HITS-1 cracked states before carving; damage survives
//                  across ruptures (primed earlier, fails later)
//   bone_fragile → same as bone during rupture (also has timer-based collapse)
//   resonant     → indestructible; contributes to reflection with chain bonus
//   soft         → destructible but clip radius scaled down (absorbs some)
//   shard        → runtime-only; lethal on contact, not touched by rupture
//
// Shards are spawned here — fresh hazard colliders with a TTL.

import type { RuptureShape } from '../rupture'
import type { Collider, Level, MaterialName } from './level'
import { CONFIG } from '../config'
import { circleToPolygon, polygonDifference } from '../math/polygon'
import { buildCollider, refreshCollider } from './level'

export interface AffectedCollider {
  id: number
  prevMaterial: MaterialName
  destroyed: boolean
  cracked: boolean
}

export interface DestructionOutcome {
  affected: AffectedCollider[]
  reflection: { x: number, y: number }
  reflectionCount: number
  terrainToward: { x: number, y: number }
  terrainCount: number
}

function ellipseBBox(cx: number, cy: number, shape: RuptureShape): {
  minX: number, minY: number, maxX: number, maxY: number
} {
  const r = Math.max(shape.rx, shape.ry)
  return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r }
}

function centroidXY(c: Collider): { x: number, y: number } {
  return { x: (c.minX + c.maxX) / 2, y: (c.minY + c.maxY) / 2 }
}

function allocId(level: Level): number {
  let max = 0
  for (const c of level.colliders) {
    if (c.id > max)
      max = c.id
  }
  return max + 1
}

// Spawn shard colliders radiating outward from `center`. Each is a tiny
// triangle (hazard) with a TTL — the broken glass leaves a trap.
function spawnShards(level: Level, cx: number, cy: number, now: number): void {
  const n = CONFIG.GLASS_SHARD_COUNT
  const size = CONFIG.GLASS_SHARD_SIZE
  const spread = CONFIG.GLASS_SHARD_SPREAD
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4
    const ox = cx + Math.cos(a) * spread * (0.4 + Math.random() * 0.6)
    const oy = cy + Math.sin(a) * spread * (0.4 + Math.random() * 0.6)
    // Small asymmetric triangle — jagged silhouette sells "shard."
    const verts = [
      { x: ox, y: oy - size },
      { x: ox + size, y: oy + size * 0.6 },
      { x: ox - size * 0.7, y: oy + size * 0.4 },
    ]
    const shard = buildCollider(allocId(level), 'shard', verts, false, now + CONFIG.GLASS_SHARD_TTL)
    level.colliders.push(shard)
  }
}

export function applyRupture(
  level: Level,
  cx: number,
  cy: number,
  shape: RuptureShape,
  now: number,
): DestructionOutcome {
  const bbox = ellipseBBox(cx, cy, shape)

  const affected: AffectedCollider[] = []
  const next: Collider[] = []
  let refX = 0
  let refY = 0
  let refCount = 0
  let terX = 0
  let terY = 0
  let terCount = 0

  // Pre-build both shape polygons up front. Soft gets a shrunken
  // ellipse since it absorbs part of the rupture.
  const fullShape = circleToPolygon(cx, cy, shape.rx, shape.ry, shape.angle)
  const softShape = circleToPolygon(
    cx,
    cy,
    shape.rx * CONFIG.SOFT_RUPTURE_SCALE,
    shape.ry * CONFIG.SOFT_RUPTURE_SCALE,
    shape.angle,
  )

  // Track glass break centers so we can spawn shards AFTER the collider
  // loop — pushing mid-loop would change level.colliders under us.
  const pendingShardCenters: { x: number, y: number }[] = []

  for (const c of level.colliders) {
    if (!c.alive) {
      next.push(c)
      continue
    }
    if (c.minX > bbox.maxX || c.maxX < bbox.minX
      || c.minY > bbox.maxY || c.maxY < bbox.minY) {
      next.push(c)
      continue
    }

    if (c.material === 'shard') {
      // Shards are untouched by rupture; they tell their own story.
      next.push(c)
      continue
    }

    if (c.material === 'resonant') {
      // Indestructible, hums, pushes back harder.
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

    if ((c.material === 'bone' || c.material === 'bone_fragile') && c.damage < CONFIG.BONE_HITS - 1) {
      // Mark and leave standing — damage persists across ruptures.
      c.damage++
      const cen = centroidXY(c)
      terX += cen.x - cx
      terY += cen.y - cy
      terCount++
      affected.push({ id: c.id, prevMaterial: c.material, destroyed: false, cracked: true })
      next.push(c)
      continue
    }

    // Destructible this tick: glass (always), bone (final hit), soft.
    const isSoft = c.material === 'soft'
    const clipShape = isSoft ? softShape : fullShape
    const cen = centroidXY(c)
    terX += cen.x - cx
    terY += cen.y - cy
    terCount++

    const remaining = polygonDifference(c.vertices, [clipShape])
    if (remaining.length === 0) {
      c.alive = false
      affected.push({ id: c.id, prevMaterial: c.material, destroyed: true, cracked: false })
      if (c.material === 'glass')
        pendingShardCenters.push({ x: cen.x, y: cen.y })
      continue
    }

    const first = remaining[0]!
    c.vertices = first
    c.damage = 0
    refreshCollider(c)
    next.push(c)
    for (let i = 1; i < remaining.length; i++) {
      next.push(buildCollider(allocId(level), c.material, remaining[i]!, c.oneWay))
    }
    affected.push({ id: c.id, prevMaterial: c.material, destroyed: false, cracked: false })
    if (c.material === 'glass')
      pendingShardCenters.push({ x: cen.x, y: cen.y })
  }

  level.colliders = next
  for (const p of pendingShardCenters)
    spawnShards(level, p.x, p.y, now)

  return {
    affected,
    reflection: { x: refX, y: refY },
    reflectionCount: refCount,
    terrainToward: { x: terX, y: terY },
    terrainCount: terCount,
  }
}
