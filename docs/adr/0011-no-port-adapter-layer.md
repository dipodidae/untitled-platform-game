# ADR 0011 — No ports/adapters layer for Pixi or localStorage

**Status:** Accepted
**Date:** 2026-04-24

## Context

Hexagonal architecture says: define ports (interfaces) in the domain,
implement adapters in infrastructure. The two external systems this
codebase touches are:

1. **Pixi v8** — graphics. Used directly by `render/`, `editor/`, `ui/`.
2. **`localStorage`** — level persistence. Used directly by
   `session/levelManager.ts`.

A strict reading of the prompt would have us define `RendererPort`,
`PersistencePort`, etc., and have only adapters call Pixi / localStorage.

## Decision

Don't introduce ports/adapters. Pixi calls remain in `render/` directly;
`localStorage` calls remain in `session/levelManager.ts` directly.

## Consequences

- Reading the renderer means reading Pixi calls — short and direct.
  Adding a port layer would mean two function calls for every draw, with
  no swapability use case to justify the indirection.
- Swapping `localStorage` for IndexedDB or a server is a known-localized
  change: the file lives at `src/session/levelManager.ts`, and the only
  side-effecting calls are `localStorage.getItem` and `setItem`. A small
  refactor when the time comes.
- `clean-ddd-hexagonal` reviewers may flag this as "leaking
  infrastructure". They're right by a strict reading. ADR-0001 established
  we're not applying that strict reading.

## Alternatives considered

1. **Full ports/adapters for Pixi.** Rejected: Pixi is THE renderer; it's
   never being swapped. The interface would be either a leaky abstraction
   over Pixi types or a thin pass-through with no value.
2. **Ports/adapters for localStorage only** (since it's plausible to swap).
   Rejected at this scale: 30 lines of code don't need an interface.
   Promote when the swap is on the horizon.

## Re-evaluate when

- A second renderer joins (e.g. server-side simulation needs to "draw"
  for telemetry). Then introduce a thin RendererPort.
- Persistence needs to support multiple backends (e.g. cloud sync vs
  localStorage). Then introduce a PersistencePort.
