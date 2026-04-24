# ADR 0007 — Kinetic platforms live under world, not at top level

**Status:** Accepted
**Date:** 2026-04-24

## Context

`src/kinetic/` (rotor, breather, spring, linear, shared, index) was at the
src root. Kinetic platforms are level geometry that moves — rotors that
swing, breathers that oscillate, springs that bounce, linear platforms that
shuttle along paths.

Two placements:
1. Top-level `kinetic/` context
2. Nested under `world/` as `world/kinetic/`

## Decision

Nest under `world/`. The path becomes `src/world/kinetic/`.

## Consequences

- The dependency direction is right: `world/level.ts` already imports
  `KineticJson` and `KineticState`. Co-locating means imports become
  same-folder (`from './kinetic'`) rather than spanning contexts.
- Future kinetic types (e.g. a "trampoline" or "elevator") live next to
  the level they belong to.

## Alternatives considered

1. **Top-level `kinetic/`.** Rejected: kinetic exists *only* to make level
   geometry move. It has no domain meaning outside world.
2. **Inline kinetic into world/level.ts.** Rejected: each kinetic type has
   substantial logic (rotor centroid math, linear path traversal, spring
   damping); inlining would balloon level.ts past readability.

## Re-evaluate when

- Kinetic systems start being used by entities other than world geometry
  (e.g. enemy attacks driven by spring physics). Then promote.
