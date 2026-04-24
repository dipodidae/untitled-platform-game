# ADR 0009 — Materials stay inline in `world/level.ts`

**Status:** Accepted
**Date:** 2026-04-24

## Context

The `MaterialName` union (`'glass' | 'bone' | 'bone_fragile' | 'resonant'
| 'soft' | 'shard'`) is currently declared inside `src/world/level.ts`,
together with documentation comments describing the gameplay-feel of each
material. The strict file-per-concept rule would split these out — one file
per material, or at least a `world/materials.ts`.

## Decision

Keep materials inline in `world/level.ts`.

## Consequences

- Materials and the `Collider` record they're attached to live next to each
  other. A reader scanning `world/level.ts` sees the full vocabulary in
  one pass.
- Adding a material remains a single-file edit. (The CLAUDE.md "Adding a
  material means…" checklist still applies — predicates, parser char,
  palette, draw branch — but the type itself is local.)

## Alternatives considered

1. **One file per material** (`world/materials/glass.ts`, etc.). Rejected:
   each material is just a string-literal in a union. There is no behavior
   per material — material-keyed behavior lives in predicate functions
   elsewhere. Splitting would create eight one-line files.
2. **`world/materials.ts` containing the union.** Rejected: would force
   an import in `level.ts` and break nothing meaningful. Not worth the move.

## Re-evaluate when

- Materials gain per-material data (e.g. `BONE.hits = 3`,
  `GLASS.shardLifetime = 4`). Currently those constants live in `config.ts`;
  if they migrate to per-material records, split then.
