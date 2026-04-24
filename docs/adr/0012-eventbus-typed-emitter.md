# ADR 0012 — EventBus is a typed in-process emitter, not a message broker

**Status:** Accepted
**Date:** 2026-04-24

## Context

`src/session/eventBus.ts` exports `on / off / emit` over an `EngineEvents`
type map. It carries cross-system signals like `playerDied`,
`levelComplete`, `checkpointReached`, `retryPressed`, `levelLoaded`.

DDD literature for events typically describes:
- **Domain events** — past-tense facts emitted by aggregates, often with
  outbox/transactional patterns.
- **Integration events** — cross-bounded-context, often serialized over a
  broker.

This codebase's events are neither. They're synchronous in-process
signals that decouple the emitter from the consumer (e.g. `player.die()`
emits and doesn't know `ui/resultsScreen.ts` exists).

## Decision

Keep the emitter as-is: typed, synchronous, in-process. Don't add an
outbox, don't add async dispatch, don't serialize.

## Consequences

- Order is deterministic: `emit('playerDied', …)` runs handlers
  synchronously before `die()` returns. This matters for the death-freeze
  freeze window — if the freeze were set by an async handler, the next
  physics tick could fire before it lands.
- Handlers throwing would propagate to the emitter. Acceptable because
  handlers are written in the same codebase; there's no "external
  subscriber" to be defensive against.
- The typed `EngineEvents` map gives editor autocomplete on event names
  and payload shapes, which is the thing that actually catches mistakes.

## Alternatives considered

1. **Use `mitt` (npm package).** Rejected: 10 lines of typed code beats a
   dependency for this scope.
2. **Async event dispatch via `queueMicrotask`.** Rejected: see freeze-
   window timing above. Sync is the right semantics for this codebase.
3. **Outbox pattern with persisted events.** Rejected: no persistence
   layer, no recovery story, no need.

## Re-evaluate when

- Events need to cross processes (e.g. multiplayer authority publishes
  `playerDied` to clients). Then split into domain events (in-process)
  vs integration events (over the wire) and add proper transport.
