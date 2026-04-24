# ADR 0005 — Editor is its own bounded context, not a sub-context

**Status:** Accepted
**Date:** 2026-04-24

## Context

The level editor lives at `src/editor/` and bundles via its own Vite entry
(`editor.html` → `src/editor/main.ts`). It uses Pixi v8, but a separate
`Application` from the running game. It reads/writes `LevelJson` from
`src/world/level.ts` and saves via the dev-server middleware in
`vite.config.ts`.

DDD options:
1. **Editor as its own bounded context** at the top level alongside `world`,
   `combat`, etc.
2. **Editor as a sub-context of `world`** (since it edits world data).
3. **Editor as a separate app entirely** (its own `package.json`, separate repo).

## Decision

Option 1: editor is a peer bounded context.

## Consequences

- The editor's internal language (brushes, pendingPreset, undo stack with
  labels) lives in editor space and doesn't leak into `world/`.
- The editor's only contact with the rest of the codebase is the
  `LevelJson` schema (and `ItemKind` from items, `ZoneType` from world).
  This is the editor's anti-corruption boundary.
- Future contributors who want to extend the editor read only `editor/`
  and the schemas it imports — no need to load the runtime game.

## Alternatives considered

1. **Sub-context of `world`.** Rejected: the editor concerns (DOM panels,
   Pixi camera, undo history) are unrelated to the runtime world simulation.
   Co-locating would inflate `world/` with irrelevant files.
2. **Separate app.** Rejected: shared types via the JSON schema are too
   convenient inside one repo. Splitting would force a published-package
   boundary between editor and runtime, which is overkill at this scale.

## Re-evaluate when

- The editor needs to be deployable independently of the game (e.g. a
  stand-alone level marketplace tool).
