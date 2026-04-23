import type { MaterialId } from './materials'
import { CONFIG } from './config'
import { charToMaterial, MAT_EMPTY } from './materials'

// Mutable tilemap. Blasts write into `tiles` (and `damage` for stone chipping),
// so these are regular arrays. `pristineTiles` is the untouched snapshot used
// by `resetLevel` when the player dies — destruction is permanent WITHIN a run
// but resets on death, as per the brief.
export interface Level {
  readonly width: number
  readonly height: number
  tiles: MaterialId[][]
  damage: number[][] // hit counter per tile; only stone consults it
  readonly pristineTiles: readonly (readonly MaterialId[])[]
  readonly spawn: { readonly x: number, readonly y: number }
}

// Hand-written test map. 50 wide × 20 tall.
// Legend:
//   .  empty
//   d  dirt (crumbles on single blast hit — the "clay" you carve through)
//   s  stone (takes STONE_HITS blast hits; first hit leaves a cracked state)
//   S  steel (indestructible + reflects blast impulse)
//   x  hazard (kills on contact; untouched by blasts)
//
// Showcases, left to right:
//   1. dirt platforms to chip through
//   2. stone wall you have to hit twice
//   3. steel pillar you ricochet off
//   4. hazard pit in the floor that punishes panic detonations
//   5. a steel ceiling shelf for overhead ricochets
const LEVEL_STRINGS: readonly string[] = [
  '..................................................', // 0
  '..................................................', // 1
  '..................................................', // 2
  '..........................................SSSS....', // 3  steel ceiling shelf
  '..................................................', // 4
  '..................ssssssss........................', // 5  stone wall
  '..................ssssssss........................', // 6
  '..................ssssssss........................', // 7
  '..................ssssssss........................', // 8
  '.......dddddd.....ssssssss...............S........', // 9  dirt pad left, steel pillar right
  '..................ssssssss...............S........', // 10
  '................................dddddd...S........', // 11 dirt pad near pillar
  '.........................................S........', // 12
  '.........................................S........', // 13
  '.....ddddddd..........xxxxxxx............S........', // 14 hazard pit overhead cue + steel
  'dddddddddddddddddddddddxxxxxxxdddddddddddddddddddd', // 15 ground (pit opens here)
  'ddddddddddddddddddddddd.......dddddddddddddddddddd', // 16 below-pit empty so you fall in
  'ssssssssssssssssssssssssssssssssssssssssssssssssss', // 17
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS', // 18 bedrock (reflective floor)
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS', // 19
]

export function parseLevel(
  strings: readonly string[],
  spawn: { readonly x: number, readonly y: number },
): Level {
  if (strings.length === 0)
    throw new Error('parseLevel: empty level')
  const first = strings[0]
  if (first === undefined)
    throw new Error('parseLevel: empty level')
  const width = first.length
  const height = strings.length

  const tiles: MaterialId[][] = strings.map((row, i) => {
    if (row.length !== width) {
      throw new Error(`parseLevel: row ${i} width ${row.length} !== ${width}`)
    }
    return [...row].map(ch => charToMaterial(ch))
  })
  const damage: number[][] = Array.from({ length: height }, () =>
    Array.from<number>({ length: width }).fill(0))
  // Deep-freeze the pristine copy so nothing mutates it by accident.
  const pristineTiles: readonly (readonly MaterialId[])[] = tiles.map(r => r.slice())

  return { width, height, tiles, damage, pristineTiles, spawn: { x: spawn.x, y: spawn.y } }
}

export function createLevel(): Level {
  return parseLevel(LEVEL_STRINGS, { x: CONFIG.SPAWN_X, y: CONFIG.SPAWN_Y })
}

// Restore the tile grid to the state it had at parse time. Called on death.
// We mutate in place so that all existing references (render's tilesGfx
// rebuild, physics' live reads, etc.) automatically see the reset world.
export function resetLevel(level: Level): void {
  for (let y = 0; y < level.height; y++) {
    const pRow = level.pristineTiles[y]
    const tRow = level.tiles[y]
    const dRow = level.damage[y]
    if (!pRow || !tRow || !dRow)
      continue
    for (let x = 0; x < level.width; x++) {
      tRow[x] = pRow[x] ?? MAT_EMPTY
      dRow[x] = 0
    }
  }
}
