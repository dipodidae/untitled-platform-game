# ADR 0008 — Weapons live under combat, not at top level

**Status:** Accepted
**Date:** 2026-04-24

## Context

`src/weapons/` (slug, bigShot, types, index) sat alongside `src/bullet.ts`
at the src root. Weapons define ballistic profiles (speed, gravity, damage,
cooldown); bullets are the projectiles those profiles spawn. The two are
inseparable.

## Decision

Co-locate under `src/combat/`. New layout:

```
combat/
├── bullet.ts          (BulletState + spawn + tick)
├── rupture.ts         (the damage event a bullet causes)
└── weapons/
    ├── slug.ts
    ├── bigShot.ts
    ├── types.ts
    └── index.ts
```

## Consequences

- "Combat" is the bounded context; "weapons" is a sub-grouping inside it
  for the per-weapon profile files. This keeps the per-weapon files
  separate (one concept per file) without inflating the top-level context
  count.
- `combat/bullet.ts` historically defined its own `BULLET_KINDS` map
  separate from `combat/weapons/index.ts`. **This duplication pre-existed
  the refactor and was not unified** per the no-behavior-change rule. See
  `docs/refactor/FINDINGS.md`.

## Alternatives considered

1. **Keep weapons/ at top level.** Rejected: combat is the domain noun;
   weapons are an implementation detail of combat.
2. **Flatten weapons/ into combat/.** Rejected: each weapon profile is its
   own file by the file-per-concept rule; a sub-grouping is the cleaner
   shape.

## Re-evaluate when

- Weapons become used outside combat (e.g. cosmetic skins for the editor).
  Then split.
