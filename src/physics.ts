// Physics barrel. The real logic lives in src/physics/{broadphase,narrowphase,resolve}.ts;
// this file bridges callers (player.ts, rupture.ts) and keeps a tiny number
// of tile-grid accessors that rupture.ts still uses (destruction is
// tile-based through step 4; step 5 swaps it to polygon clipping).

import type { Level } from './world/level'
import { isHazard, isSolid, MAT_DIRT } from './materials'

export { moveAndCollide, overlapsHazard as rectOverlapsHazard } from './physics/resolve'
export { BroadphaseGrid } from './physics/broadphase'

// ─── tile-grid accessors (kept for rupture.ts) ────────────────────

export function tileAt(level: Level, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= level.width || ty >= level.height)
    return MAT_DIRT
  const row = level.tiles[ty]
  return row?.[tx] ?? MAT_DIRT
}

export function isSolidAt(level: Level, tx: number, ty: number): boolean {
  return isSolid(tileAt(level, tx, ty))
}

export function isHazardAt(level: Level, tx: number, ty: number): boolean {
  return isHazard(tileAt(level, tx, ty))
}
