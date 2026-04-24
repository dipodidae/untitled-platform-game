# ADR 0006 — Camera lives in render, not session

**Status:** Accepted
**Date:** 2026-04-24

## Context

`Camera` is a record holding `{ x, y, zoom }`-ish state plus shake/trauma.
It's read every render frame to position `worldContainer` and apply shake
offset. It's also updated each tick from the player's position
(`updateCamera(camera, player, …)`).

Two plausible homes:
1. `render/` — camera is consumed by the renderer, that's where its purpose lives
2. `session/` — camera is per-session state; could live with GameSession

## Decision

Place `camera.ts` in `render/`.

## Consequences

- Imports from `session/game.ts` cross into `render/` for the camera type.
  This is acceptable — `session/` already imports the broader `RenderContext`
  from `render/`.
- The renderer is the single place camera state is read; co-location
  reduces import chains.

## Alternatives considered

1. **Camera in session/.** Rejected: session/ then has to export a type
   that only render/ consumes — backwards dependency direction.
2. **Camera as its own context.** Rejected: violates the three-criteria
   rule (only one concept; no domain-side meaning beyond rendering).

## Re-evaluate when

- A non-render consumer of the camera position appears (e.g. an audio
  spatializer). Then promote `Camera` to a shared type and consider
  re-homing it.
