# Context: physics

**Path:** `src/physics/`
**One-line purpose:** Stateless collision pipeline — SAT, broadphase spatial hash, and player AABB resolution (including corner nudge, one-way platforms, slope projection, and ground stick).

## What this context owns

- `sat.ts` — `AABB`, `SatHit`; `satAabbPoly` — SAT overlap test between an axis-aligned box and a convex polygon. Returns the minimum translation vector or null.
- `broadphase.ts` — `BroadphaseGrid` — uniform spatial hash over level colliders. `build(level)` + `query(minX, minY, maxX, maxY, out)`.
- `narrowphase.ts` — `ContactHit`; `deepestContact` (returns worst-overlap hit across all candidate colliders), `sweptToi` (binary-search CCD for tunneling prevention).
- `resolve.ts` — `moveAndCollide` (full per-substep player movement: corner nudge, integrate, iterative MTV, one-way gating, soft damping, bone-fragile collapse, ground flags); `applySlopeProjection`; `tryStickToGround`; `overlapsLethal`.
- `index.ts` — barrel: `BroadphaseGrid`, `moveAndCollide`, `applySlopeProjection`, `tryStickToGround`, `overlapsLethal`.

## What it does NOT own (and where to look)

- Player velocity (vx, vy) and jump timers — `src/player/player.ts`
- Prowler's own collision loop — `src/enemies/prowler.ts` (it has a simpler inline MTV that does NOT use resolve.ts)
- Level data and materials — `src/world/level.ts`
- Kinetic platform movement (which mutates collider vertices) — `src/world/kinetic/`

## Public surface

```ts
// sat.ts
export interface AABB { x, y, w, h }
export interface SatHit { normal: Vec2, depth: number }
export function satAabbPoly(box: AABB, poly: Polygon): SatHit | null

// broadphase.ts
export class BroadphaseGrid {
  build(level: Level): void
  query(minX, minY, maxX, maxY, out: Collider[]): void
}

// narrowphase.ts (not in barrel — imported directly by resolve.ts and prowler.ts)
export interface ContactHit extends SatHit { collider: Collider }
export function deepestContact(box, candidates): ContactHit | null
export function sweptToi(prev, next, halfW, halfH, candidates): number

// resolve.ts / index barrel
export function moveAndCollide(p: Player, level, dt, broadphase): void
export function applySlopeProjection(p: Player): void
export function tryStickToGround(p: Player, broadphase): void
export function overlapsLethal(level, x, y, w, h): boolean
```

## External dependencies

- Pixi v8 modules used: none
- Other contexts:
  - `src/world/level` — `Level`, `Collider` (read-only; physics never mutates world state)
  - `src/player/player` — `Player` type (resolve.ts writes position, velocity, and contact flags)
  - `src/shared-kernel/polygon` — `Polygon` (sat.ts parameter)
  - `src/shared-kernel/vec2` — `Vec2`
  - `src/config` — `CONFIG.CORNER_NUDGE`, `CONFIG.MAX_SLOPE_ANGLE`, `CONFIG.STICK_TO_GROUND_MAX_DIST`, `CONFIG.SOFT_DAMPING_PER_SEC`, `CONFIG.BONE_FRAGILE_COLLAPSE_TIME`

## Invariants / rules

- **`moveAndCollide` is called at 120 Hz (2 × physics tick)** via `CONFIG.PHYSICS_SUBSTEPS` in `player.ts`. Never call it at full 60 Hz tick rate for the player — the reduced substep causes slope overshoots.
- `BroadphaseGrid.build` must be called each physics tick before any `moveAndCollide` call, because kinetic platforms mutate collider vertices and the grid must reflect the updated bounds.
- `satAabbPoly` returns `null` for polygons with fewer than 3 vertices — callers should not pass degenerate shapes.
- The returned MTV normal points **away from the polygon toward the AABB** (`normal.y < 0` means the polygon is below the AABB, i.e., the AABB is grounded). This convention is load-bearing for `grounded` / `touchingWall` flag logic in `resolve.ts`.
- `overlapsLethal` only checks `shard` material colliders — nothing else is lethal in the current material set. Do not extend this to new materials without reviewing all callers.
- One-way platform logic in `resolve.ts` requires `prevY` (the player's pre-move Y) to decide whether arrival is from above. This value is captured at the start of `moveAndCollide`, before integration.
- **CRITICAL: `endFrame()` from `src/input/input` must be called at the end of every fixed update.** `resolve.ts` does not call it — the session loop in `game.ts` owns that call.

## Why this context exists as its own thing

Physics is stateless relative to the world — it reads `level.colliders` and writes player position/flags, but holds no mutable state of its own (the `BroadphaseGrid` is rebuilt each tick). Keeping it separate from `player.ts` means the movement resolver can be reused for the prowler's simple loop and for bullet SAT checks, and it can be tested in isolation without the player's state machine. Merging it with `world/` would mix geometry (what the world is made of) with dynamics (how things move through it).
