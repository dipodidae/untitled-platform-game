# Context: player

**Path:** `src/player/`
**One-line purpose:** Owns the Player record, all movement and jump logic, the instability resource (the core gameplay mechanic), die/respawn lifecycle, and hazard hit-taking.

## What this context owns

- `player.ts` — `Player` interface; `createPlayer`, `updatePlayer`, `respawn`, `takeHit`. Also houses the private `die` and `handleInput` functions. `updatePlayer` is the per-tick entry point called by `session/game.ts`.
- `instability.ts` — `InstabilityState` and `InstabilityTickInput`; `createInstabilityState`, `resetInstability`, `addInstability`, `updateInstability`, `onFractured`.

## What it does NOT own (and where to look)

- Physics movement resolution — `src/physics/` (`moveAndCollide`, `applySlopeProjection`, `tryStickToGround`, `overlapsLethal`)
- Rupture (the world-carving fracture) — `src/combat/rupture` (`performRupture`)
- Screen-effects triggered by fracture — `src/render/fx` (`triggerFractureFx`)
- Particle burst on fracture — `src/render/particles` (`emitFractureBurst`)
- Session bookkeeping (deaths, phase) — `src/session/gameState`
- Level reset on death — `src/world/level` (`resetLevel`)

## Public surface

```ts
// player.ts
export interface Player {
  x, y, vx, vy, w, h
  grounded, coyoteTimer, bufferTimer, facing
  instability: InstabilityState
  touchingWall, wallSide, wallSliding, wallStickTimer
  wallJumpInputLock, airSnapTimer, jumpedThisTick
  iframeTimer, hazardIframe, hp, maxHp, alive
  groundNormal, groundMaterial, resonantChain, dropThroughTimer
  doubleJumpAvailable, djGlowTimer, djFiredThisTick
  lastRupture: RuptureResult | null
}
export function createPlayer(level: Level): Player
export function updatePlayer(p, level, fx, broadphase, particles, now, dt): void
export function respawn(p: Player, level: Level): void
export function takeHit(p, level, sourceX, sourceY, damage): void

// instability.ts
export interface InstabilityState { value, containing, containmentStunTimer, fractureQueued }
export function createInstabilityState(): InstabilityState
export function resetInstability(s): void
export function addInstability(s, amount): void
export function updateInstability(s, input: InstabilityTickInput, dt): void
export function onFractured(s): void
```

## External dependencies

- Pixi v8 modules used: none (pure logic)
- Other contexts:
  - `src/input/input` — reads movement + jump + contain + drop-through edges
  - `src/physics/` — `moveAndCollide`, `applySlopeProjection`, `tryStickToGround`, `overlapsLethal`
  - `src/combat/rupture` — `performRupture` (called when `fractureQueued` fires)
  - `src/render/fx` — `triggerFractureFx`
  - `src/render/particles` — `emitFractureBurst`
  - `src/session/gameState` — mutates `gameState.deaths`, `.phase`, `.deathFreezeEndsAt`, reads `.lastSpawnPoint`
  - `src/session/eventBus` — emits `playerDied`, `levelComplete`, `checkpointReached`
  - `src/world/level` — `resetLevel` (called from `die` and `respawn`)

## Invariants / rules

- `respawn` and `die` **mutate `Player` in place** — they never return a new record, so external references (renderer, camera) remain valid.
- `die` resets the world (`resetLevel`) before returning. Any code that reads `level.colliders` after a `die` call sees the pristine world.
- Fracture is **deferred by one tick**: `updateInstability` sets `fractureQueued = true` when instability peaks; `updatePlayer` fires `performRupture` at the TOP of the NEXT tick and returns early. This guarantees the renderer sees one frame at peak instability before the blast.
- During `iframeTimer > 0` (post-fracture window), all instability gains are frozen (skipped in `updateInstability`). Do not short-circuit this gate.
- `lastRupture` is cleared by `updatePlayer` as soon as `iframeTimer` drops to zero — it is an ephemeral renderer signal, not persistent state.
- `dropThroughTimer` arms physics to ignore one-way platforms. It starts from input (down + jump while grounded) in `updatePlayer`; physics reads it in `resolve.ts`.
- The `die` function is private to `player.ts` — external code kills the player only via `takeHit` (damage path) or by the fall-out check inside `updatePlayer`. There is no exported `die`.

## Why this context exists as its own thing

The player entity is the most stateful and rule-dense object in the game. Splitting instability into its own file (`instability.ts`) within this context keeps the gain/bleed/containment table cohesive and auditable without bloating `player.ts` with 130 more lines. If player logic lived in `session/game.ts`, the game loop would have to know about instability thresholds, containment timers, and wall-jump lock windows — concerns that have nothing to do with tick orchestration.
