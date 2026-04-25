# FAULTLINE

*You break. You also shoot back.*

You're a small warm thing moving through a world that's already losing
its grip. You carry a gun. You use it to shape the world before the
world shapes you. The slugs arc. The ground gives. What you destroy
this pass is what you have to live with on the next one.

---

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview
```

Node 20+. PixiJS v8 + Spine runtime (4.2) + Vite + TypeScript. Physics:
polygon collision via SAT, slopes up to 50°, one-way platforms, 120 Hz
substepped internally so the MTV doesn't pop you off bumpy terrain.
Destruction: polygon boolean difference, re-decomposed into convex
pieces per carve. Character: Spineboy rig via
`@esotericsoftware/spine-pixi-v8`.

## Controls

| Action        | Keys                               |
| ------------- | ---------------------------------- |
| Move          | `← →` / `A D`                      |
| Jump          | `Space` / `Z` / `↑` / `W`          |
| Shoot         | `X`                                |
| Stance cycle  | `C` (forward → high → low → hip)   |
| Drop-through  | `↓` / `S` + jump on a one-way      |
| Begin again   | `R`                                |

## Movement

Celeste-grade feel — coyote time, jump buffer, wall jump with input
lock, wall-stick grace, double jump, slope projection,
stick-to-ground, corner-nudge.

## Shooting

The slug arcs. Your gun fires from the visible muzzle, in the direction
the Spineboy rig is aiming — the `crosshair` bone drives it, then a
per-stance `mitigation` + `biasY` post-processes the vector so the
result tracks whatever pose the animation happens to be on.

A live crosshair forward-simulates the trajectory every frame and marks
the predicted impact. Red means a dummy would eat the shot, warm-white
means terrain, grey means the bullet times out empty. You aim with the
crosshair, not the character silhouette.

Bullets damage enemies and carve terrain through `applyRupture` — glass
shards, bone damage, and soft absorption all behave consistently.

**Stances.** Cycle with `C`:

- `forward` — gun up forward, horizontal aim. Default.
- `high` — tilt upward.
- `low` — tilt downward (shooting at ground-level enemies).
- `hip` — gun hangs at the hip; aim is force-horizontalized. Quicker
  read, looser pose.

## HP

Three HP. Hazard contact costs one and grants ~0.7s of i-frames so a
continuous overlap doesn't multi-hit you. Fall-out-of-world kills you
regardless — HP doesn't save you from the void.

## The world under your feet

Each material fails differently, and your bullets carve them the same
way.

- **Glass** — pale, translucent. One hit and it's gone. What's left
  behind is shards — red, jagged, lethal on contact. Breaking glass
  makes the next traversal of the same space worse than the first.
- **Bone** — off-white, structural. Bullet impacts crack it, and the
  cracks *stay*. Three hits in the same spot and it finally gives.
  Things you primed earlier decide your run.
- **Bone-fragile** — aging bone. Collapses after cumulative contact
  time. Timer persists across touches.
- **Resonant** — blue-cold, indestructible. Pushes back on bullet
  impacts. A chain of resonant surfaces touched in one blast stacks
  the launch bonus. Some of those launches you will love. Some you
  won't.
- **Soft** — mauve, yielding. Dampens you on contact, absorbs part of
  bullet impacts. Safe. Expensive to leave. You can hide there; it
  costs everything you were trying to do.

`shard` is a runtime-only material, spawned from broken glass. Never
authored directly.

## Enemies

**Prowlers** — AI-driven body actors. They don't aim; they push. Ground
confidence scales their speed (bone 1.0, glass 0.3).

**Dummies** — AI-less test targets. Stand where placed, take HP
damage, flash on hit, vanish at zero. For tuning weapon feel and
impact VFX in isolation.

---

## Authoring a level

Levels are JSON in `src/levels/*.json`. Schema:

```jsonc
{
  "spawn": { "x": 80, "y": 300 },
  "worldWidth": 2800,
  "worldHeight": 560,
  "colliders": [
    {
      "id": 1,
      "material": "bone", // glass | bone | bone_fragile | resonant | soft
      "vertices": [[0, 400], [520, 400], [520, 500], [0, 500]],
      "oneWay": false,                                   // optional
      "kinetic": { "type": "rotor", "speed": 0.3 }       // optional
    }
  ],
  "prowlers": [{ "x": 2080, "y": 364 }],
  "dummies": [{ "x": 300, "y": 368, "hp": 5 }]
}
```

Vertices are an implicitly-closed ring, CCW in screen-space (Y-down).
Concave is fine — `poly-decomp-es` decomposes on load. Kinetics support
`rotor`, `breather`, and `spring`. Reaching the right world edge
advances; `src/game.ts` lists the level order.

## Level 1 in six beats

1. **Tutorial** (0–520) — flat ground, first dummy at x=300, breathing
   block to show kinetics exist.
2. **Gap + fragile step** (520–820) — first jump, a `bone_fragile` step
   that collapses if you linger.
3. **Glass barrier** (1120–1400) — a glass pillar blocks the path.
   Shoot through it, or walk through it and deal with the shards at
   your feet. A 3-HP dummy waits just past.
4. **Wall-jump shaft** (1400–1620) — narrow vertical, upper ledge
   rewards the climb with a dummy perched at y=188.
5. **Slope + prowler** (1800–2160) — descent that exercises slope
   projection; a patrolling prowler on the lower ground; a `soft`
   one-way tucked in halfway down.
6. **Resonant chain + exit** (2160–2800) — ascending resonant steps
   compound the launch, a `rotor` for flavor, exit plateau.

## The palette

One palette, one mood. `src/render/palette.ts`. Editing it changes the
game's whole emotional spectrum at once. Two categories:

- **Materials** — `{ fill, edge, shadow, highlight }` per material,
  read by the per-material draw routines in `src/render/world.ts`.
- **World tone** — sky gradient, parallax, vignette, wind motes, aura,
  player, UI.

If you want a different feeling, edit that file. If you want a
different *game*, don't.

## Tuning

Every gameplay number lives in `src/config.ts`, grouped by identity
concern:

- `MAX_RUN` / `*_ACCEL` / `*_DECEL` / `AIR_*` — horizontal feel.
- `JUMP_*` / `WALL_*` / `COYOTE_*` / `JUMP_BUFFER` / `DJ_*` — jump feel.
- `RUPTURE_*` — bullet carve shape.
- `BONE_HITS` / `GLASS_SHARD_*` / `SOFT_*` / `RESONANT_*` — per-material.
- `PLAYER_MAX_HP` / `HAZARD_*` — HP system.
- `WIND_*` / `VIGNETTE_*` / `PARALLAX_SEED` — mood knobs.

Weapon profiles live in `BULLET_KINDS` (`src/bullet.ts`). Gun stances
in `STANCES` (`src/render/spineboy.ts`). Camera feel in `CAMERA_CONFIG`
(`src/camera.ts`). CRT shader constants at the top of
`src/render/CRTFilter.ts`.

Look for `// TUNING:` markers in the destruction code for spots the
designer should revisit once playtest has a shape.
