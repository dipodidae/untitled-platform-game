# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev        # Vite dev server with HMR on http://localhost:5173
npm run build      # tsc (typecheck) then vite build → dist/
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .
npm run lint:fix   # eslint . --fix
npm run preview    # serve the production build
```

No test runner is configured. The project targets Node 20+.

TypeScript is strict with `noUncheckedIndexedAccess`, `noUnusedLocals`, and `noUnusedParameters` — array/record lookups return `T | undefined` and unused bindings fail the build. ESLint uses `@antfu/eslint-config` (stylistic rules on).

## Documentation map

This codebase has been organized into bounded contexts. Read the docs **before** writing any non-trivial code:

| File | What it tells you |
|---|---|
| [`docs/AGENTS.md`](docs/AGENTS.md) | Onboarding, where-to-find tables, load-bearing patterns, Chesterton's fences |
| [`docs/TOPOLOGY.md`](docs/TOPOLOGY.md) | Context map, dependency rule, game-loop control flow |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | Ubiquitous language; flagged collisions |
| [`docs/adr/`](docs/adr/) | Per-decision rationale (ADRs 0001–0012) |
| `src/<context>/CONTEXT.md` | Per-context purpose, owned concepts, invariants |

If you're an agent and you're about to refactor or move files, **read the relevant ADR first.** Many things that look weird are intentional and ADR-explained.

## Bounded-context layout

Top-level folders under `src/` are bounded contexts:

```
session/    game loop + lifecycle + EventBus + level sequencing
player/     Player record + behavior
enemies/    prowler, dummy
combat/     bullets, ruptures (bullet carving), weapons (per-weapon profiles in weapons/)
world/      level data, destruction, kinetic platforms (kinetic/), materials
items/      pickups
physics/    collision pipeline + SAT
input/      keyboard mapping + edge detection
render/     Pixi rendering, camera, fx (visual feedback)
editor/     standalone level-editor app
ui/         HTML overlays for the running game
shared-kernel/   true cross-context primitives (vec2, polygon)
```

`src/main.ts` (Vite entry) and `src/config.ts` (consumed everywhere) stay at the root.

Adherence rule: any new code lives inside an existing context, OR a new context that satisfies the three criteria in `docs/AGENTS.md#adding-a-new-bounded-context`. **No `utils/`, `helpers/`, `common/` folders.**

## Architecture — load-bearing patterns

Specific architectural choices that other docs assume. Don't break these.

### Fixed-step loop with hitstop gate (`src/session/game.ts`)

Pixi's ticker gives a variable frame dt; `startLoop` drains it into fixed `CONFIG.FIXED_DT` (1/60s) physics ticks using an accumulator, clamped by `MAX_FRAME_DT` to avoid the spiral of death.

**Hitstop short-circuits `fixedUpdate` entirely.** `fx.hitstopTicks` counts physics ticks (not seconds — deterministic on fixed dt), and `consumeHitstopTick` decrements it while returning `true` to skip the update. Input edges are also NOT latched during hitstop, so presses buffered during a freeze arrive on the first live tick after.

`consumeHitstopTick` lives in `src/render/fx.ts` despite gating the loop — see [ADR-0003](docs/adr/0003-keep-fx-as-one-file.md).

Camera smoothing and FX timers (shake, flash) run at **render** cadence, not physics cadence. Particles tick at **physics** cadence (deterministic spawns).

### Mutable records, no classes-with-behavior

Data flows through plain records mutated in place — no classes, no ECS, no aggregates with invariants. Each module owns a slice and exports update functions that mutate that slice. See [ADR-0004](docs/adr/0004-mutable-records-not-aggregates.md).

Examples:
- `Player` (`src/player/player.ts`) — AABB + jump timers + state flags
- `Level` (`src/world/level.ts`) — colliders + zones + pristine snapshot for `resetLevel`
- `FxState` (`src/render/fx.ts`) — hitstop / shake / flash timers
- `Camera` (`src/render/camera.ts`) — deadzone follow + trauma decay
- `RenderContext` (`src/render/index.ts`) — Pixi scene graph
- `GameSession` (`src/session/gameState.ts`) — phase / deaths / checkpoint / startTime

`respawn` and similar reset functions **mutate in place** rather than returning a fresh record — keep that convention.

### Death + respawn cycle

`die(player, level, cause)` in `src/player/player.ts` sets `alive = false`, calls `resetLevel(level)` to restore destruction, increments `gameSession.deaths`, sets `gameSession.deathFreezeEndsAt = now + CONFIG.DEATH_FREEZE_MS`, and emits `playerDied`. `session/game.ts` waits out the freeze before triggering `respawn`. Pressing R bypasses the freeze.

`respawn` honors `gameSession.lastSpawnPoint` if set (touched a checkpoint zone), else `level.spawn`.

### Axis-separated AABB collision (`src/physics/`)

`moveAndCollideX` then `tryCornerCorrection` then `moveAndCollideY`. Resolving X first, then Y (with a head-corner nudge in between capped by `CORNER_NUDGE` px) avoids the classic "stuck on a tile corner seam" bug that single-pass swept collisions hit. `moveAndCollideX` also sets `player.touchingWall` — wall-jump logic reads it.

### Materials (in `src/world/level.ts`)

`MaterialName = 'glass' | 'bone' | 'bone_fragile' | 'resonant' | 'soft' | 'shard'`. The union and the per-material gameplay-feel comments are inline in `level.ts` — see [ADR-0009](docs/adr/0009-materials-inline-in-level.md).

`shard` is a runtime-only material spawned from broken glass. Hazards are AABB-overlap-killed, not collision-blocking.

Adding a material: extend the `MaterialName` union, update predicates and color tables, add a brush in `src/editor/brushes.ts` if authorable. Editor sync rule below covers the full checklist.

### Input edges (`src/input/input.ts`)

`keys` vs `prevKeys` diff produces `justPressed` / `justReleased` that are true for exactly one physics tick. **`endFrame()` must be called at the end of each fixed update** (after all edge reads) or the buffer/cut logic breaks. It lives at the tail of `fixedUpdate` in `src/session/game.ts` and is deliberately not called during hitstop.

### Tuning

Every gameplay number lives in `src/config.ts` with `as const` so literal types propagate.

### Render pipeline

Logical buffer is `LOGICAL_WIDTH × LOGICAL_HEIGHT`; `src/main.ts#resize` integer-scales it via CSS. Pixi v8 `Application` is initialized async (`await app.init`). The scene composes `bgContainer` (screen-fixed parallax) + `worldContainer` (camera-panned) + `uiContainer` (screen-fixed overlays). See `src/render/index.ts`.

### EventBus (`src/session/eventBus.ts`)

Typed in-process synchronous emitter. `EngineEvents` enumerates payload shapes. Events are `playerDied`, `levelComplete`, `checkpointReached`, `retryPressed`, `levelLoaded`. Synchronous on purpose — see [ADR-0012](docs/adr/0012-eventbus-typed-emitter.md).

### Editor ↔ engine sync

The level editor (`src/editor/`) and the game engine share a single authored data format: `LevelJson` in `src/world/level.ts`. Any engine change that touches authorable content must also update the editor, in the same change. The checklist:

- **New material** → extend `MaterialName` in `src/world/level.ts`, update the editor's `MATERIALS` lists in `src/editor/components/LeftPanel.vue` and `src/editor/components/RightPanel.vue`, and add a brush in `src/editor/brushes.ts` if it should default to it.
- **New zone type** → extend `ZoneType` in `src/world/level.ts`, add the runtime consumer in `src/player/player.ts`, add a `ZoneJson` field for per-type params, add the inspector branch in `src/editor/components/RightPanel.vue`, add a brush in `src/editor/brushes.ts`, add the color in `src/editor/composables/useCanvas.ts`'s `ZONE_COLORS`.
- **New kinetic type** → add the file in `src/world/kinetic/`, wire into `src/world/kinetic/index.ts` dispatchers + `KineticJson`/`KineticState` unions, handle it in the editor's `computePreviewVerts` motion-preview in `src/editor/composables/useCanvas.ts`, surface params in `src/editor/components/RightPanel.vue`, add a brush.
- **New entity kind** (enemies, pickups, etc.) → add runtime + renderer + barrel re-export, extend `LevelJson` with its array, add a tool in `src/editor/components/LeftPanel.vue`'s `TOOLS`, an inspector branch in `src/editor/components/RightPanel.vue`, a canvas-draw branch in `src/editor/composables/useCanvas.ts`, and a brush if it has parameter variants.
- **Schema extension on existing types** (e.g. new `Collider` field) → extend `LevelJson['colliders']`, `EditorCollider` in `src/editor/stores/editor.ts`, `fromLevelJson`, `toLevelJson`, expose an inspector control in `src/editor/components/RightPanel.vue`.

If a PR lands in `src/world/`, `src/enemies/`, `src/items/`, `src/combat/`, or changes input/runtime semantics, scan the editor for a corresponding change. **Rule of thumb: if the editor can't round-trip a level that uses the new feature, the change is incomplete.**

## Working with this repo safely

This working tree frequently carries **substantial uncommitted work** — new directories, partial renames, schema extensions in flight. Before running any git command that touches state, pause and confirm.

### Branching model: main-only

- **All work happens on `main`.** Do NOT create feature branches (`feat/*`, `fix/*`, `editor-overhaul`, etc.) unless the user explicitly asks. The subagent-driven-development skill suggests worktrees/branches by default — ignore that default for this project.
- **Commit to main and push as you go.** Small, frequent commits beat batched ones — they're the only safety net when a destructive command goes wrong (see below).
- If an agent accidentally works on a branch, merge (`git checkout main && git merge --ff-only <branch>`) or squash back to main before finishing the session.

### Destructive commands

- **Never `git reset --hard` without explicit consent.** It permanently wipes working-tree edits on tracked files. `git reflog` cannot recover them. Use `git revert <sha>` instead — it undoes a commit by creating a new one and leaves the working tree alone.
- **Never `git checkout -- <path>`, `git restore <path>`, or `git clean -f`** without confirming the file has no uncommitted work. These are equally destructive for working-tree edits.
- **Prefer path-scoped staging and committing.** `git commit -- docs/file.md` commits only that path; a bare `git commit` takes everything in the index, which may include work you didn't mean to publish.
- **When executing plans with subagents, commit after every implementer step.** A stray later mistake can wipe uncommitted progress; committed progress is recoverable.
- **If confused about state, `git status` and `git diff HEAD`** before acting. If something looks unfamiliar (stale files, unexpected deletions), investigate before deleting.

### Adherence with the bounded-context structure

When making any change, ask:

1. Does this concept belong in an existing context? Use `docs/AGENTS.md`'s where-to-find table.
2. Am I about to introduce a `utils/` or `helpers/` folder? **Don't.** Pick a real context name.
3. Am I about to put a new file at `src/` root? **Don't,** unless it's a new bounded context (and I've validated the three criteria in `docs/AGENTS.md`).
4. If I'm changing authorable content, did I update the editor in the same change? See "Editor ↔ engine sync" above.
5. If I made a non-obvious structural choice, did I write an ADR in `docs/adr/`?

The DDD-lite refactor was deliberate scope — see [ADR-0001](docs/adr/0001-skip-heavyweight-ddd.md). Don't introduce ports/adapters, repositories, CQRS, or `domain/`/`application/`/`infrastructure/` layers without re-evaluating the trade-off documented there.
