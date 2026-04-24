# Plan — DDD-lite refactor

## Reading order

1. [DISCOVERY.md](./DISCOVERY.md) — what's in the codebase today
2. This file — what we're moving and why
3. [PROGRESS.md](./PROGRESS.md) — execution log appended as work happens
4. [`/docs/adr/`](../adr/) — one ADR per consequential decision

## Constraint reconciliation

The user's prompt and the `clean-ddd-hexagonal` skill conflict. The prompt's
own precedence rules: skill wins on architecture specifics; prompt wins on
file-per-concept, docs, DoD.

The skill's first table explicitly says **skip** full DDD/Hexagonal for solo
dev / small team / prototype / simple — this codebase is all four. So we
apply the *spirit* (bounded contexts, file-per-concept, docs, ADRs) without
the heavy machinery (no aggregates with invariants, no ports/adapters,
no repositories, no CQRS). Captured in [ADR-0001](../adr/0001-skip-heavyweight-ddd.md).

## Target topology

12 bounded contexts. Each is a folder under `src/`.

```
src/
├── session/         game loop, lifecycle, events, level sequencing
├── player/          player entity + instability + behavior
├── enemies/         prowler, dummy
├── combat/          bullets, weapons, ruptures (the damage event)
├── world/           level data, destruction, kinetic platforms, materials
├── items/           pickups
├── physics/         collision pipeline + SAT
├── input/           keyboard mapping
├── render/          Pixi rendering, camera, fx (visual feedback)
├── editor/          standalone editor app (untouched layout)
├── ui/              HTML overlays for the running game
└── shared-kernel/   true cross-context primitives (vec2, polygon)
```

`src/main.ts` and `src/config.ts` stay at the root. `main.ts` is the Vite
entry; `config.ts` is consumed by every context and would create cycles
in any single context.

## Move list

| File (old → new) | Notes |
|---|---|
| `src/bullet.ts` → `src/combat/bullet.ts` | |
| `src/rupture.ts` → `src/combat/rupture.ts` | |
| `src/weapons/*` → `src/combat/weapons/*` | weapons is a sub-grouping inside combat |
| `src/camera.ts` → `src/render/camera.ts` | |
| `src/fx.ts` → `src/render/fx.ts` | See [ADR-0003](../adr/0003-keep-fx-as-one-file.md) |
| `src/eventBus.ts` → `src/session/eventBus.ts` | |
| `src/game.ts` → `src/session/game.ts` | |
| `src/gameState.ts` → `src/session/gameState.ts` | |
| `src/levelManager.ts` → `src/session/levelManager.ts` | |
| `src/levels/*.json` → keep at `src/levels/` | Asset directory referenced by both runtime and editor — not a context. |
| `src/input.ts` → `src/input/input.ts` | |
| `src/player.ts` → `src/player/player.ts` | |
| `src/instability.ts` → `src/player/instability.ts` | |
| `src/math/sat.ts` → `src/physics/sat.ts` | Used only by physics; not a primitive |
| `src/math/vec2.ts` → `src/shared-kernel/vec2.ts` | True primitive |
| `src/math/polygon.ts` → `src/shared-kernel/polygon.ts` | True primitive |
| `src/kinetic/` → `src/world/kinetic/` | Kinetic platforms are world geometry that moves |
| `src/world/level.ts` | stays |
| `src/world/destruction.ts` | stays |
| `src/enemies/`, `src/items/`, `src/physics/`, `src/render/`, `src/editor/`, `src/ui/` | stay (already aligned) |

After: zero loose `.ts` files at `src/` root other than `main.ts`,
`config.ts`, and `vite-env.d.ts`.

## What we're NOT doing

- **No file splits beyond what's flagged in DISCOVERY.md.** `player.ts`,
  `game.ts`, `world/level.ts`, `render.ts` stay as one file each. Their
  size is the result of cohesive subject matter, not god-objecting.
  ADR-0002 explains.
- **No rename of existing folders** (`render/` stays `render/`, not
  `rendering/`). Avoiding rename churn across many import paths.
- **No introduction of port/adapter abstractions.** Pixi is touched
  directly. `localStorage` is touched directly. ADR-0001 explains.
- **No anemic-model conversion.** State stays as plain mutable records
  with associated update functions. ADR-0004 explains why this isn't an
  anti-pattern in this codebase even though it would be flagged in a
  classic DDD review.

## ADRs to write (in order)

| # | Title |
|---|---|
| 0001 | Skip heavyweight DDD machinery for this codebase |
| 0002 | Keep cohesive multi-section files (player, game, level, render) |
| 0003 | Place fx in render despite hitstop's session-level role |
| 0004 | Mutable records + update functions instead of behavior-on-entity |
| 0005 | Editor is its own bounded context, not a sub-context |
| 0006 | Camera lives in render, not session |
| 0007 | Kinetic platforms live under world, not at top level |
| 0008 | Weapons live under combat, not top level |
| 0009 | Materials stay inline in `world/level.ts` |
| 0010 | shared-kernel for vec2 + polygon only; not for Id, Timestamp, etc. |
| 0011 | No ports/adapters layer for Pixi or localStorage |
| 0012 | EventBus is not a message broker — typed in-process emitter |

## Execution order

1. ADRs 0001–0004 first (they justify the conservative choices).
2. Scaffold target folders (no moves yet) + commit.
3. Per-context migrations as separate commits, in this order to minimize
   cross-cutting blast radius:
   1. `shared-kernel` (math primitives — many imports change but mechanically simple)
   2. `physics` (pulls in `sat.ts`, updates internal imports)
   3. `world` (kinetic moves under here, internal-only churn)
   4. `combat` (bullets + rupture + weapons co-locate)
   5. `player` (player + instability)
   6. `render` (camera + fx absorbed)
   7. `input` (single file, but isolated context)
   8. `session` (game + gameState + levelManager + eventBus — this is the orchestrator, do last so its imports point to the post-migration locations)
4. Each migration: move → typecheck → fix imports → typecheck → write CONTEXT.md → commit.
5. Global docs (TOPOLOGY, GLOSSARY, AGENTS).
6. Lock-in: extend CLAUDE.md with adherence rules.
7. Self-review pass + push.

## Verification

After every migration:
- `npm run typecheck` passes
- `npm run dev` starts (process boots without import errors)

After all migrations:
- `npm run build` succeeds
- Editor still loads (`/editor.html`)
- Manual smoke: load level1, jump, shoot, die, retry, hit checkpoint, hit goal — all the tier-1 behaviors still work end-to-end

No automated tests exist. Pure refactor, so behavior identity is the
guarantee — any divergence is a bug introduced by the move.
