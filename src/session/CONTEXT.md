# Context: session

**Path:** `src/session/`
**One-line purpose:** Owns the main game loop, per-attempt session state, the level catalog, and the typed EventBus that lets other contexts communicate without direct coupling.

## What this context owns

- `game.ts` — `GameState` bundle (the runtime superstruct: `app`, `level`, `player`, `camera`, `fx`, `broadphase`, `bullets`, `prowlers`, `dummies`, `particles`, `crtFilter`, accumulator, `now`, `levelIndex`); `createGame`, `startLoop` (fixed-step ticker), `advanceLevel`, `reloadLevel`.
- `gameState.ts` — `GameSession` singleton (`phase`, `currentLevelId`, `deaths`, `startTime`, `lastSpawnPoint`, `deathFreezeEndsAt`); `resetForLevel`.
- `levelManager.ts` — `LEVEL_CATALOG` (id → name → bundled JSON), `loadLevel` (localStorage wins over bundled), `saveLevel`, `listLevels`, `nextLevelId`, `hasNextLevel`, `levelName`, `markLevelLoaded`.
- `eventBus.ts` — `EngineEvents` type map; `on`, `off`, `emit`.

## What it does NOT own (and where to look)

- Physics simulation — `src/physics/`
- Player entity and movement — `src/player/`
- Rendering / scene graph — `src/render/`
- Level data structures and destruction — `src/world/`
- Input edge detection — `src/input/`
- Enemy behavior — `src/enemies/`

## Public surface

```ts
// game.ts
export interface GameState { ... }
export function createGame(app: Application): GameState
export function startLoop(state: GameState): void
export function advanceLevel(state: GameState): void
export function reloadLevel(state: GameState): void

// gameState.ts
export type GamePhase = 'gameplay' | 'results' | 'dead'
export interface GameSession { phase, currentLevelId, deaths, startTime, lastSpawnPoint, deathFreezeEndsAt }
export const gameState: GameSession          // singleton; import and mutate in place
export function resetForLevel(gs: GameSession, levelId: string): void

// levelManager.ts
export function loadLevel(id: string): LevelJson | null
export function saveLevel(id: string, data: LevelJson): void
export function listLevels(): readonly { id, name }[]
export function levelName(id: string): string
export function hasNextLevel(id: string): boolean
export function nextLevelId(id: string): string | null
export function markLevelLoaded(id: string): void

// eventBus.ts
export interface EngineEvents {
  playerDied: { x, y, cause: 'hazard' | 'fallout' }
  levelComplete: { levelId, deaths, timeMs }
  checkpointReached: { x, y }
  levelLoaded: { levelId }
  retryPressed: null
}
export function on<K>(event: K, handler): () => void
export function off<K>(event, handler): void
export function emit<K>(event, payload): void
```

## External dependencies

- Pixi v8 modules used: `Application` (type only, passed in from `main.ts`)
- Other contexts: `src/world/level` (`fromJson`, `tickEphemeral`, `resetLevel`), `src/player/player` (`createPlayer`, `respawn`, `updatePlayer`), `src/enemies/`, `src/combat/bullet`, `src/render/`, `src/physics/`, `src/input/input`

## Invariants / rules

- **`GameState` vs `GameSession` naming**: `GameState` (in `game.ts`) is the full runtime bundle — every live object the loop touches. `GameSession` (in `gameState.ts`) is the lightweight per-attempt bookkeeping. Never conflate them.
- `gameState` (the `GameSession` singleton) is imported and mutated in place everywhere — no copies, no fresh records.
- `advanceLevel` and `reloadLevel` both call `loadLevelAtIndex`, which tears down and rebuilds the Pixi scene (`teardownScene` + `buildScene`). Do not call either during an active hitstop window.
- Input edges (`endFrame()`) are NOT called during hitstop — they are skipped alongside the physics step so buffered presses arrive on the first live tick after freeze.
- `deathFreezeEndsAt` is a `performance.now()` wall-clock timestamp; `gameSession.phase = 'dead'` is the flag that gates physics. The freeze ends when either R is pressed or the timestamp passes.
- `now` in `GameState` is continuous game-time seconds — it advances every physics tick by `CONFIG.FIXED_DT`. It is reset to 0 on level load and is **not** the same as `performance.now()`.

## Why this context exists as its own thing

The session layer is the only place that knows the full runtime bundle and drives the ticker. If this logic lived in, say, `player.ts` or `render/index.ts`, those modules would need to own every other system (camera, broadphase, bullets, enemies) and the single-responsibility boundary would collapse. Separating it also lets `LevelManager` and `EventBus` be reused by the editor or future menus without pulling in Pixi or player code.

## Events published / consumed

- Publishes: `levelLoaded` — on `createGame` and every `loadLevelAtIndex` call; payload `{ levelId }`.
- Publishes: `retryPressed` — when the R key fires inside `fixedUpdate`.
- Consumes: none directly — it is the emitter hub. `ui/resultsScreen` and others subscribe via `on()`.
