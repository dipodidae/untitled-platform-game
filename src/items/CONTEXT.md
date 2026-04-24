# Context: items

**Path:** `src/items/`
**One-line purpose:** Owns pickup entity definitions, the runtime Pickup struct, and the logic to create, tick, and overlap-test pickups.

## What this context owns

- `types.ts` — `ItemKind` string literal union; `ItemDef` interface (visual + weapon grant); `Pickup` runtime struct (position, kind, alive, bobPhase).
- `bigShot.ts` — `BIG_SHOT: ItemDef` — the only currently authored pickup; grants the `bigShot` weapon and has a 12-second cooldown.
- `index.ts` — `ITEMS` registry; `getItemDef`, `createPickupsFromSpawns`, `tickPickups` (advances `bobPhase`), `pickupOverlapsPlayer`. Re-exports `ItemDef`, `ItemKind`, `Pickup`.

## What it does NOT own (and where to look)

- The bullet kind the pickup grants — `src/combat/weapons/bigShot.ts` and `src/combat/bullet.ts` (`BULLET_KINDS.bigShot`)
- Rendering of pickups — not yet wired into `src/render/index.ts` (as of the current codebase, pickup rendering is absent; see Findings)
- Pickup spawn coordinates in the level — `src/world/level.ts` (`LevelJson.pickups`, `Level` does not surface pickups at runtime — see Findings)
- Player weapon state mutation on pickup — not yet implemented in `session/game.ts`

## Public surface

```ts
// types.ts
export type ItemKind = 'bigShot'
export interface ItemDef { id, w, h, grantsWeapon: BulletKindName, bodyColor, accentColor, glowColor }
export interface Pickup { x, y, w, h, kind, alive, bobPhase }

// index.ts
export function getItemDef(kind: ItemKind): ItemDef
export interface PickupSpawn { x, y, kind }
export function createPickupsFromSpawns(spawns): Pickup[]
export function tickPickups(pickups, dt): void
export function pickupOverlapsPlayer(p: Pickup, player: { x, y, w, h }): boolean
export type { ItemDef, ItemKind, Pickup }
```

## External dependencies

- Pixi v8 modules used: none
- Other contexts:
  - `src/combat/bullet` — `BulletKindName` (used in `ItemDef.grantsWeapon` and `types.ts` import)

## Invariants / rules

- `ItemDef` is authored-only (static configuration). The `Pickup` struct is the runtime instance — one per spawn point, owns `alive` and `bobPhase`.
- `createPickupsFromSpawns` centers each pickup on its spawn point by subtracting `def.w/2` and `def.h/2` from the authored coordinates.
- `tickPickups` only advances `bobPhase` at render cadence — it must not gate gameplay logic on this (bobPhase is visual-only).
- `pickupOverlapsPlayer` is a pure AABB test; it does not mutate either argument. Mutation (setting `alive = false`, changing the player's weapon) is the caller's responsibility.

## Why this context exists as its own thing

Pickups have a distinct lifetime (spawned from level JSON, consumed once, never respawned within a run) and a distinct rendering contract (bob animation, glow). Keeping them separate from `world/level.ts` (which models static colliders) and from `session/game.ts` (which would otherwise need to inline every item's behavior) lets new item types be added by creating a file and registering it in the barrel — a local change with no ripple into the game loop.

## Events published / consumed

None currently — pickup collection is not yet integrated into the EventBus.
