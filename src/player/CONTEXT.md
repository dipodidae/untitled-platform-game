# Context: player

**Path:** `src/player/`
**One-line purpose:** Owns the Player record, all movement and jump logic, die/respawn lifecycle, and hazard hit-taking.

## What this context owns

- `player.ts` — `Player` interface; `createPlayer`, `updatePlayer`, `respawn`, `takeHit`. Also houses the private `die` and `handleInput` functions. `updatePlayer` is the per-tick entry point called by `session/game.ts`.
- `instability.ts` — `InstabilityState` and `InstabilityTickInput`; `createInstabilityState`, `resetInstability`, `addInstability`, `updateInstability`. Instability is a movement-degradation resource that builds from momentum and bleeds naturally.

## What it does NOT own (and where to look)

- Physics movement resolution — `src/physics/` (`moveAndCollide`, `applySlopeProjection`, `tryStickToGround`, `overlapsLethal`)
- Session bookkeeping (deaths, phase) — `src/session/gameState`
- Level reset on death — `src/world/level` (`resetLevel`)

## Public surface

```ts
// player.ts
export interface Player {
  x
  y
  vx
  vy
  w
  h
  grounded
  coyoteTimer
  bufferTimer
  facing
  instability: InstabilityState
  touchingWall
  wallSide
  wallSliding
  wallStickTimer
  wallJumpInputLock
  airSnapTimer
  jumpedThisTick
  iframeTimer
  hazardIframe
  hp
  maxHp
  alive
  groundNormal
  groundMaterial
  resonantChain
  dropThroughTimer
  doubleJumpAvailable
  djGlowTimer
  djFiredThisTick
}
export function createPlayer(level: Level): Player
export function updatePlayer(p, level, fx, broadphase, _particles, _now, dt): void
export function respawn(p: Player, level: Level): void
export function takeHit(p, level, sourceX, sourceY, damage): void

// instability.ts
export interface InstabilityState { value }
export function createInstabilityState(): InstabilityState
export function resetInstability(s): void
export function addInstability(s, amount): void
export function updateInstability(s, input: InstabilityTickInput, dt): void
```

## External dependencies

- Pixi v8 modules used: none (pure logic)
- Other contexts:
  - `src/input/input` — reads movement + jump + drop-through edges
  - `src/physics/` — `moveAndCollide`, `applySlopeProjection`, `tryStickToGround`, `overlapsLethal`
  - `src/session/gameState` — mutates `gameState.deaths`, `.phase`, `.deathFreezeEndsAt`, reads `.lastSpawnPoint`
  - `src/session/eventBus` — emits `playerDied`, `levelComplete`, `checkpointReached`
  - `src/world/level` — `resetLevel` (called from `die` and `respawn`)

## Invariants / rules

- `respawn` and `die` **mutate `Player` in place** — they never return a new record, so external references (renderer, camera) remain valid.
- `die` resets the world (`resetLevel`) before returning. Any code that reads `level.colliders` after a `die` call sees the pristine world.
- `dropThroughTimer` arms physics to ignore one-way platforms. It starts from input (down + jump while grounded) in `updatePlayer`; physics reads it in `resolve.ts`.
- The `die` function is private to `player.ts` — external code kills the player only via `takeHit` (damage path) or by the fall-out check inside `updatePlayer`. There is no exported `die`.

## Why this context exists as its own thing

The player entity is the most stateful and rule-dense object in the game. Splitting instability into its own file (`instability.ts`) within this context keeps the gain/bleed table cohesive and auditable without bloating `player.ts`. If player logic lived in `session/game.ts`, the game loop would have to know about wall-jump lock windows and other concerns that have nothing to do with tick orchestration.
