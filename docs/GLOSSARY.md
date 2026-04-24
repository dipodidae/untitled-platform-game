# Glossary — ubiquitous language

Every domain term, its meaning in this codebase, and which context owns
the canonical definition. Collisions (same word, different meaning) are
flagged.

## Core

| Term | Definition | Owner |
|---|---|---|
| **AABB** | Axis-aligned bounding box `{x, y, w, h}`. Player + enemies + zones use AABBs for cheap overlap tests. | `physics/sat.ts` |
| **Aggregate** | Not used in this codebase. State is plain mutable records — see [ADR-0004](adr/0004-mutable-records-not-aggregates.md). |
| **Bounded context** | A folder under `src/` that owns one cohesive subject. 12 of them — see TOPOLOGY.md. | — |
| **Brush** | An editor preset that arms the next-shape tool with default metadata (e.g. "Linear Mover" arms `pendingPreset.kinetic = { type: 'linear', … }`). | `editor/brushes.ts` |
| **Bullet** | A projectile in flight. Spawned by `spawnBullet`, ticked by `updateBullets`. | `combat/bullet.ts` |
| **Camera** | World-space → screen-space transform with shake/trauma. | `render/camera.ts` |
| **Checkpoint** | A `'spawnPoint'` zone the player has touched. Updates `gameSession.lastSpawnPoint`. | `world/level.ts` (zone type), `session/gameState.ts` (state) |
| **Collider** | A polygon piece of level geometry. May be static or kinetic. May have surface motion or launch-pad metadata. | `world/level.ts` |
| **Coyote timer** | Brief window after walking off a platform during which a jump still registers. | `player/player.ts` |
| **Dummy** | A stationary enemy with HP, used for testing weapon feel. | `enemies/dummy.ts` |
| **EventBus** | Typed in-process synchronous emitter for cross-system signals. | `session/eventBus.ts` |
| **Fixed step** | Physics runs at a constant `CONFIG.FIXED_DT` (1/60s) regardless of frame rate. | `session/game.ts` |
| **Goal zone** | A `'goal'` zone whose overlap emits `levelComplete`. | `world/level.ts` (zone type), `player/player.ts` (overlap detection) |
| **Hitstop** | Brief freeze of `fixedUpdate` (counted in TICKS) so a fracture event "lands" visually. | `render/fx.ts` |
| **Instability** | Per-player accumulator of momentum events; at high values the player breaks glass underfoot or shatters. | `player/instability.ts` |
| **Kinetic** | A collider that moves under runtime simulation. Four kinds: rotor, breather, spring, linear. | `world/kinetic/` |
| **LevelJson** | The on-disk authored level format — collider list + entities + zones. | `world/level.ts` |
| **Material** | One of `glass | bone | bone_fragile | resonant | soft | shard`. Determines destruction behavior, friction, and color. | `world/level.ts` |
| **MTV** | Minimum translation vector returned by SAT to resolve overlap. | `physics/sat.ts` |
| **Pickup** | An item the player can collect. Currently just `bigShot`. | `items/` |
| **Player** | The controllable actor. Singular — there's only one. | `player/player.ts` |
| **Pristine collider** | A snapshot of a collider's authored state. Used by `resetLevel` to restore the world after a death. | `world/level.ts` |
| **Prowler** | A weighted-movement enemy organism. Material-biased confidence affects speed; instability accumulates from momentum events. | `enemies/prowler.ts` |
| **Rupture** | The carve-into-the-world event a bullet causes on impact. | `combat/rupture.ts` |
| **SAT** | Separating Axis Theorem — collision test for AABB vs convex polygon. | `physics/sat.ts` |
| **Session** | One running game instance: phase, deaths, current level, checkpoint. | `session/gameState.ts` |
| **Shard** | Runtime-only collider spawned from broken glass. Lethal on contact. Has `expiresAt`. | `world/level.ts` |
| **Snap** | Editor coordinate quantization step. | `editor/state.ts` |
| **Spawn** | The level's authored player start position (`LevelJson.spawn`). NOT the same as a checkpoint — see collisions. | `world/level.ts` |
| **Stance** | Spineboy character's visual stance (idle/run/etc.). Cycles via input. | `render/spineboy.ts` |
| **Trauma** | Camera-shake accumulator, decays each frame. | `render/camera.ts` |
| **Vec2** | `{ x: number, y: number }`. Universal 2D vector type. | `shared-kernel/vec2.ts` |
| **Zone** | An axis-aligned rectangle in world space carrying per-type metadata. Six types: gravity, wind, hazard, trigger, goal, spawnPoint. | `world/level.ts` |

## Language collisions

These are the same word with different meanings — flagged so future
readers don't conflate them.

### `GameState` vs `GameSession`

- **`GameState`** (in `session/game.ts`) — the runtime bundle: `{ app,
  level, player, camera, fx, broadphase, prowlers, dummies, bullets,
  particles, … }`. Created by `createGame`, threaded through `fixedUpdate`.
- **`GameSession`** (in `session/gameState.ts`) — per-attempt session state:
  `{ phase, currentLevelId, deaths, startTime, lastSpawnPoint,
  deathFreezeEndsAt }`. Singleton `gameState` exported.

Two records, two purposes, similar names. `GameSession` was renamed during
tier-1 wiring to avoid the collision in code; the file is still called
`gameState.ts` and the singleton is still called `gameState` for backward
compatibility. Future cleanup: rename file + singleton too.

### `spawn` (level start) vs `spawnPoint` (zone) vs SpawnPoint (concept)

- **`spawn`** — `LevelJson.spawn: { x, y }`. The single authored level-start
  position. Players spawn here on level load.
- **`'spawnPoint'`** — a `ZoneType` value. A zone of this type acts as a
  checkpoint: touching it updates `gameSession.lastSpawnPoint`.
- **SpawnPoint** (capitalized concept) — informal name for the
  checkpoint feature in design docs. In code, just `zone.type === 'spawnPoint'`.

Three references, one in the level format and two for the checkpoint
system.

### `spawn` (verb) — `spawnBullet`, `prowlerSpawns`, `dummySpawns`

Verb usage of "spawn" referring to instance creation is unrelated to
either of the above. Not a collision in practice — context disambiguates.

### `level` overload

- **`Level`** (interface in `world/level.ts`) — runtime level state with
  mutable collider list.
- **`LevelJson`** — the on-disk format (immutable shape, smaller surface
  area).
- **`level1` / `level2`** — bundled level identifiers (filenames + ids).

Distinct types. The runtime `Level` is built from `LevelJson` via
`fromJson`.

### `state` overload

- **`EditorState`** — the editor's mutable state (`src/editor/state.ts`).
- **`GameState`** / **`GameSession`** — see above.
- **`FxState`** — fx timers (`src/render/fx.ts`).
- **`InstabilityState`** — per-player instability (`src/player/instability.ts`).
- **`BulletState`** — bullet pool + cooldown (`src/combat/bullet.ts`).
- **Several other `*State` records** (FxState, ParallaxState, WindState,
  KineticState).

Convention: any per-feature mutable record gets the suffix `State`.
Always qualified by the prefix; never `state` standalone in code.

### `kind` vs `type`

- **`kind`** — discriminator field on items, bullets, enemies (e.g.
  `pickup.kind: 'bigShot'`).
- **`type`** — discriminator field on zones and kinetic platforms
  (e.g. `zone.type: 'goal'`, `kinetic.type: 'rotor'`).

Inconsistent but pre-existing. Not unifying per no-behavior-change rule.
Recommend future cleanup: pick one (probably `type`) and migrate.

## Anti-glossary — terms NOT used

To avoid confusion with other DDD codebases, these terms appear in
literature but are intentionally absent here:

- **Aggregate root** — see [ADR-0004](adr/0004-mutable-records-not-aggregates.md).
- **Repository** — no persistence layer beyond `localStorage` + JSON imports.
- **Use case / application service** — game-loop calls into context
  modules directly; no use-case layer.
- **Port / Adapter** — see [ADR-0011](adr/0011-no-port-adapter-layer.md).
- **Domain event** — events here are runtime signals via the in-process
  EventBus, not persisted facts. See [ADR-0012](adr/0012-eventbus-typed-emitter.md).
- **Command** / **Query** — no CQRS.
