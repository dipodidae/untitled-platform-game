# ADR 0002 — Keep cohesive multi-section files (player, game, level, render)

**Status:** Accepted
**Date:** 2026-04-24

## Context

The prompt's "one domain concept per file" rule, taken literally, would
split files like `src/player.ts` (~500 lines: Player record, `createPlayer`,
`die`, `respawn`, `updatePlayer`, `takeHit`) into separate files for each
function. Same for `game.ts`, `world/level.ts`, `render.ts`.

These files are large because their *subject* is large, not because they're
god-objects. Splitting risks:

- More indirection without more clarity (you chase through 8 files instead
  of scrolling one).
- Subtle bugs in physics-tight game code with no test runner to catch them.
- Circular import temptations (`die` would need to call into a separate
  `respawn`, which calls back into `Player`, which is in the file `die` was
  just extracted from).

## Decision

A "concept" for the file-per-concept rule means a **distinct domain noun**,
not "every exported function". Keep these files whole:

- `player/player.ts` — the Player record + all its mutation functions
- `session/game.ts` — the GameState bundle + the loop + level transitions
- `world/level.ts` — Level + Collider + Material + ZoneType + parsers
- `render/render.ts` — top-level scene composition

Split when there are **multiple distinct nouns** living in one file. We
already did the splits that mattered (kinetic types each got their own
file; weapons each got their own; enemies each got their own).

## Consequences

- These files stay 200–600 lines. Acceptable in this codebase given they're
  read top-to-bottom as a coherent subject.
- Future contributors should resist the urge to split for splitting's sake.
  If a file grows past ~800 lines AND exposes multiple distinct nouns,
  re-evaluate.

## Alternatives considered

1. **Split aggressively per function.** Rejected: see Context above.
2. **Split only the largest files (game.ts, render.ts).** Rejected: even
   the largest aren't doing too much, they're just the orchestrators.
   Splitting the orchestrator means inventing a parallel orchestrator
   somewhere else.

## Re-evaluate when

- A file genuinely starts hosting unrelated subjects (e.g. somebody adds
  `dialogue.ts` content into `player.ts`). Catch it in code review and
  split immediately.
