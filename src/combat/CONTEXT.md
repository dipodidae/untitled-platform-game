# Context: combat

**Path:** `src/combat/`
**One-line purpose:** Owns projectile bullets (spawn, tick, hit-resolution), ruptures (the world-carving polygon explosion triggered by player fracture), and weapon kind definitions.

## What this context owns

- `bullet.ts` — `BulletKind`, `BULLET_KINDS`, `BulletKindName`, `Bullet`, `BulletState`; `createBulletState`, `resetBulletState`, `spawnBullet`, `updateBullets`, `predictBulletImpact` (trajectory preview for crosshair). Also independently defines `BulletKind` and `BULLET_KINDS` (slug + bigShot inline — see Invariants).
- `rupture.ts` — `RuptureShape`, `RuptureResult`; `computeRuptureShape`, `pointInRupture`, `performRupture`. Computes the velocity-derived ellipse, calls `world/destruction.applyRupture`, and returns the self-impulse + resonant reflection for `player.ts` to apply.
- `weapons/types.ts` — the canonical `BulletKind` interface shared by the per-weapon files.
- `weapons/slug.ts` — `SLUG: BulletKind` constant.
- `weapons/bigShot.ts` — `BIG_SHOT: BulletKind` constant.
- `weapons/index.ts` — `BULLET_KINDS` registry + `BulletKindName` type (keyed from the registry).

## What it does NOT own (and where to look)

- Damage applied to the player — `src/player/player.ts` (`takeHit`)
- Rupture geometry carving — `src/world/destruction.ts` (`applyRupture`)
- Muzzle position and aim direction — `src/render/spineboy.ts` (`SpineboyBridge.muzzleX/Y/DirX/Y`)
- Particle effects on impact or muzzle flash — `src/render/particles.ts`
- Camera trauma on hit — `src/render/camera.ts` (`addTrauma`)
- Pickup that grants the bigShot weapon — `src/items/`

## Public surface

```ts
// bullet.ts
export interface BulletKind { speed, gravity, lifeSec, size, ruptureRadius, damage, coreColor, haloColor, fireCooldownSec }
export const BULLET_KINDS: { slug: BulletKind, bigShot: BulletKind }   // ⚠ see Invariants
export type BulletKindName = 'slug' | 'bigShot'                         // ⚠ see Invariants
export interface Bullet { x, y, vx, vy, life, alive, kind }
export interface BulletState { bullets, fireCooldown, fireEdge }
export function createBulletState(): BulletState
export function resetBulletState(s): void
export function spawnBullet(s, particles, muzzleX, muzzleY, dirX, dirY, kindName?): void
export function updateBullets(s, level, dummies, broadphase, particles, camera, now, dt): void
export interface ImpactPrediction { points, impactX, impactY, hit, material }
export function predictBulletImpact(startX, startY, dirX, dirY, kindName, level, dummies, broadphase): ImpactPrediction

// rupture.ts
export interface RuptureShape { rx, ry, angle }
export interface RuptureResult { center, shape, affected, reflection, impulse }
export function computeRuptureShape(vx, vy): RuptureShape
export function pointInRupture(dx, dy, shape): boolean
export function performRupture(level, px, py, vx, vy, now): RuptureResult

// weapons/index.ts
export type { BulletKind } from './types'
export const BULLET_KINDS: { slug, bigShot }
export type BulletKindName = keyof typeof BULLET_KINDS
```

## External dependencies

- Pixi v8 modules used: none (pure logic; effects are delegated to render context)
- Other contexts:
  - `src/world/destruction` — `applyRupture` (rupture.ts and bullet.ts both call this)
  - `src/world/level` — `Level`, `Collider`, `MaterialName`
  - `src/physics/broadphase` — `BroadphaseGrid`
  - `src/physics/sat` — `satAabbPoly`
  - `src/enemies/dummy` — `overlapsDummy`, `damageDummy`, `dummyAabb`
  - `src/render/particles` — `emitImpactBurst`, `emitMuzzleFlash`
  - `src/render/camera` — `addTrauma`, `Camera`

## Invariants / rules

- **Pre-existing duplication (do not silently unify):** `bullet.ts` defines its own `BULLET_KINDS` and `BulletKindName` inline (slug + bigShot as literal objects). `weapons/index.ts` also exports `BULLET_KINDS` built from the per-file constants (`SLUG`, `BIG_SHOT`). The two registries have identical values but are separate definitions. Unifying them is a deliberate follow-up task, not a one-line fix — the type-level `BulletKindName` used by `BulletState.kind` must stay stable across the change.
- Hit resolution order in `updateBullets`: dummies are checked before terrain. A bullet that would hit both the enemy and the wall behind it should always hit the enemy. This ordering must not be reversed.
- `spawnBullet` is a no-op when `fireCooldown > 0`. The cooldown timer is per-`BulletState` (i.e. per-player), not per-bullet-kind.
- `BulletState.fireEdge` is true for exactly one render frame after a spawn — it is consumed by the Spineboy bridge (`triggerShootOverlay`) and cleared in `render.ts`.
- `performRupture` does NOT mutate `Player` — it returns `impulse` for `player.ts` to apply. The player module stays in control of its own velocity.
- Bullet gravity is applied BEFORE position integration each tick (`vy += kind.gravity * dt; y += vy * dt`) to produce visible arc curvature immediately on the first frame.

## Why this context exists as its own thing

Combat crosses two concerns that no single existing context owns: projectile physics (independent trajectory + collision) and the fracture mechanism (player-triggered world-carving). Merging bullets into `session/game.ts` would bury hit logic in the loop; merging rupture into `player.ts` would give the player module direct access to world geometry. A dedicated combat context holds both, makes weapon extension local (add a file in `weapons/`, register in the barrel), and keeps `performRupture`'s self-impulse calculation away from the world-destruction machinery.
