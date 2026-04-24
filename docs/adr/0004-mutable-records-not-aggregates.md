# ADR 0004 — Mutable records + update functions instead of behavior-on-entity

**Status:** Accepted
**Date:** 2026-04-24

## Context

Classic DDD says entities have behavior — methods on the entity that
enforce its invariants. The `clean-ddd-hexagonal` skill flags
"anemic domain models" (data-only records + service functions) as an
anti-pattern.

This codebase uses the opposite pattern by deliberate choice. Quoting
`CLAUDE.md`:

> Data flows through plain records mutated in place — no classes, no ECS.
> Each module owns a slice […] `respawn` and `resetPressure` **mutate in place**
> rather than returning a fresh record — keep that convention when extending state.

This is load-bearing for the fixed-step physics loop:

- Allocations in the hot path cause GC pauses; mutable records reuse memory.
- Plain shapes destructure cheaply (`{ x, y } = player`).
- The loop reads dozens of records per tick; making each one a class with
  a method per behavior would scatter physics across many call sites.

## Decision

Keep the existing pattern. **Don't convert records to classes.** A `Player`
remains:

```ts
export interface Player { x: number, y: number, /* … */ }
export function createPlayer(level: Level): Player { … }
export function updatePlayer(p: Player, /* … */): void { mutate(p) }
export function die(p: Player, level: Level, cause: 'hazard' | 'fallout'): void { … }
```

Not:

```ts
class Player { update() { … }; die() { … } }
```

## Consequences

- The codebase reads "C-with-namespaces", which is exactly what the fixed-step
  loop wants.
- A reviewer using a strict DDD lens will mark this as anemic. The lens is
  wrong for this codebase. ADR-0001 established that we're not applying
  full DDD anyway.
- "Behavior lives next to the data" is honored by **co-locating the update
  functions in the same file as the record**, not by methods on a class.

## Alternatives considered

1. **Convert to classes with methods.** Rejected: GC pressure, allocation
   churn, no fit with the loop's read-mutate cycle, no payoff at this scale.
2. **Convert to ECS (entity-component-system).** Rejected: bigger rewrite
   than the user asked for. A future migration to ECS is plausible if the
   game grows; document then.
3. **Mix: some entities classes, others records.** Rejected: inconsistency
   is the worst of both worlds.

## Re-evaluate when

- A second renderer joins (e.g. server-side simulation in Node) and the
  physics loop needs to be paradigm-portable.
- The team adds a contributor who flags this as confusing — train via this
  ADR rather than convert.
