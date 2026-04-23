# Level Redesign: 4-Beat Traversal Arc

Date: 2026-04-24

## Summary

Redesign `showcase.json` from a flat physics corridor into a Celeste-style
4-section level with teaching progression, emotional rhythm, and mechanical
escalation. Add a new `bone_fragile` material (time-pressure platforms).

## World

- **Dimensions**: 2400 × 520 px (up from 900 × 420)
- **Spawn**: (80, 320)
- **Camera**: continuous scroll (no screen gates)

## New material: `bone_fragile`

Identical to bone visually and physically, but starts a **contact timer**
when the player stands on it. After **1.8 s** of cumulative contact the
collider collapses (`alive = false`). Timer persists across touches.

### Code changes

| File | Change |
|------|--------|
| `config.ts` | Add `BONE_FRAGILE_COLLAPSE_TIME: 1.8` |
| `world/level.ts` | Add `'bone_fragile'` to `MaterialName`; add `contactTime: number` to `Collider` (default 0); init in `buildCollider` |
| `player.ts` / physics | When player is grounded on a `bone_fragile` collider, increment its `contactTime` by dt. When `contactTime >= BONE_FRAGILE_COLLAPSE_TIME`, set `alive = false` and refresh geometry. |
| `render/world.ts` | Add `drawBoneFragile`: bone fill with timer-driven shake + crack scribbles |
| `render/palette.ts` | Add `bone_fragile` material colors (yellowed bone) |
| `world/level.ts` tilemap | Map char `'f'` → `'bone_fragile'` |

### Visual

- Base: bone fill tinted slightly yellow
- As timer fills: increasingly dark, shake offset, crack scribble count scales with ratio
- At >80% timer: small particle dust (optional, stretch)

## Level structure

### Section 1 — "Trust" (x: 0–600)

Establish safe movement. Non-interactive glass tease.

| ID | Material | Vertices | Notes |
|----|----------|----------|-------|
| 1 | bone | `[[0,180],[15,180],[15,400],[0,400]]` | Left wall |
| 2 | bone | `[[0,360],[580,360],[580,400],[0,400]]` | Main floor |
| 3 | bone | `[[260,335],[330,335],[330,360],[260,360]]` | Practice step (25 px hop) |
| 4 | glass | `[[400,240],[470,240],[470,248],[400,248]]` | Unreachable tease |

### Section 2 — "Consequence" (x: 580–1180)

Glass bridge over a gap. Breaking it = losing the shortcut. Recovery floor
below catches falls.

| ID | Material | Vertices | Notes |
|----|----------|----------|-------|
| 5 | bone | `[[580,360],[660,360],[660,400],[580,400]]` | Pre-gap ledge |
| 6 | glass | `[[690,348],[880,348],[880,356],[690,356]]` | Glass bridge (190 px, 8 px thick) |
| 7 | bone | `[[670,430],[910,430],[910,460],[670,460]]` | Recovery floor |
| 8 | bone | `[[870,395],[930,395],[930,430],[870,430]]` | Climb-back step |
| 9 | bone | `[[910,360],[1180,360],[1180,400],[910,400]]` | Post-gap floor (relief) |

### Section 3 — "Control" (x: 1180–1840)

Soft dampens momentum. Bone_fragile creates time pressure. Two paths:
low/safe (soft valley) or high/fast (one-way → bone_fragile chain).

| ID | Material | Vertices | Notes |
|----|----------|----------|-------|
| 10 | bone | `[[1180,360],[1290,360],[1290,400],[1180,400]]` | Breathing space |
| 11 | soft | `[[1290,365],[1540,365],[1540,430],[1290,430]]` | Soft valley (slow, safe) |
| 12 | bone (oneWay) | `[[1340,328],[1450,328],[1450,333],[1340,333]]` | One-way above soft |
| 13 | bone_fragile | `[[1490,322],[1580,322],[1580,332],[1490,332]]` | Crumble platform 1 |
| 14 | bone_fragile | `[[1620,308],[1710,308],[1710,318],[1620,318]]` | Crumble platform 2 |
| 15 | bone | `[[1540,365],[1840,365],[1840,400],[1540,400]]` | Floor under fragile route |
| 16 | bone | `[[1750,338],[1840,338],[1840,365],[1750,365]]` | Safe landing (recovery) |

### Section 4 — "Payoff" (x: 1840–2400)

Resonant launch. Clear approach space, chain geometry, elevated victory
platform.

| ID | Material | Vertices | Notes |
|----|----------|----------|-------|
| 17 | bone | `[[1840,365],[2050,365],[2050,400],[1840,400]]` | Approach floor |
| 18 | resonant | `[[2050,365],[2110,265],[2110,365]]` | Ramp (launch surface) |
| 19 | resonant | `[[2110,245],[2140,365],[2110,365]]` | Chain piece (extra impulse) |
| 20 | bone | `[[2140,365],[2400,365],[2400,400],[2140,400]]` | Failed-launch catch floor |
| 21 | bone | `[[2060,195],[2280,195],[2280,225],[2060,225]]` | Victory platform |
| 22 | bone | `[[2380,195],[2400,195],[2400,400],[2380,400]]` | Right wall |

## Mechanical hierarchy

| Tier | Material | Role |
|------|----------|------|
| 1 | bone | Safe, structural |
| 2 | soft | Movement modifier (dampens) |
| 2.5 | bone_fragile | Time pressure (crumbles) |
| 3 | glass | Risk / state change (breaks, shards) |
| 4 | resonant | Skill execution (launch) |

## Design principles applied

1. **One idea per section**: Trust → Consequence → Control → Payoff
2. **Safe → risky → recovery**: each section has breathing space before and relief after
3. **Failure teaches softly**: glass gap has recovery floor; fragile platforms have catch floor; resonant miss lands on flat ground
4. **Non-interactive first encounter**: glass appears as tease in Section 1, becomes interactive in Section 2
5. **Two-path choice**: Section 3 offers safe/slow vs fast/stressful, respecting different play styles
