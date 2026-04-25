# Context: enemies

**Path:** `src/enemies/`
**One-line purpose:** Non-player actors — the Prowler (a ground-hugging weighted-movement organism) and the Dummy (a stationary HP bag used for weapon testing).

## What this context owns

- `dummy.ts` — `Dummy` interface + `DUMMY_CONFIG`; `createDummy`, `updateDummy` (drains hit-flash timer only), `overlapsDummy`, `damageDummy`, `dummyAabb`.
- `prowler.ts` — `Prowler` interface; `createProwler`, `updateProwler` (movement, glass-break, shatter/respawn), `prowlerReactToRupture`, `checkProwlerPlayerContact`. Owns all per-kind config constants (speed, accel) internally as module-level `const`.
- `index.ts` — barrel that re-exports everything from both files.

## What it does NOT own (and where to look)

- Rendering of enemies — `src/render/index.ts` (dummies drawn inline), `src/render/prowlerRenderer.ts` (prowler draw)
- Bullet-vs-dummy hit logic — `src/combat/bullet.ts` (`updateBullets` calls `overlapsDummy` / `damageDummy`)
- Prowler spawn coordinates — `src/world/level.ts` (`Level.prowlerSpawns`), hydrated by `session/game.ts`
- Player knockback from prowler contact — `checkProwlerPlayerContact` writes to `player.vx/vy` directly; the method lives here but the player's velocity is owned by `src/player/`

## Public surface

```ts
// dummy.ts
export interface Dummy { x, y, w, h, hp, maxHp, alive, hitFlashTimer }
export const DUMMY_CONFIG: { w, h, maxHp, hitFlashSec }
export function createDummy(x, y, maxHp?): Dummy
export function updateDummy(d, dt): void
export function overlapsDummy(d, px, py, radius): boolean
export function damageDummy(d, dmg): void
export function dummyAabb(d): { x, y, w, h }

// prowler.ts
export interface Prowler { x, y, vx, vy, w, h, grounded, groundMaterial, facing, alive, stunTimer, shatterTimer, spawnX, spawnY }
export function createProwler(x, y): Prowler
export function updateProwler(p, player, level, broadphase, dt): void
export function prowlerReactToRupture(p, ruptureX, ruptureY): void
export function checkProwlerPlayerContact(p, player): boolean
```

## External dependencies

- Pixi v8 modules used: none (pure logic)
- Other contexts:
  - `src/physics/sat` — `satAabbPoly` and `AABB` type (prowler uses its own simplified MTV loop)
  - `src/physics/broadphase` — `BroadphaseGrid` for prowler collision queries
  - `src/player/player` — `Player` type; `checkProwlerPlayerContact` writes to `player.vx/vy` and reads `player.iframeTimer`
  - `src/world/level` — `Level`, `Collider`, `MaterialName`
  - `src/config` — `CONFIG.JUMP_GRAVITY`, `CONFIG.FALL_GRAVITY`, `CONFIG.MAX_FALL`, `CONFIG.SOFT_DAMPING_PER_SEC`

## Invariants / rules

- The Prowler does **not** use `src/physics/resolve.ts` (the player's resolver). It has its own inline iterative MTV loop (`moveAndCollideProwler`) — simpler (no corner nudge, no one-way edge detection beyond above-only), but the glass-priming `c.touched` flag IS respected.
- Shatter (`p.alive = false, p.shatterTimer = PROWLER_SHATTER_RESPAWN`) is a temporary removal, not a permanent death. The prowler resets to `spawnX/spawnY` once the timer expires inside `updateProwler`.
- `prowlerReactToRupture` and `checkProwlerPlayerContact` are side-effect-only procedures called from `session/game.ts` each tick — they are not self-invoked by the prowler.
- The Dummy has no AI, no velocity, no gravity. `updateDummy` only ticks `hitFlashTimer`. Damage is applied externally by `combat/bullet`.
- `overlapsDummy` uses point + radius against the dummy AABB, matching the bullet's `kind.size` hit-test convention. This must stay consistent with bullet.ts's hit logic or shots will appear to miss/hit incorrectly.

## Why this context exists as its own thing

Enemy actors are discrete runtime entities that need their own update loops and contact resolution — none of which belongs in the world data layer or the player module. Keeping them together (rather than merging with `session/game.ts`) means adding a new enemy kind is a local change: create a file, add to the barrel, register spawn points in LevelJson. The game loop never needs to know which enemy kind it's updating.
