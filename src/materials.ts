// Material / tile table.
//
// The tilemap stores a material id per cell (not just solid/empty). All
// terrain questions — "is it solid?", "can a blast break it?", "does it
// kill on contact?" — route through this module so there's exactly one
// source of truth for per-material behavior.
//
// Stone is the only material that needs per-tile state (damage counter),
// so `Level.damage[y][x]` tracks that alongside the main `tiles` grid.

export const MAT_EMPTY = 0 as const
export const MAT_DIRT = 1 as const
export const MAT_STONE = 2 as const
export const MAT_STEEL = 3 as const
export const MAT_HAZARD = 4 as const

export type MaterialId
  = | typeof MAT_EMPTY
    | typeof MAT_DIRT
    | typeof MAT_STONE
    | typeof MAT_STEEL
    | typeof MAT_HAZARD

// Does the player's AABB collide with this material?
// Hazards are pass-through so falling into a pit actually kills (rather than
// landing on top of the spike surface).
export function isSolid(mat: number): boolean {
  return mat === MAT_DIRT || mat === MAT_STONE || mat === MAT_STEEL
}

// Can a blast remove this tile (given enough hits)?
export function isDestructible(mat: number): boolean {
  return mat === MAT_DIRT || mat === MAT_STONE
}

// Does the blast reflect away from this material?
export function isReflective(mat: number): boolean {
  return mat === MAT_STEEL
}

export function isHazard(mat: number): boolean {
  return mat === MAT_HAZARD
}

// Character → material id (used by the level parser). `.` is a common
// "empty" glyph; the rest are mnemonic.
export function charToMaterial(ch: string): MaterialId {
  switch (ch) {
    case '.':
    case ' ':
      return MAT_EMPTY
    case 'd':
    case '#': // legacy — the old parser used '#' for "solid"
      return MAT_DIRT
    case 's':
      return MAT_STONE
    case 'S':
      return MAT_STEEL
    case 'x':
    case 'X':
      return MAT_HAZARD
    default:
      throw new Error(`materials.charToMaterial: unknown char '${ch}'`)
  }
}
