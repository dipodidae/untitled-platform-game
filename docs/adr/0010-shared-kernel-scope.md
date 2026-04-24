# ADR 0010 — `shared-kernel/` for vec2 + polygon only; not for Id, Timestamp, etc.

**Status:** Accepted
**Date:** 2026-04-24

## Context

DDD literature warns against shared-kernel bloat: anything placed there
becomes pinned and risky to change because every context depends on it.
The skill says: "Err toward duplication over false sharing."

Candidate shared primitives in this codebase:
- `Vec2` — used in physics, world, render, editor, kinetic. Genuinely universal.
- `Polygon` — same; used everywhere geometry is touched.
- `AABB` — interface, but only used in physics (defined in `physics/sat.ts`).
- `Id` (numeric collider id, level id string) — different shapes per context,
  not unified.
- `Timestamp` — `performance.now()` returns `number`; no project-wide
  Timestamp type.

## Decision

Only `Vec2` and `Polygon` go in `src/shared-kernel/`. AABB stays in
physics. Ids stay in their owning context (collider id is a `number` field
on `Collider`; level id is a string in session/levelManager).

## Consequences

- The shared kernel is small (2 files) and stable. Changes to it would
  ripple, but they're unlikely.
- AABB's `physics/sat.ts` location is honest: SAT is the only physics
  concept that needs an AABB type at the public surface.

## Alternatives considered

1. **Empty shared-kernel; copy Vec2 + Polygon into each context.**
   Rejected: Vec2 is genuinely identical everywhere; duplicating it would
   produce four mutually-incompatible Vec2 types and frequent coercion code.
2. **Aggressive shared-kernel: AABB + Id + Timestamp + general utilities.**
   Rejected: false sharing risk. Each non-primitive concept has subtle
   per-context invariants that would erode if shared.

## Re-evaluate when

- A genuine cross-context Id type emerges (e.g. an entity-id used in
  combat AND world AND render). Then promote.
- AABB starts being used outside physics (e.g. a culling system in
  render). Then promote.
