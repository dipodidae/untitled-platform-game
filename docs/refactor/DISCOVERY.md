# Discovery — current state of the codebase

Snapshot before the DDD-lite refactor. Records what's where, what's misplaced,
what's a multi-concept file, and where the language collides.

## Codebase scale

- **62 TypeScript files** under `src/`
- One Vite entry per surface: `src/main.ts` (game), `src/editor/main.ts` (editor)
- No test runner (CLAUDE.md confirms)
- Tight fixed-step game loop with hitstop gating
- State is plain mutable records + a `listeners: Set<() => void>` observer pattern. No classes-with-behavior, no aggregates with invariants, no DI container.

## Existing folders

| Folder | What it holds today | Honest read |
|---|---|---|
| `src/` (root) | 13 loose files: bullet, camera, config, eventBus, fx, game, gameState, input, instability, levelManager, main, player, rupture | Mixed bag — most belong in a clearly-named context. |
| `src/editor/` | Editor entry, canvas, sidebar, brushes, state, minimap + `ui/` | Cohesive — the editor IS its own bounded context. |
| `src/editor/ui/` | leftPanel, rightPanel, topBar, bottomBar, toast | Editor-internal UI components. |
| `src/enemies/` | dummy, prowler, index barrel | Cohesive — enemies context. |
| `src/items/` | bigShot, types, index barrel | Cohesive — items context. |
| `src/kinetic/` | rotor, breather, spring, linear, shared, index | Cohesive — kinetic platforms (subdomain of `world`). |
| `src/math/` | polygon, sat, vec2 | Mixed: vec2 + polygon are pure shared primitives; sat is physics-specific. |
| `src/physics/` | broadphase, narrowphase, resolve | Cohesive — collision pipeline. |
| `src/render/` | CRTFilter, palette, parallax, particles, playerRenderer, post, prowlerRenderer, spineboy, wind, world | Cohesive — Pixi-side rendering. |
| `src/ui/` | resultsScreen | Currently one HTML overlay; shaped to grow. |
| `src/weapons/` | bigShot, slug, types, index barrel | Cohesive — weapon profiles (subdomain of `combat`). |
| `src/world/` | level, destruction | Level data + destruction logic. |

## Implicit bounded contexts already present

Reading the file graph, these contexts are already shaped by where things live:

1. **session** — game lifecycle: `game.ts`, `gameState.ts`, `levelManager.ts`, `eventBus.ts`, `main.ts`, `config.ts`. Loose at `src/` root today.
2. **player** — `player.ts` + `instability.ts` (instability is player-only state). Loose at root.
3. **enemies** — `src/enemies/` (already a folder).
4. **combat** — `bullet.ts`, `rupture.ts`, `src/weapons/`. Split between root and `weapons/`.
5. **world** — `src/world/` + `src/kinetic/` (kinetic platforms are world geometry that moves).
6. **items** — `src/items/`.
7. **physics** — `src/physics/` + `src/math/sat.ts` (SAT is consumed only by physics).
8. **rendering** — `src/render/` + `camera.ts` + `fx.ts` (fx is mostly visual feedback; hitstop is the awkward exception — see ADRs).
9. **input** — `src/input.ts`. Loose, single file.
10. **editor** — `src/editor/`. Standalone bundle.
11. **ui** — `src/ui/` (HTML overlays for the running game).
12. **shared-kernel** — `vec2.ts`, `polygon.ts` from `src/math/`. True cross-context primitives.

## Misplaced concepts

| File | Today | Belongs in | Reason |
|---|---|---|---|
| `src/bullet.ts` | root | `combat/` | Combat: bullets + weapons are one subject. |
| `src/camera.ts` | root | `render/` | Camera is consumed by rendering and serves no other context. |
| `src/eventBus.ts` | root | `session/` | Cross-system signal hub belongs with session lifecycle. |
| `src/fx.ts` | root | `render/` | See ADR — placed in render despite hitstop's cross-cutting nature. |
| `src/game.ts` | root | `session/` | The loop owner. |
| `src/gameState.ts` | root | `session/` | Per-attempt state. |
| `src/input.ts` | root | `input/` (new) | Keyboard mapping is its own concern. |
| `src/instability.ts` | root | `player/` (new) | Player-only state. |
| `src/levelManager.ts` | root | `session/` | Sequencing concern. |
| `src/player.ts` | root | `player/` (new) | The player entity. |
| `src/rupture.ts` | root | `combat/` (new) | Damage event from a bullet hit. |
| `src/math/sat.ts` | math | `physics/` | Used only by physics; not a primitive. |
| `src/math/vec2.ts` | math | `shared-kernel/` (new) | True cross-context primitive. |
| `src/math/polygon.ts` | math | `shared-kernel/` (new) | Used in physics, render, world, editor. |

## Multi-concept files (split candidates)

| File | Concepts | Plan |
|---|---|---|
| `src/fx.ts` | hitstop tick gate + shake + flash | **Keep as one** — small, internally cohesive `FxState`, splitting risks introducing bugs without test runner. Document in ADR. |
| `src/world/level.ts` | LevelJson + Collider + Material + ZoneType + parser + reset | Already partially split (kinetic moved out). Materials inline is the only concept worth flagging — but extracting them risks breaking the polygon-decomp interplay. Keep, document. |
| `src/player.ts` | Player record + die + respawn + updatePlayer + takeHit | Cohesive: all player behavior. Keep as one (300+ lines but one subject). |
| `src/game.ts` | GameState bundle + createGame + advanceLevel + reloadLevel + fixedUpdate + startLoop | The loop and the world it loops over. Keep — splitting would just shuffle the ticker callback's imports. |
| `src/render.ts` | Container build + draw + parallax/particle wiring | Most has been extracted (palette, parallax, particles, etc.). What remains is the orchestration — keep. |

## Language collisions

- **`GameState`** appears twice: `src/game.ts` exports `GameState` (the runtime bundle: app + level + player + camera + …); `src/gameState.ts` exports `GameSession` (session-level: phase + deaths + checkpoints). Already renamed during the tier-1 work — this file's docstring calls it out.
- **`spawn`** has two meanings: `LevelJson.spawn` (the authored start position) and `'spawnPoint'` zone type (a checkpoint). Resolved by naming in code; flag in glossary.
- **`level1` / `level2` / `BUNDLED`** — bundled in two places (`game.ts` for runtime, `editor/main.ts` for the editor's preset dropdown). Identical lists. Acceptable duplication so the editor and runtime can diverge their level lists later if needed.

## What's NOT here

- No `utils/`, `helpers/`, `common/`, or `misc/` folder.
- No infrastructure / persistence / messaging adapters — Pixi is used directly throughout (the only "external system"), and `localStorage` is touched only by `levelManager.ts`. The hexagonal port/adapter pattern would be ceremony without payoff for this scale.
- No tests, no test runner. Validation lives in `npm run typecheck` + manual playtest.

## Out-of-scope concepts (not in this codebase)

The plan should not invent these contexts:
- `audio` — no audio system exists yet
- `progression` — no XP, no unlocks, no save game beyond `localStorage["levels:{id}"]`
- `economy` — no currency, no shop
- `narrative` — no dialogue, no story
- `netcode` — no multiplayer
- `ai` — prowlers have minimal behavior; not a context worth standing up
