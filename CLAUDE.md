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

## Architecture

The game is a fixed-step platformer built on PixiJS v8. The core design choices below matter because they're load-bearing for how modules talk to each other.

### Fixed-step loop with hitstop gate (`src/game.ts`)

Pixi's ticker gives a variable frame dt; `startLoop` drains it into fixed `CONFIG.FIXED_DT` (1/60s) physics ticks using an accumulator, clamped by `MAX_FRAME_DT` to avoid the spiral of death.

**Hitstop short-circuits `fixedUpdate` entirely.** `fx.hitstopTicks` counts physics ticks (not seconds — deterministic on fixed dt), and `consumeHitstopTick` decrements it while returning `true` to skip the update. Input edges are also NOT latched during hitstop, so presses buffered during a freeze arrive on the first live tick after.

Camera smoothing and FX timers (shake, flash) run at **render** cadence, not physics cadence. Particles tick at **physics** cadence (they're spawned from deterministic blast events).

### State ownership

Data flows through plain records mutated in place — no classes, no ECS. Each module owns a slice:

- `Player` (`src/player.ts`) — AABB + jump timers + pressure state + ephemeral `lastBlast` renderer handle
- `Level` (`src/level.ts`) — mutable `tiles[y][x]` + per-tile `damage[y][x]` (stone chipping) + a frozen `pristineTiles` snapshot used by `resetLevel` on death
- `PressureState` (`src/pressure.ts`) — resource, vent flags, `detonateQueued`
- `FxState` (`src/fx.ts`) — hitstop/shake/flash timers + particle pool
- `Camera` (`src/camera.ts`) — deadzone follow, clamped to world bounds
- `RenderContext` (`src/render.ts`) — Pixi scene graph + `tileCacheKey`

`respawn` and `resetPressure` **mutate in place** rather than returning a fresh record — keep that convention when extending state.

### Deferred detonation

At `PRESSURE_MAX`, `updatePressure` sets `detonateQueued = true` but does **not** fire the blast that tick. `updatePlayer` checks the flag at the **top of the next tick** and calls `performBlast` there, then returns early (the blast IS the tick's action). This gives the ghost-preview renderer one guaranteed frame at peak pressure and avoids a single tick both adding and consuming pressure.

After a blast, `onDetonated` zeros pressure and `triggerDetonationFx` sets `fx.hitstopTicks = BLAST_HITSTOP_FRAMES`, so the next N physics ticks are skipped while shake/flash keep animating on render.

### Destruction & respawn cycle

`performBlast` in `src/blast.ts` mutates `level.tiles` and `level.damage` directly. Destruction is **permanent within a run** — on hazard contact or fall-out, `die()` sets `alive = false` and calls `resetLevel(level)`, which restores every tile from `pristineTiles`. `game.ts` then triggers `respawn` on the tick after death so death visuals land first.

The renderer detects level mutation via `hashTiles(level)` — a cheap FNV-ish mix over (material, damage) — and rebuilds `tilesGfx` only when the hash changes. Don't redraw every frame; rely on the hash.

### Axis-separated AABB collision (`src/physics.ts`)

`moveAndCollideX` then `tryCornerCorrection` then `moveAndCollideY`. Resolving X first, then Y (with a head-corner nudge in between capped by `CORNER_NUDGE` px) avoids the classic "stuck on a tile corner seam" bug that single-pass swept collisions hit on axis-aligned grids. `moveAndCollideX` also sets `player.touchingWall` — the pressure system reads this for the "pressed into a wall" gain.

Out-of-bounds tile reads return `MAT_DIRT` (any solid works — it just prevents the player from escaping the world).

### Materials are the single source of truth (`src/materials.ts`)

Every "is it solid? / blastable? / reflective? / lethal?" question routes through predicates (`isSolid`, `isDestructible`, `isReflective`, `isHazard`). **Hazards are pass-through (non-solid)** so the player's AABB enters the tile and `rectOverlapsHazard` kills on overlap — don't accidentally add hazard to `isSolid`.

Adding a material means: new `MAT_*` id, predicate updates, parser char in `charToMaterial`, palette in `config.ts`, and a draw branch in `drawTiles` (`render.ts`). The README's "Where to tweak" table is the canonical list.

### Input edges (`src/input.ts`)

`keys` vs `prevKeys` diff produces `justPressed` / `justReleased` that are true for exactly one physics tick. **`endFrame()` must be called at the end of each fixed update** (after all edge reads) or the buffer/cut logic breaks. It lives at the tail of `fixedUpdate` in `game.ts` and is deliberately not called during hitstop.

### Tuning

Every gameplay number lives in `src/config.ts` with `as const` so literal types propagate. Look for `// TUNING:` comments in `src/blast.ts` for flagged tuning points. The README's "Where to tweak" table maps intents to files.

### Render pipeline notes

Low-res logical buffer (`LOGICAL_WIDTH × LOGICAL_HEIGHT`, 480×270) is integer-scaled via CSS (`main.ts#resize`) with `image-rendering: pixelated` to keep the pixel grid crisp — **don't set `autoDensity` or change `resolution`**. Pixi's `roundPixels: true` is on. The scene is two containers: `worldContainer` (camera-panned + shake-offset) and `uiContainer` (screen-fixed, holds meter/hints/flash overlay).
