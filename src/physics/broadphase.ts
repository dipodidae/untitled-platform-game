// Spatial hash grid for collider queries. Physics asks "which colliders
// overlap this AABB?" every substep; a uniform grid beats O(N) for any
// level with more than a dozen colliders and stays O(1) amortised for
// typical queries.
//
// Grid is rebuilt on every destruction tick — we don't try to move
// colliders between cells because destruction either removes a collider
// or replaces it with a different shape (re-decomposed after clip).

import type { Collider, Level } from '../world/level'

const CELL = 64 // px. Trades lookup precision vs. cell-population. 64 = ~4 tiles.

export class BroadphaseGrid {
  private cells = new Map<number, Collider[]>()
  private minCellX = 0
  private minCellY = 0
  private cellsX = 0

  build(level: Level): void {
    this.cells.clear()
    let minX = 0
    let minY = 0
    let maxX = level.worldWidth
    let maxY = level.worldHeight
    for (const c of level.colliders) {
      if (!c.alive)
        continue
      if (c.minX < minX)
        minX = c.minX
      if (c.minY < minY)
        minY = c.minY
      if (c.maxX > maxX)
        maxX = c.maxX
      if (c.maxY > maxY)
        maxY = c.maxY
    }
    this.minCellX = Math.floor(minX / CELL)
    this.minCellY = Math.floor(minY / CELL)
    this.cellsX = Math.max(1, Math.ceil((maxX - minX) / CELL) + 1)

    for (const c of level.colliders) {
      if (!c.alive)
        continue
      const cx0 = Math.floor(c.minX / CELL) - this.minCellX
      const cy0 = Math.floor(c.minY / CELL) - this.minCellY
      const cx1 = Math.floor(c.maxX / CELL) - this.minCellX
      const cy1 = Math.floor(c.maxY / CELL) - this.minCellY
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = cy * this.cellsX + cx
          let bucket = this.cells.get(key)
          if (!bucket) {
            bucket = []
            this.cells.set(key, bucket)
          }
          bucket.push(c)
        }
      }
    }
  }

  // Return every collider whose AABB could overlap the query box. May
  // contain duplicates across cells — caller deduplicates via Set if
  // needed (we use an in-loop `seen` Map for determinism).
  query(minX: number, minY: number, maxX: number, maxY: number, out: Collider[]): void {
    out.length = 0
    const cx0 = Math.floor(minX / CELL) - this.minCellX
    const cy0 = Math.floor(minY / CELL) - this.minCellY
    const cx1 = Math.floor(maxX / CELL) - this.minCellX
    const cy1 = Math.floor(maxY / CELL) - this.minCellY
    const seen = new Set<number>()
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = cy * this.cellsX + cx
        const bucket = this.cells.get(key)
        if (!bucket)
          continue
        for (const c of bucket) {
          if (seen.has(c.id))
            continue
          seen.add(c.id)
          // Cheap bbox reject — skip SAT if AABBs don't overlap at all.
          if (c.maxX < minX || c.minX > maxX || c.maxY < minY || c.minY > maxY)
            continue
          out.push(c)
        }
      }
    }
  }
}
