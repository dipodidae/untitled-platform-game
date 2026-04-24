# AGENTS.md — onboarding for future agents and developers

A new agent or developer should be able to navigate, extend, and reason
about this codebase using only this file plus the `CONTEXT.md` siblings
and the ADRs. Read this once, refer back as needed.

## What this codebase is

A 2D PixiJS v8 platformer — single-player, browser-only, no backend.
Polygon-based level geometry with destructible terrain, kinetic platforms,
hazards, checkpoints, and a goal-zone level-completion model. Comes with
a standalone in-app level editor.

About 60 TypeScript source files. Solo-developer scale.

## Starting point

Read in this order:

1. `CLAUDE.md` (root) — engine/architecture instructions, branching rules.
2. `docs/TOPOLOGY.md` — context map + game-loop control flow.
3. `docs/GLOSSARY.md` — vocabulary.
4. `docs/adr/0001-skip-heavyweight-ddd.md` — why this codebase isn't classic DDD.
5. The `CONTEXT.md` of whatever context you're touching.

## How to find a concept

| You're looking for | Look at |
|---|---|
| Player behavior | `src/player/player.ts` |
| Specific enemy logic | `src/enemies/<kind>.ts` |
| Bullet ballistics | `src/combat/bullet.ts` + `src/combat/weapons/<kind>.ts` |
| Level format | `src/world/level.ts` |
| Materials (glass / bone / …) | `src/world/level.ts` (the `MaterialName` union) |
| A moving platform type | `src/world/kinetic/<kind>.ts` |
| Collision math | `src/physics/` |
| Zone behavior | `src/world/level.ts` (the `ZoneType` union) + `src/player/player.ts` (overlap detection) |
| The game loop | `src/session/game.ts` |
| Per-attempt state (deaths, checkpoint) | `src/session/gameState.ts` |
| Cross-system events | `src/session/eventBus.ts` |
| Camera | `src/render/camera.ts` |
| Particles | `src/render/particles.ts` |
| Editor UI | `src/editor/` (start with `editor/CONTEXT.md`) |
| Results overlay | `src/ui/resultsScreen.ts` |
| Math primitives (Vec2, Polygon) | `src/shared-kernel/` |
| Tuning constants | `src/config.ts` |

If still lost: grep first, ask second. The codebase isn't large enough to
need fancier search.

## Adherence rules — must not break

These are the load-bearing patterns. If you find yourself fighting them,
stop and check the relevant ADR before writing the code.

### State pattern: mutable records + update functions

Every entity is a plain TypeScript record. Behavior is colocated module
functions that mutate the record in place. **Don't convert records to
classes.** See [ADR-0004](adr/0004-mutable-records-not-aggregates.md).

```ts
// ✅ This is the pattern
export interface Player { x: number, y: number, /* … */ }
export function createPlayer(level: Level): Player { … }
export function updatePlayer(p: Player, /* … */): void { mutate(p) }

// ❌ Don't do this
class Player { update() { … } }
```

### Branching: main-only

This project commits directly to `main`. **Don't create feature
branches** unless explicitly asked. See `CLAUDE.md`'s "Branching model"
section.

### Editor ↔ engine sync rule

If you change anything authorable in the engine (new material, new zone
type, new kinetic kind, new entity, new collider field), the editor
**must** be updated in the same change. The full checklist is in
`CLAUDE.md`'s "Editor ↔ engine sync" section. Rule of thumb: **if the
editor can't round-trip a level that uses the new feature, the change is
incomplete.**

### Fixed-step physics + hitstop gate

The game loop in `src/session/game.ts` drains a frame's variable dt into
fixed `CONFIG.FIXED_DT` ticks. Hitstop counts in TICKS, not seconds.
`consumeHitstopTick` short-circuits the entire `fixedUpdate`. Don't try
to "fix" this by moving timing to wall-clock — the determinism is the
feature.

### `endFrame()` must be the last call in `fixedUpdate`

`src/input/input.ts` exports `endFrame()` which latches `justPressed` /
`justReleased` edges for the next tick. Forgetting this breaks jump
buffering and shoot edge-detection. See `CONTEXT.md` for input.

### EventBus is synchronous and typed

Don't add async dispatch, don't broaden payloads to `unknown`, don't
allow string event names outside `EngineEvents`. See [ADR-0012](adr/0012-eventbus-typed-emitter.md).

### `domain/` does not exist here, on purpose

Some DDD reviewers look for a `src/domain/` folder. There isn't one —
[ADR-0001](adr/0001-skip-heavyweight-ddd.md) explains. Don't introduce
one to "fix" the structure.

## Adding a new entity (player, enemy, item)

1. Decide the bounded context: enemy → `enemies/`, player → `player/`,
   pickup → `items/`.
2. Create `src/<context>/<kind>.ts` with the record + update functions.
   File-per-concept: don't add it to an existing file.
3. If it has a barrel (`index.ts`), re-export.
4. Update the runtime consumer (e.g. `session/game.ts` for an enemy:
   spawn from `level.<kind>Spawns` in `loadLevelAtIndex`, tick in
   `fixedUpdate`).
5. Update the editor: add a tool / brush / inspector branch per the
   sync rule.
6. Update `world/level.ts`'s `LevelJson` if the entity is authorable.
7. Update `GLOSSARY.md` with the new term.
8. If the addition involves a structural choice (e.g. a new context, an
   unusual coupling), write an ADR.

## Adding a new bounded context

Don't, unless all three criteria pass:

1. **Name is from the domain**, not the tech (e.g. `audio` not `pixiSound`).
2. **One-sentence boundary statement** is writable.
3. **At least two concepts belong only here** (one-concept folders are
   noise — keep them inside an existing context).

If the criteria pass:

1. `mkdir src/<context>/`
2. Move or create the files.
3. Write `src/<context>/CONTEXT.md` (template: see existing siblings).
4. Update `docs/TOPOLOGY.md` (add to the table, the diagram, and the
   dependency rule if needed).
5. Update `docs/GLOSSARY.md` with new terms.
6. Write an ADR (`docs/adr/NNNN-<context>-as-bounded-context.md`)
   explaining why this context exists as its own thing.

## Adding a new ADR

Bug-driven changes don't need ADRs. Structural decisions do. The threshold:
"would a future reader looking at this folder say 'why is this here?' and
not be able to answer from the code alone?"

ADR template (use this exactly):

```md
# ADR NNNN — <title>

**Status:** Proposed | Accepted | Superseded
**Date:** YYYY-MM-DD

## Context
<the situation, the forces, the competing pulls>

## Decision
<what we're going to do>

## Consequences
<what this means going forward, both wins and costs>

## Alternatives considered
<at least one>

## Re-evaluate when
<concrete triggers — not "if we feel like it">
```

Number is the next available — check `docs/adr/`.

## Chesterton's fences

Things that look weird but are intentional. Don't "fix" without reading
the ADR.

| Looks weird | Why | Read |
|---|---|---|
| `render/fx.ts` exports `consumeHitstopTick`, which gates the physics loop | Hitstop is part of the FxState bundle (shake + flash + hitstop trigger together). Splitting it would create state-coordination bugs. | [ADR-0003](adr/0003-keep-fx-as-one-file.md) |
| `Player`, `Game`, `Level` are large single files | Cohesive subjects. Splitting just shuffles the orchestrator elsewhere. | [ADR-0002](adr/0002-keep-cohesive-multi-section-files.md) |
| State is mutable records, not classes with behavior | Hot-loop GC pressure + reads-mutate-cycle of fixed-step games. | [ADR-0004](adr/0004-mutable-records-not-aggregates.md) |
| No `domain/` / `application/` / `infrastructure/` layers | This codebase is on the "skip" side of the `clean-ddd-hexagonal` skill's own table. | [ADR-0001](adr/0001-skip-heavyweight-ddd.md) |
| Pixi calls happen directly in `render/`, not behind a port | No second renderer; abstraction without a use case. | [ADR-0011](adr/0011-no-port-adapter-layer.md) |
| `localStorage` calls happen directly in `session/levelManager.ts` | Same — no second persistence backend. | [ADR-0011](adr/0011-no-port-adapter-layer.md) |
| `BULLET_KINDS` defined in two places | Pre-existing duplication; not unified per no-behavior-change rule of the refactor. | [FINDINGS.md](refactor/FINDINGS.md) |
| `editor-save` middleware in `vite.config.ts` is unauthenticated | Dev-server only; `apply: 'serve'` gates it. | (FINDINGS) |
| `physics.ts` and `render.ts` were at root, now `physics/index.ts` and `render/index.ts` | Barrels stay close to the folder they barrel. Cleanup commit during refactor. | (PROGRESS) |

## Verification before claiming a change is done

- `npm run typecheck` passes.
- `npm run dev` starts without import errors.
- Open `http://localhost:5173/` and `http://localhost:5173/editor.html`
  to smoke-test both surfaces.
- For runtime changes: load level1, jump, shoot, die, retry, hit a
  checkpoint, hit a goal — all the tier-1 paths still work.
- No new `npm run lint` errors in the files you touched (pre-existing
  errors elsewhere are out of scope).

The codebase has **no test runner**. Manual playtest is the only
behavior verification. Be conservative.
