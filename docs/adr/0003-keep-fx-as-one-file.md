# ADR 0003 — Place fx in render despite hitstop's session-level role

**Status:** Accepted
**Date:** 2026-04-24

## Context

`src/fx.ts` carries three pieces of state on a single `FxState` record:

- `hitstopTicks` — a counter that **gates the physics loop** when > 0.
  This is a session/timing concern, not a visual concern.
- `shakeTimer` / `shakeDuration` / `shakeAmplitude` — camera-shake state.
  Read by the renderer.
- `flashTimer` / `flashDuration` — full-screen flash. Read by the renderer.

By strict bounded-context logic, hitstop should live with `session/`
(it gates `fixedUpdate`). Shake and flash should live with `render/`. So
either:

(a) Split `FxState` into `HitstopState` (session) + `FeedbackState` (render)
(b) Place the whole file in one context and accept that one consumer crosses
    the boundary

## Decision

Place `fx.ts` in `render/` and accept that `session/game.ts` imports
`consumeHitstopTick` from it.

## Consequences

- Imports cross a context boundary (`session/` → `render/`), which
  ordinarily we'd avoid. The justification is the alternative is worse:
  splitting state across files forces both consumers to import from two
  places, and the three timers were designed to be triggered together
  ("a fracture event triggers hitstop + shake + flash on the same FxState").
- If hitstop ever gets used by a consumer that has no business depending
  on `render/` (e.g. a server-side authority), revisit.

## Alternatives considered

1. **Split the state across two files.** Rejected: `triggerFractureFx` and
   similar helpers set hitstop + shake + flash atomically. Splitting forces
   either a coordinator that imports both, or duplicate trigger functions
   in each file. Either way more code, no clarity gain.
2. **Put fx.ts in session/.** Rejected: 80% of the file is visual concerns.
   Future readers expecting the renderer's flash to live in render would
   have to chase it elsewhere.
3. **Make fx its own context.** Rejected: violates the prompt's three
   criteria for new contexts (only one truly novel concept, not a domain
   noun on its own).

## Re-evaluate when

- A non-render consumer of hitstop appears.
- The fx state grows beyond the three timers (e.g. screen-warp, time-dilation
  visual effects) and starts to feel like multiple subjects.
