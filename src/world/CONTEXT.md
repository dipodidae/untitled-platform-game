# Context: world

**Path:** `src/world/`
**One-line purpose:** Owns the Level data model (colliders, materials, zones, spawn points), all world-mutation (rupture carving, shard spawning, bone damage), and every kinetic platform type (rotor, breather, spring, linear).

## What this context owns

- `level.ts` — `MaterialName`, `ZoneType`, `ZoneJson`, `Collider`, `Level`, `LevelJson`, `PristineCollider`; `buildCollider`, `computeColliderBounds`, `refreshCollider`, `tickEphemeral` (purges expired shards), `fromJson`, `fromTilemap`, `tilemapToPolygons`, `resetLevel`. Also `KineticJson` + `KineticState` (re-exported from `kinetic/`).
- `destruction.ts` — `AffectedCollider`, `DestructionOutcome`; `applyRupture` — the function that clips collider polygons by an ellipse, handles per-material response, spawns shard colliders, and returns reflection/terrain vectors.
- `kinetic/shared.ts` — `KineticBase`, `PlayerLike`; shared vertex transforms (`rotateVertices`, `translateVertices`, `breatheVertices`, `vertexNormals`) and `playerOnCollider`.
- `kinetic/rotor.ts` — `RotorJson`, `RotorState`; `createRotor`, `updateRotor`, `rotorReactToRupture`.
- `kinetic/breather.ts` — `BreatherJson`, `BreatherState`; `createBreather`, `updateBreather`, `breatherReactToRupture`.
- `kinetic/spring.ts` — `SpringJson`, `SpringState`; `createSpring`, `updateSpring`, `springReactToRupture`.
- `kinetic/linear.ts` — `LinearJson`, `LinearState`; `createLinear`, `updateLinear`.
- `kinetic/index.ts` — dispatcher; `KineticJson`, `KineticState` union types; `createKineticState`, `updateKinetics`, `kineticReactToRupture`.

## What it does NOT own (and where to look)

- Player physics (AABB movement, collision) — `src/physics/`
- Rupture shape computation + self-impulse — `src/combat/rupture`
- Broadphase spatial hash — `src/physics/broadphase`
- Rendering of the world geometry — `src/render/world.ts`
- Level catalog and persistence — `src/session/levelManager`

## Public surface

```ts
// level.ts
export type MaterialName = 'glass' | 'bone' | 'bone_fragile' | 'resonant' | 'soft' | 'shard'
export type ZoneType = 'gravity' | 'wind' | 'hazard' | 'trigger' | 'goal' | 'spawnPoint'
export interface Collider { id, material, vertices, pieces, oneWay, minX/Y, maxX/Y, damage, contactTime, touched, alive, expiresAt, kinetic }
export interface Level { colliders, pristineColliders, worldWidth, worldHeight, spawn, prowlerSpawns, dummySpawns, zones }
export interface LevelJson { ... }                    // serialization schema
export function fromJson(data: LevelJson): Level
export function fromTilemap(rows: string[]): Level    // legacy tile format
export function resetLevel(level: Level): void        // restores pristineColliders in place
export function tickEphemeral(level: Level, now): void
export function buildCollider(id, material, vertices, oneWay?, expiresAt?): Collider
export function refreshCollider(c): void

// destruction.ts
export interface AffectedCollider { id, prevMaterial, destroyed, cracked }
export function applyRupture(level, cx, cy, shape: RuptureShape, now): DestructionOutcome

// kinetic/index.ts
export type KineticJson = RotorJson | BreatherJson | SpringJson | LinearJson
export type KineticState = RotorState | BreatherState | SpringState | LinearState
export function createKineticState(baseVertices, json): KineticState
export function updateKinetics(level, player: PlayerLike, dt): void
export function kineticReactToRupture(level, rx, ry): void
```

## External dependencies

- Pixi v8 modules used: none
- Other contexts:
  - `src/shared-kernel/polygon` — `Polygon`, `bounds`, `decompose`, `polygonDifference`, `circleToPolygon`
  - `src/shared-kernel/vec2` — `Vec2`
  - `src/combat/rupture` — `RuptureShape` type (used by destruction.ts parameter)
  - `src/config` — material constants (`BONE_HITS`, `GLASS_SHARD_COUNT`, `SOFT_RUPTURE_SCALE`, etc.)
  - `src/items/types` — `ItemKind` (referenced in `LevelJson.pickups`)

## Invariants / rules

- `resetLevel` **mutates colliders in place** using the `pristineColliders` snapshot taken at `fromJson` time. Existing `Collider` object references remain valid — the renderer and physics system do not need to be rebuilt after a reset.
- `applyRupture` is the only function that may add or remove colliders from `level.colliders`. It rebuilds the array in place (`level.colliders = next`). Shard spawning happens AFTER the main loop to avoid modifying the array mid-iteration.
- `tickEphemeral` compacts `level.colliders` in place by removing expired shards. It must be called **before** the broadphase build each physics tick or stale shards will still appear in queries.
- Bone colliders accumulate `damage` across ruptures — they survive until `damage >= CONFIG.BONE_HITS - 1`. `damage` is reset to 0 only when the collider is actually carved (not on `resetLevel`; that restores from pristine).
- Glass colliders set `touched = true` on first player ground contact. Once touched, they act as one-way platforms from below. This flag is reset by `resetLevel`.
- Kinetic states store `pivotX/pivotY` (from `KineticBase`). `kineticReactToRupture` uses these to compute distance from the rupture center — all kinetic types must set `pivotX/pivotY` at creation.
- Adding a new kinetic type requires: a new file, add to the `KineticJson | KineticState` unions in `kinetic/index.ts`, and add cases to `createKineticState`, `updateKinetics`, and `kineticReactToRupture`.

## Why this context exists as its own thing

The world model is the substrate everything else acts on — physics reads it, destruction mutates it, the renderer draws it, the editor edits it. Keeping it separate from both the physics resolver (which is stateless) and the session loop (which orchestrates) means the Level type can be imported cleanly by all three without circular dependencies. Destruction logic belongs here rather than in `combat/` because it is a world-mutation concern, not a projectile concern.
